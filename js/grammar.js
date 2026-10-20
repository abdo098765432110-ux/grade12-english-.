/* Grammar Lessons page: lesson list, or one lesson when ?lesson=<id> is in the URL. */
(function () {
  'use strict';

  var G12 = window.G12;
  var el = G12.el;
  var root = document.getElementById('page-root');

  G12.loadContent(['lessons', 'summaries', 'questions']).then(function (content) {
    var id = G12.param('lesson');
    if (id) renderLesson(content, id);
    else renderList(content);
  }).catch(function (error) {
    G12.showError(root, error);
  });

  function questionCount(content, lessonId) {
    return content.questions.filter(function (q) { return q.topic === lessonId; }).length;
  }

  function summaryFor(content, lessonId) {
    return content.summaries.filter(function (s) { return s.lessonId === lessonId; })[0] || null;
  }

  /* ---------- Lesson list ---------- */

  function renderList(content) {
    G12.setTitle('Grammar Lessons');
    G12.clear(root);
    root.appendChild(el('h1', { text: 'Grammar Lessons' }));
    root.appendChild(el('p', { className: 'lead', text: 'Choose a lesson to read the explanation and examples.' }));
    var skipped = G12.skippedNotice(content.skipped);
    if (skipped) root.appendChild(skipped);

    if (content.lessons.length === 0) {
      root.appendChild(G12.emptyState(
        'No lessons added yet',
        'Grammar lessons will appear here once they are added in the content manager.',
        [{ label: 'Add a lesson', href: G12.MANAGER_PAGE + '#lessons/new' }]
      ));
      return;
    }

    var notice = G12.listReviewNotice(content.lessons);
    if (notice) root.appendChild(notice);

    var list = el('ul', { className: 'card-grid' });
    content.lessons.forEach(function (lesson) {
      var count = questionCount(content, lesson.id);
      var href = 'grammar.html?lesson=' + encodeURIComponent(lesson.id);
      list.appendChild(el('li', { className: 'card' }, [
        el('h2', { dir: 'auto' }, [el('a', { href: href, text: lesson.title })]),
        G12.Schema.hasText(lesson.description) ? el('p', { dir: 'auto', text: lesson.description }) : null,
        G12.badges(lesson),
        el('div', { className: 'card-actions' }, [
          el('a', { className: 'btn', href: href, text: 'Read lesson', 'aria-label': 'Read lesson: ' + lesson.title }),
          count ? el('a', { href: 'practice.html?topic=' + encodeURIComponent(lesson.id), text: 'Practise (' + G12.plural(count, 'question') + ')' }) : null
        ])
      ]));
    });
    root.appendChild(list);
  }

  /* ---------- One lesson ---------- */

  function renderLesson(content, id) {
    G12.clear(root);
    var index = -1;
    content.lessons.forEach(function (lesson, i) { if (lesson.id === id) index = i; });

    if (index === -1) {
      G12.setTitle('Lesson not found');
      root.appendChild(el('h1', { text: 'Lesson not found' }));
      root.appendChild(el('p', { text: 'This lesson does not exist or has been removed.' }));
      root.appendChild(el('a', { className: 'btn', href: 'grammar.html', text: 'Back to all lessons' }));
      return;
    }

    var lesson = content.lessons[index];
    G12.setTitle(lesson.title);

    root.appendChild(el('nav', { className: 'breadcrumb', 'aria-label': 'Breadcrumb' }, [
      el('ol', null, [
        el('li', null, [el('a', { href: 'grammar.html', text: 'Grammar Lessons' })]),
        el('li', null, [el('span', { 'aria-current': 'page', dir: 'auto', text: lesson.title })])
      ])
    ]));
    root.appendChild(el('h1', { dir: 'auto', text: lesson.title }));
    if (G12.Schema.hasText(lesson.description)) {
      root.appendChild(el('p', { className: 'lead', dir: 'auto', text: lesson.description }));
    }
    root.appendChild(G12.badges(lesson));
    var notice = G12.reviewNotice(lesson, 'lesson');
    if (notice) root.appendChild(notice);

    var body = el('div', { className: 'lesson-body' });
    if (lesson.sections.length === 0) {
      body.appendChild(el('p', { text: 'This lesson has no content yet.' }));
    }
    lesson.sections.forEach(function (section) {
      body.appendChild(renderSection(section));
    });
    root.appendChild(body);

    var summary = summaryFor(content, lesson.id);
    var count = questionCount(content, lesson.id);
    var links = [];
    if (summary) links.push(el('a', { className: 'btn btn--secondary', href: 'summaries.html#' + encodeURIComponent(summary.id), text: 'Read the summary' }));
    if (count) links.push(el('a', { className: 'btn', href: 'practice.html?topic=' + encodeURIComponent(lesson.id), text: 'Practise this topic (' + G12.plural(count, 'question') + ')' }));
    if (links.length) {
      root.appendChild(el('section', { className: 'next-steps', 'aria-labelledby': 'next-steps-heading' }, [
        el('h2', { id: 'next-steps-heading', text: 'Next steps' }),
        el('div', { className: 'actions' }, links)
      ]));
    }

    var previous = content.lessons[index - 1];
    var next = content.lessons[index + 1];
    root.appendChild(el('nav', { className: 'pager', 'aria-label': 'Other lessons' }, [
      previous ? el('a', { href: 'grammar.html?lesson=' + encodeURIComponent(previous.id), dir: 'auto', text: '← ' + previous.title }) : el('span'),
      next ? el('a', { href: 'grammar.html?lesson=' + encodeURIComponent(next.id), dir: 'auto', text: next.title + ' →' }) : el('span')
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
        wrapper.appendChild(el('ul', { className: 'prose' }, section.items.filter(G12.Schema.hasText).map(function (item) {
          return el('li', { dir: 'auto', text: item });
        })));
        break;

      case 'examples':
        wrapper.appendChild(heading(section) || document.createTextNode(''));
        wrapper.appendChild(el('ul', { className: 'example-list' }, section.items.filter(G12.Schema.hasText).map(function (item) {
          return el('li', { dir: 'auto', text: item });
        })));
        break;

      case 'table':
        wrapper.appendChild(heading(section) || document.createTextNode(''));
        wrapper.appendChild(el('div', { className: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': section.heading || 'Table' }, [
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
            el('p', { dir: 'auto' }, [el('span', { className: 'label-avoid', text: '✗ Avoid: ' }), el('span', { className: 'text-avoid', text: item.avoid })]),
            el('p', { dir: 'auto' }, [el('span', { className: 'label-use', text: '✓ Use: ' }), item.use]),
            G12.Schema.hasText(item.note) ? el('p', { className: 'hint', dir: 'auto', text: item.note }) : null
          ]);
        })));
        break;
    }
    return wrapper;
  }
})();
