/* ==========================================================================
   Content store: pure functions that change the content library, plus the
   browser draft (saved in localStorage on this device only).

   Every change function returns a NEW library and never edits the one it
   was given, which keeps the editor simple and easy to test.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./content-schema.js'));
  } else {
    root.G12 = root.G12 || {};
    root.G12.Store = factory(root.G12.Schema);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema) {
  'use strict';

  var DRAFT_KEY = 'g12-content-draft-v1';
  var PREVIEW_KEY = 'g12-preview-draft';
  var BACKUP_TYPE = 'grade12-english-backup';

  function normalizeLibrary(library) {
    var result = Schema.emptyLibrary();
    Schema.COLLECTION_KEYS.forEach(function (key) {
      result[key] = Array.isArray(library && library[key]) ? Schema.clone(library[key]) : [];
    });
    return result;
  }

  /* Stable text form of a library, used to detect changes. */
  function fingerprint(library) {
    var normal = normalizeLibrary(library);
    return JSON.stringify(Schema.COLLECTION_KEYS.map(function (key) { return normal[key]; }));
  }

  function isEmpty(library) {
    return Schema.COLLECTION_KEYS.every(function (key) {
      return !library || !Array.isArray(library[key]) || library[key].length === 0;
    });
  }

  function indexOfId(items, id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) return i;
    }
    return -1;
  }

  /* ---------- Editing ---------- */

  /**
   * Adds a new item, or replaces the item whose id was originalId.
   * When a lesson id changes, linked summaries and questions are updated too.
   */
  function saveItem(library, key, item, originalId) {
    var next = normalizeLibrary(library);
    var items = next[key];
    var position = originalId ? indexOfId(items, originalId) : -1;
    if (position === -1) {
      items.push(Schema.clone(item));
    } else {
      items[position] = Schema.clone(item);
    }
    if (key === 'lessons' && originalId && originalId !== item.id) {
      next.summaries.forEach(function (summary) {
        if (summary.lessonId === originalId) summary.lessonId = item.id;
      });
      next.questions.forEach(function (question) {
        if (question.topic === originalId) question.topic = item.id;
      });
    }
    return next;
  }

  /* How many summaries and questions point at a lesson. */
  function countLessonLinks(library, lessonId) {
    return {
      summaries: (library.summaries || []).filter(function (s) { return s.lessonId === lessonId; }).length,
      questions: (library.questions || []).filter(function (q) { return q.topic === lessonId; }).length
    };
  }

  /**
   * Deletes an item. Deleting a lesson keeps its summaries and questions but
   * removes their link to the deleted lesson.
   */
  function deleteItem(library, key, id) {
    var next = normalizeLibrary(library);
    var position = indexOfId(next[key], id);
    if (position === -1) return next;
    next[key].splice(position, 1);
    if (key === 'lessons') {
      next.summaries.forEach(function (summary) {
        if (summary.lessonId === id) delete summary.lessonId;
      });
      next.questions.forEach(function (question) {
        if (question.topic === id) delete question.topic;
      });
    }
    return next;
  }

  /* Moves an item up (delta -1) or down (delta +1). */
  function moveItem(library, key, id, delta) {
    var next = normalizeLibrary(library);
    var items = next[key];
    var from = indexOfId(items, id);
    var to = from + delta;
    if (from === -1 || to < 0 || to >= items.length) return next;
    var moved = items.splice(from, 1)[0];
    items.splice(to, 0, moved);
    return next;
  }

  /* ---------- Import ---------- */

  /**
   * Applies imported collections to a library.
   *   mode "merge":   items with the same id are replaced, new ids are added.
   *   mode "replace": each imported collection replaces the existing one.
   * Collections that are not in the import are left unchanged.
   */
  function applyImport(library, collections, mode) {
    var next = normalizeLibrary(library);
    var summary = {};
    Object.keys(collections).forEach(function (key) {
      if (Schema.COLLECTION_KEYS.indexOf(key) === -1) return;
      var incoming = Schema.clone(collections[key]) || [];
      if (mode === 'replace') {
        summary[key] = { added: incoming.length, updated: 0, removed: next[key].length };
        next[key] = incoming;
        return;
      }
      var stats = { added: 0, updated: 0, removed: 0 };
      incoming.forEach(function (item) {
        var position = item && typeof item.id === 'string' ? indexOfId(next[key], item.id) : -1;
        if (position === -1) {
          next[key].push(item);
          stats.added += 1;
        } else {
          next[key][position] = item;
          stats.updated += 1;
        }
      });
      summary[key] = stats;
    });
    return { library: next, summary: summary };
  }

  /* ---------- Export ---------- */

  function fileData(library, key) {
    return Schema.toFileData(key, Schema.clone(library[key] || []));
  }

  function backupData(library, now) {
    var data = {
      schemaVersion: Schema.SCHEMA_VERSION,
      type: BACKUP_TYPE,
      exportedAt: (now || new Date()).toISOString()
    };
    Schema.COLLECTION_KEYS.forEach(function (key) {
      data[key] = Schema.clone(library[key] || []);
    });
    return data;
  }

  /* ---------- Browser draft (localStorage) ---------- */

  /* Returns window.localStorage if it can be used, otherwise null. */
  function browserStorage() {
    try {
      var storage = typeof window !== 'undefined' ? window.localStorage : null;
      if (!storage) return null;
      var probe = '__g12_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (error) {
      return null;
    }
  }

  function loadDraft(storage) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object' || !draft.library) return null;
      return {
        library: normalizeLibrary(draft.library),
        savedAt: draft.savedAt || null,
        baseline: typeof draft.baseline === 'string' ? draft.baseline : null
      };
    } catch (error) {
      return null;
    }
  }

  /* Throws if the browser refuses to store the draft (e.g. storage full). */
  function saveDraft(storage, library, baseline, now) {
    if (!storage) throw new Error('This browser is not allowing the website to save drafts.');
    var savedAt = (now || new Date()).toISOString();
    storage.setItem(DRAFT_KEY, JSON.stringify({
      savedAt: savedAt,
      baseline: baseline,
      library: normalizeLibrary(library)
    }));
    return savedAt;
  }

  function clearDraft(storage) {
    if (!storage) return;
    try {
      storage.removeItem(DRAFT_KEY);
      storage.removeItem(PREVIEW_KEY);
    } catch (error) { /* nothing to clear */ }
  }

  function isPreviewOn(storage) {
    if (!storage) return false;
    try {
      return storage.getItem(PREVIEW_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function setPreview(storage, on) {
    if (!storage) return false;
    try {
      if (on) storage.setItem(PREVIEW_KEY, '1');
      else storage.removeItem(PREVIEW_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    DRAFT_KEY: DRAFT_KEY,
    PREVIEW_KEY: PREVIEW_KEY,
    BACKUP_TYPE: BACKUP_TYPE,
    normalizeLibrary: normalizeLibrary,
    fingerprint: fingerprint,
    isEmpty: isEmpty,
    saveItem: saveItem,
    countLessonLinks: countLessonLinks,
    deleteItem: deleteItem,
    moveItem: moveItem,
    applyImport: applyImport,
    fileData: fileData,
    backupData: backupData,
    browserStorage: browserStorage,
    loadDraft: loadDraft,
    saveDraft: saveDraft,
    clearDraft: clearDraft,
    isPreviewOn: isPreviewOn,
    setPreview: setPreview
  };
});
