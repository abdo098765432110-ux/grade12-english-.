/* ==========================================================================
   Content schema and validation rules.

   One module, used in three places:
     - the student pages (to skip broken items instead of crashing),
     - the content manager (to check items before saving or importing),
     - tools/validate-content.js (command-line check in Node).

   Errors   = the item is broken and cannot be used.
   Warnings = the item works but is incomplete or has a broken link.
   See docs/CONTENT_FORMAT.md for the human-readable description.

   How content is organised
     Unit   — data/units.json. A unit groups everything else.
     Topic  — one grammar lesson. A topic's ID is the lesson's "id".
     Every lesson, summary, question and passage can name its unit with
     "unitId". Summaries and practice questions can name their topic with
     "topicId"; they then belong to that lesson's unit automatically.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.G12 = root.G12 || {};
    root.G12.Schema = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Version 2 added units, "unitId" and "topicId". Version 1 files still
     load: their old field names are converted automatically (see upgradeItem). */
  var SCHEMA_VERSION = 2;

  /* The content collections and the data file each one lives in. */
  var COLLECTIONS = {
    units: {
      key: 'units', path: 'data/units.json', fileName: 'units.json',
      label: 'Units', singular: 'Unit'
    },
    lessons: {
      key: 'lessons', path: 'data/grammar-lessons.json', fileName: 'grammar-lessons.json',
      label: 'Grammar lessons', singular: 'Lesson'
    },
    summaries: {
      key: 'summaries', path: 'data/grammar-summaries.json', fileName: 'grammar-summaries.json',
      label: 'Grammar summaries', singular: 'Summary'
    },
    questions: {
      key: 'questions', path: 'data/grammar-questions.json', fileName: 'grammar-questions.json',
      label: 'Grammar practice questions', singular: 'Question'
    },
    passages: {
      key: 'passages', path: 'data/reading-passages.json', fileName: 'reading-passages.json',
      label: 'Reading passages', singular: 'Passage'
    }
  };
  var COLLECTION_KEYS = ['units', 'lessons', 'summaries', 'questions', 'passages'];

  var REVIEW_STATUSES = ['unreviewed', 'reviewed'];
  var SECTION_TYPES = ['text', 'note', 'list', 'examples', 'table', 'mistakes'];
  var QUESTION_TYPES = ['mcq', 'short'];
  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var LANGUAGES = ['en', 'ar'];
  var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var MIN_OPTIONS = 2;
  var MAX_OPTIONS = 6;
  var LETTERS = 'ABCDEF';

  /* Old field name → new field name, per collection (version 1 → 2). */
  var RENAMED_FIELDS = {
    summaries: { lessonId: 'topicId' },
    questions: { topic: 'topicId' }
  };

  /* ---------- Messages ----------
     Messages are written in English with {placeholders}. In the browser they
     go through G12.t() (js/i18n.js), so they appear in the chosen interface
     language. In Node (tools/validate-content.js) they stay in English. */

  function format(text, params) {
    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, function (match, name) {
      return params[name] !== undefined && params[name] !== null ? String(params[name]) : match;
    });
  }

  function tr(text, params) {
    var scope = typeof globalThis !== 'undefined' ? globalThis : null;
    if (scope && scope.G12 && typeof scope.G12.t === 'function') return scope.G12.t(text, params);
    return format(text, params);
  }

  /* ---------- Small helpers ---------- */

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function emptyLibrary() {
    return { units: [], lessons: [], summaries: [], questions: [], passages: [] };
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  /* "1 cell" / "3 cells" in English; Arabic forms come from the dictionary. */
  function plural(count, word) {
    var scope = typeof globalThis !== 'undefined' ? globalThis : null;
    if (scope && scope.G12 && typeof scope.G12.plural === 'function') return scope.G12.plural(count, word);
    return count + ' ' + word + (count === 1 ? '' : 's');
  }

  function shorten(text, max) {
    text = String(text).replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  /* "Lesson 3 “Passive voice”" — a readable name for messages. */
  function describe(kind, index, item) {
    var name = '';
    if (isObject(item)) {
      if (hasText(item.title)) name = item.title;
      else if (hasText(item.prompt)) name = item.prompt;
      else if (hasText(item.id)) name = item.id;
    }
    var label = tr('{kind} {n}', { kind: tr(kind), n: index + 1 });
    return name ? tr('{label} “{name}”', { label: label, name: shorten(name, 50) }) : label;
  }

  /* errors / warnings: readable lines "Where: message".
     details: the same problems as { level, where, message, meta } so the
     content manager can show a message next to the right form field. */
  function Report() {
    this.errors = [];
    this.warnings = [];
    this.details = [];
  }
  Report.prototype.error = function (where, message, meta) {
    this.errors.push(where + ': ' + message);
    this.details.push({ level: 'error', where: where, message: message, meta: meta || null });
  };
  Report.prototype.warn = function (where, message, meta) {
    this.warnings.push(where + ': ' + message);
    this.details.push({ level: 'warning', where: where, message: message, meta: meta || null });
  };
  Report.prototype.ok = function () { return this.errors.length === 0; };

  /* ---------- Upgrading old field names ---------- */

  /**
   * Returns a copy of the item using the current field names. Old names are
   * moved to the new name (unless the new one is already set) and removed.
   * Pass a list as "renamed" to collect the old names that were found.
   */
  function upgradeItem(key, item, renamed) {
    var map = RENAMED_FIELDS[key];
    if (!map || !isObject(item)) return item;
    var copy = clone(item);
    Object.keys(map).forEach(function (oldName) {
      if (copy[oldName] === undefined) return;
      var newName = map[oldName];
      if (copy[newName] === undefined || copy[newName] === '') copy[newName] = copy[oldName];
      delete copy[oldName];
      if (renamed && renamed.indexOf(oldName) === -1) renamed.push(oldName);
    });
    return copy;
  }

  function upgradeCollection(key, items, renamed) {
    if (!Array.isArray(items)) return items;
    return items.map(function (item) { return upgradeItem(key, item, renamed); });
  }

  /* ---------- Shared field checks ---------- */

  function checkId(item, report, where) {
    if (!hasText(item.id)) {
      report.error(where, tr('id is missing.'));
    } else if (!ID_PATTERN.test(item.id)) {
      report.error(where, tr('id “{id}” may only contain lowercase English letters, numbers and single hyphens (for example: unit-1 or passive-voice).', { id: item.id }));
    }
  }

  /* Optional link to another item (unitId, topicId): empty, or a valid id. */
  function checkLinkId(item, field, report, where) {
    var value = item[field];
    if (value === undefined || value === '') return;
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      report.error(where, tr('{field} “{value}” is not a valid id (lowercase English letters, numbers and single hyphens).', { field: field, value: value }));
    }
  }

  function checkRequiredText(item, field, report, where) {
    if (!hasText(item[field])) report.error(where, tr('{field} is required.', { field: field }));
  }

  function checkOptionalText(item, field, report, where) {
    if (item[field] !== undefined && typeof item[field] !== 'string') {
      report.error(where, tr('{field} must be text.', { field: field }));
    }
  }

  function checkReviewStatus(item, report, where) {
    if (item.reviewStatus === undefined) {
      report.warn(where, tr('reviewStatus is missing, so it is treated as "unreviewed".'));
    } else if (REVIEW_STATUSES.indexOf(item.reviewStatus) === -1) {
      report.error(where, tr('reviewStatus must be "unreviewed" or "reviewed".'));
    }
  }

  function checkTextList(list, field, report, where, minimum, meta) {
    if (!Array.isArray(list)) {
      report.error(where, tr('{field} must be a list.', { field: field }), meta);
      return;
    }
    var filled = list.filter(hasText).length;
    if (list.some(function (entry) { return typeof entry !== 'string'; })) {
      report.error(where, tr('every entry in {field} must be text.', { field: field }), meta);
    } else if (filled < minimum) {
      report.error(where, minimum === 1
        ? tr('{field} needs at least 1 non-empty entry.', { field: field })
        : tr('{field} needs at least {min} non-empty entries.', { field: field, min: minimum }), meta);
    }
  }

  function checkDuplicateIds(items, report, where, kind) {
    var seen = {};
    items.forEach(function (item, index) {
      if (!isObject(item) || !hasText(item.id)) return;
      if (seen[item.id] !== undefined) {
        report.error(where, tr('{item} uses the id “{id}”, which is already used by {other}. Every id must be unique.', {
          item: tr('{kind} {n}', { kind: tr(kind), n: index + 1 }),
          id: item.id,
          other: tr('{kind} {n}', { kind: tr(kind), n: seen[item.id] + 1 })
        }));
      } else {
        seen[item.id] = index;
      }
    });
  }

  /* ---------- Units ---------- */

  function validateUnit(unit, report, where) {
    if (!isObject(unit)) {
      report.error(where, tr('must be an object.'));
      return;
    }
    checkId(unit, report, where);
    checkRequiredText(unit, 'title', report, where);
    checkOptionalText(unit, 'description', report, where);
  }

  /* ---------- Lessons (topics) ---------- */

  /* meta = { section: index } lets the content manager point at the section. */
  function validateSection(section, report, where, meta) {
    if (!isObject(section)) {
      report.error(where, tr('must be an object.'), meta);
      return;
    }
    if (SECTION_TYPES.indexOf(section.type) === -1) {
      report.error(where, tr('type must be one of: {types}.', { types: SECTION_TYPES.join(', ') }), meta);
      return;
    }
    if (section.heading !== undefined && typeof section.heading !== 'string') {
      report.error(where, tr('{field} must be text.', { field: 'heading' }), meta);
    }

    switch (section.type) {
      case 'text':
      case 'note':
        checkTextList(section.paragraphs, 'paragraphs', report, where, 1, meta);
        if (section.lang !== undefined && LANGUAGES.indexOf(section.lang) === -1) {
          report.error(where, tr('lang must be "en" or "ar".'), meta);
        }
        break;
      case 'list':
      case 'examples':
        checkTextList(section.items, 'items', report, where, 1, meta);
        break;
      case 'table':
        checkTextList(section.columns, 'columns', report, where, 1, meta);
        if (!Array.isArray(section.rows) || section.rows.length === 0) {
          report.error(where, tr('a table needs at least one row.'), meta);
        } else if (Array.isArray(section.columns)) {
          section.rows.forEach(function (row, rowIndex) {
            if (!Array.isArray(row) || row.some(function (cell) { return typeof cell !== 'string'; })) {
              report.error(where, tr('row {row} must be a list of text cells.', { row: rowIndex + 1 }), meta);
            } else if (row.length !== section.columns.length) {
              report.error(where, tr('row {row} has {cells}, but the table has {columns}.', {
                row: rowIndex + 1,
                cells: plural(row.length, 'cell'),
                columns: plural(section.columns.length, 'column')
              }), meta);
            }
          });
        }
        break;
      case 'mistakes':
        if (!Array.isArray(section.items) || section.items.length === 0) {
          report.error(where, tr('needs at least one item.'), meta);
        } else {
          section.items.forEach(function (entry, i) {
            var at = tr('{where}, item {n}', { where: where, n: i + 1 });
            if (!isObject(entry)) {
              report.error(at, tr('must be an object with "avoid" and "use".'), meta);
              return;
            }
            ['avoid', 'use'].forEach(function (field) {
              if (!hasText(entry[field])) report.error(at, tr('{field} is required.', { field: field }), meta);
            });
            if (entry.note !== undefined && typeof entry.note !== 'string') {
              report.error(at, tr('{field} must be text.', { field: 'note' }), meta);
            }
          });
        }
        break;
    }
  }

  function validateLesson(lesson, report, where) {
    if (!isObject(lesson)) {
      report.error(where, tr('must be an object.'));
      return;
    }
    checkId(lesson, report, where);
    checkRequiredText(lesson, 'title', report, where);
    checkOptionalText(lesson, 'description', report, where);
    checkLinkId(lesson, 'unitId', report, where);
    checkReviewStatus(lesson, report, where);
    if (!Array.isArray(lesson.sections)) {
      report.error(where, tr('sections must be a list (it can be empty while you are still writing).'));
    } else if (lesson.sections.length === 0) {
      report.warn(where, tr('has no sections yet, so students will see an empty lesson.'));
    } else {
      lesson.sections.forEach(function (section, i) {
        validateSection(section, report, tr('{where}, section {n}', { where: where, n: i + 1 }), { section: i });
      });
    }
  }

  /* ---------- Summaries ---------- */

  function validateSummary(summary, report, where) {
    if (!isObject(summary)) {
      report.error(where, tr('must be an object.'));
      return;
    }
    checkId(summary, report, where);
    checkRequiredText(summary, 'title', report, where);
    checkLinkId(summary, 'unitId', report, where);
    checkLinkId(summary, 'topicId', report, where);
    checkReviewStatus(summary, report, where);
    var pointCount = 0;
    if (summary.points !== undefined) {
      if (!Array.isArray(summary.points)) {
        report.error(where, tr('points must be a list.'));
      } else {
        summary.points.forEach(function (point, i) {
          var at = tr('{where}, point {n}', { where: where, n: i + 1 });
          if (!isObject(point)) {
            report.error(at, tr('must be an object with at least a "rule".'));
            return;
          }
          checkRequiredText(point, 'rule', report, at);
          checkOptionalText(point, 'title', report, at);
          checkOptionalText(point, 'example', report, at);
        });
        pointCount = summary.points.length;
      }
    }
    var rememberCount = 0;
    if (summary.remember !== undefined) {
      checkTextList(summary.remember, 'remember', report, where, 0);
      if (Array.isArray(summary.remember)) rememberCount = summary.remember.filter(hasText).length;
    }
    if (pointCount === 0 && rememberCount === 0) {
      report.warn(where, tr('has no points and nothing in “remember”, so it will look empty.'));
    }
  }

  /* ---------- Questions (grammar practice and reading) ---------- */

  /* Explains why a multiple-choice answer key does not match, with a hint. */
  function answerKeyProblem(question) {
    var options = question.options;
    var answer = question.answer;
    if (answer === undefined || answer === null || answer === '') {
      return tr('answer is missing. Write the full text of the correct option, exactly as it appears in "options".');
    }
    if (typeof answer === 'number') {
      var byNumber = options[answer - 1];
      return hasText(byNumber)
        ? tr('answer is the number {n}. Write the full text of the correct option instead (option {n} is “{option}”).', { n: answer, option: shorten(byNumber, 40) })
        : tr('answer is the number {n}. Write the full text of the correct option instead.', { n: answer });
    }
    if (typeof answer !== 'string') {
      return tr('answer must be the text of the correct option.');
    }
    if (options.indexOf(answer) !== -1) return null;
    var trimmed = answer.trim().toLowerCase();
    var near = options.filter(function (option) {
      return typeof option === 'string' && option.trim().toLowerCase() === trimmed;
    })[0];
    if (near !== undefined) {
      return tr('answer “{answer}” differs from the option “{option}” only in spaces or capital letters. It must match exactly.', { answer: shorten(answer, 40), option: shorten(near, 40) });
    }
    var letter = /^\s*\(?([A-Fa-f])[).]?\s*$/.exec(answer);
    if (letter) {
      var byLetter = options[LETTERS.indexOf(letter[1].toUpperCase())];
      return hasText(byLetter)
        ? tr('answer “{answer}” looks like an option letter. Write the full text of the correct option instead (option {letter} is “{option}”).', { answer: answer.trim(), letter: letter[1].toUpperCase(), option: shorten(byLetter, 40) })
        : tr('answer “{answer}” looks like an option letter. Write the full text of the correct option instead.', { answer: answer.trim() });
    }
    var digits = /^\s*(\d+)\s*$/.exec(answer);
    if (digits) {
      var byDigits = options[Number(digits[1]) - 1];
      return hasText(byDigits)
        ? tr('answer “{answer}” looks like an option number. Write the full text of the correct option instead (option {n} is “{option}”).', { answer: answer.trim(), n: digits[1], option: shorten(byDigits, 40) })
        : tr('answer “{answer}” looks like an option number. Write the full text of the correct option instead.', { answer: answer.trim() });
    }
    return tr('answer “{answer}” does not exactly match any option.', { answer: shorten(answer, 40) });
  }

  function validateQuestion(question, report, where, meta) {
    if (!isObject(question)) {
      report.error(where, tr('must be an object.'));
      return;
    }
    checkId(question, report, where);
    checkRequiredText(question, 'prompt', report, where);
    checkReviewStatus(question, report, where);
    checkOptionalText(question, 'explanation', report, where);
    checkLinkId(question, 'unitId', report, where);
    checkLinkId(question, 'topicId', report, where);
    if (question.difficulty !== undefined && DIFFICULTIES.indexOf(question.difficulty) === -1) {
      report.error(where, tr('difficulty must be "easy", "medium" or "hard" (or left out).'), meta);
    }

    if (QUESTION_TYPES.indexOf(question.type) === -1) {
      report.error(where, tr('type must be "mcq" (multiple choice) or "short" (short written answer).'), meta);
      return;
    }

    if (question.type === 'mcq') {
      var options = question.options;
      if (!Array.isArray(options)) {
        report.error(where, tr('options must be a list.'), meta);
        return;
      }
      if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
        report.error(where, tr('needs between {min} and {max} options (it has {count}).', { min: MIN_OPTIONS, max: MAX_OPTIONS, count: options.length }), meta);
      }
      if (!options.every(hasText)) {
        report.error(where, tr('every option must contain text.'), meta);
      }
      var trimmed = options.map(function (option) { return String(option).trim(); });
      var duplicate = trimmed.filter(function (option, i) { return trimmed.indexOf(option) !== i; });
      if (duplicate.length) {
        report.error(where, tr('the option “{option}” appears more than once.', { option: shorten(duplicate[0], 40) }), meta);
      }
      var problem = answerKeyProblem(question);
      if (problem) report.error(where, problem, meta);
    } else {
      checkRequiredText(question, 'modelAnswer', report, where);
    }
  }

  /* ---------- Reading passages ---------- */

  function validatePassage(passage, report, where) {
    if (!isObject(passage)) {
      report.error(where, tr('must be an object.'));
      return;
    }
    checkId(passage, report, where);
    checkRequiredText(passage, 'title', report, where);
    checkOptionalText(passage, 'level', report, where);
    checkOptionalText(passage, 'source', report, where);
    checkLinkId(passage, 'unitId', report, where);
    checkReviewStatus(passage, report, where);
    if (passage.showParagraphNumbers !== undefined && typeof passage.showParagraphNumbers !== 'boolean') {
      report.error(where, tr('showParagraphNumbers must be true or false.'));
    }
    checkTextList(passage.paragraphs, 'paragraphs', report, where, 1);
    if (!Array.isArray(passage.questions)) {
      report.error(where, tr('questions must be a list (it can be empty).'));
    } else {
      if (passage.questions.length === 0) {
        report.warn(where, tr('has no questions yet.'));
      }
      passage.questions.forEach(function (question, i) {
        validateQuestion(question, report, tr('{where}, question {n}', { where: where, n: i + 1 }), { question: i });
      });
      checkDuplicateIds(passage.questions, report, where, 'Question');
    }
  }

  /* ---------- Collections and the whole library ---------- */

  var ITEM_VALIDATORS = {
    units: validateUnit,
    lessons: validateLesson,
    summaries: validateSummary,
    questions: validateQuestion,
    passages: validatePassage
  };

  function validateItem(key, item, index) {
    var report = new Report();
    ITEM_VALIDATORS[key](item, report, describe(COLLECTIONS[key].singular, index || 0, item));
    return report;
  }

  function validateCollection(key, items, report) {
    report = report || new Report();
    var kind = COLLECTIONS[key].singular;
    if (!Array.isArray(items)) {
      report.error(tr(COLLECTIONS[key].label), tr('must be a list.'));
      return report;
    }
    items.forEach(function (item, index) {
      ITEM_VALIDATORS[key](item, report, describe(kind, index, item));
    });
    checkDuplicateIds(items, report, tr(COLLECTIONS[key].label), kind);
    return report;
  }

  /* Validates everything, including links between collections. */
  function validateLibrary(library) {
    var report = new Report();
    COLLECTION_KEYS.forEach(function (key) {
      validateCollection(key, library[key] || [], report);
    });
    checkLinks(library, report);
    return report;
  }

  function idsOf(list) {
    return (list || []).filter(isObject).map(function (item) { return item.id; });
  }

  /* Warns about links to units or topics that do not exist, and about items
     whose unitId disagrees with the unit of their topic. */
  function checkLinks(library, report) {
    report = report || new Report();
    var unitIds = idsOf(library.units);
    var lessons = (library.lessons || []).filter(isObject);
    var lessonIds = idsOf(lessons);

    function checkUnit(item, where) {
      if (hasText(item.unitId) && unitIds.indexOf(item.unitId) === -1) {
        report.warn(where, tr('has the unitId “{unit}”, but no unit has that id. It will be shown under “Other”.', { unit: item.unitId }));
      }
    }

    function checkTopic(item, where) {
      if (!hasText(item.topicId)) return;
      var lesson = lessons[lessonIds.indexOf(item.topicId)];
      if (!lesson) {
        report.warn(where, tr('has the topicId “{topic}”, but no lesson has that id.', { topic: item.topicId }));
      } else if (hasText(item.unitId) && hasText(lesson.unitId) && item.unitId !== lesson.unitId) {
        report.warn(where, tr('has the unitId “{unit}”, but its topic “{topic}” is in the unit “{topicUnit}”. The topic’s unit is used.', { unit: item.unitId, topic: item.topicId, topicUnit: lesson.unitId }));
      }
    }

    lessons.forEach(function (lesson, index) { checkUnit(lesson, describe('Lesson', index, lesson)); });
    ['summaries', 'questions'].forEach(function (key) {
      (library[key] || []).forEach(function (item, index) {
        if (!isObject(item)) return;
        var where = describe(COLLECTIONS[key].singular, index, item);
        checkUnit(item, where);
        checkTopic(item, where);
      });
    });
    (library.passages || []).forEach(function (passage, index) {
      if (isObject(passage)) checkUnit(passage, describe('Passage', index, passage));
    });
    return report;
  }

  /* Checks the outer shape of one data file: { "schemaVersion": 2, "lessons": [...] } */
  function validateFile(key, data) {
    var report = new Report();
    var label = COLLECTIONS[key].fileName;
    if (!isObject(data)) {
      report.error(label, tr('must contain a JSON object such as {example}.', { example: '{ "schemaVersion": ' + SCHEMA_VERSION + ', "' + key + '": [] }' }));
      return report;
    }
    checkSchemaVersion(data, report, label);
    if (!Array.isArray(data[key])) {
      report.error(label, tr('must contain a "{key}" list.', { key: key }));
      return report;
    }
    var renamed = [];
    validateCollection(key, upgradeCollection(key, data[key], renamed), report);
    noteRenamed(renamed, key, report, label);
    return report;
  }

  function noteRenamed(renamed, key, report, label) {
    renamed.forEach(function (oldName) {
      report.warn(label, tr('uses the old field name "{old}"; it is read as "{new}". Saving or exporting from the content manager updates the file.', { old: oldName, new: RENAMED_FIELDS[key][oldName] }));
    });
  }

  function checkSchemaVersion(data, report, label) {
    if (data.schemaVersion === undefined) {
      report.warn(label, tr('schemaVersion is missing; version {version} is assumed.', { version: SCHEMA_VERSION }));
    } else if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION || data.schemaVersion < 1) {
      report.error(label, tr('schemaVersion {value} is not supported by this version of the website (expected 1 or {version}).', { value: JSON.stringify(data.schemaVersion), version: SCHEMA_VERSION }));
    }
  }

  /**
   * Reads an imported JSON object. Accepts a single data file (for example
   * { "lessons": [...] }) or a full backup containing several collections.
   * Old field names are upgraded. Returns { collections: {...}, report }.
   */
  function readImport(data, sourceName) {
    var report = new Report();
    var label = sourceName || tr('Imported file');
    var collections = {};
    if (!isObject(data)) {
      report.error(label, tr('is not a content file. It must be a JSON object such as {example}.', { example: '{ "lessons": [ ... ] }' }));
      return { collections: collections, report: report };
    }
    checkSchemaVersion(data, report, label);
    COLLECTION_KEYS.forEach(function (key) {
      if (data[key] !== undefined) {
        if (!Array.isArray(data[key])) {
          report.error(label, tr('"{key}" must be a list.', { key: key }));
        } else {
          var renamed = [];
          collections[key] = upgradeCollection(key, clone(data[key]), renamed);
          noteRenamed(renamed, key, report, label);
        }
      }
    });
    if (Object.keys(collections).length === 0 && report.errors.length === 0) {
      report.error(label, tr('does not contain units, lessons, summaries, questions or passages.'));
    }
    return { collections: collections, report: report };
  }

  /* ---------- Filtering for the student pages ---------- */

  /**
   * Returns only the items that can be shown safely. Broken items are left
   * out (and counted) so one mistake in a file cannot break a whole page.
   * For passages, broken questions are removed but the passage is kept.
   * Old field names are upgraded first.
   */
  function usableItems(key, items) {
    var result = { items: [], skipped: 0, skippedQuestions: 0 };
    if (!Array.isArray(items)) return result;
    var usedIds = {};
    upgradeCollection(key, items).forEach(function (item, index) {
      var candidate = item;
      if (key === 'passages' && isObject(item) && Array.isArray(item.questions)) {
        candidate = clone(item);
        var questionIds = {};
        candidate.questions = item.questions.filter(function (question, qIndex) {
          var ok = validateItem('questions', question, qIndex).ok() && !questionIds[question.id];
          if (ok) questionIds[question.id] = true;
          else result.skippedQuestions += 1;
          return ok;
        });
      }
      var ok = validateItem(key, candidate, index).ok() && !usedIds[candidate.id];
      if (ok) {
        usedIds[candidate.id] = true;
        result.items.push(candidate);
      } else {
        result.skipped += 1;
      }
    });
    return result;
  }

  /* ---------- Units and topics ---------- */

  function findById(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  /**
   * The unit an item belongs to: the unit of its topic (lesson) if it has
   * one, otherwise its own unitId. Returns '' when it has no unit.
   */
  function unitIdOf(item, lessons) {
    if (!isObject(item)) return '';
    if (hasText(item.topicId)) {
      var lesson = findById(lessons, item.topicId);
      if (lesson && hasText(lesson.unitId)) return lesson.unitId;
    }
    return hasText(item.unitId) ? item.unitId : '';
  }

  /**
   * Groups items by unit, in the order of the units list. Every unit gets a
   * group (possibly empty, so pages can show "nothing here yet"). Items with
   * no unit, or an unknown unit, go in a final group with unit: null, which
   * is only included when it has items.
   *   groupByUnit(items, units, lessons) → [{ unit, items }, ...]
   */
  function groupByUnit(items, units, lessons) {
    var groups = (units || []).map(function (unit) { return { unit: unit, items: [] }; });
    var other = { unit: null, items: [] };
    (items || []).forEach(function (item) {
      var unitId = unitIdOf(item, lessons);
      var group = null;
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].unit.id === unitId) group = groups[i];
      }
      (group || other).items.push(item);
    });
    if (other.items.length) groups.push(other);
    return groups;
  }

  /* All items in display order: unit by unit, then items without a unit. */
  function orderByUnit(items, units, lessons) {
    var ordered = [];
    groupByUnit(items, units, lessons).forEach(function (group) {
      ordered.push.apply(ordered, group.items);
    });
    return ordered;
  }

  /* ---------- ID helpers ---------- */

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
  }

  function uniqueId(base, existingIds) {
    var root = slugify(base) || 'item';
    var id = root;
    var n = 2;
    while (existingIds.indexOf(id) !== -1) {
      id = root + '-' + n;
      n += 1;
    }
    return id;
  }

  /* Next sequential id such as q-001, q-002 ... */
  function nextNumberedId(prefix, existingIds) {
    var pattern = new RegExp('^' + prefix + '-(\\d+)$');
    var max = 0;
    existingIds.forEach(function (id) {
      var match = pattern.exec(id);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    });
    var next = String(max + 1);
    while (next.length < 3) next = '0' + next;
    return prefix + '-' + next;
  }

  /* ---------- Text helpers for editor fields ---------- */

  /* Paragraphs are separated by one or more blank lines. Single line breaks
     inside a paragraph are kept (the website shows them as line breaks). */
  function splitParagraphs(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(function (part) {
      return part.trim();
    }).filter(Boolean);
  }

  function splitLines(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split('\n').map(function (line) {
      return line.trim();
    }).filter(Boolean);
  }

  /* Wraps a collection in the file format the website loads. */
  function toFileData(key, items) {
    var data = { schemaVersion: SCHEMA_VERSION };
    data[key] = items;
    return data;
  }

  function toJSON(data) {
    return JSON.stringify(data, null, 2) + '\n';
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    COLLECTIONS: COLLECTIONS,
    COLLECTION_KEYS: COLLECTION_KEYS,
    REVIEW_STATUSES: REVIEW_STATUSES,
    SECTION_TYPES: SECTION_TYPES,
    QUESTION_TYPES: QUESTION_TYPES,
    DIFFICULTIES: DIFFICULTIES,
    LANGUAGES: LANGUAGES,
    ID_PATTERN: ID_PATTERN,
    MIN_OPTIONS: MIN_OPTIONS,
    MAX_OPTIONS: MAX_OPTIONS,
    RENAMED_FIELDS: RENAMED_FIELDS,
    Report: Report,
    emptyLibrary: emptyLibrary,
    clone: clone,
    hasText: hasText,
    upgradeItem: upgradeItem,
    upgradeCollection: upgradeCollection,
    answerKeyProblem: answerKeyProblem,
    format: format,
    validateItem: validateItem,
    validateCollection: validateCollection,
    validateLibrary: validateLibrary,
    checkLinks: checkLinks,
    validateFile: validateFile,
    readImport: readImport,
    usableItems: usableItems,
    findById: findById,
    unitIdOf: unitIdOf,
    groupByUnit: groupByUnit,
    orderByUnit: orderByUnit,
    slugify: slugify,
    uniqueId: uniqueId,
    nextNumberedId: nextNumberedId,
    splitParagraphs: splitParagraphs,
    splitLines: splitLines,
    toFileData: toFileData,
    toJSON: toJSON
  };
});
