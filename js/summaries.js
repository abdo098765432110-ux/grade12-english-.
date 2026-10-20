/* Grammar Summaries page: every summary on one page, with links to each. */
(function () {
  'use strict';

  var G12 = window.G12;
  var el = G12.el;
  var hasText = G12.Schema.hasText;
  var root = document.getElementById('page-root');

  G12.loadContent(['summaries', 'lessons', 'questions']).then(render).catch(function (error) {
    G12.showError(root, error);
  });

  function render(content) {
    G12.setTitle('Grammar Summaries');
    G12.clear(root);
    root.appendChild(el('h1', { text: 'Grammar Summaries' }));
    root.appendChild(el('p', { className: 'lead', text: 'Short revision notes for each grammar topic. You can print this page to study offline.' }));
    var skipped = G12.skippedNotice(content.skipped);
    if (skipped) root.appendChild(skipped);

    if (content.summaries.length === 0) {
      root.appendChild(G12.emptyState(
        'No summaries added yet',
        'Grammar summaries will appear here once they are added in the content manager.',
        [{ label: 'Add a summary', href: G12.MANAGER_PAGE + '#summaries/new' }]
      ));
      return;
    }

    var notice = G12.listReviewNotice(content.summaries);
    if (notice) root.appendChild(notice);

    if (content.summaries.length > 1) {
      root.appendChild(el('nav', { className: 'toc', 'aria-labelledby': 'toc-heading' }, [
        el('h2', { id: 'toc-heading', text: 'Topics on this page' }),
        el('ul', null, content.summaries.map(function (summary) {
          return el('li', null, [el('a', { href: '#' + summary.id, dir: 'auto', text: summary.title })]);
        }))
      ]));
    }

    content.summaries.forEach(function (summary) {
      root.appendChild(renderSummary(content, summary));
    });

    /* Jump to the summary named in the address (e.g. summaries.html#passive-voice-summary),
       now that it exists on the page. */
    if (window.location.hash) {
      var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        G12.focus(target.querySelector('h2'));
      }
    }
  }

  function renderSummary(content, summary) {
    var headingId = summary.id + '-heading';
    var card = el('section', { className: 'summary-card', id: summary.id, 'aria-labelledby': headingId });
    card.appendChild(el('h2', { id: headingId, dir: 'auto', text: summary.title }));
    card.appendChild(G12.badges(summary));

    var points = Array.isArray(summary.points) ? summary.points : [];
    if (points.length) {
      var showTitle = points.some(function (p) { return hasText(p.title); });
      var showExample = points.some(function (p) { return hasText(p.example); });
      var columns = [];
      if (showTitle) columns.push('Point');
      columns.push('Rule');
      if (showExample) columns.push('Example');

      card.appendChild(el('div', { className: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': summary.title + ' — rules' }, [
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
      card.appendChild(el('h3', { text: 'Remember' }));
      card.appendChild(el('ul', null, remember.map(function (text) {
        return el('li', { dir: 'auto', text: text });
      })));
    }

    var links = [];
    var lesson = hasText(summary.lessonId) ? G12.byId(content.lessons, summary.lessonId) : null;
    if (lesson) {
      links.push(el('a', { className: 'btn btn--secondary', href: 'grammar.html?lesson=' + encodeURIComponent(lesson.id), text: 'Read the full lesson' }));
      var count = content.questions.filter(function (q) { return q.topic === lesson.id; }).length;
      if (count) links.push(el('a', { className: 'btn', href: 'practice.html?topic=' + encodeURIComponent(lesson.id), text: 'Practise (' + G12.plural(count, 'question') + ')' }));
    }
    if (links.length) card.appendChild(el('div', { className: 'actions' }, links));
    return card;
  }
})();
