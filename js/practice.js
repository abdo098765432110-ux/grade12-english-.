/* Grammar Practice page: choose a topic and a number of questions, then take the quiz.
   practice.html?topic=<lesson id> preselects a topic. */
(function () {
  'use strict';

  var G12 = window.G12;
  var el = G12.el;
  var root = document.getElementById('page-root');
  var OTHER = '__other__';
  var COUNT_CHOICES = [5, 10, 20];

  var content = null;
  var groups = [];
  var settings = { topic: '', count: null };
  var setupArea = el('div');
  var quizArea = el('div', { id: 'quiz-area' });

  G12.loadContent(['questions', 'lessons']).then(function (loaded) {
    content = loaded;
    G12.setTitle('Grammar Practice');
    G12.clear(root);
    root.appendChild(el('h1', { text: 'Grammar Practice' }));
    root.appendChild(el('p', { className: 'lead', text: 'Choose a topic, answer the questions and read the feedback after each answer.' }));
    var skipped = G12.skippedNotice(content.skipped);
    if (skipped) root.appendChild(skipped);

    if (content.questions.length === 0) {
      root.appendChild(G12.emptyState(
        'No practice questions added yet',
        'Grammar practice questions will appear here once they are added in the content manager.',
        [{ label: 'Add a question', href: G12.MANAGER_PAGE + '#questions/new' }]
      ));
      return;
    }

    var notice = G12.listReviewNotice(content.questions);
    if (notice) root.appendChild(notice);

    groups = topicGroups();
    var requested = G12.param('topic');
    if (requested && groups.some(function (group) { return group.value === requested; })) {
      settings.topic = requested;
    }
    root.appendChild(setupArea);
    root.appendChild(quizArea);
    showSetup(false);
  }).catch(function (error) {
    G12.showError(root, error);
  });

  /* Lessons that have questions (in lesson order), plus "Other questions". */
  function topicGroups() {
    var lessonIds = content.lessons.map(function (lesson) { return lesson.id; });
    var list = content.lessons.map(function (lesson) {
      return {
        value: lesson.id,
        label: lesson.title,
        questions: content.questions.filter(function (q) { return q.topic === lesson.id; })
      };
    }).filter(function (group) { return group.questions.length > 0; });
    var other = content.questions.filter(function (q) {
      return !q.topic || lessonIds.indexOf(q.topic) === -1;
    });
    if (other.length) list.push({ value: OTHER, label: 'Other questions', questions: other });
    return list;
  }

  function poolFor(topic) {
    if (!topic) return content.questions;
    var group = groups.filter(function (g) { return g.value === topic; })[0];
    return group ? group.questions : content.questions;
  }

  /* ---------- Settings form ---------- */

  function showSetup(moveFocus) {
    G12.clear(quizArea);
    G12.clear(setupArea);
    setupArea.hidden = false;

    var select = el('select', { id: 'practice-topic', name: 'topic' }, [
      el('option', { value: '', text: 'All topics (' + content.questions.length + ')' })
    ].concat(groups.map(function (group) {
      return el('option', { value: group.value, text: group.label + ' (' + group.questions.length + ')' });
    })));
    select.value = settings.topic;

    var countChoices = el('div', { className: 'inline-choices' });
    var heading = el('h2', { id: 'setup-heading', tabindex: '-1', text: 'Choose your practice' });
    var form = el('form', { className: 'panel', 'aria-labelledby': 'setup-heading', novalidate: true }, [
      heading,
      el('div', { className: 'form-row' }, [
        el('label', { for: 'practice-topic', text: 'Topic' }),
        select
      ]),
      el('fieldset', { className: 'form-row' }, [
        el('legend', { text: 'Number of questions' }),
        countChoices,
        el('p', { className: 'hint', text: 'Questions are chosen at random from the topic.' })
      ]),
      el('div', { className: 'actions' }, [el('button', { type: 'submit', className: 'btn', text: 'Start practice' })])
    ]);

    function drawCountChoices() {
      var available = poolFor(select.value).length;
      var values = COUNT_CHOICES.filter(function (n) { return n < available; }).map(String).concat(['all']);
      var current = settings.count && values.indexOf(String(settings.count)) !== -1 ? String(settings.count) : (available > 10 ? '10' : 'all');
      G12.clear(countChoices);
      values.forEach(function (value) {
        var id = 'practice-count-' + value;
        countChoices.appendChild(el('label', { for: id }, [
          el('input', { type: 'radio', id: id, name: 'count', value: value, checked: value === current }),
          value === 'all' ? 'All (' + available + ')' : value
        ]));
      });
    }

    select.addEventListener('change', drawCountChoices);
    drawCountChoices();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var chosen = form.querySelector('input[name="count"]:checked');
      settings.topic = select.value;
      settings.count = chosen && chosen.value !== 'all' ? Number(chosen.value) : null;
      startQuiz();
    });

    setupArea.appendChild(form);
    if (moveFocus) G12.focus(heading);
  }

  /* ---------- Quiz ---------- */

  function startQuiz() {
    var pool = poolFor(settings.topic);
    var picked = G12.QuizEngine.shuffle(pool, Math.random);
    if (settings.count) picked = picked.slice(0, settings.count);

    setupArea.hidden = true;
    G12.clear(quizArea);
    quizArea.appendChild(el('p', null, [
      el('button', { type: 'button', className: 'btn btn--link', text: '← Change practice settings', onclick: function () { showSetup(true); } })
    ]));
    var holder = el('div');
    quizArea.appendChild(holder);
    G12.renderQuiz(holder, picked, {
      label: 'Grammar practice',
      shuffle: true,
      resultActions: [{ label: 'Change practice settings', onClick: function () { showSetup(true); } }]
    });
    G12.focus(holder.querySelector('h2'));
  }
})();
