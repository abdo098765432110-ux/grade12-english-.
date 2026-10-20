/* ==========================================================================
   Quiz engine — the rules of a quiz, with no page code.
   Used by Grammar Practice and Reading Comprehension.

   Answer-key honesty rule:
     A question counts as teacher-checked only when reviewStatus is
     "reviewed". For any other question the engine never reports "correct"
     or "incorrect"; it reports that the answer "matches" or "differs from"
     the suggested answer, and the score is marked provisional.

   Scoring: only multiple-choice ("mcq") questions are scored, and only the
   first attempt counts. Short written answers are recorded and compared
   with the model answer by the student; they are never auto-scored.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.G12 = root.G12 || {};
    root.G12.QuizEngine = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function shuffle(list, random) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function isReviewed(question) {
    return Boolean(question) && question.reviewStatus === 'reviewed';
  }

  function isScored(question) {
    return question.type === 'mcq';
  }

  function outcomeFor(matches, reviewed) {
    if (reviewed) return matches ? 'correct' : 'incorrect';
    return matches ? 'matches' : 'differs';
  }

  /**
   * new Quiz(questions, { shuffle: true, random: Math.random })
   */
  function Quiz(questions, options) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('A quiz needs at least one question.');
    }
    options = options || {};
    this.original = questions.slice();
    this.shouldShuffle = options.shuffle !== false;
    this.random = options.random || Math.random;
    this.round = 0;
    this.roundType = 'full';
    this._begin(this.original, 'full');
  }

  Quiz.prototype._begin = function (questions, roundType) {
    var ordered = this.shouldShuffle ? shuffle(questions, this.random) : questions.slice();
    this.items = ordered.map(function (question) {
      return { question: question, attempts: [], revealed: false, response: null };
    });
    this.index = 0;
    this.round += 1;
    this.roundType = roundType;
  };

  Object.defineProperty(Quiz.prototype, 'total', {
    get: function () { return this.items.length; }
  });

  Object.defineProperty(Quiz.prototype, 'current', {
    get: function () { return this.items[this.index] || null; }
  });

  Object.defineProperty(Quiz.prototype, 'finished', {
    get: function () { return this.index >= this.items.length; }
  });

  /**
   * Submit an answer for the current question.
   * mcq:   answer is the option text. Returns { outcome, matches, firstAttempt, reviewed }.
   * short: answer is the student's text. Returns { outcome: 'recorded', reviewed }.
   */
  Quiz.prototype.submit = function (answer) {
    var item = this.current;
    if (!item) throw new Error('The quiz is already finished.');
    var question = item.question;
    var reviewed = isReviewed(question);

    if (question.type === 'short') {
      if (item.revealed) throw new Error('This question has already been answered.');
      var text = String(answer === undefined || answer === null ? '' : answer).trim();
      if (!text) throw new Error('Please write an answer first.');
      item.response = text;
      item.revealed = true;
      return { outcome: 'recorded', reviewed: reviewed };
    }

    if (item.revealed) throw new Error('This question has already been answered.');
    if (question.options.indexOf(answer) === -1) throw new Error('Please choose one of the options.');
    if (this.hasTried(answer)) throw new Error('You have already tried that option.');

    var matches = answer === question.answer;
    item.attempts.push({ answer: answer, matches: matches });
    if (matches) item.revealed = true;
    return {
      outcome: outcomeFor(matches, reviewed),
      matches: matches,
      firstAttempt: item.attempts.length === 1,
      reviewed: reviewed
    };
  };

  Quiz.prototype.hasTried = function (option) {
    var item = this.current;
    return Boolean(item) && item.attempts.some(function (attempt) { return attempt.answer === option; });
  };

  /* True when the current mcq question was answered wrongly and untried options remain. */
  Quiz.prototype.canRetry = function () {
    var item = this.current;
    if (!item || item.revealed || item.question.type !== 'mcq' || item.attempts.length === 0) return false;
    var self = this;
    return item.question.options.some(function (option) { return !self.hasTried(option); });
  };

  /* Show the answer after at least one attempt (mcq only). */
  Quiz.prototype.reveal = function () {
    var item = this.current;
    if (!item) throw new Error('The quiz is already finished.');
    if (item.question.type === 'mcq' && item.attempts.length === 0) {
      throw new Error('Try the question at least once before showing the answer.');
    }
    item.revealed = true;
  };

  /* Move on. Only allowed once the current question is complete. */
  Quiz.prototype.next = function () {
    var item = this.current;
    if (!item) throw new Error('The quiz is already finished.');
    if (!item.revealed) throw new Error('Answer the question before moving on.');
    this.index += 1;
  };

  Quiz.prototype.results = function () {
    var scored = this.items.filter(function (item) { return isScored(item.question); });
    var firstTry = scored.filter(function (item) {
      return item.attempts.length > 0 && item.attempts[0].matches;
    }).length;
    var unreviewed = scored.filter(function (item) { return !isReviewed(item.question); }).length;
    return {
      round: this.round,
      roundType: this.roundType,
      total: this.items.length,
      scoredCount: scored.length,
      firstTryMatches: firstTry,
      percent: scored.length ? Math.round((firstTry / scored.length) * 100) : null,
      unreviewedCount: unreviewed,
      provisional: unreviewed > 0,
      shortAnswerCount: this.items.length - scored.length,
      items: this.items.map(function (item) {
        var scoredItem = isScored(item.question);
        var first = item.attempts[0];
        return {
          question: item.question,
          scored: scoredItem,
          reviewed: isReviewed(item.question),
          firstAnswer: first ? first.answer : null,
          firstTryMatches: Boolean(first && first.matches),
          attempts: item.attempts.length,
          response: item.response
        };
      })
    };
  };

  /* Scored questions not answered on the first attempt. */
  Quiz.prototype.missedQuestions = function () {
    return this.items.filter(function (item) {
      return isScored(item.question) && !(item.attempts.length > 0 && item.attempts[0].matches);
    }).map(function (item) { return item.question; });
  };

  /* Start again with every original question. */
  Quiz.prototype.restart = function () {
    this._begin(this.original, 'full');
  };

  /* Start a new round with only the missed questions. */
  Quiz.prototype.retryMissed = function () {
    var missed = this.missedQuestions();
    if (missed.length === 0) throw new Error('There are no missed questions to retry.');
    this._begin(missed, 'missed');
  };

  return {
    Quiz: Quiz,
    shuffle: shuffle,
    isReviewed: isReviewed
  };
});
