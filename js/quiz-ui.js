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
  var LETTERS = 'ABCDEFGH';

  function answerWord(reviewed) {
    return reviewed ? 'correct answer' : 'suggested answer';
  }

  function reviewNote() {
    return el('p', {
      className: 'review-note',
      text: 'This answer has not yet been reviewed by a teacher, so it is a suggestion, not a final answer.'
    });
  }

  function explanationParagraph(question, reviewed) {
    if (!G12.Schema.hasText(question.explanation)) return null;
    return el('p', { dir: 'auto' }, [
      el('strong', { text: reviewed ? 'Explanation: ' : 'Suggested explanation: ' }),
      question.explanation
    ]);
  }

  G12.renderQuiz = function (container, questions, options) {
    options = options || {};
    var quiz = new G12.QuizEngine.Quiz(questions, { shuffle: options.shuffle !== false });
    var root = el('section', { className: 'quiz', 'aria-label': options.label || 'Quiz' });
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
        text: (quiz.roundType === 'missed' ? 'Missed questions — ' : '') + 'Question ' + number + ' of ' + quiz.total
      });

      root.appendChild(el('div', { className: 'quiz-header' }, [
        heading,
        el('button', {
          type: 'button',
          className: 'btn btn--link',
          text: 'Restart quiz',
          onclick: function () {
            quiz.restart();
            showQuestion(true);
          }
        })
      ]));
      root.appendChild(el('progress', { max: quiz.total, value: quiz.index, 'aria-hidden': 'true' }));

      var labels = [];
      if (question.difficulty) labels.push('Difficulty: ' + question.difficulty);
      var badges = G12.badges(question, labels);

      var form = el('form', { className: 'question-form', novalidate: true });
      var feedback = el('div', { className: 'feedback', tabindex: '-1' });
      var submitButton = el('button', { type: 'submit', className: 'btn', text: 'Submit answer' });
      var actions = el('div', { className: 'actions' }, [submitButton]);

      var inputs = [];
      var optionItems = [];
      var textarea = null;

      if (question.type === 'mcq') {
        var list = el('ul', { className: 'options' });
        question.options.forEach(function (option, i) {
          var input = el('input', { type: 'radio', name: fieldName, value: String(i), 'data-index': String(i) });
          var status = el('span', { className: 'option-status' });
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
        form.appendChild(el('fieldset', null, [
          el('legend', { className: 'question-legend', dir: 'auto' }, [G12.renderPrompt(question.prompt)]),
          badges,
          list
        ]));
      } else {
        var textareaId = fieldName + '-answer';
        textarea = el('textarea', { id: textareaId, dir: 'auto', rows: '5' });
        form.appendChild(el('div', { className: 'form-row' }, [
          el('label', { className: 'question-legend', for: textareaId, dir: 'auto' }, [G12.renderPrompt(question.prompt)]),
          badges,
          el('p', { className: 'hint', id: textareaId + '-hint', text: 'Write your answer, then submit it to compare it with the ' + answerWord(reviewed) + '. Written answers are not scored automatically.' }),
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

      function setFeedback(kind, title, children) {
        G12.clear(feedback);
        feedback.className = 'feedback feedback--' + kind;
        feedback.appendChild(el('p', { className: 'feedback-title', text: title }));
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
          text: last ? 'See results' : 'Next question',
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
            entry.status.textContent = reviewed ? '✓ Correct answer' : '✓ Suggested answer';
          } else if (tried) {
            entry.status.textContent = '✗ Tried';
          } else {
            entry.status.textContent = '';
          }
          entry.input.disabled = lockAll || item.revealed || tried;
        });
      }

      function submitChoice() {
        var checked = inputs.filter(function (input) { return input.checked; })[0];
        if (!checked) {
          setFeedback('warning', 'Choose an answer first.', []);
          return;
        }
        var option = question.options[Number(checked.getAttribute('data-index'))];
        var result = quiz.submit(option);
        paintOptions(true);

        if (result.matches) {
          setFeedback('match', reviewed ? 'Correct!' : 'Your answer matches the suggested answer.', [
            explanationParagraph(question, reviewed),
            reviewed ? null : reviewNote()
          ]);
          setActions([nextButton()]);
          return;
        }

        setFeedback('differs', reviewed ? 'Not correct.' : 'Your answer is different from the suggested answer.', [
          el('p', { text: quiz.canRetry() ? 'You can try again or show the ' + answerWord(reviewed) + '.' : 'Show the ' + answerWord(reviewed) + ' to continue.' })
        ]);
        var buttons = [];
        if (quiz.canRetry()) {
          buttons.push(el('button', {
            type: 'button',
            className: 'btn',
            text: 'Try again',
            onclick: tryAgain
          }));
        }
        buttons.push(el('button', {
          type: 'button',
          className: 'btn btn--secondary',
          text: 'Show ' + answerWord(reviewed),
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
        setFeedback('info', (reviewed ? 'Correct answer: ' : 'Suggested answer: ') + question.answer, [
          explanationParagraph(question, reviewed),
          reviewed ? null : reviewNote()
        ]);
        setActions([nextButton()]);
      }

      function submitWritten() {
        if (!textarea.value.trim()) {
          setFeedback('warning', 'Write an answer first.', []);
          return;
        }
        quiz.submit(textarea.value);
        textarea.readOnly = true;
        setFeedback('info', 'Answer saved. Compare it with the ' + answerWord(reviewed) + ':', [
          el('p', { dir: 'auto', text: question.modelAnswer }),
          explanationParagraph(question, reviewed),
          el('p', { className: 'hint', text: 'Written answers are not scored automatically.' }),
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
        text: results.roundType === 'missed' ? 'Results — missed questions' : 'Results'
      });
      root.appendChild(heading);

      if (results.scoredCount > 0) {
        var allReviewed = !results.provisional;
        root.appendChild(el('div', { className: 'score-box' }, [
          el('p', { className: 'score-number', text: results.firstTryMatches + ' / ' + results.scoredCount }),
          el('p', {
            text: allReviewed
              ? 'questions answered correctly on the first try (' + results.percent + '%).'
              : 'answers matched the suggested answer on the first try (' + results.percent + '%).'
          })
        ]));
        if (results.provisional) {
          root.appendChild(el('div', { className: 'notice notice--demo', role: 'note' }, [
            el('p', null, [
              el('strong', { text: 'Provisional score. ' }),
              G12.plural(results.unreviewedCount, 'answer') + ' in this quiz ' + (results.unreviewedCount === 1 ? 'has' : 'have') +
              ' not yet been reviewed by a teacher, so this score may change after review.'
            ])
          ]));
        }
      }
      if (results.shortAnswerCount > 0) {
        root.appendChild(el('p', {
          text: G12.plural(results.shortAnswerCount, 'written answer') + ' ' + (results.shortAnswerCount === 1 ? 'is' : 'are') +
            ' not scored. Compare ' + (results.shortAnswerCount === 1 ? 'it' : 'them') + ' with the answers below.'
        }));
      }

      root.appendChild(el('h3', { text: 'Review your answers' }));
      var list = el('ol', { className: 'review-list' });
      results.items.forEach(function (entry) {
        var question = entry.question;
        var li = el('li');
        li.appendChild(el('p', { dir: 'auto' }, [el('strong', null, [G12.renderPrompt(question.prompt)])]));
        if (entry.scored) {
          var matched = entry.firstTryMatches;
          var outcomeText = entry.reviewed
            ? (matched ? 'Correct on the first try' : 'Not correct on the first try')
            : (matched ? 'Matched the suggested answer' : 'Different from the suggested answer');
          li.appendChild(el('p', null, [
            el('span', { className: 'review-outcome review-outcome--' + (matched ? 'match' : 'differs'), text: (matched ? '✓ ' : '✗ ') + outcomeText })
          ]));
          li.appendChild(el('p', { dir: 'auto' }, ['Your first answer: ', el('strong', { text: entry.firstAnswer || '—' })]));
          li.appendChild(el('p', { dir: 'auto' }, [(entry.reviewed ? 'Correct answer: ' : 'Suggested answer: '), el('strong', { text: question.answer })]));
          if (entry.attempts > 1) li.appendChild(el('p', { className: 'hint', text: 'You used ' + entry.attempts + ' attempts.' }));
        } else {
          li.appendChild(el('p', null, [el('span', { className: 'review-outcome review-outcome--recorded', text: 'Written answer (not scored)' })]));
          li.appendChild(el('p', { dir: 'auto' }, ['Your answer: ', entry.response || '—']));
          li.appendChild(el('p', { dir: 'auto' }, [(entry.reviewed ? 'Model answer: ' : 'Suggested answer: '), question.modelAnswer]));
        }
        var explanation = explanationParagraph(question, entry.reviewed);
        if (explanation) li.appendChild(explanation);
        if (!entry.reviewed) li.appendChild(el('p', { className: 'hint', text: 'Not yet reviewed by a teacher.' }));
        list.appendChild(li);
      });
      root.appendChild(list);

      var buttons = [];
      var missed = quiz.missedQuestions().length;
      if (missed > 0) {
        buttons.push(el('button', {
          type: 'button',
          className: 'btn',
          text: 'Retry missed questions (' + missed + ')',
          onclick: function () {
            quiz.retryMissed();
            showQuestion(true);
          }
        }));
      }
      buttons.push(el('button', {
        type: 'button',
        className: missed > 0 ? 'btn btn--secondary' : 'btn',
        text: 'Restart quiz',
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
})(window);
