/* Unit tests for js/content-schema.js — run with: node --test tests/*.test.js
   Fixtures use placeholder text only; they are not educational content. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../js/content-schema.js');

function lesson(overrides) {
  return Object.assign({
    id: 'test-lesson',
    title: 'Test lesson',
    reviewStatus: 'unreviewed',
    sections: [{ type: 'text', paragraphs: ['Placeholder paragraph.'] }]
  }, overrides);
}

function mcq(overrides) {
  return Object.assign({
    id: 'q-001',
    type: 'mcq',
    prompt: 'Test prompt ___ 1',
    options: ['Option A', 'Option B', 'Option C'],
    answer: 'Option B',
    reviewStatus: 'unreviewed'
  }, overrides);
}

function errorsOf(key, item) {
  return Schema.validateItem(key, item, 0).errors;
}

test('an empty library is valid', () => {
  const report = Schema.validateLibrary(Schema.emptyLibrary());
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
});

test('a complete lesson with every section type is valid', () => {
  const item = lesson({
    sections: [
      { type: 'text', heading: 'H', paragraphs: ['P1', 'P2'] },
      { type: 'note', paragraphs: ['ملاحظة'], lang: 'ar' },
      { type: 'list', items: ['a', 'b'] },
      { type: 'examples', items: ['e1'] },
      { type: 'table', columns: ['C1', 'C2'], rows: [['1', '2'], ['3', '']] },
      { type: 'mistakes', items: [{ avoid: 'x', use: 'y' }, { avoid: 'x2', use: 'y2', note: 'n' }] }
    ]
  });
  assert.deepEqual(errorsOf('lessons', item), []);
});

test('lesson errors: missing title, bad id, unknown section type, bad table row', () => {
  assert.match(errorsOf('lessons', lesson({ title: ' ' })).join(), /title is required/);
  assert.match(errorsOf('lessons', lesson({ id: 'Bad ID' })).join(), /may only contain lowercase/);
  assert.match(errorsOf('lessons', lesson({ sections: [{ type: 'video' }] })).join(), /type must be one of/);
  const table = lesson({ sections: [{ type: 'table', columns: ['A', 'B'], rows: [['only one']] }] });
  assert.match(errorsOf('lessons', table).join(), /row 1 has 1 cell, but the table has 2 columns/);
  assert.match(errorsOf('lessons', lesson({ reviewStatus: 'maybe' })).join(), /reviewStatus/);
});

test('a lesson without sections is a warning, not an error', () => {
  const report = Schema.validateItem('lessons', lesson({ sections: [] }), 0);
  assert.equal(report.errors.length, 0);
  assert.match(report.warnings.join(), /no sections yet/);
});

test('missing reviewStatus is a warning and is treated as unreviewed', () => {
  const item = lesson();
  delete item.reviewStatus;
  const report = Schema.validateItem('lessons', item, 0);
  assert.equal(report.errors.length, 0);
  assert.match(report.warnings.join(), /treated as "unreviewed"/);
});

test('multiple-choice rules: answer must match an option exactly', () => {
  assert.deepEqual(errorsOf('questions', mcq()), []);
  assert.match(errorsOf('questions', mcq({ answer: 'option b' })).join(), /only in spaces or capital letters/);
  assert.match(errorsOf('questions', mcq({ answer: 'Something else' })).join(), /does not exactly match any option/);
  assert.match(errorsOf('questions', mcq({ answer: '' })).join(), /answer is missing/);
  assert.match(errorsOf('questions', mcq({ options: ['Only one'], answer: 'Only one' })).join(), /between 2 and 6 options/);
  assert.match(errorsOf('questions', mcq({ options: ['A', 'A', 'B'], answer: 'B' })).join(), /appears more than once/);
  assert.match(errorsOf('questions', mcq({ options: ['A', '', 'B'], answer: 'B' })).join(), /every option must contain text/);
  assert.match(errorsOf('questions', mcq({ type: undefined })).join(), /type must be "mcq"/);
  assert.match(errorsOf('questions', mcq({ difficulty: 'impossible' })).join(), /difficulty/);
});

test('short-answer questions need a model answer', () => {
  const short = { id: 'q-002', type: 'short', prompt: 'Test prompt 2', reviewStatus: 'unreviewed' };
  assert.match(errorsOf('questions', short).join(), /modelAnswer is required/);
  assert.deepEqual(errorsOf('questions', Object.assign({ modelAnswer: 'Placeholder answer' }, short)), []);
});

test('passages: need paragraphs; questions are validated; duplicate question ids are errors', () => {
  const passage = { id: 'p1', title: 'Test passage', reviewStatus: 'unreviewed', paragraphs: ['Text.'], questions: [mcq()] };
  assert.deepEqual(errorsOf('passages', passage), []);
  assert.match(errorsOf('passages', Object.assign({}, passage, { paragraphs: [] })).join(), /paragraphs needs at least 1/);
  assert.match(errorsOf('passages', Object.assign({}, passage, { questions: [mcq(), mcq()] })).join(), /already used/);
  const noQuestions = Schema.validateItem('passages', Object.assign({}, passage, { questions: [] }), 0);
  assert.equal(noQuestions.errors.length, 0);
  assert.match(noQuestions.warnings.join(), /no questions yet/);
});

test('summaries: rule is required for each point; empty summary is a warning', () => {
  const summary = { id: 's1', title: 'Test summary', reviewStatus: 'unreviewed', points: [{ title: 'T', rule: 'R' }] };
  assert.deepEqual(errorsOf('summaries', summary), []);
  assert.match(errorsOf('summaries', Object.assign({}, summary, { points: [{ title: 'T' }] })).join(), /rule is required/);
  const empty = Schema.validateItem('summaries', { id: 's2', title: 'Empty', reviewStatus: 'unreviewed' }, 0);
  assert.equal(empty.errors.length, 0);
  assert.match(empty.warnings.join(), /will look empty/);
});

test('duplicate ids in a collection are errors', () => {
  const report = Schema.validateCollection('lessons', [lesson(), lesson()]);
  assert.match(report.errors.join(), /already used by Lesson 1/);
});

test('links to missing topics and units are warnings', () => {
  const library = Schema.emptyLibrary();
  library.questions = [mcq({ topicId: 'missing-lesson' })];
  library.summaries = [{ id: 's1', title: 'S', topicId: 'missing-lesson', reviewStatus: 'unreviewed', remember: ['r'] }];
  library.passages = [{ id: 'p1', title: 'P', unitId: 'missing-unit', reviewStatus: 'unreviewed', paragraphs: ['x'], questions: [mcq()] }];
  library.lessons = [lesson({ unitId: 'missing-unit' })];
  const report = Schema.validateLibrary(library);
  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.length, 4);
  assert.match(report.warnings.join(), /no lesson has that id/);
  assert.match(report.warnings.join(), /no unit has that id/);
});

test('a unitId that disagrees with the topic’s unit is a warning, and the topic’s unit wins', () => {
  const library = Schema.emptyLibrary();
  library.units = [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }];
  library.lessons = [lesson({ id: 'l1', unitId: 'u1' })];
  library.questions = [mcq({ topicId: 'l1', unitId: 'u2' })];
  const report = Schema.validateLibrary(library);
  assert.match(report.warnings.join(), /its topic “l1” is in the unit “u1”/);
  assert.equal(Schema.unitIdOf(library.questions[0], library.lessons), 'u1');
});

test('file shape and schema version are checked', () => {
  assert.equal(Schema.validateFile('lessons', { schemaVersion: 1, lessons: [] }).errors.length, 0);
  assert.match(Schema.validateFile('lessons', [] ).errors.join(), /must contain a JSON object/);
  assert.match(Schema.validateFile('lessons', { schemaVersion: 1 }).errors.join(), /must contain a "lessons" list/);
  assert.match(Schema.validateFile('lessons', { schemaVersion: 99, lessons: [] }).errors.join(), /not supported/);
  assert.match(Schema.validateFile('lessons', { lessons: [] }).warnings.join(), /schemaVersion is missing/);
});

test('readImport accepts single files and backups, rejects other shapes', () => {
  const single = Schema.readImport({ schemaVersion: 1, questions: [mcq()] }, 'q.json');
  assert.deepEqual(Object.keys(single.collections), ['questions']);
  const backup = Schema.readImport({ schemaVersion: 1, type: 'grade12-english-backup', lessons: [], summaries: [], questions: [], passages: [] });
  assert.equal(Object.keys(backup.collections).length, 4);
  assert.match(Schema.readImport([1, 2]).report.errors.join(), /not a content file/);
  assert.match(Schema.readImport({ something: [] }).report.errors.join(), /does not contain units, lessons/);
  assert.match(Schema.readImport({ lessons: {} }).report.errors.join(), /must be a list/);
});

test('usableItems skips broken items but keeps a passage whose question is broken', () => {
  const lessons = Schema.usableItems('lessons', [lesson(), lesson({ id: 'x', title: '' }), lesson()]);
  assert.equal(lessons.items.length, 1);
  assert.equal(lessons.skipped, 2); // one broken, one duplicate id

  const passages = Schema.usableItems('passages', [{
    id: 'p1', title: 'T', reviewStatus: 'unreviewed', paragraphs: ['x'],
    questions: [mcq(), mcq({ id: 'q-002', answer: 'nope' })]
  }]);
  assert.equal(passages.items.length, 1);
  assert.equal(passages.items[0].questions.length, 1);
  assert.equal(passages.skippedQuestions, 1);
});

test('id and text helpers', () => {
  assert.equal(Schema.slugify('  Hello, World! Ünïcode  '), 'hello-world-unicode');
  assert.equal(Schema.slugify('نص عربي'), '');
  assert.equal(Schema.uniqueId('Test', ['test', 'test-2']), 'test-3');
  assert.equal(Schema.uniqueId('', []), 'item');
  assert.equal(Schema.nextNumberedId('q', ['q-001', 'q-009', 'other']), 'q-010');
  assert.equal(Schema.nextNumberedId('q', []), 'q-001');
  assert.deepEqual(Schema.splitParagraphs('a\nb\n\n\n  c  \r\n\r\nd'), ['a\nb', 'c', 'd']);
  assert.deepEqual(Schema.splitLines(' a \n\n b\r\n'), ['a', 'b']);
  assert.equal(Schema.toJSON(Schema.toFileData('lessons', [])), '{\n  "schemaVersion": 2,\n  "lessons": []\n}\n');
});

/* ---------- Added in Phase 2: units, topics, format upgrade, answer keys ---------- */

test('units: id and title are required; description is optional text', () => {
  assert.deepEqual(errorsOf('units', { id: 'unit-1', title: 'Unit title' }), []);
  assert.match(errorsOf('units', { id: 'unit-1', title: '' }).join(), /title is required/);
  assert.match(errorsOf('units', { id: 'Unit 1', title: 'T' }).join(), /may only contain lowercase/);
  assert.match(errorsOf('units', { id: 'u', title: 'T', description: 5 }).join(), /description must be text/);
  assert.match(Schema.validateCollection('units', [{ id: 'u', title: 'A' }, { id: 'u', title: 'B' }]).errors.join(), /already used/);
});

test('unitId and topicId must be valid ids when given', () => {
  assert.deepEqual(errorsOf('questions', mcq({ unitId: 'unit-1', topicId: 'topic-1' })), []);
  assert.match(errorsOf('questions', mcq({ unitId: 'Unit 1' })).join(), /unitId “Unit 1” is not a valid id/);
  assert.match(errorsOf('summaries', { id: 's', title: 'S', topicId: 'Bad Topic', remember: ['r'] }).join(), /topicId/);
  assert.match(errorsOf('lessons', lesson({ unitId: 7 })).join(), /unitId/);
  assert.match(errorsOf('passages', { id: 'p', title: 'P', paragraphs: ['x'], questions: [], unitId: 'x y' }).join(), /unitId/);
});

test('version 1 field names are upgraded (lessonId → topicId, topic → topicId)', () => {
  assert.deepEqual(Schema.upgradeItem('summaries', { id: 's', lessonId: 'l1' }), { id: 's', topicId: 'l1' });
  assert.deepEqual(Schema.upgradeItem('questions', { id: 'q', topic: 'l1' }), { id: 'q', topicId: 'l1' });
  assert.deepEqual(Schema.upgradeItem('questions', { id: 'q', topic: 'old', topicId: 'new' }), { id: 'q', topicId: 'new' });
  const original = { id: 'q', topic: 'l1' };
  Schema.upgradeItem('questions', original);
  assert.deepEqual(original, { id: 'q', topic: 'l1' }, 'the original is not changed');

  const file = Schema.validateFile('questions', { schemaVersion: 1, questions: [mcq({ topic: 'l1' })] });
  assert.equal(file.errors.length, 0);
  assert.match(file.warnings.join(), /old field name "topic"/);
  const imported = Schema.readImport({ schemaVersion: 1, summaries: [{ id: 's', title: 'S', lessonId: 'l1', remember: ['r'] }] });
  assert.equal(imported.collections.summaries[0].topicId, 'l1');
  assert.equal(Schema.usableItems('questions', [mcq({ topic: 'l1' })]).items[0].topicId, 'l1');
  assert.match(Schema.validateFile('lessons', { schemaVersion: 3, lessons: [] }).errors.join(), /not supported/);
});

test('answer-key mistakes get specific messages', () => {
  const problem = (answer) => Schema.answerKeyProblem(mcq({ answer }));
  assert.equal(problem('Option B'), null);
  assert.match(problem(''), /answer is missing/);
  assert.match(problem(undefined), /answer is missing/);
  assert.match(problem('B'), /looks like an option letter.*option B is “Option B”/);
  assert.match(problem('(c)'), /option letter.*option C is “Option C”/);
  assert.match(problem('2'), /looks like an option number.*option 2 is “Option B”/);
  assert.match(problem(3), /is the number 3.*“Option C”/);
  assert.match(problem(' option b '), /only in spaces or capital letters/);
  assert.match(problem({}), /must be the text/);
});

test('passage options: showParagraphNumbers must be true or false', () => {
  const passage = { id: 'p', title: 'P', paragraphs: ['x'], questions: [], reviewStatus: 'unreviewed' };
  assert.deepEqual(errorsOf('passages', Object.assign({}, passage, { showParagraphNumbers: false })), []);
  assert.match(errorsOf('passages', Object.assign({}, passage, { showParagraphNumbers: 'no' })).join(), /true or false/);
});

test('unitIdOf, groupByUnit and orderByUnit', () => {
  const units = [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }];
  const lessons = [lesson({ id: 'l1', unitId: 'u1' }), lesson({ id: 'l2' })];
  const items = [
    { id: 'a', topicId: 'l1' },            // unit from its topic
    { id: 'b', unitId: 'u2' },             // own unit
    { id: 'c', topicId: 'l2' },            // topic without a unit, no unit
    { id: 'd', unitId: 'gone' },           // unknown unit
    { id: 'e', topicId: 'l2', unitId: 'u1' } // topic has no unit, so own unit counts
  ];
  assert.equal(Schema.unitIdOf(items[0], lessons), 'u1');
  assert.equal(Schema.unitIdOf(items[2], lessons), '');
  assert.equal(Schema.unitIdOf(items[4], lessons), 'u1');
  const groups = Schema.groupByUnit(items, units, lessons);
  assert.deepEqual(groups.map((g) => (g.unit ? g.unit.id : null)), ['u1', 'u2', null]);
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.id)), [['a', 'e'], ['b'], ['c', 'd']]);
  assert.deepEqual(Schema.groupByUnit([], units, lessons).map((g) => g.items.length), [0, 0], 'empty units are kept; no "other" group');
  assert.deepEqual(Schema.orderByUnit(items, units, lessons).map((i) => i.id), ['a', 'e', 'b', 'c', 'd']);
});
