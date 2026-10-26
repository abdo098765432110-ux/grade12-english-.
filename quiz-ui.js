/* ==========================================================================
   Quiz interface: draws a quiz on the page and connects buttons to the
   quiz engine. Shared by Grammar Practice and Reading Comprehension.

   G12.renderQuiz(container, questions, {
     label: 'Grammar practice',   // accessible name for the quiz
     shuffle: true,               // shuffle question order
     resultActions: [{ label: 'Change settings', onClick: fn }]
   })
   ========================================================================== */
(function (global) {
  'use strict';

  var G12 = global.G12;
  var el = G12.el;
  var t = G12.t;
  var LETTERS = 'ABCDEFGH';

  /* Content (answers, explanations) inside an interface sentence is wrapped
     in <bdi> so English content and Arabic interface text never get mixed up. */
  function content(text) {
    return el('bdi', { text: text });
  }

  /* Interface text inside a content block keeps the interface direction, and
     is ignored when the block works out its own direction (dir="auto"). */
  function ui(tag, props) {
    props = props || {};
    props.dir = G12.dir;
    return el(tag, props);
  }

  function reviewNote() {
    return el('p', {
      className: 'review-note',
      text: t('This answer has not yet been reviewed by a teacher, so it is a suggestion, not a final answer.')
    });
  }

  function explanationParagraph(question, reviewed) {
    if (!G12.Schema.hasText(question.explanation)) return null;
    return el('p', null, [
      el('strong', { text: (reviewed ? t('Explanation:') : t('Suggested explanation:')) + ' ' }),
      el('span', { dir: 'auto', className: 'explanation-text', text: question.explanation })
    ]);
  }

  /* "3 / 5" always reads left to right, also on Arabic pages. */
  function scoreText(score, total) {
    return el('bdi', { dir: 'ltr', text: score + ' / ' + total });
  }

  function difficultyLabels(question) {
    return question.difficulty ? [t('Difficulty: {level}', { level: t(question.difficulty) })] : [];
  }

  /* The question text, with the number above it (interface language). */
  function promptNodes(question, numberText) {
    return [
      numberText ? ui('span', { className: 'question-number', text: numberText }) : null,
      el('span', { className: 'prompt-text' }, [G12.renderPrompt(question.prompt)])
    ];
  }

  G12.renderQuiz = function (container, questions, options) {
    options = options || {};
    var quiz = new G12.QuizEngine.Quiz(questions, { shuffle: options.shuffle !== false });
    var root = el('section', { className: 'quiz', 'aria-label': options.label || t('Quiz') });
    G12.clear(container).appendChild(root);
    showQuestion(false);

    /* ---------- Question view ---------- */

    function showQuestion(moveFocus) {
      G12.clear(root);
      var item = quiz.current;
      var question = item.question;
      var reviewed = G12.isReviewed(question);
      var number = quiz.index + 1;
      var fieldName = 'quiz-r' + quiz.round + '-q' + quiz.index;

      var heading = el('h2', {
        className: 'quiz-progress-text',
        tabindex: '-1',
        text: quiz.roundType === 'missed'
          ? t('Missed questions — Question {n} of {total}', { n: number, total: quiz.total })
          : t('Question {n} of {total}', { n: number, total: quiz.total })
      });

      root.appendChild(el('div', { className: 'quiz-header' }, [
        heading,
        el('button', {
          type: 'button',
          className: 'btn btn--link',
          text: t('Restart quiz'),
          onclick: function () {
            quiz.restart();
            showQuestion(true);
          }
        })
      ]));
      root.appendChild(el('progress', { max: quiz.total, value: quiz.index, 'aria-hidden': 'true' }));

      var badges = G12.badges(question, difficultyLabels(question));

      var form = el('form', { className: 'question-form', novalidate: true });
      var feedback = el('div', { className: 'feedback', tabindex: '-1' });
      var submitButton = el('button', { type: 'submit', className: 'btn', text: t('Submit answer') });
      var actions = el('div', { className: 'actions' }, [submitButton]);

      var inputs = [];
      var optionItems = [];
      var textarea = null;

      if (question.type === 'mcq') {
        var list = el('ul', { className: 'options' });
        question.options.forEach(function (option, i) {
          var input = el('input', { type: 'radio', name: fieldName, value: String(i), 'data-index': String(i) });
          var status = ui('span', { className: 'option-status' });
          var li = el('li', { className: 'option' }, [
            el('label', null, [
              input,
              el('span', { className: 'option-letter', 'aria-hidden': 'true', text: LETTERS.charAt(i) + '.' }),
              el('span', { className: 'option-text', dir: 'auto', text: option }),
              status
            ])
          ]);
          inputs.push(input);
          optionItems.push({ li: li, input: input, status: status, option: option });
          list.appendChild(li);
        });
        form.appendChild(el('fieldset', { dir: 'auto' }, [
          el('legend', { className: 'question-legend' }, promptNodes(question, null)),
          badges,
          list
        ]));
      } else {
        var textareaId = fieldName + '-answer';
        textarea = el('textarea', { id: textareaId, dir: 'auto', rows: '5' });
        form.appendChild(el('div', { className: 'form-row' }, [
          el('label', { className: 'question-legend', for: textareaId, dir: 'auto' }, promptNodes(question, null)),
          badges,
          el('p', { className: 'hint', id: textareaId + '-hint', text: reviewed
            ? t('Write your answer, then submit it to compare it with the correct answer. Written answers are not scored automatically.')
            : t('Write your answer, then submit it to compare it with the suggested answer. Written answers are not scored automatically.') }),
          textarea
        ]));
        textarea.setAttribute('aria-describedby', textareaId + '-hint');
      }

      form.appendChild(feedback);
      form.appendChild(actions);
      root.appendChild(form);

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (question.type === 'mcq') submitChoice();
        else submitWritten();
      });

      if (moveFocus) G12.focus(heading);

      /* ---------- Helpers for this question ---------- */

      /* title: text, or a list of text and elements (from G12.tNodes). */
      function setFeedback(kind, title, children) {
        G12.clear(feedback);
        feedback.className = 'feedback feedback--' + kind;
        feedback.appendChild(el('p', { className: 'feedback-title' }, title));
        (children || []).forEach(function (child) { if (child) feedback.appendChild(child); });
        G12.focus(feedback);
      }

      function setActions(buttons) {
        G12.clear(actions);
        buttons.forEach(function (button) { actions.appendChild(button); });
      }

      function nextButton() {
        var last = quiz.index === quiz.total - 1;
        return el('button', {
          type: 'button',
          className: 'btn',
          text: last ? t('See results') : t('Next question'),
          onclick: function () {
            quiz.next();
            if (quiz.finished) showResults();
            else showQuestion(true);
          }
        });
      }

      /* Show which options were tried and which is the (suggested) answer. */
      function paintOptions(lockAll) {
        optionItems.forEach(function (entry) {
          var tried = quiz.hasTried(entry.option);
          var isAnswer = entry.option === question.answer;
          var showAnswer = isAnswer && (item.revealed || tried);
          entry.li.classList.toggle('option--tried', tried && !isAnswer);
          entry.li.classList.toggle('option--match', showAnswer);
          if (showAnswer) {
            entry.status.textContent = reviewed ? t('✓ Correct answer') : t('✓ Suggested answer');
          } else if (tried) {
            entry.status.textContent = t('✗ Tried');
          } else {
            entry.status.textContent = '';
          }
          entry.input.disabled = lockAll || item.revealed || tried;
        });
      }

      function submitChoice() {
        var checked = inputs.filter(function (input) { return input.checked; })[0];
        if (!checked) {
          setFeedback('warning', t('Choose an answer first.'), []);
          return;
        }
        var option = question.options[Number(checked.getAttribute('data-index'))];
        var result = quiz.submit(option);
        paintOptions(true);

        if (result.matches) {
          setFeedback('match', reviewed ? t('Correct!') : t('Your answer matches the suggested answer.'), [
            explanationParagraph(question, reviewed),
            reviewed ? null : reviewNote()
          ]);
          setActions([nextButton()]);
          return;
        }

        var hint;
        if (quiz.canRetry()) hint = reviewed ? t('You can try again or show the correct answer.') : t('You can try again or show the suggested answer.');
        else hint = reviewed ? t('Show the correct answer to continue.') : t('Show the suggested answer to continue.');
        setFeedback('differs', reviewed ? t('Not correct.') : t('Your answer is different from the suggested answer.'), [
          el('p', { text: hint })
        ]);
        var buttons = [];
        if (quiz.canRetry()) {
          buttons.push(el('button', {
            type: 'button',
            className: 'btn',
            text: t('Try again'),
            onclick: tryAgain
          }));
        }
        buttons.push(el('button', {
          type: 'button',
          className: 'btn btn--secondary',
          text: reviewed ? t('Show correct answer') : t('Show suggested answer'),
          onclick: showAnswer
        }));
        setActions(buttons);
      }

      function tryAgain() {
        inputs.forEach(function (input) { input.checked = false; });
        paintOptions(false);
        G12.clear(feedback);
        feedback.className = 'feedback';
        setActions([submitButton]);
        var firstOpen = inputs.filter(function (input) { return !input.disabled; })[0];
        if (firstOpen) firstOpen.focus();
      }

      function showAnswer() {
        quiz.reveal();
        paintOptions(true);
        setFeedback('info', G12.tNodes(reviewed ? 'Correct answer: {answer}' : 'Suggested answer: {answer}', null, { answer: content(question.answer) }), [
          explanationParagraph(question, reviewed),
          reviewed ? null : reviewNote()
        ]);
        setActions([nextButton()]);
      }

      function submitWritten() {
        if (!textarea.value.trim()) {
          setFeedback('warning', t('Write an answer first.'), []);
          return;
        }
        quiz.submit(textarea.value);
        textarea.readOnly = true;
        setFeedback('info', reviewed ? t('Answer saved. Compare it with the correct answer:') : t('Answer saved. Compare it with the suggested answer:'), [
          el('p', { dir: 'auto', text: question.modelAnswer }),
          explanationParagraph(question, reviewed),
          el('p', { className: 'hint', text: t('Written answers are not scored automatically.') }),
          reviewed ? null : reviewNote()
        ]);
        setActions([nextButton()]);
      }
    }

    /* ---------- Results view ---------- */

    function showResults() {
      G12.clear(root);
      var results = quiz.results();
      var heading = el('h2', {
        tabindex: '-1',
        text: results.roundType === 'missed' ? t('Results — missed questions') : t('Results')
      });
      root.appendChild(heading);

      if (results.scoredCount > 0) {
        var allReviewed = !results.provisional;
        root.appendChild(el('div', { className: 'score-box' }, [
          el('p', { className: 'score-number' }, [scoreText(results.firstTryMatches, results.scoredCount)]),
          el('p', {
            text: allReviewed
              ? t('questions answered correctly on the first try ({percent}%).', { percent: results.percent })
              : t('answers matched the suggested answer on the first try ({percent}%).', { percent: results.percent })
          })
        ]));
        if (results.provisional) {
          root.appendChild(el('div', { className: 'notice notice--demo', role: 'note' }, [
            el('p', null, [
              el('strong', { text: t('Provisional score.') + ' ' }),
              results.unreviewedCount === 1
                ? t('{answers} in this quiz has not yet been reviewed by a teacher, so this score may change after review.', { answers: G12.plural(1, 'answer') })
                : t('{answers} in this quiz have not yet been reviewed by a teacher, so this score may change after review.', { answers: G12.plural(results.unreviewedCount, 'answer') })
            ])
          ]));
        }
      }
      if (results.shortAnswerCount > 0) {
        root.appendChild(el('p', {
          text: results.shortAnswerCount === 1
            ? t('{answers} is not scored. Compare it with the answers below.', { answers: G12.plural(1, 'written answer') })
            : t('{answers} are not scored. Compare them with the answers below.', { answers: G12.plural(results.shortAnswerCount, 'written answer') })
        }));
      }

      root.appendChild(el('h3', { text: t('Review your answers') }));
      var list = el('ol', { className: 'review-list' });
      results.items.forEach(function (entry) {
        var question = entry.question;
        var li = el('li');
        li.appendChild(el('p', { dir: 'auto' }, [el('strong', null, [G12.renderPrompt(question.prompt)])]));
        if (entry.scored) {
          var matched = entry.firstTryMatches;
          var outcomeText = entry.reviewed
            ? (matched ? t('Correct on the first try') : t('Not correct on the first try'))
            : (matched ? t('Matched the suggested answer') : t('Different from the suggested answer'));
          li.appendChild(el('p', null, [
            el('span', { className: 'review-outcome review-outcome--' + (matched ? 'match' : 'differs'), text: (matched ? '✓ ' : '✗ ') + outcomeText })
          ]));
          li.appendChild(el('p', null, G12.tNodes('Your first answer: {answer}', null, { answer: el('strong', null, [content(entry.firstAnswer || '—')]) })));
          li.appendChild(el('p', null, G12.tNodes(entry.reviewed ? 'Correct answer: {answer}' : 'Suggested answer: {answer}', null, { answer: el('strong', null, [content(question.answer)]) })));
          if (entry.attempts > 1) li.appendChild(el('p', { className: 'hint', text: t('You used {n} attempts.', { n: entry.attempts }) }));
        } else {
          li.appendChild(el('p', null, [el('span', { className: 'review-outcome review-outcome--recorded', text: t('Written answer (not scored)') })]));
          li.appendChild(el('p', null, G12.tNodes('Your answer: {answer}', null, { answer: content(entry.response || '—') })));
          li.appendChild(el('p', null, G12.tNodes(entry.reviewed ? 'Model answer: {answer}' : 'Suggested answer: {answer}', null, { answer: content(question.modelAnswer) })));
        }
        var explanation = explanationParagraph(question, entry.reviewed);
        if (explanation) li.appendChild(explanation);
        if (!entry.reviewed) li.appendChild(el('p', { className: 'hint', text: t('Not yet reviewed by a teacher.') }));
        list.appendChild(li);
      });
      root.appendChild(list);

      var buttons = [];
      var missed = quiz.missedQuestions().length;
      if (missed > 0) {
        buttons.push(el('button', {
          type: 'button',
          className: 'btn',
          text: t('Retry missed questions ({n})', { n: missed }),
          onclick: function () {
            quiz.retryMissed();
            showQuestion(true);
          }
        }));
      }
      buttons.push(el('button', {
        type: 'button',
        className: missed > 0 ? 'btn btn--secondary' : 'btn',
        text: t('Restart quiz'),
        onclick: function () {
          quiz.restart();
          showQuestion(true);
        }
      }));
      (options.resultActions || []).forEach(function (action) {
        buttons.push(el('button', { type: 'button', className: 'btn btn--secondary', text: action.label, onclick: action.onClick }));
      });
      root.appendChild(el('div', { className: 'actions' }, buttons));
      G12.focus(heading);
    }

    return quiz;
  };

  /* ==========================================================================
     Answer-all mode ("worksheet"): every question is shown in order, the
     student answers any of them, then checks them all at once.

     G12.renderWorksheet(container, questions, {
       label: 'Questions about …',   // accessible name
       title: 'Questions',           // heading text
       resultActions: [{ label, onClick }]
     })
     Unanswered questions are reported before checking and are marked
     "Not answered" with no marks; they are never counted as correct.
     ========================================================================== */
  var worksheetCount = 0;

  G12.renderWorksheet = function (container, questions, options) {
    options = options || {};
    var root = el('section', { className: 'quiz worksheet', 'aria-label': options.label || t('Questions') });
    G12.clear(container).appendChild(root);
    draw(questions, false, false);

    function draw(set, missedRound, moveFocus) {
      worksheetCount += 1;
      var prefix = 'ws' + worksheetCount;
      var answers = {};
      var confirmedBlank = false;
      var views = [];
      G12.clear(root);

      var heading = el('h2', {
        tabindex: '-1',
        text: t('{title} ({n})', { title: missedRound ? t('Missed questions') : (options.title || t('Questions')), n: set.length })
      });
      var answeredText = el('p', { className: 'answered-count', 'aria-live': 'polite' });
      root.appendChild(el('div', { className: 'quiz-header' }, [heading, answeredText]));
      root.appendChild(el('p', { className: 'hint', text: t('Answer the questions in any order, then choose “Check my answers”.') }));
      var scoreArea = el('div', { className: 'worksheet-score' });
      root.appendChild(scoreArea);

      var form = el('form', { novalidate: true });
      var list = el('ol', { className: 'worksheet-list' });
      set.forEach(function (question, index) {
        var view = questionView(question, index, prefix + '-q' + index);
        views.push(view);
        list.appendChild(view.li);
      });
      var warning = el('div', { className: 'worksheet-warning' });
      var actions = el('div', { className: 'actions' }, [
        el('button', { type: 'submit', className: 'btn', text: t('Check my answers') })
      ]);
      form.appendChild(list);
      form.appendChild(warning);
      form.appendChild(actions);
      root.appendChild(form);

      function updateCount() {
        var blank = G12.QuizEngine.unansweredNumbers(set, answers).length;
        answeredText.textContent = t('Answered {n} of {total}', { n: set.length - blank, total: set.length });
      }
      updateCount();

      form.addEventListener('change', function (event) {
        var target = event.target;
        if (target && target.type === 'radio') {
          answers[target.getAttribute('data-question')] = set[Number(target.getAttribute('data-q'))].options[Number(target.getAttribute('data-index'))];
          updateCount();
        }
      });
      form.addEventListener('input', function (event) {
        var target = event.target;
        if (target && target.tagName === 'TEXTAREA') {
          answers[target.getAttribute('data-question')] = target.value;
          updateCount();
        }
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var blank = G12.QuizEngine.unansweredNumbers(set, answers);
        if (blank.length && !confirmedBlank) {
          showBlankWarning(blank);
          return;
        }
        check();
      });

      function showBlankWarning(blank) {
        G12.clear(warning);
        var first = views[blank[0] - 1];
        warning.appendChild(el('div', { className: 'notice notice--demo', role: 'alert', tabindex: '-1' }, [
          el('p', null, [
            el('strong', { text: t('You have not answered {questions}:', { questions: G12.plural(blank.length, 'question') }) + ' ' }),
            t('{numbers}. Unanswered questions are marked “Not answered” and get no marks.', { numbers: blank.join(G12.lang === 'ar' ? '، ' : ', ') })
          ]),
          el('div', { className: 'actions' }, [
            el('button', {
              type: 'button',
              className: 'btn btn--secondary',
              text: t('Go to question {n}', { n: blank[0] }),
              onclick: function () {
                G12.clear(warning);
                first.li.scrollIntoView({ block: 'center' });
                first.focusTarget().focus();
              }
            }),
            el('button', {
              type: 'button',
              className: 'btn',
              text: t('Check anyway'),
              onclick: function () {
                confirmedBlank = true;
                check();
              }
            })
          ])
        ]));
        G12.focus(warning.firstChild);
      }

      function check() {
        G12.clear(warning);
        var result = G12.QuizEngine.gradeAll(set, answers);
        result.items.forEach(function (item, index) { views[index].showResult(item); });
        answeredText.textContent = '';
        showScore(result);
        G12.clear(actions);
        if (result.missed.length) {
          actions.appendChild(el('button', {
            type: 'button',
            className: 'btn',
            text: t('Retry missed questions ({n})', { n: result.missed.length }),
            onclick: function () { draw(result.missed, true, true); }
          }));
        }
        actions.appendChild(el('button', {
          type: 'button',
          className: result.missed.length ? 'btn btn--secondary' : 'btn',
          text: t('Start again'),
          onclick: function () { draw(questions, false, true); }
        }));
        (options.resultActions || []).forEach(function (action) {
          actions.appendChild(el('button', { type: 'button', className: 'btn btn--secondary', text: action.label, onclick: action.onClick }));
        });
      }

      function showScore(result) {
        G12.clear(scoreArea);
        var scoreHeading = el('h3', { tabindex: '-1', text: t('Your score') });
        scoreArea.appendChild(scoreHeading);
        if (result.scoredCount > 0) {
          var reviewedWords = !result.provisional;
          scoreArea.appendChild(el('div', { className: 'score-box' }, [
            el('p', { className: 'score-number' }, [scoreText(result.correctCount, result.scoredCount)]),
            el('p', {
              text: reviewedWords
                ? t('questions answered correctly ({percent}%).', { percent: result.percent })
                : t('answers matched the suggested answers ({percent}%).', { percent: result.percent })
            }),
            el('ul', { className: 'score-breakdown' }, [
              el('li', { text: reviewedWords ? t('Correct: {n}', { n: result.correctCount }) : t('Matched: {n}', { n: result.correctCount }) }),
              el('li', { text: reviewedWords ? t('Not correct: {n}', { n: result.incorrectCount }) : t('Different: {n}', { n: result.incorrectCount }) }),
              el('li', { text: t('Not answered: {n}', { n: result.unansweredCount }) })
            ])
          ]));
          if (result.provisional) {
            scoreArea.appendChild(el('div', { className: 'notice notice--demo', role: 'note' }, [
              el('p', null, [
                el('strong', { text: t('Provisional score.') + ' ' }),
                result.unreviewedCount === 1
                  ? t('{answers} in this set has not yet been reviewed by a teacher, so this score may change after review.', { answers: G12.plural(1, 'answer') })
                  : t('{answers} in this set have not yet been reviewed by a teacher, so this score may change after review.', { answers: G12.plural(result.unreviewedCount, 'answer') })
              ])
            ]));
          }
        }
        if (result.shortAnswerCount > 0) {
          scoreArea.appendChild(el('p', {
            text: result.shortAnswerCount === 1
              ? t('{answers} is not scored. Compare it with the suggested answers below.', { answers: G12.plural(1, 'written answer') })
              : t('{answers} are not scored. Compare them with the suggested answers below.', { answers: G12.plural(result.shortAnswerCount, 'written answer') })
          }));
        }
        G12.focus(scoreHeading);
      }
    }

    /* One question in the list: its inputs, and later its result. */
    function questionView(question, index, id) {
      var reviewed = G12.isReviewed(question);
      var labels = difficultyLabels(question);
      var numberText = t('Question {n}', { n: index + 1 });
      var result = el('div', { className: 'feedback', id: id + '-result' });
      var li = el('li', { className: 'worksheet-q', id: id });
      var inputs = [];
      var optionItems = [];
      var textarea = null;

      if (question.type === 'mcq') {
        var optionList = el('ul', { className: 'options' });
        question.options.forEach(function (option, i) {
          var input = el('input', {
            type: 'radio', name: id, value: String(i),
            'data-q': String(index), 'data-index': String(i), 'data-question': question.id
          });
          var status = ui('span', { className: 'option-status' });
          var optionLi = el('li', { className: 'option' }, [
            el('label', null, [
              input,
              el('span', { className: 'option-letter', 'aria-hidden': 'true', text: LETTERS.charAt(i) + '.' }),
              el('span', { className: 'option-text', dir: 'auto', text: option }),
              status
            ])
          ]);
          inputs.push(input);
          optionItems.push({ li: optionLi, input: input, status: status, option: option });
          optionList.appendChild(optionLi);
        });
        li.appendChild(el('fieldset', { dir: 'auto' }, [
          el('legend', { className: 'question-legend' }, promptNodes(question, numberText)),
          G12.badges(question, labels),
          optionList
        ]));
      } else {
        textarea = el('textarea', { id: id + '-answer', dir: 'auto', rows: '4', 'data-question': question.id });
        li.appendChild(el('div', { className: 'form-row' }, [
          el('label', { className: 'question-legend', for: id + '-answer', dir: 'auto' }, promptNodes(question, numberText)),
          G12.badges(question, labels),
          el('p', { className: 'hint', id: id + '-hint', text: t('Written answers are not scored automatically.') }),
          textarea
        ]));
        textarea.setAttribute('aria-describedby', id + '-hint');
      }
      li.appendChild(result);


      function showResult(item) {
        inputs.forEach(function (input) { input.disabled = true; });
        if (textarea) textarea.readOnly = true;
        var kind;
        var title;
        var children = [];

        if (question.type === 'mcq') {
          optionItems.forEach(function (entry) {
            var chosen = entry.option === item.response;
            var isAnswer = entry.option === question.answer;
            entry.li.classList.toggle('option--match', isAnswer);
            entry.li.classList.toggle('option--tried', chosen && !isAnswer);
            if (isAnswer && chosen) entry.status.textContent = t('✓ Your answer');
            else if (isAnswer) entry.status.textContent = reviewed ? t('✓ Correct answer') : t('✓ Suggested answer');
            else if (chosen) entry.status.textContent = t('✗ Your answer');
          });
          var answer = { answer: content(question.answer) };
          switch (item.status) {
            case 'correct':
              kind = 'match'; title = [t('Correct.')]; break;
            case 'matches':
              kind = 'match'; title = [t('Your answer matches the suggested answer.')]; break;
            case 'incorrect':
              kind = 'differs'; title = G12.tNodes('Not correct. Correct answer: {answer}', null, answer); break;
            case 'differs':
              kind = 'differs'; title = G12.tNodes('Different from the suggested answer. Suggested answer: {answer}', null, answer); break;
            default:
              kind = 'warning';
              title = G12.tNodes(reviewed ? 'Not answered — no marks. Correct answer: {answer}' : 'Not answered — no marks. Suggested answer: {answer}', null, answer);
          }
        } else if (item.status === 'recorded') {
          kind = 'info';
          title = [reviewed ? t('Compare your answer with the model answer:') : t('Compare your answer with the suggested answer:')];
          children.push(el('p', { dir: 'auto', text: question.modelAnswer }));
        } else {
          kind = 'warning';
          title = [reviewed ? t('Not answered. Model answer:') : t('Not answered. Suggested answer:')];
          children.push(el('p', { dir: 'auto', text: question.modelAnswer }));
        }
        children.push(explanationParagraph(question, reviewed));
        if (!reviewed) children.push(reviewNote());

        G12.clear(result);
        result.className = 'feedback feedback--' + kind;
        result.appendChild(el('p', { className: 'feedback-title' }, title));
        children.forEach(function (child) { if (child) result.appendChild(child); });
      }

      return {
        li: li,
        showResult: showResult,
        focusTarget: function () { return inputs[0] || textarea; }
      };
    }
  };
})(window);
