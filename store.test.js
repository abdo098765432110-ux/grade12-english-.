/* Unit tests for js/content-store.js — run with: node --test tests/*.test.js
   Fixtures use placeholder text only; they are not educational content. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../js/content-schema.js');
const Store = require('../js/content-store.js');

function sampleLibrary() {
  const library = Schema.emptyLibrary();
  library.lessons = [
    { id: 'l1', title: 'Lesson 1', reviewStatus: 'unreviewed', sections: [] },
    { id: 'l2', title: 'Lesson 2', reviewStatus: 'unreviewed', sections: [] }
  ];
  library.units = [{ id: 'u1', title: 'Unit 1' }];
  library.lessons[0].unitId = 'u1';
  library.summaries = [{ id: 's1', title: 'Summary 1', topicId: 'l1', reviewStatus: 'unreviewed', remember: ['r'] }];
  library.questions = [
    { id: 'q-001', type: 'mcq', topicId: 'l1', prompt: 'P1', options: ['A', 'B'], answer: 'A', reviewStatus: 'unreviewed' },
    { id: 'q-002', type: 'mcq', topicId: 'l2', unitId: 'u1', prompt: 'P2', options: ['A', 'B'], answer: 'B', reviewStatus: 'unreviewed' }
  ];
  library.passages = [{ id: 'p1', title: 'P', unitId: 'u1', paragraphs: ['x'], questions: [], reviewStatus: 'unreviewed' }];
  return library;
}

/* Minimal stand-in for window.localStorage. */
function memoryStorage() {
  const data = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    data
  };
}

test('saveItem adds new items and replaces existing ones without changing the original', () => {
  const library = sampleLibrary();
  const before = JSON.stringify(library);
  const added = Store.saveItem(library, 'lessons', { id: 'l3', title: 'Lesson 3', reviewStatus: 'unreviewed', sections: [] }, null);
  assert.equal(added.lessons.length, 3);
  const edited = Store.saveItem(added, 'lessons', { id: 'l3', title: 'Renamed', reviewStatus: 'reviewed', sections: [] }, 'l3');
  assert.equal(edited.lessons.length, 3);
  assert.equal(edited.lessons[2].title, 'Renamed');
  assert.equal(JSON.stringify(library), before, 'original library must not change');
});

test('changing a lesson id updates linked summaries and questions', () => {
  const next = Store.saveItem(sampleLibrary(), 'lessons', { id: 'new-id', title: 'Lesson 1', reviewStatus: 'unreviewed', sections: [] }, 'l1');
  assert.equal(next.lessons[0].id, 'new-id');
  assert.equal(next.summaries[0].topicId, 'new-id');
  assert.equal(next.questions[0].topicId, 'new-id');
  assert.equal(next.questions[1].topicId, 'l2');
});

test('deleting a lesson keeps linked items but removes the link', () => {
  const library = sampleLibrary();
  assert.deepEqual(Store.countLessonLinks(library, 'l1'), { summaries: 1, questions: 1 });
  const next = Store.deleteItem(library, 'lessons', 'l1');
  assert.equal(next.lessons.length, 1);
  assert.equal(next.summaries.length, 1);
  assert.equal(next.summaries[0].topicId, undefined);
  assert.equal(next.questions[0].topicId, undefined);
  assert.equal(Store.deleteItem(library, 'lessons', 'nope').lessons.length, 2);
});

test('moveItem reorders and ignores moves past either end', () => {
  const library = sampleLibrary();
  assert.deepEqual(Store.moveItem(library, 'lessons', 'l2', -1).lessons.map((l) => l.id), ['l2', 'l1']);
  assert.deepEqual(Store.moveItem(library, 'lessons', 'l1', -1).lessons.map((l) => l.id), ['l1', 'l2']);
  assert.deepEqual(Store.moveItem(library, 'lessons', 'l2', 1).lessons.map((l) => l.id), ['l1', 'l2']);
});

test('applyImport merge adds and updates by id; replace swaps whole collections', () => {
  const incoming = {
    questions: [
      { id: 'q-002', type: 'mcq', prompt: 'Updated', options: ['A', 'B'], answer: 'A', reviewStatus: 'reviewed' },
      { id: 'q-003', type: 'short', prompt: 'New', modelAnswer: 'M', reviewStatus: 'unreviewed' }
    ]
  };
  const merged = Store.applyImport(sampleLibrary(), incoming, 'merge');
  assert.deepEqual(merged.summary.questions, { added: 1, updated: 1, removed: 0 });
  assert.deepEqual(merged.library.questions.map((q) => q.id), ['q-001', 'q-002', 'q-003']);
  assert.equal(merged.library.questions[1].prompt, 'Updated');
  assert.equal(merged.library.lessons.length, 2, 'collections not in the import are untouched');

  const replaced = Store.applyImport(sampleLibrary(), incoming, 'replace');
  assert.deepEqual(replaced.summary.questions, { added: 2, updated: 0, removed: 2 });
  assert.deepEqual(replaced.library.questions.map((q) => q.id), ['q-002', 'q-003']);
});

test('export formats: data file and backup', () => {
  const library = sampleLibrary();
  assert.deepEqual(Object.keys(Store.fileData(library, 'questions')), ['schemaVersion', 'questions']);
  const backup = Store.backupData(library, new Date('2026-01-02T03:04:05Z'));
  assert.equal(backup.type, Store.BACKUP_TYPE);
  assert.equal(backup.exportedAt, '2026-01-02T03:04:05.000Z');
  assert.equal(backup.lessons.length, 2);
  assert.equal(backup.units.length, 1);
  // A backup can be imported again.
  const read = Schema.readImport(JSON.parse(JSON.stringify(backup)), 'backup.json');
  assert.equal(read.report.errors.length, 0);
  assert.equal(Object.keys(read.collections).length, 5);
});

test('fingerprint detects changes; isEmpty works', () => {
  const library = sampleLibrary();
  assert.equal(Store.fingerprint(library), Store.fingerprint(JSON.parse(JSON.stringify(library))));
  assert.notEqual(Store.fingerprint(library), Store.fingerprint(Store.moveItem(library, 'lessons', 'l2', -1)));
  assert.equal(Store.isEmpty(Schema.emptyLibrary()), true);
  assert.equal(Store.isEmpty(library), false);
});

test('draft save, load, clear and preview flag', () => {
  const storage = memoryStorage();
  assert.equal(Store.loadDraft(storage), null);
  const savedAt = Store.saveDraft(storage, sampleLibrary(), 'baseline-x', new Date('2026-05-06T07:08:09Z'));
  assert.equal(savedAt, '2026-05-06T07:08:09.000Z');
  const draft = Store.loadDraft(storage);
  assert.equal(draft.library.lessons.length, 2);
  assert.equal(draft.baseline, 'baseline-x');

  assert.equal(Store.isPreviewOn(storage), false);
  Store.setPreview(storage, true);
  assert.equal(Store.isPreviewOn(storage), true);
  Store.clearDraft(storage);
  assert.equal(Store.loadDraft(storage), null);
  assert.equal(Store.isPreviewOn(storage), false, 'clearing the draft also turns preview off');
});

test('a corrupted draft is ignored instead of crashing', () => {
  const storage = memoryStorage();
  storage.setItem(Store.DRAFT_KEY, '{not json');
  assert.equal(Store.loadDraft(storage), null);
});

test('without storage, saving throws and the other functions are safe', () => {
  assert.throws(() => Store.saveDraft(null, sampleLibrary(), null), /not allowing/);
  assert.equal(Store.loadDraft(null), null);
  assert.equal(Store.isPreviewOn(null), false);
  assert.equal(Store.setPreview(null, true), false);
});

/* ---------- Added in Phase 2 ---------- */

test('renaming a unit id updates every item that names it', () => {
  const next = Store.saveItem(sampleLibrary(), 'units', { id: 'unit-one', title: 'Unit 1' }, 'u1');
  assert.equal(next.units[0].id, 'unit-one');
  assert.equal(next.lessons[0].unitId, 'unit-one');
  assert.equal(next.questions[1].unitId, 'unit-one');
  assert.equal(next.passages[0].unitId, 'unit-one');
});

test('deleting a unit keeps its content but removes the unit link', () => {
  const library = sampleLibrary();
  assert.deepEqual(Store.countUnitLinks(library, 'u1'), { lessons: 1, summaries: 0, questions: 1, passages: 1 });
  const next = Store.deleteItem(library, 'units', 'u1');
  assert.equal(next.units.length, 0);
  assert.equal(next.lessons.length, 2);
  assert.equal(next.lessons[0].unitId, undefined);
  assert.equal(next.questions[1].unitId, undefined);
  assert.equal(next.passages[0].unitId, undefined);
});

test('old drafts and imports with version 1 field names are upgraded', () => {
  const storage = memoryStorage();
  storage.setItem(Store.DRAFT_KEY, JSON.stringify({ library: {
    lessons: [], summaries: [{ id: 's', title: 'S', lessonId: 'l1' }], questions: [{ id: 'q', topic: 'l1' }], passages: []
  } }));
  const draft = Store.loadDraft(storage);
  assert.deepEqual(draft.library.units, []);
  assert.equal(draft.library.summaries[0].topicId, 'l1');
  assert.equal(draft.library.questions[0].topicId, 'l1');
  assert.equal('topic' in draft.library.questions[0], false);
  const merged = Store.applyImport(Schema.emptyLibrary(), { questions: [{ id: 'q2', topic: 'l9' }] }, 'merge');
  assert.equal(merged.library.questions[0].topicId, 'l9');
});
