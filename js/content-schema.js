/* ==========================================================================
   Content schema and validation rules.

   One module, used in three places:
     - the student pages (to skip broken items instead of crashing),
     - the content manager (to check items before saving or importing),
     - tools/validate-content.js (command-line check in Node).

   Errors   = the item is broken and cannot be used.
   Warnings = the item works but is incomplete or has a broken link.
   See docs/CONTENT_FORMAT.md for the human-readable description.
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

  var SCHEMA_VERSION = 1;

  /* The four content collections and the data file each one lives in. */
  var COLLECTIONS = {
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
  var COLLECTION_KEYS = ['lessons', 'summaries', 'questions', 'passages'];

  var REVIEW_STATUSES = ['unreviewed', 'reviewed'];
  var SECTION_TYPES = ['text', 'note', 'list', 'examples', 'table', 'mistakes'];
  var QUESTION_TYPES = ['mcq', 'short'];
  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var LANGUAGES = ['en', 'ar'];
  var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var MIN_OPTIONS = 2;
  var MAX_OPTIONS = 6;

  /* ---------- Small helpers ---------- */

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function emptyLibrary() {
    return { lessons: [], summaries: [], questions: [], passages: [] };
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
    return kind + ' ' + (index + 1) + (name ? ' “' + shorten(name, 50) + '”' : '');
  }

  function Report() {
    this.errors = [];
    this.warnings = [];
  }
  Report.prototype.error = function (where, message) { this.errors.push(where + ': ' + message); };
  Report.prototype.warn = function (where, message) { this.warnings.push(where + ': ' + message); };
  Report.prototype.ok = function () { return this.errors.length === 0; };

  /* ---------- Shared field checks ---------- */

  function checkId(item, report, where) {
    if (!hasText(item.id)) {
      report.error(where, 'id is missing.');
    } else if (!ID_PATTERN.test(item.id)) {
      report.error(where, 'id “' + item.id + '” may only contain lowercase English letters, numbers and single hyphens (for example: passive-voice).');
    }
  }

  function checkRequiredText(item, field, report, where) {
    if (!hasText(item[field])) report.error(where, field + ' is required.');
  }

  function checkOptionalText(item, field, report, where) {
    if (item[field] !== undefined && typeof item[field] !== 'string') {
      report.error(where, field + ' must be text.');
    }
  }

  function checkReviewStatus(item, report, where) {
    if (item.reviewStatus === undefined) {
      report.warn(where, 'reviewStatus is missing, so it is treated as "unreviewed".');
    } else if (REVIEW_STATUSES.indexOf(item.reviewStatus) === -1) {
      report.error(where, 'reviewStatus must be "unreviewed" or "reviewed".');
    }
  }

  function checkTextList(list, field, report, where, minimum) {
    if (!Array.isArray(list)) {
      report.error(where, field + ' must be a list.');
      return;
    }
    var filled = list.filter(hasText).length;
    if (list.some(function (entry) { return typeof entry !== 'string'; })) {
      report.error(where, 'every entry in ' + field + ' must be text.');
    } else if (filled < minimum) {
      report.error(where, field + ' needs at least ' + minimum + ' non-empty ' + (minimum === 1 ? 'entry' : 'entries') + '.');
    }
  }

  function checkDuplicateIds(items, report, where, kind) {
    var seen = {};
    items.forEach(function (item, index) {
      if (!isObject(item) || !hasText(item.id)) return;
      if (seen[item.id] !== undefined) {
        report.error(where, kind + ' ' + (index + 1) + ' uses the id “' + item.id + '”, which is already used by ' + kind.toLowerCase() + ' ' + (seen[item.id] + 1) + '. Every id must be unique.');
      } else {
        seen[item.id] = index;
      }
    });
  }

  /* ---------- Lessons ---------- */

  function validateSection(section, report, where) {
    if (!isObject(section)) {
      report.error(where, 'must be an object.');
      return;
    }
    if (SECTION_TYPES.indexOf(section.type) === -1) {
      report.error(where, 'type must be one of: ' + SECTION_TYPES.join(', ') + '.');
      return;
    }
    checkOptionalText(section, 'heading', report, where);

    switch (section.type) {
      case 'text':
      case 'note':
        checkTextList(section.paragraphs, 'paragraphs', report, where, 1);
        if (section.lang !== undefined && LANGUAGES.indexOf(section.lang) === -1) {
          report.error(where, 'lang must be "en" or "ar".');
        }
        break;
      case 'list':
      case 'examples':
        checkTextList(section.items, 'items', report, where, 1);
        break;
      case 'table':
        checkTextList(section.columns, 'columns', report, where, 1);
        if (!Array.isArray(section.rows) || section.rows.length === 0) {
          report.error(where, 'a table needs at least one row.');
        } else if (Array.isArray(section.columns)) {
          section.rows.forEach(function (row, rowIndex) {
            if (!Array.isArray(row) || row.some(function (cell) { return typeof cell !== 'string'; })) {
              report.error(where, 'row ' + (rowIndex + 1) + ' must be a list of text cells.');
            } else if (row.length !== section.columns.length) {
              report.error(where, 'row ' + (rowIndex + 1) + ' has ' + row.length + (row.length === 1 ? ' cell' : ' cells') +
                ', but the table has ' + section.columns.length + (section.columns.length === 1 ? ' column.' : ' columns.'));
            }
          });
        }
        break;
      case 'mistakes':
        if (!Array.isArray(section.items) || section.items.length === 0) {
          report.error(where, 'needs at least one item.');
        } else {
          section.items.forEach(function (entry, i) {
            var at = where + ', item ' + (i + 1);
            if (!isObject(entry)) {
              report.error(at, 'must be an object with "avoid" and "use".');
              return;
            }
            checkRequiredText(entry, 'avoid', report, at);
            checkRequiredText(entry, 'use', report, at);
            checkOptionalText(entry, 'note', report, at);
          });
        }
        break;
    }
  }

  function validateLesson(lesson, report, where) {
    if (!isObject(lesson)) {
      report.error(where, 'must be an object.');
      return;
    }
    checkId(lesson, report, where);
    checkRequiredText(lesson, 'title', report, where);
    checkOptionalText(lesson, 'description', report, where);
    checkReviewStatus(lesson, report, where);
    if (!Array.isArray(lesson.sections)) {
      report.error(where, 'sections must be a list (it can be empty while you are still writing).');
    } else if (lesson.sections.length === 0) {
      report.warn(where, 'has no sections yet, so students will see an empty lesson.');
    } else {
      lesson.sections.forEach(function (section, i) {
        validateSection(section, report, where + ', section ' + (i + 1));
      });
    }
  }

  /* ---------- Summaries ---------- */

  function validateSummary(summary, report, where) {
    if (!isObject(summary)) {
      report.error(where, 'must be an object.');
      return;
    }
    checkId(summary, report, where);
    checkRequiredText(summary, 'title', report, where);
    checkReviewStatus(summary, report, where);
    if (summary.lessonId !== undefined && summary.lessonId !== '' && !ID_PATTERN.test(String(summary.lessonId))) {
      report.error(where, 'lessonId is not a valid lesson id.');
    }
    var pointCount = 0;
    if (summary.points !== undefined) {
      if (!Array.isArray(summary.points)) {
        report.error(where, 'points must be a list.');
      } else {
        summary.points.forEach(function (point, i) {
          var at = where + ', point ' + (i + 1);
          if (!isObject(point)) {
            report.error(at, 'must be an object with at least a "rule".');
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
      report.warn(where, 'has no points and nothing in “remember”, so it will look empty.');
    }
  }

  /* ---------- Questions (grammar practice and reading) ---------- */

  function validateQuestion(question, report, where) {
    if (!isObject(question)) {
      report.error(where, 'must be an object.');
      return;
    }
    checkId(question, report, where);
    checkRequiredText(question, 'prompt', report, where);
    checkReviewStatus(question, report, where);
    checkOptionalText(question, 'explanation', report, where);
    checkOptionalText(question, 'topic', report, where);
    if (question.difficulty !== undefined && DIFFICULTIES.indexOf(question.difficulty) === -1) {
      report.error(where, 'difficulty must be "easy", "medium" or "hard" (or left out).');
    }

    if (QUESTION_TYPES.indexOf(question.type) === -1) {
      report.error(where, 'type must be "mcq" (multiple choice) or "short" (short written answer).');
      return;
    }

    if (question.type === 'mcq') {
      var options = question.options;
      if (!Array.isArray(options)) {
        report.error(where, 'options must be a list.');
        return;
      }
      if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
        report.error(where, 'needs between ' + MIN_OPTIONS + ' and ' + MAX_OPTIONS + ' options (it has ' + options.length + ').');
      }
      if (!options.every(hasText)) {
        report.error(where, 'every option must contain text.');
      }
      var trimmed = options.map(function (option) { return String(option).trim(); });
      var duplicate = trimmed.filter(function (option, i) { return trimmed.indexOf(option) !== i; });
      if (duplicate.length) {
        report.error(where, 'the option “' + shorten(duplicate[0], 40) + '” appears more than once.');
      }
      if (!hasText(question.answer)) {
        report.error(where, 'answer is required: copy the text of the correct option exactly.');
      } else if (options.indexOf(question.answer) === -1) {
        report.error(where, 'answer “' + shorten(question.answer, 40) + '” does not exactly match any option.');
      }
    } else {
      checkRequiredText(question, 'modelAnswer', report, where);
    }
  }

  /* ---------- Reading passages ---------- */

  function validatePassage(passage, report, where) {
    if (!isObject(passage)) {
      report.error(where, 'must be an object.');
      return;
    }
    checkId(passage, report, where);
    checkRequiredText(passage, 'title', report, where);
    checkOptionalText(passage, 'level', report, where);
    checkOptionalText(passage, 'source', report, where);
    checkReviewStatus(passage, report, where);
    checkTextList(passage.paragraphs, 'paragraphs', report, where, 1);
    if (!Array.isArray(passage.questions)) {
      report.error(where, 'questions must be a list (it can be empty).');
    } else {
      if (passage.questions.length === 0) {
        report.warn(where, 'has no questions yet.');
      }
      passage.questions.forEach(function (question, i) {
        validateQuestion(question, report, where + ', question ' + (i + 1));
      });
      checkDuplicateIds(passage.questions, report, where, 'Question');
    }
  }

  /* ---------- Collections and the whole library ---------- */

  var ITEM_VALIDATORS = {
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
      report.error(COLLECTIONS[key].label, 'must be a list.');
      return report;
    }
    items.forEach(function (item, index) {
      ITEM_VALIDATORS[key](item, report, describe(kind, index, item));
    });
    checkDuplicateIds(items, report, COLLECTIONS[key].label, kind);
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

  /* Warns about summaries and questions linked to lessons that do not exist. */
  function checkLinks(library, report) {
    report = report || new Report();
    var lessonIds = (library.lessons || []).filter(isObject).map(function (lesson) { return lesson.id; });
    (library.summaries || []).forEach(function (summary, index) {
      if (isObject(summary) && hasText(summary.lessonId) && lessonIds.indexOf(summary.lessonId) === -1) {
        report.warn(describe('Summary', index, summary), 'is linked to the lesson id “' + summary.lessonId + '”, but no lesson has that id.');
      }
    });
    (library.questions || []).forEach(function (question, index) {
      if (isObject(question) && hasText(question.topic) && lessonIds.indexOf(question.topic) === -1) {
        report.warn(describe('Question', index, question), 'has the topic “' + question.topic + '”, but no lesson has that id. It will be listed under “Other questions”.');
      }
    });
    return report;
  }

  /* Checks the outer shape of one data file: { "schemaVersion": 1, "lessons": [...] } */
  function validateFile(key, data) {
    var report = new Report();
    var label = COLLECTIONS[key].fileName;
    if (!isObject(data)) {
      report.error(label, 'must contain a JSON object such as { "schemaVersion": 1, "' + key + '": [] }.');
      return report;
    }
    checkSchemaVersion(data, report, label);
    if (!Array.isArray(data[key])) {
      report.error(label, 'must contain a "' + key + '" list.');
      return report;
    }
    validateCollection(key, data[key], report);
    return report;
  }

  function checkSchemaVersion(data, report, label) {
    if (data.schemaVersion === undefined) {
      report.warn(label, 'schemaVersion is missing; version ' + SCHEMA_VERSION + ' is assumed.');
    } else if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
      report.error(label, 'schemaVersion ' + JSON.stringify(data.schemaVersion) + ' is not supported by this version of the website (expected ' + SCHEMA_VERSION + ').');
    }
  }

  /**
   * Reads an imported JSON object. Accepts a single data file (for example
   * { "lessons": [...] }) or a full backup containing several collections.
   * Returns { collections: { lessons: [...] , ... }, report }.
   */
  function readImport(data, sourceName) {
    var report = new Report();
    var label = sourceName || 'Imported file';
    var collections = {};
    if (!isObject(data)) {
      report.error(label, 'is not a content file. It must be a JSON object such as { "lessons": [ ... ] }.');
      return { collections: collections, report: report };
    }
    checkSchemaVersion(data, report, label);
    COLLECTION_KEYS.forEach(function (key) {
      if (data[key] !== undefined) {
        if (!Array.isArray(data[key])) {
          report.error(label, '"' + key + '" must be a list.');
        } else {
          collections[key] = clone(data[key]);
        }
      }
    });
    if (Object.keys(collections).length === 0 && report.errors.length === 0) {
      report.error(label, 'does not contain lessons, summaries, questions or passages.');
    }
    return { collections: collections, report: report };
  }

  /* ---------- Filtering for the student pages ---------- */

  /**
   * Returns only the items that can be shown safely. Broken items are left
   * out (and counted) so one mistake in a file cannot break a whole page.
   * For passages, broken questions are removed but the passage is kept.
   */
  function usableItems(key, items) {
    var result = { items: [], skipped: 0, skippedQuestions: 0 };
    if (!Array.isArray(items)) return result;
    var usedIds = {};
    items.forEach(function (item, index) {
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

  /* Paragraphs are separated by one or more blank lines. */
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
    Report: Report,
    emptyLibrary: emptyLibrary,
    clone: clone,
    hasText: hasText,
    validateItem: validateItem,
    validateCollection: validateCollection,
    validateLibrary: validateLibrary,
    checkLinks: checkLinks,
    validateFile: validateFile,
    readImport: readImport,
    usableItems: usableItems,
    slugify: slugify,
    uniqueId: uniqueId,
    nextNumberedId: nextNumberedId,
    splitParagraphs: splitParagraphs,
    splitLines: splitLines,
    toFileData: toFileData,
    toJSON: toJSON
  };
});
