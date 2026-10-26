/* Reading Comprehension page.
     reading.html                 all passages, grouped by unit
     reading.html?unit=<id>       the passages of one unit
     reading.html?passage=<id>    one passage with its questions
   Passage text keeps its paragraphs, line breaks and spacing exactly as
   written, and questions are always shown in the order they are stored. */
(function () {
  'use strict';

  var G12 = window.G12;
  var Schema = G12.Schema;
  var el = G12.el;
  var t = G12.t;
  var hasText = Schema.hasText;
  var root = document.getElementById('page-root');
  var PAGE = 'reading.html';
  var MODES = [
    { value: 'all', label: t('All questions') },
    { value: 'one', label: t('One at a time') }
  ];

  G12.loadContent(['units', 'passages']).then(function (content) {
    var id = G12.param('passage');
    if (id) renderPassage(content, id);
    else renderList(content, G12.param('unit'));
  }).catch(function (error) {
    G12.showError(root, error, { title: t('Reading Comprehension') });
  });

  function passageLink(passage) {
    return PAGE + '?passage=' + encodeURIComponent(passage.id);
  }

  function metaItems(passage) {
    var items = [];
    if (hasText(passage.level)) items.push(t('Level: {level}', { level: passage.level }));
    items.push(G12.plural(G12.wordCount(passage.paragraphs), 'word'));
    items.push(G12.plural(passage.questions.length, 'question'));
    return items;
  }

  /* ---------- Passage list ---------- */

  function passageCards(passages, headingLevel) {
    return el('ul', { className: 'card-grid' }, passages.map(function (passage) {
      return el('li', { className: 'card' }, [
        el(headingLevel, { dir: 'auto' }, [el('a', { href: passageLink(passage), text: passage.title })]),
        el('ul', { className: 'passage-meta' }, metaItems(passage).map(function (text) {
          return el('li', { text: text });
        })),
        G12.badges(passage),
        el('div', { className: 'card-actions' }, [
          el('a', { className: 'btn', href: passageLink(passage), text: t('Read passage'), 'aria-label': t('Read passage: {title}', { title: passage.title }) })
        ])
      ]);
    }));
  }

  function renderList(content, unitId) {
    G12.setTitle(t('Reading Comprehension'));
    G12.clear(root);
    root.appendChild(el('h1', { text: t('Reading Comprehension') }));
    root.appendChild(el('p', { className: 'lead', text: t('Read a passage carefully, then answer the questions about it.') }));
    var skipped = G12.skippedNotice(content, ['units', 'passages']);
    if (skipped) root.appendChild(skipped);

    if (content.passages.length === 0 && content.units.length === 0) {
      root.appendChild(G12.emptyState(
        t('No reading passages added yet'),
        t('Reading passages and their questions will appear here once they are added in the content manager.'),
        [{ label: t('Add a passage'), href: G12.MANAGER_PAGE + '#passages/new' }]
      ));
      return;
    }

    var nav = G12.unitNav(content.units, unitId, PAGE, G12.countByUnit(content.passages));
    if (nav) root.appendChild(nav);
    var groups = Schema.groupByUnit(content.passages, content.units, []);

    if (unitId) {
      var group = groups.filter(function (g) { return g.unit && g.unit.id === unitId; })[0];
      if (!group) {
        G12.unitNotFound(root, PAGE, 'passages');
        return;
      }
      G12.setTitle(group.unit.title + ' — ' + t('Reading Comprehension'));
      root.appendChild(el('h2', { dir: 'auto', text: group.unit.title }));
      if (group.items.length === 0) {
        root.appendChild(G12.emptyState(
          t('No passages in this unit yet'),
          t('Reading passages for this unit will appear here once they are added in the content manager.'),
          [{ label: t('Show all units'), href: PAGE }],
          'h3'
        ));
        return;
      }
      var notice = G12.listReviewNotice(group.items);
      if (notice) root.appendChild(notice);
      root.appendChild(passageCards(group.items, 'h3'));
      return;
    }

    var allNotice = G12.listReviewNotice(content.passages);
    if (allNotice) root.appendChild(allNotice);
    if (content.units.length === 0) {
      root.appendChild(passageCards(content.passages, 'h2'));
      return;
    }
    groups.forEach(function (g) {
      var unit = g.unit;
      var headingId = 'unit-' + (unit ? unit.id : 'other');
      var section = el('section', { className: 'unit-section', 'aria-labelledby': headingId }, [
        el('h2', { id: headingId, dir: 'auto' }, unit ? [el('a', { href: G12.unitHref(PAGE, unit.id), text: unit.title })] : [t('Other passages')])
      ]);
      if (unit && hasText(unit.description)) section.appendChild(el('p', { className: 'unit-description', dir: 'auto', text: unit.description }));
      section.appendChild(g.items.length
        ? passageCards(g.items, 'h3')
        : el('p', { className: 'unit-empty', text: t('No passages in this unit yet.') }));
      root.appendChild(section);
    });
  }

  /* ---------- One passage ---------- */

  function passageText(passage) {
    var paragraphs = passage.paragraphs.filter(hasText);
    if (passage.showParagraphNumbers === false) {
      return el('div', { className: 'passage-text', dir: 'auto' }, paragraphs.map(function (text) {
        return el('p', { dir: 'auto', text: text });
      }));
    }
    return el('ol', { className: 'passage-paragraphs', dir: 'auto', 'aria-label': t('Paragraphs') }, paragraphs.map(function (text) {
      return el('li', { dir: 'auto', text: text });
    }));
  }

  function renderPassage(content, id) {
    G12.clear(root);
    var ordered = Schema.orderByUnit(content.passages, content.units, []);
    var index = -1;
    ordered.forEach(function (passage, i) { if (passage.id === id) index = i; });

    if (index === -1) {
      G12.setTitle(t('Passage not found'));
      root.appendChild(el('h1', { text: t('Passage not found') }));
      root.appendChild(el('p', { text: t('This passage does not exist or has been removed.') }));
      root.appendChild(el('a', { className: 'btn', href: PAGE, text: t('Back to all passages') }));
      return;
    }

    var passage = ordered[index];
    var unit = Schema.findById(content.units, passage.unitId);
    G12.setTitle(passage.title);

    var crumbs = [el('li', null, [el('a', { href: PAGE, text: t('Reading Comprehension') })])];
    if (unit) crumbs.push(el('li', null, [el('a', { href: G12.unitHref(PAGE, unit.id), dir: 'auto', text: unit.title })]));
    crumbs.push(el('li', null, [el('span', { 'aria-current': 'page', dir: 'auto', text: passage.title })]));
    root.appendChild(el('nav', { className: 'breadcrumb', 'aria-label': t('Breadcrumb') }, [el('ol', null, crumbs)]));
    root.appendChild(el('h1', { dir: 'auto', text: passage.title }));
    root.appendChild(G12.badges(passage, [unit ? unit.title : null]));
    var notice = G12.reviewNotice(passage, 'passage');
    if (notice) root.appendChild(notice);
    var skipped = G12.skippedNotice(content, ['units', 'passages']);
    if (skipped) root.appendChild(skipped);

    var article = el('article', { className: 'passage', 'aria-labelledby': 'passage-heading', tabindex: '0' }, [
      el('h2', { id: 'passage-heading', text: t('Passage') }),
      el('ul', { className: 'passage-meta' }, metaItems(passage).map(function (text) {
        return el('li', { text: text });
      })),
      passageText(passage),
      hasText(passage.source) ? el('p', { className: 'passage-source' }, [t('Source:') + ' ', el('span', { dir: 'auto', text: passage.source })]) : null
    ]);

    var questionColumn = el('div', { className: 'reading-questions' });
    root.appendChild(el('div', { className: 'reading-layout' }, [article, questionColumn]));

    if (passage.questions.length === 0) {
      questionColumn.appendChild(el('div', { className: 'quiz' }, [
        el('h2', { text: t('Questions') }),
        el('p', { text: t('No questions have been added to this passage yet.') })
      ]));
    } else {
      renderQuestions(questionColumn, passage, 'all', false);
    }

    var previous = ordered[index - 1];
    var next = ordered[index + 1];
    root.appendChild(el('nav', { className: 'pager', 'aria-label': t('Other passages') }, [
      previous ? el('a', { href: passageLink(previous), text: t('← {title}', { title: previous.title }) }) : el('span'),
      next ? el('a', { href: passageLink(next), text: t('{title} →', { title: next.title }) }) : el('span')
    ]));
  }

  /* Questions in their stored order, either all together or one at a time. */
  function renderQuestions(column, passage, mode, moveFocus) {
    G12.clear(column);
    var switcher = el('div', { className: 'mode-switch', role: 'group', 'aria-label': t('How to answer the questions') },
      MODES.map(function (option) {
        return el('button', {
          type: 'button',
          className: 'btn btn--secondary btn--small',
          'aria-pressed': String(option.value === mode),
          text: option.label,
          onclick: function () {
            if (option.value !== mode) renderQuestions(column, passage, option.value, true);
          }
        });
      }));
    var holder = el('div');
    column.appendChild(switcher);
    column.appendChild(holder);
    var label = t('Questions about {title}', { title: passage.title });
    if (mode === 'one') {
      G12.renderQuiz(holder, passage.questions, { label: label, shuffle: false });
    } else {
      G12.renderWorksheet(holder, passage.questions, { label: label, title: t('Questions') });
    }
    if (moveFocus) G12.focus(holder.querySelector('h2'));
  }
})();
