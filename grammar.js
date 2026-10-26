/* Grammar Lessons page.
     grammar.html               all lessons, grouped by unit
     grammar.html?unit=<id>     the lessons of one unit
     grammar.html?topic=<id>    one lesson (topic). ?lesson=<id> also works. */
(function () {
  'use strict';

  var G12 = window.G12;
  var Schema = G12.Schema;
  var el = G12.el;
  var t = G12.t;
  var hasText = Schema.hasText;
  var root = document.getElementById('page-root');
  var PAGE = 'grammar.html';

  G12.loadContent(['units', 'lessons', 'summaries', 'questions']).then(function (content) {
    var topicId = G12.param('topic') || G12.param('lesson');
    if (topicId) renderLesson(content, topicId);
    else renderList(content, G12.param('unit'));
  }).catch(function (error) {
    G12.showError(root, error, { title: t('Grammar Lessons') });
  });

  function lessonHref(lesson) {
    return PAGE + '?topic=' + encodeURIComponent(lesson.id);
  }

  function questionCount(content, lessonId) {
    return content.questions.filter(function (q) { return q.topicId === lessonId; }).length;
  }

  function summaryFor(content, lessonId) {
    return content.summaries.filter(function (s) { return s.topicId === lessonId; })[0] || null;
  }

  /* ---------- Lesson list ---------- */

  function lessonCards(content, lessons, headingLevel) {
    return el('ul', { className: 'card-grid' }, lessons.map(function (lesson) {
      var count = questionCount(content, lesson.id);
      var href = lessonHref(lesson);
      return el('li', { className: 'card' }, [
        el(headingLevel, { dir: 'auto' }, [el('a', { href: href, text: lesson.title })]),
        hasText(lesson.description) ? el('p', { dir: 'auto', text: lesson.description }) : null,
        G12.badges(lesson),
        el('div', { className: 'card-actions' }, [
          el('a', { className: 'btn', href: href, text: t('Read lesson'), 'aria-label': t('Read lesson: {title}', { title: lesson.title }) }),
          count ? el('a', { href: 'practice.html?topic=' + encodeURIComponent(lesson.id), text: t('Practise ({questions})', { questions: G12.plural(count, 'question') }) }) : null
        ])
      ]);
    }));
  }

  /* One unit: heading, description, and its lessons or "no lessons yet". */
  function unitSection(content, group, headingLevel, linkHeading) {
    var unit = group.unit;
    var title = unit ? unit.title : t('Other topics');
    var headingId = 'unit-' + (unit ? unit.id : 'other');
    var heading = el(headingLevel, { id: headingId, dir: 'auto' },
      linkHeading && unit ? [el('a', { href: G12.unitHref(PAGE, unit.id), text: title })] : [title]);
    var section = el('section', { className: 'unit-section', 'aria-labelledby': headingId }, [heading]);
    if (unit && hasText(unit.description)) section.appendChild(el('p', { className: 'unit-description', dir: 'auto', text: unit.description }));
    if (group.items.length) {
      section.appendChild(lessonCards(content, group.items, headingLevel === 'h2' ? 'h3' : 'h2'));
    } else {
      section.appendChild(el('p', { className: 'unit-empty', text: t('No lessons in this unit yet.') }));
    }
    return section;
  }

  function renderList(content, unitId) {
    G12.setTitle(t('Grammar Lessons'));
    G12.clear(root);
    root.appendChild(el('h1', { text: t('Grammar Lessons') }));
    root.appendChild(el('p', { className: 'lead', text: t('Choose a lesson to read the explanation and examples.') }));
    var skipped = G12.skippedNotice(content, ['units', 'lessons']);
    if (skipped) root.appendChild(skipped);

    if (content.lessons.length === 0 && content.units.length === 0) {
      root.appendChild(G12.emptyState(
        t('No lessons added yet'),
        t('Grammar lessons will appear here once they are added in the content manager.'),
        [{ label: t('Add a lesson'), href: G12.MANAGER_PAGE + '#lessons/new' }]
      ));
      return;
    }

    var nav = G12.unitNav(content.units, unitId, PAGE, G12.countByUnit(content.lessons));
    if (nav) root.appendChild(nav);
    var groups = Schema.groupByUnit(content.lessons, content.units, content.lessons);

    if (unitId) {
      var group = groups.filter(function (g) { return g.unit && g.unit.id === unitId; })[0];
      if (!group) {
        G12.unitNotFound(root, PAGE, 'lessons');
        return;
      }
      G12.setTitle(group.unit.title + ' — ' + t('Grammar Lessons'));
      var notice = G12.listReviewNotice(group.items);
      if (notice) root.appendChild(notice);
      if (group.items.length === 0) {
        root.appendChild(el('h2', { dir: 'auto', text: group.unit.title }));
        root.appendChild(G12.emptyState(
          t('No lessons in this unit yet'),
          t('Lessons for this unit will appear here once they are added in the content manager.'),
          [{ label: t('Show all units'), href: PAGE }],
          'h3'
        ));
        return;
      }
      root.appendChild(unitSection(content, group, 'h2', false));
      return;
    }

    var allNotice = G12.listReviewNotice(content.lessons);
    if (allNotice) root.appendChild(allNotice);

    if (content.units.length === 0) {
      root.appendChild(lessonCards(content, content.lessons, 'h2'));
      return;
    }
    groups.forEach(function (g) {
      root.appendChild(unitSection(content, g, 'h2', true));
    });
  }

  /* ---------- One lesson ---------- */

  function renderLesson(content, id) {
    G12.clear(root);
    var ordered = Schema.orderByUnit(content.lessons, content.units, content.lessons);
    var index = -1;
    ordered.forEach(function (lesson, i) { if (lesson.id === id) index = i; });

    if (index === -1) {
      G12.setTitle(t('Lesson not found'));
      root.appendChild(el('h1', { text: t('Lesson not found') }));
      root.appendChild(el('p', { text: t('This lesson does not exist or has been removed.') }));
      root.appendChild(el('a', { className: 'btn', href: PAGE, text: t('Back to all lessons') }));
      return;
    }

    var lesson = ordered[index];
    var unit = Schema.findById(content.units, lesson.unitId);
    G12.setTitle(lesson.title);

    var crumbs = [el('li', null, [el('a', { href: PAGE, text: t('Grammar Lessons') })])];
    if (unit) crumbs.push(el('li', null, [el('a', { href: G12.unitHref(PAGE, unit.id), dir: 'auto', text: unit.title })]));
    crumbs.push(el('li', null, [el('span', { 'aria-current': 'page', dir: 'auto', text: lesson.title })]));
    root.appendChild(el('nav', { className: 'breadcrumb', 'aria-label': t('Breadcrumb') }, [el('ol', null, crumbs)]));

    root.appendChild(el('h1', { dir: 'auto', text: lesson.title }));
    if (hasText(lesson.description)) {
      root.appendChild(el('p', { className: 'lead', dir: 'auto', text: lesson.description }));
    }
    root.appendChild(G12.badges(lesson, [unit ? unit.title : null]));
    var notice = G12.reviewNotice(lesson, 'lesson');
    if (notice) root.appendChild(notice);

    var body = el('div', { className: 'lesson-body', dir: 'auto' });
    if (lesson.sections.length === 0) {
      body.appendChild(el('p', { text: t('This lesson has no content yet.') }));
    }
    lesson.sections.forEach(function (section) {
      body.appendChild(renderSection(section));
    });
    root.appendChild(body);

    var summary = summaryFor(content, lesson.id);
    var count = questionCount(content, lesson.id);
    var links = [];
    if (summary) links.push(el('a', { className: 'btn btn--secondary', href: 'summaries.html?topic=' + encodeURIComponent(lesson.id), text: t('Read the summary') }));
    if (count) links.push(el('a', { className: 'btn', href: 'practice.html?topic=' + encodeURIComponent(lesson.id), text: t('Practise this topic ({questions})', { questions: G12.plural(count, 'question') }) }));
    if (links.length) {
      root.appendChild(el('section', { className: 'next-steps', 'aria-labelledby': 'next-steps-heading' }, [
        el('h2', { id: 'next-steps-heading', text: t('Next steps') }),
        el('div', { className: 'actions' }, links)
      ]));
    }

    var previous = ordered[index - 1];
    var next = ordered[index + 1];
    root.appendChild(el('nav', { className: 'pager', 'aria-label': t('Other lessons') }, [
      previous ? el('a', { href: lessonHref(previous), text: t('← {title}', { title: previous.title }) }) : el('span'),
      next ? el('a', { href: lessonHref(next), text: t('{title} →', { title: next.title }) }) : el('span')
    ]));
  }

  /* ---------- Lesson sections ---------- */

  function heading(section) {
    return G12.Schema.hasText(section.heading) ? el('h2', { dir: 'auto', text: section.heading }) : null;
  }

  function paragraphs(list) {
    return list.filter(G12.Schema.hasText).map(function (text) {
      return el('p', { dir: 'auto', text: text });
    });
  }

  function renderSection(section) {
    var wrapper = el('section', { className: 'lesson-section' });
    if (section.lang === 'ar') {
      wrapper.setAttribute('lang', 'ar');
      wrapper.setAttribute('dir', 'rtl');
    }

    switch (section.type) {
      case 'text':
        wrapper.appendChild(el('div', { className: 'prose' }, [heading(section), paragraphs(section.paragraphs)]));
        break;

      case 'note':
        wrapper.appendChild(el('div', { className: 'callout', role: 'note' }, [heading(section), paragraphs(section.paragraphs)]));
        break;

      case 'list':
        wrapper.appendChild(heading(section) || document.createTextNode(''));
        wrapper.appendChild(el('ul', { className: 'prose', dir: 'auto' }, section.items.filter(G12.Schema.hasText).map(function (item) {
          return el('li', { dir: 'auto', text: item });
        })));
        break;

      case 'examples':
        wrapper.appendChild(heading(section) || document.createTextNode(''));
        wrapper.appendChild(el('ul', { className: 'example-list', dir: 'auto' }, section.items.filter(G12.Schema.hasText).map(function (item) {
          return el('li', { dir: 'auto', text: item });
        })));
        break;

      case 'table':
        wrapper.appendChild(heading(section) || document.createTextNode(''));
        wrapper.appendChild(el('div', { className: 'table-wrap', dir: 'auto', tabindex: '0', role: 'region', 'aria-label': section.heading || t('Table') }, [
          el('table', null, [
            el('thead', null, [el('tr', null, section.columns.map(function (column) {
              return el('th', { scope: 'col', dir: 'auto', text: column });
            }))]),
            el('tbody', null, section.rows.map(function (row) {
              return el('tr', null, row.map(function (cell) {
                return el('td', { dir: 'auto', text: cell });
              }));
            }))
          ])
        ]));
        break;

      case 'mistakes':
        wrapper.appendChild(heading(section) || document.createTextNode(''));
        wrapper.appendChild(el('ul', { className: 'mistake-list' }, section.items.map(function (item) {
          return el('li', null, [
            el('p', null, [el('span', { className: 'label-avoid', text: t('✗ Avoid:') + ' ' }), el('span', { className: 'text-avoid', dir: 'auto', text: item.avoid })]),
            el('p', null, [el('span', { className: 'label-use', text: t('✓ Use:') + ' ' }), el('span', { dir: 'auto', text: item.use })]),
            G12.Schema.hasText(item.note) ? el('p', { className: 'hint', dir: 'auto', text: item.note }) : null
          ]);
        })));
        break;
    }
    return wrapper;
  }
})();
