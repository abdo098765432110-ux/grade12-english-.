/* Home page: shows how much content each section has. */
(function () {
  'use strict';

  var G12 = window.G12;
  var status = document.getElementById('home-status');
  var WORDS = {
    lessons: ['lesson', 'No lessons yet'],
    summaries: ['summary', 'No summaries yet', 'summaries'],
    questions: ['question', 'No questions yet'],
    passages: ['passage', 'No passages yet']
  };

  G12.loadContent(['lessons', 'summaries', 'questions', 'passages']).then(function (content) {
    var total = 0;
    Object.keys(WORDS).forEach(function (key) {
      var count = content[key].length;
      total += count;
      var target = document.querySelector('[data-count="' + key + '"]');
      if (target) target.textContent = count ? G12.plural(count, WORDS[key][0], WORDS[key][2]) : WORDS[key][1];
    });

    if (total === 0) {
      status.appendChild(G12.emptyState(
        'No content added yet',
        'Lessons, summaries, practice questions and reading passages will appear here as soon as a teacher adds them.',
        [{ label: 'Open the content manager', href: G12.MANAGER_PAGE }]
      ));
    }
    var skipped = G12.skippedNotice(content.skipped);
    if (skipped) status.appendChild(skipped);
  }).catch(function (error) {
    G12.showError(status, error);
  });
})();
