/* Reading Comprehension page: passage list, or one passage with its
   questions when ?passage=<id> is in the URL. */
(function () {
  'use strict';

  var G12 = window.G12;
  var el = G12.el;
  var hasText = G12.Schema.hasText;
  var root = document.getElementById('page-root');

  G12.loadContent(['passages']).then(function (content) {
    var id = G12.param('passage');
    if (id) renderPassage(content, id);
    else renderList(content);
  }).catch(function (error) {
    G12.showError(root, error);
  });

  function passageLink(passage) {
    return 'reading.html?passage=' + encodeURIComponent(passage.id);
  }

  function metaItems(passage) {
    var items = [];
    if (hasText(passage.level)) items.push('Level: ' + passage.level);
    items.push(G12.plural(G12.wordCount(passage.paragraphs), 'word'));
    items.push(G12.plural(passage.questions.length, 'question'));
    return items;
  }

  /* ---------- Passage list ---------- */

  function renderList(content) {
    G12.setTitle('Reading Comprehension');
    G12.clear(root);
    root.appendChild(el('h1', { text: 'Reading Comprehension' }));
    root.appendChild(el('p', { className: 'lead', text: 'Read a passage carefully, then answer the questions about it.' }));
    var skipped = G12.skippedNotice(content.skipped);
    if (skipped) root.appendChild(skipped);

    if (content.passages.length === 0) {
      root.appendChild(G12.emptyState(
        'No reading passages added yet',
        'Reading passages and their questions will appear here once they are added in the content manager.',
        [{ label: 'Add a passage', href: G12.MANAGER_PAGE + '#passages/new' }]
      ));
      return;
    }

    var notice = G12.listReviewNotice(content.passages);
    if (notice) root.appendChild(notice);

    root.appendChild(el('ul', { className: 'card-grid' }, content.passages.map(function (passage) {
      return el('li', { className: 'card' }, [
        el('h2', { dir: 'auto' }, [el('a', { href: passageLink(passage), text: passage.title })]),
        el('ul', { className: 'passage-meta' }, metaItems(passage).map(function (text) {
          return el('li', { text: text });
        })),
        G12.badges(passage),
        el('div', { className: 'card-actions' }, [
          el('a', { className: 'btn', href: passageLink(passage), text: 'Read passage', 'aria-label': 'Read passage: ' + passage.title })
        ])
      ]);
    })));
  }

  /* ---------- One passage ---------- */

  function renderPassage(content, id) {
    G12.clear(root);
    var index = -1;
    content.passages.forEach(function (passage, i) { if (passage.id === id) index = i; });

    if (index === -1) {
      G12.setTitle('Passage not found');
      root.appendChild(el('h1', { text: 'Passage not found' }));
      root.appendChild(el('p', { text: 'This passage does not exist or has been removed.' }));
      root.appendChild(el('a', { className: 'btn', href: 'reading.html', text: 'Back to all passages' }));
      return;
    }

    var passage = content.passages[index];
    G12.setTitle(passage.title);

    root.appendChild(el('nav', { className: 'breadcrumb', 'aria-label': 'Breadcrumb' }, [
      el('ol', null, [
        el('li', null, [el('a', { href: 'reading.html', text: 'Reading Comprehension' })]),
        el('li', null, [el('span', { 'aria-current': 'page', dir: 'auto', text: passage.title })])
      ])
    ]));
    root.appendChild(el('h1', { dir: 'auto', text: passage.title }));
    root.appendChild(G12.badges(passage));
    var notice = G12.reviewNotice(passage, 'passage and its questions');
    if (notice) root.appendChild(notice);
    var skipped = G12.skippedNotice(content.skipped);
    if (skipped) root.appendChild(skipped);

    var article = el('article', { className: 'passage', 'aria-labelledby': 'passage-heading' }, [
      el('h2', { id: 'passage-heading', text: 'Passage' }),
      el('ul', { className: 'passage-meta' }, metaItems(passage).map(function (text) {
        return el('li', { text: text });
      })),
      el('ol', { className: 'passage-paragraphs', 'aria-label': 'Paragraphs' }, passage.paragraphs.filter(hasText).map(function (text) {
        return el('li', { dir: 'auto', text: text });
      })),
      hasText(passage.source) ? el('p', { className: 'passage-source', dir: 'auto', text: 'Source: ' + passage.source }) : null
    ]);

    var questionColumn = el('div', { className: 'reading-questions' });
    var layout = el('div', { className: 'reading-layout' }, [article, questionColumn]);
    root.appendChild(layout);

    if (passage.questions.length === 0) {
      questionColumn.appendChild(el('div', { className: 'quiz' }, [
        el('h2', { text: 'Questions' }),
        el('p', { text: 'No questions have been added to this passage yet.' }),
        el('a', { className: 'btn btn--secondary', href: G12.MANAGER_PAGE + '#passages/edit/' + encodeURIComponent(passage.id), text: 'Add questions' })
      ]));
    } else {
      G12.renderQuiz(questionColumn, passage.questions, {
        label: 'Questions about ' + passage.title,
        shuffle: false
      });
    }

    var previous = content.passages[index - 1];
    var next = content.passages[index + 1];
    root.appendChild(el('nav', { className: 'pager', 'aria-label': 'Other passages' }, [
      previous ? el('a', { href: passageLink(previous), dir: 'auto', text: '← ' + previous.title }) : el('span'),
      next ? el('a', { href: passageLink(next), dir: 'auto', text: next.title + ' →' }) : el('span')
    ]));
  }
})();
