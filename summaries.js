/* Grammar Summaries page.
     summaries.html              all summaries, grouped by unit (printable)
     summaries.html?unit=<id>    the summaries of one unit
     summaries.html?topic=<id>   the summary of one topic (lesson)
   summaries.html#<summary id> still jumps to one summary. */
(function () {
  'use strict';

  var G12 = window.G12;
  var Schema = G12.Schema;
  var el = G12.el;
  var t = G12.t;
  var hasText = Schema.hasText;
  var root = document.getElementById('page-root');
  var PAGE = 'summaries.html';

  G12.loadContent(['units', 'summaries', 'lessons', 'questions']).then(function (content) {
    var topicId = G12.param('topic');
    if (topicId) renderTopic(content, topicId);
    else renderList(content, G12.param('unit'));
    jumpToHash();
  }).catch(function (error) {
    G12.showError(root, error, { title: t('Grammar Summaries') });
  });

  function header(content) {
    G12.clear(root);
    root.appendChild(el('h1', { text: t('Grammar Summaries') }));
    root.appendChild(el('p', { className: 'lead', text: t('Short revision notes for each grammar topic. You can print this page to study offline.') }));
    var skipped = G12.skippedNotice(content, ['units', 'summaries']);
    if (skipped) root.appendChild(skipped);
  }

  /* Jump to the summary named in the address, now that it exists on the page. */
  function jumpToHash() {
    if (!window.location.hash) return;
    var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) {
      target.scrollIntoView();
      G12.focus(target.querySelector('h2, h3'));
    }
  }

  function tableOfContents(summaries) {
    if (summaries.length < 2) return null;
    return el('nav', { className: 'toc', 'aria-labelledby': 'toc-heading' }, [
      el('h2', { id: 'toc-heading', text: t('Topics on this page') }),
      el('ul', null, summaries.map(function (summary) {
        return el('li', null, [el('a', { href: '#' + summary.id, dir: 'auto', text: summary.title })]);
      }))
    ]);
  }

  /* ---------- All summaries, or one unit ---------- */

  function renderList(content, unitId) {
    G12.setTitle(t('Grammar Summaries'));
    header(content);

    if (content.summaries.length === 0 && content.units.length === 0) {
      root.appendChild(G12.emptyState(
        t('No summaries added yet'),
        t('Grammar summaries will appear here once they are added in the content manager.'),
        [{ label: t('Add a summary'), href: G12.MANAGER_PAGE + '#summaries/new' }]
      ));
      return;
    }

    var nav = G12.unitNav(content.units, unitId, PAGE, G12.countByUnit(content.summaries, content.lessons));
    if (nav) root.appendChild(nav);
    var groups = Schema.groupByUnit(content.summaries, content.units, content.lessons);

    if (unitId) {
      var group = groups.filter(function (g) { return g.unit && g.unit.id === unitId; })[0];
      if (!group) {
        G12.unitNotFound(root, PAGE, 'summaries');
        return;
      }
      G12.setTitle(group.unit.title + ' — ' + t('Grammar Summaries'));
      if (group.items.length === 0) {
        root.appendChild(el('h2', { dir: 'auto', text: group.unit.title }));
        root.appendChild(G12.emptyState(
          t('No summaries in this unit yet'),
          t('Summaries for this unit will appear here once they are added in the content manager.'),
          [{ label: t('Show all units'), href: PAGE }],
          'h3'
        ));
        return;
      }
      var notice = G12.listReviewNotice(group.items);
      if (notice) root.appendChild(notice);
      var toc = tableOfContents(group.items);
      if (toc) root.appendChild(toc);
      root.appendChild(el('h2', { dir: 'auto', text: group.unit.title }));
      group.items.forEach(function (summary) {
        root.appendChild(renderSummary(content, summary, 'h3'));
      });
      return;
    }

    var allNotice = G12.listReviewNotice(content.summaries);
    if (allNotice) root.appendChild(allNotice);
    var allToc = tableOfContents(Schema.orderByUnit(content.summaries, content.units, content.lessons));
    if (allToc) root.appendChild(allToc);

    if (content.units.length === 0) {
      content.summaries.forEach(function (summary) {
        root.appendChild(renderSummary(content, summary, 'h2'));
      });
      return;
    }
    groups.forEach(function (g) {
      var unit = g.unit;
      var headingId = 'unit-' + (unit ? unit.id : 'other');
      var section = el('section', { className: 'unit-section', 'aria-labelledby': headingId }, [
        el('h2', { id: headingId, dir: 'auto' }, unit ? [el('a', { href: G12.unitHref(PAGE, unit.id), text: unit.title })] : [t('Other summaries')])
      ]);
      if (g.items.length === 0) {
        section.appendChild(el('p', { className: 'unit-empty', text: t('No summaries in this unit yet.') }));
      }
      g.items.forEach(function (summary) {
        section.appendChild(renderSummary(content, summary, 'h3'));
      });
      root.appendChild(section);
    });
  }

  /* ---------- One topic ---------- */

  function renderTopic(content, topicId) {
    header(content);
    var lesson = Schema.findById(content.lessons, topicId);
    var summaries = content.summaries.filter(function (s) { return s.topicId === topicId; });
    var unit = Schema.findById(content.units, lesson ? lesson.unitId : (summaries[0] && summaries[0].unitId));

    if (!lesson && summaries.length === 0) {
      G12.setTitle(t('Topic not found'));
      root.appendChild(G12.emptyState(
        t('Topic not found'),
        t('This topic does not exist or has been removed.'),
        [{ label: t('Show all summaries'), href: PAGE }]
      ));
      return;
    }

    var topicTitle = lesson ? lesson.title : topicId;
    G12.setTitle(topicTitle + ' — ' + t('Grammar Summaries'));
    var crumbs = [el('li', null, [el('a', { href: PAGE, text: t('All summaries') })])];
    if (unit) crumbs.push(el('li', null, [el('a', { href: G12.unitHref(PAGE, unit.id), dir: 'auto', text: unit.title })]));
    crumbs.push(el('li', null, [el('span', { 'aria-current': 'page', dir: 'auto', text: topicTitle })]));
    root.insertBefore(el('nav', { className: 'breadcrumb', 'aria-label': t('Breadcrumb') }, [el('ol', null, crumbs)]), root.firstChild);

    if (summaries.length === 0) {
      var links = [{ label: t('Show all summaries'), href: PAGE }];
      if (lesson) links.unshift({ label: t('Read the full lesson'), href: 'grammar.html?topic=' + encodeURIComponent(lesson.id) });
      root.appendChild(G12.emptyState(
        t('No summary for this topic yet'),
        t('A summary of “{topic}” will appear here once it is added in the content manager.', { topic: topicTitle }),
        links
      ));
      return;
    }
    var notice = G12.listReviewNotice(summaries);
    if (notice) root.appendChild(notice);
    summaries.forEach(function (summary) {
      root.appendChild(renderSummary(content, summary, 'h2'));
    });
  }

  /* ---------- One summary card ---------- */

  function renderSummary(content, summary, headingLevel) {
    var headingId = summary.id + '-heading';
    var subLevel = headingLevel === 'h2' ? 'h3' : 'h4';
    var card = el('section', { className: 'summary-card', id: summary.id, 'aria-labelledby': headingId });
    card.appendChild(el(headingLevel, { id: headingId, dir: 'auto', text: summary.title }));
    card.appendChild(G12.badges(summary));

    var points = Array.isArray(summary.points) ? summary.points : [];
    if (points.length) {
      var showTitle = points.some(function (p) { return hasText(p.title); });
      var showExample = points.some(function (p) { return hasText(p.example); });
      var columns = [];
      if (showTitle) columns.push(t('Point'));
      columns.push(t('Rule'));
      if (showExample) columns.push(t('Example'));

      card.appendChild(el('div', { className: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': t('{title} — rules', { title: summary.title }) }, [
        el('table', null, [
          el('thead', null, [el('tr', null, columns.map(function (column) {
            return el('th', { scope: 'col', text: column });
          }))]),
          el('tbody', null, points.map(function (point) {
            var cells = [];
            if (showTitle) cells.push(el('th', { scope: 'row', dir: 'auto', text: point.title || '' }));
            cells.push(el('td', { dir: 'auto', text: point.rule }));
            if (showExample) cells.push(el('td', { dir: 'auto', text: point.example || '' }));
            return el('tr', null, cells);
          }))
        ])
      ]));
    }

    var remember = (summary.remember || []).filter(hasText);
    if (remember.length) {
      card.appendChild(el(subLevel, { text: t('Remember') }));
      card.appendChild(el('ul', { dir: 'auto' }, remember.map(function (text) {
        return el('li', { dir: 'auto', text: text });
      })));
    }

    var links = [];
    var lesson = hasText(summary.topicId) ? Schema.findById(content.lessons, summary.topicId) : null;
    if (lesson) {
      links.push(el('a', { className: 'btn btn--secondary', href: 'grammar.html?topic=' + encodeURIComponent(lesson.id), text: t('Read the full lesson') }));
      var count = content.questions.filter(function (q) { return q.topicId === lesson.id; }).length;
      if (count) links.push(el('a', { className: 'btn', href: 'practice.html?topic=' + encodeURIComponent(lesson.id), text: t('Practise ({questions})', { questions: G12.plural(count, 'question') }) }));
    }
    if (links.length) card.appendChild(el('div', { className: 'actions' }, links));
    return card;
  }
})();
