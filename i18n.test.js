/* Tests for the interface language (js/i18n.js and js/i18n-ar.js).
   Run with: node --test tests/*.test.js */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { collect } = require('./i18n-keys.js');
const Schema = require('../js/content-schema.js');

const PROJECT = path.join(__dirname, '..');

/* Loads i18n-ar.js and i18n.js in a small fake browser. */
function loadI18n(lang) {
  const store = lang ? { 'g12-lang': lang } : {};
  const html = {};
  const sandbox = {
    console: { warn() {}, log() {} },
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); }
    },
    document: {
      documentElement: html,
      readyState: 'complete',
      querySelectorAll: () => [],
      addEventListener() {}
    },
    location: { reload() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ['i18n-ar.js', 'i18n.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(PROJECT, 'js', file), 'utf8'), sandbox, { filename: file });
  });
  return { G12: sandbox.G12, html, store };
}

const ar = loadI18n('ar').G12;
const DICT = ar.I18N_AR;

/* Texts that the code translates through a variable, so the key finder
   cannot see them as written text. */
function dynamicKeys() {
  const keys = new Set(['Grade 12 English', 'Imported file', 'required', 'optional', 'Mistake', 'Point']);
  Schema.COLLECTION_KEYS.forEach((key) => {
    keys.add(Schema.COLLECTIONS[key].label);
    keys.add(Schema.COLLECTIONS[key].singular);
    keys.add(Schema.COLLECTIONS[key].singular.toLowerCase());
  });
  Schema.DIFFICULTIES.forEach((level) => keys.add(level));
  return keys;
}

function placeholders(text) {
  return (text.match(/\{\w+\}/g) || []).sort();
}

const used = collect(PROJECT);
const allKeys = new Set([...used.keys, ...dynamicKeys()]);

test('the key finder sees the interface text in the code and pages', () => {
  assert.ok(used.keys.size > 500, 'expected hundreds of texts, found ' + used.keys.size);
  ['Grammar Lessons', 'Check my answers', 'Import & export', 'Download backup file', 'id is missing.'].forEach((key) => {
    assert.ok(used.keys.has(key), 'not found: ' + key);
  });
});

test('every interface text has an Arabic translation', () => {
  const missing = [...allKeys].filter((key) => !(key in DICT.strings));
  assert.deepEqual(missing, [], 'missing in js/i18n-ar.js:\n' + missing.map((key) => '  ' + key + '  (' + (used.where[key] || 'dynamic') + ')').join('\n'));
});

test('the dictionary has no leftover texts that the website no longer uses', () => {
  const unused = Object.keys(DICT.strings).filter((key) => !allKeys.has(key));
  assert.deepEqual(unused, []);
});

test('translations keep exactly the same {placeholders}', () => {
  const wrong = Object.keys(DICT.strings).filter((key) => {
    return JSON.stringify(placeholders(key)) !== JSON.stringify(placeholders(DICT.strings[key]));
  });
  assert.deepEqual(wrong, []);
});

test('translations are Arabic text, not empty or copied English', () => {
  const notArabic = Object.keys(DICT.strings).filter((key) => {
    const value = DICT.strings[key];
    const bare = value.replace(/\{\w+\}/g, '').replace(/[\s()\-—–:,.←→«»]/g, '');
    if (bare === '') return false; // only placeholders and punctuation, such as "{title} ({n})"
    return !/[؀-ۿ]/.test(value);
  });
  assert.deepEqual(notArabic, []);
});

test('every counted word has all six Arabic forms', () => {
  used.nouns.forEach((word) => {
    const forms = DICT.nouns[word];
    assert.ok(forms, 'no Arabic forms for "' + word + '"');
    ['zero', 'one', 'two', 'few', 'many', 'other'].forEach((category) => {
      assert.ok(forms[category], word + ': missing ' + category);
      if (['zero', 'few', 'many', 'other'].includes(category)) assert.match(forms[category], /\{n\}/, word + ' ' + category);
    });
  });
});

test('arrows point the other way in Arabic (right to left)', () => {
  assert.equal(DICT.strings['← {title}'], '→ {title}');
  assert.equal(DICT.strings['{title} →'], '{title} ←');
  assert.match(DICT.strings['← Change practice settings'], /^→ /);
  assert.match(DICT.strings['← {label}'], /^→ /);
});

test('Arabic plural categories', () => {
  const expected = { 0: 'zero', 1: 'one', 2: 'two', 3: 'few', 10: 'few', 11: 'many', 99: 'many', 100: 'other', 101: 'other', 102: 'other', 103: 'few', 111: 'many' };
  Object.keys(expected).forEach((n) => assert.equal(ar.arabicCategory(Number(n)), expected[n], 'n = ' + n));
  assert.equal(ar.plural(1, 'lesson'), 'درس واحد');
  assert.equal(ar.plural(2, 'lesson'), 'درسان');
  assert.equal(ar.plural(5, 'lesson'), '5 دروس');
  assert.equal(ar.plural(12, 'lesson'), '12 درسًا');
  assert.equal(ar.plural(100, 'lesson'), '100 درس');
});

test('English is the default; Arabic only when chosen', () => {
  const en = loadI18n(null);
  assert.equal(en.G12.lang, 'en');
  assert.equal(en.html.lang, 'en');
  assert.equal(en.html.dir, 'ltr');
  assert.equal(en.G12.t('Grammar Lessons'), 'Grammar Lessons');
  assert.equal(en.G12.t('Question {n} of {total}', { n: 2, total: 5 }), 'Question 2 of 5');
  assert.equal(en.G12.plural(1, 'summary', 'summaries'), '1 summary');
  assert.equal(en.G12.plural(3, 'summary', 'summaries'), '3 summaries');

  const arabic = loadI18n('ar');
  assert.equal(arabic.html.lang, 'ar');
  assert.equal(arabic.html.dir, 'rtl');
  assert.equal(arabic.G12.t('Grammar Lessons'), 'دروس القواعد');
  assert.equal(arabic.G12.t('Question {n} of {total}', { n: 2, total: 5 }), 'السؤال 2 من 5');

  const unknown = loadI18n('fr');
  assert.equal(unknown.G12.lang, 'en', 'an unknown saved value falls back to English');
});

test('unknown text falls back to English instead of breaking', () => {
  assert.equal(ar.t('Some text that is not in the dictionary {x}', { x: 1 }), 'Some text that is not in the dictionary 1');
  assert.equal(ar.plural(4, 'not-a-word'), '4 not-a-words');
});

test('tNodes keeps elements (such as links) in the translated sentence', () => {
  const link = { element: 'a' };
  const parts = ar.tNodes('They are saved in this browser. Students cannot see them until you publish them from {link}.', null, { link });
  assert.ok(parts.includes(link));
  assert.equal(typeof parts[0], 'string');
  assert.match(parts[0], /[؀-ۿ]/);
});

test('setLanguage saves the choice', () => {
  const page = loadI18n(null);
  page.G12.setLanguage('ar');
  assert.equal(page.store['g12-lang'], 'ar');
  page.G12.setLanguage('xx');
  assert.equal(page.store['g12-lang'], 'ar', 'unsupported languages are ignored');
});

test('content checks speak Arabic when the page is in Arabic', () => {
  const previous = globalThis.G12;
  globalThis.G12 = ar;
  try {
    const report = Schema.validateItem('questions', { id: 'q-1', type: 'mcq', prompt: 'Prompt ___', options: ['One', 'Two'], answer: 'Three', reviewStatus: 'unreviewed' }, 0);
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0], /^السؤال 1 «Prompt ___»: الإجابة «Three» لا تطابق أي اختيار تمامًا\.$/);
  } finally {
    globalThis.G12 = previous;
  }
  const english = Schema.validateItem('questions', { id: 'q-1', type: 'mcq', prompt: 'Prompt ___', options: ['One', 'Two'], answer: 'Three', reviewStatus: 'unreviewed' }, 0);
  assert.match(english.errors[0], /does not exactly match any option/);
});
