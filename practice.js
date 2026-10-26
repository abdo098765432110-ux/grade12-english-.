/* Grammar Practice page: choose a unit, a topic, how many questions and how
   to answer them, then practise.
     practice.html?unit=<unit id>     preselects a unit
     practice.html?topic=<lesson id>  preselects a topic (and its unit) */
(function () {
  'use strict';

  var G12 = window.G12;
  var Schema = G12.Schema;
  var el = G12.el;
  var t = G12.t;
  var root = document.getElementById('page-root');
  var OTHER_UNIT = '__other__';   // questions with no unit (or an unknown unit)
  var NO_TOPIC = '__none__';      // questions with no topic (or an unknown topic)
  var COUNT_CHOICES = [5, 10, 20];
  var MODES = [
    { value: 'one', label: t('One at a time — feedback after each answer') },
    { value: 'all', label: t('All at once — answer everything, then check') }
  ];

  var content = null;
  var settings = { unit: '', topic: '', count: null, mode: 'one' };
  var setupArea = el('div');
  var quizArea = el('div', { id: 'quiz-area' });

  G12.loadContent(['units', 'lessons', 'questions']).then(function (loaded) {
    content = loaded;
    G12.setTitle(t('Grammar Practice'));
    G12.clear(root);
    root.appendChild(el('h1', { text: t('Grammar Practice') }));
    root.appendChild(el('p', { className: 'lead', text: t('Choose a unit and topic, answer the questions and read the feedback.') }));
    var skipped = G12.skippedNotice(content, ['units', 'questions']);
    if (skipped) root.appendChild(skipped);

    if (content.questions.length === 0) {
      root.appendChild(G12.emptyState(
        t('No practice questions added yet'),
        t('Grammar practice questions will appear here once they are added in the content manager.'),
        [{ label: t('Add a question'), href: G12.MANAGER_PAGE + '#questions/new' }]
      ));
      return;
    }

    var notice = G12.listReviewNotice(content.questions);
    if (notice) root.appendChild(notice);
    applyAddress();
    root.appendChild(setupArea);
    root.appendChild(quizArea);
    showSetup(false);
  }).catch(function (error) {
    G12.showError(root, error, { title: t('Grammar Practice') });
  });

  /* ---------- Which questions belong where ---------- */

  function knownUnit(id) {
    return Boolean(Schema.findById(content.units, id));
  }

  function knownLesson(id) {
    return Boolean(Schema.findById(content.lessons, id));
  }

  function unitOf(question) {
    var unitId = Schema.unitIdOf(question, content.lessons);
    return knownUnit(unitId) ? unitId : OTHER_UNIT;
  }

  function topicOf(question) {
    return knownLesson(question.topicId) ? question.topicId : NO_TOPIC;
  }

  function inUnit(question, unit) {
    return !unit || unitOf(question) === unit;
  }

  function pool(unit, topic) {
    return content.questions.filter(function (question) {
      return inUnit(question, unit) && (!topic || topicOf(question) === topic);
    });
  }

  /* Preselect from the address: ?topic= wins, then ?unit=. */
  function applyAddress() {
    var topic = G12.param('topic');
    var unit = G12.param('unit');
    if (topic && knownLesson(topic)) {
      var lesson = Schema.findById(content.lessons, topic);
      settings.unit = knownUnit(lesson.unitId) ? lesson.unitId : (pool(OTHER_UNIT, topic).length ? OTHER_UNIT : '');
      settings.topic = topic;
    } else if (unit && knownUnit(unit)) {
      settings.unit = unit;
    }
  }

  function unitOptions() {
    var list = [{ value: '', label: t('All units ({count})', { count: content.questions.length }) }];
    content.units.forEach(function (unit) {
      var count = pool(unit.id, '').length;
      list.push({ value: unit.id, label: count ? t('{title} ({count})', { title: unit.title, count: count }) : t('{title} (no questions yet)', { title: unit.title }) });
    });
    var other = pool(OTHER_UNIT, '').length;
    if (other && content.units.length) list.push({ value: OTHER_UNIT, label: t('Questions without a unit ({count})', { count: other }) });
    return list;
  }

  function topicOptions(unit) {
    var lessons = unit === OTHER_UNIT
      ? content.lessons.filter(function (lesson) { return !knownUnit(lesson.unitId); })
      : unit
        ? content.lessons.filter(function (lesson) { return lesson.unitId === unit; })
        : Schema.orderByUnit(content.lessons, content.units, content.lessons);
    var list = [{ value: '', label: t('All topics ({count})', { count: pool(unit, '').length }) }];
    lessons.forEach(function (lesson) {
      var count = pool(unit, lesson.id).length;
      list.push({ value: lesson.id, label: count ? t('{title} ({count})', { title: lesson.title, count: count }) : t('{title} (no questions yet)', { title: lesson.title }) });
    });
    var noTopic = pool(unit, NO_TOPIC).length;
    if (noTopic) list.push({ value: NO_TOPIC, label: t('Questions without a topic ({count})', { count: noTopic }) });
    return list;
  }

  function fillSelect(select, options, value) {
    G12.clear(select);
    options.forEach(function (option) {
      select.appendChild(el('option', { value: option.value, text: option.label }));
    });
    select.value = options.some(function (option) { return option.value === value; }) ? value : '';
  }

  /* ---------- Settings form ---------- */

  function showSetup(moveFocus) {
    G12.clear(quizArea);
    G12.clear(setupArea);
    setupArea.hidden = false;

    var unitSelect = el('select', { id: 'practice-unit', name: 'unit' });
    var topicSelect = el('select', { id: 'practice-topic', name: 'topic' });
    var countChoices = el('div', { className: 'inline-choices' });
    var emptyMessage = el('div', { className: 'practice-empty', role: 'status' });
    var startButton = el('button', { type: 'submit', className: 'btn', text: t('Start practice') });
    var heading = el('h2', { id: 'setup-heading', tabindex: '-1', text: t('Choose your practice') });

    var rows = [heading];
    if (content.units.length) {
      rows.push(el('div', { className: 'form-row' }, [el('label', { for: 'practice-unit', text: t('Unit') }), unitSelect]));
    }
    rows.push(el('div', { className: 'form-row' }, [el('label', { for: 'practice-topic', text: t('Topic') }), topicSelect]));
    rows.push(emptyMessage);
    var countFieldset = el('fieldset', { className: 'form-row' }, [
      el('legend', { text: t('Number of questions') }),
      countChoices,
      el('p', { className: 'hint', text: t('Questions are chosen at random.') })
    ]);
    rows.push(countFieldset);
    rows.push(el('fieldset', { className: 'form-row' }, [
      el('legend', { text: t('How do you want to answer?') }),
      el('div', { className: 'inline-choices' }, MODES.map(function (mode) {
        var id = 'practice-mode-' + mode.value;
        return el('label', { for: id }, [
          el('input', { type: 'radio', id: id, name: 'mode', value: mode.value, checked: settings.mode === mode.value }),
          mode.label
        ]);
      }))
    ]));
    rows.push(el('div', { className: 'actions' }, [startButton]));
    var form = el('form', { className: 'panel', 'aria-labelledby': 'setup-heading', novalidate: true }, rows);

    function refresh() {
      var available = pool(unitSelect.value || '', topicSelect.value).length;
      G12.clear(emptyMessage);
      startButton.disabled = available === 0;
      countFieldset.hidden = available === 0;
      if (available === 0) {
        emptyMessage.appendChild(el('div', { className: 'unit-empty' }, [
          el('p', { text: topicSelect.value ? t('No practice questions for this topic yet.') : t('No practice questions for this unit yet.') }),
          el('p', { className: 'hint', text: t('Choose another unit or topic.') })
        ]));
        return;
      }
      var values = COUNT_CHOICES.filter(function (n) { return n < available; }).map(String).concat(['all']);
      var current = settings.count && values.indexOf(String(settings.count)) !== -1 ? String(settings.count) : (available > 10 ? '10' : 'all');
      G12.clear(countChoices);
      values.forEach(function (value) {
        var id = 'practice-count-' + value;
        countChoices.appendChild(el('label', { for: id }, [
          el('input', { type: 'radio', id: id, name: 'count', value: value, checked: value === current }),
          value === 'all' ? t('All ({count})', { count: available }) : value
        ]));
      });
    }

    fillSelect(unitSelect, unitOptions(), settings.unit);
    fillSelect(topicSelect, topicOptions(unitSelect.value || ''), settings.topic);
    unitSelect.addEventListener('change', function () {
      fillSelect(topicSelect, topicOptions(unitSelect.value), '');
      refresh();
    });
    topicSelect.addEventListener('change', refresh);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var count = form.querySelector('input[name="count"]:checked');
      var mode = form.querySelector('input[name="mode"]:checked');
      settings.unit = unitSelect.value || '';
      settings.topic = topicSelect.value;
      settings.count = count && count.value !== 'all' ? Number(count.value) : null;
      settings.mode = mode ? mode.value : 'one';
      if (pool(settings.unit, settings.topic).length) startPractice();
    });

    setupArea.appendChild(form);
    refresh();
    if (moveFocus) G12.focus(heading);
  }

  /* ---------- Practice ---------- */

  function startPractice() {
    var picked = G12.QuizEngine.shuffle(pool(settings.unit, settings.topic), Math.random);
    if (settings.count) picked = picked.slice(0, settings.count);

    setupArea.hidden = true;
    G12.clear(quizArea);
    quizArea.appendChild(el('p', null, [
      el('button', { type: 'button', className: 'btn btn--link', text: t('← Change practice settings'), onclick: function () { showSetup(true); } })
    ]));
    var holder = el('div');
    quizArea.appendChild(holder);
    var back = [{ label: t('Change practice settings'), onClick: function () { showSetup(true); } }];
    if (settings.mode === 'all') {
      G12.renderWorksheet(holder, picked, { label: t('Grammar practice'), title: t('Practice questions'), resultActions: back });
    } else {
      G12.renderQuiz(holder, picked, { label: t('Grammar practice'), shuffle: true, resultActions: back });
    }
    G12.focus(holder.querySelector('h2'));
  }
})();
