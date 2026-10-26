/* Unit tests for js/quiz-engine.js — run with: node --test tests/*.test.js
   Fixtures use placeholder text only; they are not educational content. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Quiz, shuffle, gradeAll, unansweredNumbers, hasValidAnswerKey } = require('../js/quiz-engine.js');

function mcq(id, reviewStatus) {
  return { id, type: 'mcq', prompt: 'Prompt ' + id, options: ['A', 'B', 'C'], answer: 'B', reviewStatus };
}

function short(id) {
  return { id, type: 'short', prompt: 'Prompt ' + id, modelAnswer: 'Model', reviewStatus: 'unreviewed' };
}

/* Deterministic random numbers for repeatable shuffles. */
function seeded(seed) {
  return function () {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

test('a quiz needs at least one question', () => {
  assert.throws(() => new Quiz([]), /at least one question/);
});

test('unreviewed questions never report correct/incorrect', () => {
  const quiz = new Quiz([mcq('q1', 'unreviewed')], { shuffle: false });
  const wrong = quiz.submit('A');
  assert.equal(wrong.outcome, 'differs');
  assert.equal(wrong.reviewed, false);
  const right = quiz.submit('B');
  assert.equal(right.outcome, 'matches');
});

test('reviewed questions report correct/incorrect', () => {
  const quiz = new Quiz([mcq('q1', 'reviewed')], { shuffle: false });
  assert.equal(quiz.submit('C').outcome, 'incorrect');
  assert.equal(quiz.submit('B').outcome, 'correct');
});

test('only the first attempt counts towards the score', () => {
  const quiz = new Quiz([mcq('q1', 'reviewed'), mcq('q2', 'reviewed')], { shuffle: false });
  quiz.submit('A');           // wrong first try
  quiz.submit('B');           // right on retry
  quiz.next();
  quiz.submit('B');           // right first try
  quiz.next();
  const results = quiz.results();
  assert.equal(results.scoredCount, 2);
  assert.equal(results.firstTryMatches, 1);
  assert.equal(results.percent, 50);
  assert.equal(results.provisional, false);
  assert.equal(results.items[0].attempts, 2);
});

test('retry rules: no repeating a tried option; no retry once every wrong option is tried', () => {
  const quiz = new Quiz([mcq('q1', 'unreviewed')], { shuffle: false });
  quiz.submit('A');
  assert.equal(quiz.canRetry(), true);
  assert.throws(() => quiz.submit('A'), /already tried/);
  quiz.submit('C');
  // Only the answer is left untried, so a retry is still possible.
  assert.equal(quiz.canRetry(), true);
  quiz.submit('B');
  assert.equal(quiz.canRetry(), false, 'answered questions cannot be retried');
  assert.throws(() => quiz.submit('B'), /already been answered/);
});

test('invalid answers are rejected', () => {
  const quiz = new Quiz([mcq('q1', 'unreviewed')], { shuffle: false });
  assert.throws(() => quiz.submit('Z'), /choose one of the options/);
  assert.throws(() => quiz.submit(undefined), /choose one of the options/);
});

test('reveal needs an attempt; next needs a finished question', () => {
  const quiz = new Quiz([mcq('q1', 'unreviewed'), mcq('q2', 'unreviewed')], { shuffle: false });
  assert.throws(() => quiz.reveal(), /at least once/);
  assert.throws(() => quiz.next(), /Answer the question/);
  quiz.submit('A');
  quiz.reveal();
  quiz.next();
  assert.equal(quiz.index, 1);
  assert.equal(quiz.finished, false);
  quiz.submit('B');
  quiz.next();
  assert.equal(quiz.finished, true);
  assert.throws(() => quiz.next(), /already finished/);
});

test('scores are provisional when any scored question is unreviewed', () => {
  const quiz = new Quiz([mcq('q1', 'reviewed'), mcq('q2', 'unreviewed')], { shuffle: false });
  quiz.submit('B'); quiz.next();
  quiz.submit('B'); quiz.next();
  const results = quiz.results();
  assert.equal(results.provisional, true);
  assert.equal(results.unreviewedCount, 1);
});

test('short answers are recorded but never scored', () => {
  const quiz = new Quiz([short('s1'), mcq('q1', 'unreviewed')], { shuffle: false });
  assert.throws(() => quiz.submit('   '), /write an answer/);
  assert.equal(quiz.submit('  my answer  ').outcome, 'recorded');
  quiz.next();
  quiz.submit('A'); quiz.reveal(); quiz.next();
  const results = quiz.results();
  assert.equal(results.scoredCount, 1);
  assert.equal(results.shortAnswerCount, 1);
  assert.equal(results.items[0].response, 'my answer');
  assert.deepEqual(quiz.missedQuestions().map((q) => q.id), ['q1']);
});

test('retryMissed starts a round with only missed questions; restart brings all back', () => {
  const questions = [mcq('q1', 'unreviewed'), mcq('q2', 'unreviewed'), mcq('q3', 'unreviewed')];
  const quiz = new Quiz(questions, { shuffle: false });
  quiz.submit('B'); quiz.next();             // q1 matched
  quiz.submit('A'); quiz.reveal(); quiz.next(); // q2 missed
  quiz.submit('C'); quiz.submit('B'); quiz.next(); // q3 missed (first try wrong)
  quiz.retryMissed();
  assert.equal(quiz.roundType, 'missed');
  assert.deepEqual(quiz.items.map((item) => item.question.id), ['q2', 'q3']);
  quiz.submit('B'); quiz.next();
  quiz.submit('B'); quiz.next();
  assert.throws(() => quiz.retryMissed(), /no missed questions/);
  quiz.restart();
  assert.equal(quiz.roundType, 'full');
  assert.equal(quiz.total, 3);
  assert.equal(quiz.index, 0);
  assert.equal(quiz.items.every((item) => item.attempts.length === 0), true);
});

test('shuffle keeps every question exactly once; shuffle: false keeps order', () => {
  const list = Array.from({ length: 20 }, (_, i) => i);
  const mixed = shuffle(list, seeded(42));
  assert.deepEqual([...mixed].sort((a, b) => a - b), list);
  assert.notDeepEqual(mixed, list);
  assert.deepEqual(list, Array.from({ length: 20 }, (_, i) => i), 'input is not modified');
  const ordered = new Quiz([mcq('a'), mcq('b'), mcq('c')], { shuffle: false });
  assert.deepEqual(ordered.items.map((item) => item.question.id), ['a', 'b', 'c']);
});

/* ---------- Added in Phase 2: answer-all mode ---------- */

test('gradeAll: unanswered questions are never marked correct', () => {
  const questions = [mcq('q1', 'reviewed'), mcq('q2', 'reviewed'), mcq('q3', 'reviewed'), mcq('q4', 'reviewed')];
  const result = gradeAll(questions, { q1: 'B', q2: 'A', q3: '', q4: 'Not an option' });
  assert.deepEqual(result.items.map((item) => item.status), ['correct', 'incorrect', 'unanswered', 'unanswered']);
  assert.deepEqual(result.items.map((item) => item.correct), [true, false, false, false]);
  assert.equal(result.correctCount, 1);
  assert.equal(result.incorrectCount, 1);
  assert.equal(result.unansweredCount, 2);
  assert.equal(result.scoredCount, 4);
  assert.equal(result.percent, 25);
  assert.deepEqual(result.missed.map((q) => q.id), ['q2', 'q3', 'q4']);
});

test('gradeAll: nothing answered scores zero, never full marks', () => {
  const result = gradeAll([mcq('q1', 'reviewed'), mcq('q2', 'unreviewed')], {});
  assert.equal(result.correctCount, 0);
  assert.equal(result.unansweredCount, 2);
  assert.equal(result.percent, 0);
  // Even an (invalid) empty answer key cannot be "matched" by an empty answer.
  const broken = Object.assign(mcq('q3', 'reviewed'), { answer: '' });
  const brokenResult = gradeAll([broken], { q3: '' });
  assert.equal(brokenResult.items[0].status, 'no-key');
  assert.equal(brokenResult.items[0].correct, false);
  assert.equal(brokenResult.scoredCount, 0);
  assert.equal(brokenResult.noKeyCount, 1);
});

test('gradeAll: unreviewed wording, provisional score, written answers not scored', () => {
  const result = gradeAll([mcq('q1', 'unreviewed'), mcq('q2', 'unreviewed'), short('s1'), short('s2')],
    { q1: 'B', q2: 'C', s1: '  my words  ' });
  assert.deepEqual(result.items.map((item) => item.status), ['matches', 'differs', 'recorded', 'unanswered']);
  assert.equal(result.provisional, true);
  assert.equal(result.unreviewedCount, 2);
  assert.equal(result.scoredCount, 2);
  assert.equal(result.shortAnswerCount, 2);
  assert.equal(result.shortUnansweredCount, 1);
  assert.equal(result.items[2].response, 'my words');
  assert.equal(result.unansweredCount, 0, 'unanswered written answers are not counted as unanswered scored questions');
});

test('unansweredNumbers lists the questions still blank', () => {
  const questions = [mcq('q1'), short('s1'), mcq('q2'), mcq('q3')];
  assert.deepEqual(unansweredNumbers(questions, { q1: 'A', s1: '   ', q3: 'Wrong text' }), [2, 3, 4]);
  assert.deepEqual(unansweredNumbers(questions, { q1: 'A', s1: 'x', q2: 'B', q3: 'C' }), []);
});

test('answer keys are checked: a quiz refuses a question without a valid key', () => {
  assert.equal(hasValidAnswerKey(mcq('q1')), true);
  assert.equal(hasValidAnswerKey(short('s1')), true);
  assert.equal(hasValidAnswerKey(Object.assign(mcq('q2'), { answer: 'Z' })), false);
  assert.throws(() => new Quiz([Object.assign(mcq('q2'), { answer: 'Z' })]), /no valid answer key/);
});

test('Quiz results count questions never attempted as unanswered, not correct', () => {
  const quiz = new Quiz([mcq('q1', 'reviewed'), mcq('q2', 'reviewed')], { shuffle: false });
  quiz.submit('B');
  const results = quiz.results();
  assert.equal(results.firstTryMatches, 1);
  assert.equal(results.unansweredCount, 1);
  assert.equal(results.percent, 50);
});
