/* ==========================================================================
   Content manager (manage.html)

   - Starts from the published data files (data/*.json).
   - Every change is saved automatically as a draft in this browser.
   - "Import & export" downloads the data files to upload to GitHub, makes a
     backup, imports files (merge or replace) and checks all content.
   - Preview mode shows the draft on the student pages in this browser only.

   Views are chosen by the address hash:
     #lessons  #lessons/new  #lessons/edit/<id>      (same for summaries,
     #questions ...  #passages ...)                  questions and passages)
     #passages/edit/<id>/questions/new
     #passages/edit/<id>/questions/edit/<questionId>
     #tools
   ========================================================================== */
(function () {
  'use strict';

  var G12 = window.G12;
  var Schema = G12.Schema;
  var Store = G12.Store;
  var el = G12.el;
  var t = G12.t;
  var hasText = Schema.hasText;
  var root = document.getElementById('page-root');

  var TYPES = {
    units: {
      title: t('Units'), singular: 'unit', add: t('Add a unit'), none: t('No units added yet'),
      help: t('Units group the lessons, summaries, practice questions and reading passages. They appear on the website in this order. Units are optional: without them, each page shows one list.'),
      empty: t('Add your first unit, or import a units file.')
    },
    lessons: {
      title: t('Lessons'), singular: 'lesson', add: t('Add a lesson'), none: t('No lessons added yet'),
      help: t('Each lesson is one grammar topic; its ID is the topic ID. Lessons appear in this order within their unit.'),
      empty: t('Add your first grammar lesson, or import a lessons file.')
    },
    summaries: {
      title: t('Summaries'), singular: 'summary', add: t('Add a summary'), none: t('No summaries added yet'),
      help: t('Summaries appear in this order within their unit. Link each summary to its topic (lesson); it then belongs to that lesson’s unit.'),
      empty: t('Add your first grammar summary, or import a summaries file.')
    },
    questions: {
      title: t('Grammar questions'), singular: 'question', add: t('Add a question'), none: t('No grammar questions added yet'),
      help: t('These questions are used on the Grammar Practice page. Link each question to a topic (lesson) or a unit so students can practise by unit and topic.'),
      empty: t('Add your first practice question, or import a questions file.')
    },
    passages: {
      title: t('Reading passages'), singular: 'passage', add: t('Add a passage'), none: t('No reading passages added yet'),
      help: t('Passages appear on the Reading page in this order within their unit. Each passage has its own questions.'),
      empty: t('Add your first reading passage, or import a passages file.')
    }
  };

  var SECTION_TYPE_OPTIONS = [
    { value: 'text', label: t('Text (paragraphs)') },
    { value: 'note', label: t('Note (highlighted box)') },
    { value: 'list', label: t('Bulleted list') },
    { value: 'examples', label: t('Examples') },
    { value: 'table', label: t('Table') },
    { value: 'mistakes', label: t('Common mistakes (avoid / use)') }
  ];
  var LETTERS = 'ABCDEFGH';

  /* ---------- State ---------- */

  var storage = Store.browserStorage();
  var published = Schema.emptyLibrary();
  var publishedFingerprint = Store.fingerprint(published);
  var publishedErrors = [];
  var library = Schema.emptyLibrary();
  var baseline = null;
  var savedAt = null;

  var dirty = false;          // the open form has unsaved edits
  var currentHash = '';
  var flash = null;           // message to show after the next render
  var afterRender = null;     // focus callback after the next render
  var importReport = null;    // shown on the tools view after an import
  var lastQuestionLinks = {}; // unit and topic remembered for "Save and add another"
  var firstRender = true;
  var ui = {};

  G12.setTitle(t('Content Manager'));

  loadPublished().then(function () {
    var draft = Store.loadDraft(storage);
    if (draft) {
      library = draft.library;
      savedAt = draft.savedAt;
      baseline = draft.baseline;
      if (Store.fingerprint(library) === publishedFingerprint) baseline = publishedFingerprint;
    } else {
      library = Store.normalizeLibrary(published);
      baseline = publishedFingerprint;
    }
    buildShell();
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', function (event) {
      if (dirty || (!storage && changed())) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    currentHash = window.location.hash.slice(1);
    route();
  }).catch(function (error) {
    G12.showError(root, error, { title: t('Content Manager') });
  });

  function loadPublished() {
    return Promise.all(Schema.COLLECTION_KEYS.map(function (key) {
      return G12.loadCollection(key).then(function (list) {
        published[key] = list;
      }).catch(function (error) {
        publishedErrors.push(error.message);
      });
    })).then(function () {
      publishedFingerprint = Store.fingerprint(published);
    });
  }

  function changed() {
    return Store.fingerprint(library) !== publishedFingerprint;
  }

  /* ---------- Saving ---------- */

  function persist() {
    if (!storage) return null;
    try {
      savedAt = Store.saveDraft(storage, library, baseline);
      return null;
    } catch (error) {
      return t('Warning: your changes could not be saved in this browser ({reason}). Download a backup now from Import & export.', { reason: error.message });
    }
  }

  /* Replace the library, save the draft and refresh the status and counts. */
  function commit(next, message) {
    library = next;
    var problem = persist();
    flash = problem ? { text: problem, warning: true } : (message ? { text: message } : null);
    renderStatus();
    renderNav();
  }

  /* ---------- Page frame ---------- */

  function buildShell() {
    G12.clear(root);
    root.appendChild(el('h1', { text: t('Content Manager') }));
    root.appendChild(el('p', {
      className: 'lead',
      text: t('Add, edit, organise, import and export the lessons, summaries, practice questions and reading passages shown on the website.')
    }));
    root.appendChild(el('div', { className: 'notice notice--info' }, [
      el('p', null, [el('strong', { text: t('How saving works:') + ' ' }), G12.tNodes(
        'your changes are saved automatically as a draft in this browser, on this device only. Students see them after you publish: open {link}, download the data files and upload them to the data folder of your GitHub repository.',
        null, { link: el('a', { href: '#tools', text: t('Import & export') }) })])
    ]));
    ui.status = el('div', { className: 'status-bar', role: 'region', 'aria-label': t('Draft status') });
    ui.nav = el('nav', { className: 'manager-nav', 'aria-label': t('Content types') });
    ui.message = el('div', { className: 'manager-message', role: 'status' });
    ui.view = el('div', { id: 'manager-view' });
    root.appendChild(ui.status);
    root.appendChild(ui.nav);
    root.appendChild(ui.message);
    root.appendChild(ui.view);
    renderStatus();
  }

  function formatTime(iso) {
    return G12.formatDateTime(iso);
  }

  function renderStatus() {
    var box = G12.clear(ui.status);
    if (publishedErrors.length) {
      box.appendChild(el('div', { className: 'notice notice--error', role: 'alert' }, [
        el('p', null, [el('strong', { text: t('The published data files could not be loaded.') + ' ' }), publishedErrors.join(' ')]),
        el('p', { text: t('The manager is showing your browser draft, or an empty library if there is no draft. Be careful: publishing from here could replace content that is already on the website. Reload the page to try again.') })
      ]));
    }

    if (!storage) {
      box.appendChild(el('p', null, [el('strong', { text: t('Drafts cannot be saved in this browser') }), ' ', G12.tNodes(
        '(for example, in private browsing). Your changes will be lost when you close this page, so download a backup often from {link}.',
        null, { link: el('a', { href: '#tools', text: t('Import & export') }) })]));
    } else if (changed()) {
      box.appendChild(el('p', null, [el('strong', { text: t('You have unpublished changes.') + ' ' }), G12.tNodes(
        savedAt
          ? 'They are saved in this browser (last saved {time}). Students cannot see them until you publish them from {link}.'
          : 'They are saved in this browser. Students cannot see them until you publish them from {link}.',
        { time: formatTime(savedAt) }, { link: el('a', { href: '#tools', text: t('Import & export') }) })]));
      if (baseline && baseline !== publishedFingerprint) {
        box.appendChild(el('div', { className: 'notice notice--demo', role: 'note' }, [
          el('p', null, [el('strong', { text: t('The published files have changed since you started this draft.') + ' ' }), G12.tNodes(
            'For example, new files may have been uploaded from another computer. Publishing this draft will replace them. To start again from the published files, use “Discard my draft” in {link}.',
            null, { link: el('a', { href: '#tools', text: t('Import & export') }) })])
        ]));
      }
    } else {
      box.appendChild(el('p', { text: t('No unpublished changes: everything here matches the published files.') }));
    }

    var toggle = el('input', { type: 'checkbox', id: 'preview-toggle', checked: Store.isPreviewOn(storage), disabled: !storage });
    toggle.addEventListener('change', function () {
      Store.setPreview(storage, toggle.checked);
      showMessage(toggle.checked
        ? t('Preview is on: the student pages in this browser now show your draft.')
        : t('Preview is off: the student pages show the published files.'));
    });
    box.appendChild(el('div', { className: 'checkbox-row' }, [
      el('label', { for: 'preview-toggle' }, [toggle, t('Preview my draft on the student pages (only in this browser)')])
    ]));
    box.appendChild(el('p', null, [el('a', { href: 'index.html', text: t('Open the website') })]));
  }

  function renderNav() {
    var section = currentHash.split('/')[0] || 'lessons';
    var links = Schema.COLLECTION_KEYS.map(function (key) {
      return el('li', null, [el('a', {
        href: '#' + key,
        'aria-current': section === key ? 'page' : null,
        text: t('{title} ({count})', { title: TYPES[key].title, count: library[key].length })
      })]);
    });
    links.push(el('li', null, [el('a', { href: '#tools', 'aria-current': section === 'tools' ? 'page' : null, text: t('Import & export') })]));
    G12.clear(ui.nav).appendChild(el('ul', null, links));
  }

  function showMessage(text, warning) {
    ui.message.className = 'manager-message' + (warning ? ' notice--demo' : '');
    ui.message.textContent = text || '';
  }

  /* ---------- Navigation ---------- */

  function onHashChange() {
    var next = window.location.hash.slice(1);
    if (next === currentHash) return;
    if (dirty && !window.confirm(t('You have unsaved changes on this form. Leave without saving them?'))) {
      window.history.replaceState(null, '', '#' + currentHash);
      return;
    }
    dirty = false;
    currentHash = next;
    route();
  }

  /* Navigate from code (after saving, deleting, etc.). */
  function go(hash) {
    dirty = false;
    currentHash = hash;
    if (window.location.hash.slice(1) !== hash) {
      window.history.pushState(null, '', '#' + hash);
    }
    route();
  }

  function route() {
    var quietStart = firstRender && !currentHash; // plain first visit: don't move focus
    var parts = currentHash.split('/').map(function (part) {
      try { return decodeURIComponent(part); } catch (error) { return part; }
    });
    var section = parts[0];
    if (section !== 'tools' && !TYPES[section]) {
      section = 'lessons';
      parts = ['lessons'];
      currentHash = 'lessons';
      window.history.replaceState(null, '', '#lessons');
    }
    renderNav();
    G12.clear(ui.view);

    if (section === 'tools') {
      renderTools();
    } else if (parts[1] === 'new') {
      renderEditor(section, null);
    } else if (parts[1] === 'edit' && parts[2]) {
      if (section === 'passages' && parts[3] === 'questions') {
        renderPassageQuestionEditor(parts[2], parts[4] === 'edit' ? parts[5] : null);
      } else {
        renderEditor(section, parts[2]);
      }
    } else {
      renderList(section);
    }

    showMessage(flash ? flash.text : '', flash && flash.warning);
    flash = null;

    if (afterRender) {
      var callback = afterRender;
      afterRender = null;
      callback();
    } else if (!quietStart) {
      G12.focus(ui.view.querySelector('h2'));
    }
    firstRender = false;
  }

  function focusById(id) {
    var target = document.getElementById(id);
    if (target) target.focus();
  }

  /* ---------- Small form helpers ---------- */

  function labelFor(id, text, mark) {
    return el('label', { for: id }, [text, mark ? el('span', { className: 'hint', text: ' (' + t(mark) + ')' }) : null]);
  }

  function describe(control, id) {
    var ids = (control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    ids.push(id);
    control.setAttribute('aria-describedby', ids.join(' '));
  }

  /* Text input or textarea with label and optional hint. */
  function textField(opts) {
    var control = opts.multiline
      ? el('textarea', { id: opts.id, rows: String(opts.rows || 4), dir: opts.dir || 'auto' })
      : el('input', { type: 'text', id: opts.id, dir: opts.dir || 'auto', autocomplete: 'off' });
    control.value = opts.value || '';
    if (opts.required) control.setAttribute('aria-required', 'true');
    var hint = null;
    if (opts.hint) {
      hint = el('p', { className: 'hint', id: opts.id + '-hint', text: opts.hint });
      describe(control, opts.id + '-hint');
    }
    var row = el('div', { className: 'form-row' }, [
      labelFor(opts.id, opts.label, opts.required ? 'required' : (opts.optional ? 'optional' : null)),
      hint,
      control
    ]);
    return { row: row, control: control };
  }

  /* opts.options: [{ value, label }] or groups [{ group: 'Label', options: [...] }] */
  function selectField(opts) {
    function optionNode(option) {
      return el('option', { value: option.value, text: option.label });
    }
    var control = el('select', { id: opts.id }, opts.options.map(function (option) {
      return option.group
        ? el('optgroup', { label: option.group }, option.options.map(optionNode))
        : optionNode(option);
    }));
    control.value = opts.value || '';
    var hint = null;
    if (opts.hint) {
      hint = el('p', { className: 'hint', id: opts.id + '-hint', text: opts.hint });
      describe(control, opts.id + '-hint');
    }
    return {
      row: el('div', { className: 'form-row' }, [labelFor(opts.id, opts.label, opts.optional ? 'optional' : null), hint, control]),
      control: control
    };
  }

  function checkboxField(opts) {
    var control = el('input', { type: 'checkbox', id: opts.id, checked: Boolean(opts.checked) });
    var hint = null;
    if (opts.hint) {
      hint = el('p', { className: 'hint', id: opts.id + '-hint', text: opts.hint });
      describe(control, opts.id + '-hint');
    }
    return {
      row: el('div', { className: 'form-row checkbox-row' }, [el('label', { for: opts.id }, [control, opts.label]), hint]),
      control: control
    };
  }

  function bind(control, target, key) {
    control.addEventListener('input', function () { target[key] = control.value; });
  }

  function smallButton(text, ariaLabel, onClick, options) {
    options = options || {};
    return el('button', {
      type: 'button',
      className: 'btn btn--small ' + (options.danger ? 'btn--danger' : 'btn--secondary'),
      text: text,
      'aria-label': ariaLabel,
      disabled: Boolean(options.disabled),
      'data-action': options.action,
      'data-id': options.id,
      onclick: onClick
    });
  }

  /* Form shell: back link, heading, form with an error area. */
  function editorFrame(heading, backHref, backLabel) {
    ui.view.appendChild(el('p', null, [el('a', { href: backHref, text: t('← {label}', { label: backLabel }) })]));
    ui.view.appendChild(el('h2', { tabindex: '-1', dir: 'auto', text: heading }));
    var errors = el('div', { className: 'form-errors' });
    var form = el('form', { className: 'editor-form', novalidate: true }, [errors]);
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('change', function () { dirty = true; });
    ui.view.appendChild(form);
    return { form: form, errors: errors };
  }

  function formActions(buttons, cancelHref) {
    return el('div', { className: 'actions' }, buttons.concat([
      el('a', { className: 'btn btn--secondary', href: cancelHref, text: t('Cancel') })
    ]));
  }

  /* Shows a list of problems at the top of the form and next to each field. */
  function showErrors(frame, errors) {
    frame.form.querySelectorAll('.field-error').forEach(function (node) { node.remove(); });
    frame.form.querySelectorAll('[aria-invalid]').forEach(function (node) {
      node.removeAttribute('aria-invalid');
      var ids = (node.getAttribute('aria-describedby') || '').split(' ').filter(function (id) { return id && !/-error$/.test(id); });
      if (ids.length) node.setAttribute('aria-describedby', ids.join(' '));
      else node.removeAttribute('aria-describedby');
    });
    G12.clear(frame.errors);
    if (!errors.length) return;

    var list = el('ul');
    errors.forEach(function (error) {
      var target = error.field ? document.getElementById(error.field) : null;
      if (target) {
        var errorId = error.field + '-error';
        if (!document.getElementById(errorId)) {
          target.setAttribute('aria-invalid', 'true');
          target.insertAdjacentElement('afterend', el('p', { className: 'field-error', id: errorId, text: error.message }));
          describe(target, errorId);
        }
        list.appendChild(el('li', null, [el('a', {
          href: '#' + error.field,
          text: error.message,
          onclick: function (event) {
            event.preventDefault();
            target.focus();
          }
        })]));
      } else {
        list.appendChild(el('li', { text: error.message }));
      }
    });
    var box = el('div', { className: 'error-summary', role: 'alert', tabindex: '-1' }, [
      el('h3', { text: errors.length === 1 ? t('Please fix this problem before saving:') : t('Please fix these {n} problems before saving:', { n: errors.length }) }),
      list
    ]);
    frame.errors.appendChild(box);
    box.focus();
  }

  /* Problems found by the shared schema rules, as form errors.
     fieldFor(detail) may return the id of the form field to point at. */
  function schemaErrors(key, item, fieldFor) {
    return Schema.validateItem(key, item, 0).details.filter(function (detail) {
      return detail.level === 'error';
    }).map(function (detail) {
      var text = detail.message;
      if (detail.meta && detail.meta.section !== undefined) {
        text = t('Section {n}: {message}', { n: detail.meta.section + 1, message: text });
      }
      text = text.charAt(0).toUpperCase() + text.slice(1);
      return { field: fieldFor ? fieldFor(detail) : null, message: text };
    });
  }

  function idErrors(id, otherIds, field) {
    if (!Schema.ID_PATTERN.test(id)) {
      return [{ field: field, message: t('The ID can only use lowercase English letters (a–z), numbers and single hyphens, for example: passive-voice.') }];
    }
    if (otherIds.indexOf(id) !== -1) {
      return [{ field: field, message: t('Another item already uses the ID “{id}”. Choose a different ID.', { id: id }) }];
    }
    return [];
  }

  function reviewStatusOf(checkbox) {
    return checkbox.checked ? 'reviewed' : 'unreviewed';
  }

  /* title: the full heading, e.g. t('Lesson not found'). */
  function notFound(title, backHref, backLabel) {
    ui.view.appendChild(el('h2', { tabindex: '-1', text: title }));
    ui.view.appendChild(el('p', { text: t('It may have been deleted, or the link is wrong.') }));
    ui.view.appendChild(el('a', { className: 'btn', href: backHref, text: backLabel }));
  }

  function unitTitle(id) {
    var unit = G12.byId(library.units, id);
    return unit ? (unit.title || unit.id) : (hasText(id) ? t('{id} (not found)', { id: id }) : t('none'));
  }

  function topicTitle(id) {
    var lesson = G12.byId(library.lessons, id);
    return lesson ? (lesson.title || lesson.id) : (hasText(id) ? t('{id} (not found)', { id: id }) : t('none'));
  }

  function unitSelectOptions(currentValue, noneLabel) {
    var options = [{ value: '', label: noneLabel }].concat(library.units.map(function (unit) {
      return { value: unit.id, label: unit.title || unit.id };
    }));
    if (hasText(currentValue) && !G12.byId(library.units, currentValue)) {
      options.push({ value: currentValue, label: t('{id} (unit not found)', { id: currentValue }) });
    }
    return options;
  }

  /* Topics (lessons) grouped by unit, for a <select> with <optgroup>s. */
  function topicSelectOptions(currentValue, noneLabel) {
    var options = [{ value: '', label: noneLabel }];
    Schema.groupByUnit(library.lessons, library.units, library.lessons).forEach(function (group) {
      if (!group.items.length) return;
      var list = group.items.map(function (lesson) {
        return { value: lesson.id, label: lesson.title || lesson.id };
      });
      if (library.units.length) options.push({ group: group.unit ? (group.unit.title || group.unit.id) : t('No unit'), options: list });
      else options = options.concat(list);
    });
    if (hasText(currentValue) && !G12.byId(library.lessons, currentValue)) {
      options.push({ value: currentValue, label: t('{id} (topic not found)', { id: currentValue }) });
    }
    return options;
  }

  /**
   * Unit and (optionally) topic fields for an editor.
   * Choosing a topic selects its unit. On save, read(errors) returns
   * { unitId, topicId }; unitId is left out when it comes from the topic.
   */
  function unitTopicFields(item, withTopic, defaults) {
    item = item || {};
    defaults = defaults || {};
    var startTopic = item.id ? item.topicId : defaults.topicId;
    var startUnit = item.id ? (Schema.unitIdOf(item, library.lessons) || item.unitId) : defaults.unitId;
    var unit = selectField({
      id: 'f-unit', label: t('Unit'), optional: true, value: startUnit,
      options: unitSelectOptions(startUnit, t('— No unit —')),
      hint: library.units.length ? null : t('There are no units yet. Add units in the Units tab, or leave this empty.')
    });
    var topic = withTopic ? selectField({
      id: 'f-topic', label: t('Topic (lesson)'), optional: true, value: startTopic,
      options: topicSelectOptions(startTopic, t('— No topic —')),
      hint: library.lessons.length ? t('Choosing a topic also chooses its unit.') : t('There are no lessons yet. You can link a topic later.')
    }) : null;
    if (topic) {
      topic.control.addEventListener('change', function () {
        var lesson = G12.byId(library.lessons, topic.control.value);
        if (lesson && hasText(lesson.unitId)) unit.control.value = lesson.unitId;
      });
    }
    return {
      rows: topic ? [unit.row, topic.row] : [unit.row],
      read: function (errors) {
        var result = {};
        var topicId = topic ? topic.control.value : '';
        var unitId = unit.control.value;
        var lesson = topicId ? G12.byId(library.lessons, topicId) : null;
        if (topicId) result.topicId = topicId;
        if (lesson && hasText(lesson.unitId)) {
          if (unitId && unitId !== lesson.unitId) {
            errors.push({ field: 'f-unit', message: t('The topic “{topic}” is in the unit “{unit}”. Choose that unit, or another topic.', { topic: lesson.title || lesson.id, unit: unitTitle(lesson.unitId) }) });
          }
        } else if (unitId) {
          result.unitId = unitId;
        }
        return result;
      }
    };
  }

  /* ---------- Lists ---------- */

  /* How many items of each kind belong to a unit (directly or through their topic). */
  function unitContents(unitId) {
    var counts = {};
    ['lessons', 'summaries', 'questions', 'passages'].forEach(function (key) {
      counts[key] = library[key].filter(function (item) { return Schema.unitIdOf(item, library.lessons) === unitId; }).length;
    });
    return counts;
  }

  function rowDetails(key, item) {
    var details = [];
    var count;
    var unitLine = library.units.length ? t('Unit: {unit}', { unit: unitTitle(Schema.unitIdOf(item, library.lessons) || item.unitId) }) : null;
    switch (key) {
      case 'units':
        details.push(t('ID: {id}', { id: item.id }));
        var inUnit = unitContents(item.id);
        details.push(G12.plural(inUnit.lessons, 'lesson'), G12.plural(inUnit.summaries, 'summary', 'summaries'),
          G12.plural(inUnit.questions, 'question'), G12.plural(inUnit.passages, 'passage'));
        return { title: item.title || item.id, meta: details.join(' · ') };
      case 'lessons':
        count = Array.isArray(item.sections) ? item.sections.length : 0;
        details.push(t('ID: {id}', { id: item.id }));
        if (unitLine) details.push(unitLine);
        details.push(G12.plural(count, 'section'));
        var links = Store.countLessonLinks(library, item.id);
        if (links.questions) details.push(G12.plural(links.questions, 'question'));
        return { title: item.title || item.id, meta: details.join(' · ') };
      case 'summaries':
        if (unitLine) details.push(unitLine);
        details.push(t('Topic: {topic}', { topic: topicTitle(item.topicId) }));
        details.push(G12.plural(Array.isArray(item.points) ? item.points.length : 0, 'point'));
        return { title: item.title || item.id, meta: details.join(' · ') };
      case 'questions':
        details.push(item.type === 'short' ? t('Short answer') : t('Multiple choice'));
        if (unitLine) details.push(unitLine);
        details.push(t('Topic: {topic}', { topic: topicTitle(item.topicId) }));
        if (item.type === 'mcq' && hasText(item.answer)) details.push(t('Answer: {answer}', { answer: item.answer }));
        details.push(t('ID: {id}', { id: item.id }));
        return { title: item.prompt || item.id, meta: details.join(' · ') };
      case 'passages':
        if (unitLine) details.push(unitLine);
        var paragraphs = Array.isArray(item.paragraphs) ? item.paragraphs : [];
        details.push(G12.plural(paragraphs.length, 'paragraph'), G12.plural(G12.wordCount(paragraphs), 'word'));
        details.push(G12.plural(Array.isArray(item.questions) ? item.questions.length : 0, 'question'));
        return { title: item.title || item.id, meta: details.join(' · ') };
    }
    return { title: item.id, meta: '' };
  }

  /**
   * A list of items with Edit / Move / Delete buttons.
   * opts: { items, all, kindLabel, describe(item), editHref(item), onMove(item, delta), onDelete(item) }
   */
  function itemRows(opts) {
    var list = el('ol', { className: 'manager-list' });
    opts.items.forEach(function (item) {
      var info = opts.describe(item);
      var position = opts.all.indexOf(item);
      var names = { kind: t(opts.kindLabel), name: String(info.title).slice(0, 60) };
      var actions = [el('a', {
        className: 'btn btn--small btn--secondary',
        href: opts.editHref(item),
        text: t('Edit'),
        'aria-label': t('Edit {kind} “{name}”', names)
      })];
      if (opts.onMove) {
        actions.push(smallButton(t('Move up'), t('Move {kind} “{name}” up', names), function () { opts.onMove(item, -1); },
          { disabled: position === 0, action: 'up', id: item.id }));
        actions.push(smallButton(t('Move down'), t('Move {kind} “{name}” down', names), function () { opts.onMove(item, 1); },
          { disabled: position === opts.all.length - 1, action: 'down', id: item.id }));
      }
      actions.push(smallButton(t('Delete'), t('Delete {kind} “{name}”', names), function () { opts.onDelete(item); },
        { danger: true, action: 'delete', id: item.id }));

      list.appendChild(el('li', { className: 'manager-row' }, [
        el('div', { className: 'manager-row-main' }, [
          el('p', { className: 'manager-row-title', dir: 'auto', text: info.title }),
          el('p', { className: 'manager-row-meta', dir: 'auto', text: info.meta }),
          G12.badges(item)
        ]),
        el('div', { className: 'row-actions' }, actions)
      ]));
    });
    return list;
  }

  /* After moving, keep keyboard focus on the moved item's button. */
  function focusMoved(id, delta) {
    afterRender = function () {
      var preferred = ui.view.querySelector('[data-id="' + cssEscape(id) + '"][data-action="' + (delta < 0 ? 'up' : 'down') + '"]');
      var other = ui.view.querySelector('[data-id="' + cssEscape(id) + '"][data-action="' + (delta < 0 ? 'down' : 'up') + '"]');
      var target = preferred && !preferred.disabled ? preferred : other;
      if (target) target.focus();
    };
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
  }

  function renderList(key) {
    var type = TYPES[key];
    var items = library[key];
    ui.view.appendChild(el('div', { className: 'view-header' }, [
      el('h2', { tabindex: '-1', text: type.title }),
      el('a', { className: 'btn', href: '#' + key + '/new', text: type.add })
    ]));
    ui.view.appendChild(el('p', { className: 'hint', text: type.help }));

    if (items.length === 0) {
      ui.view.appendChild(G12.emptyState(
        type.none,
        type.empty,
        [{ label: type.add, href: '#' + key + '/new' }, { label: t('Import a file'), href: '#tools' }],
        'h3'
      ));
      return;
    }

    var holder = el('div');
    var filterState = { unit: '__all__', topic: '__all__', text: '' };

    function draw() {
      var shown = items;
      if (key === 'questions') {
        shown = items.filter(function (question) {
          var unitId = Schema.unitIdOf(question, library.lessons);
          var unitOk = filterState.unit === '__all__' || (filterState.unit === '' ? !unitId : unitId === filterState.unit);
          var topicOk = filterState.topic === '__all__' ||
            (filterState.topic === '' ? !hasText(question.topicId) : question.topicId === filterState.topic);
          var textOk = !filterState.text || String(question.prompt || '').toLowerCase().indexOf(filterState.text) !== -1;
          return unitOk && topicOk && textOk;
        });
      }
      var filtering = shown.length !== items.length || filterState.text || filterState.topic !== '__all__' || filterState.unit !== '__all__';
      G12.clear(holder);
      if (filtering) {
        holder.appendChild(el('p', { className: 'hint', role: 'status', text: t('Showing {shown} of {total} questions. Clear the filters to reorder questions.', { shown: shown.length, total: items.length }) }));
      }
      if (shown.length === 0) return;
      holder.appendChild(itemRows({
        items: shown,
        all: items,
        kindLabel: type.singular,
        describe: function (item) { return rowDetails(key, item); },
        editHref: function (item) { return '#' + key + '/edit/' + encodeURIComponent(item.id); },
        onMove: filtering ? null : function (item, delta) {
          commit(Store.moveItem(library, key, item.id, delta), null);
          focusMoved(item.id, delta);
          route();
        },
        onDelete: function (item) { deleteFromList(key, item); }
      }));
    }

    if (key === 'questions') {
      var filters = [];
      if (library.units.length) {
        var unitFilter = el('select', { id: 'filter-unit' }, [
          el('option', { value: '__all__', text: t('All units') }),
          el('option', { value: '', text: t('No unit') })
        ].concat(library.units.map(function (unit) {
          return el('option', { value: unit.id, text: unit.title || unit.id });
        })));
        unitFilter.addEventListener('change', function () { filterState.unit = unitFilter.value; draw(); });
        filters.push(el('div', { className: 'form-row' }, [el('label', { for: 'filter-unit', text: t('Show unit') }), unitFilter]));
      }
      var topicFilter = el('select', { id: 'filter-topic' }, [
        el('option', { value: '__all__', text: t('All topics') }),
        el('option', { value: '', text: t('No topic') })
      ].concat(library.lessons.map(function (lesson) {
        return el('option', { value: lesson.id, text: lesson.title || lesson.id });
      })));
      var search = el('input', { type: 'search', id: 'filter-text', autocomplete: 'off', dir: 'auto' });
      topicFilter.addEventListener('change', function () { filterState.topic = topicFilter.value; draw(); });
      search.addEventListener('input', function () { filterState.text = search.value.trim().toLowerCase(); draw(); });
      filters.push(el('div', { className: 'form-row' }, [el('label', { for: 'filter-topic', text: t('Show topic') }), topicFilter]));
      filters.push(el('div', { className: 'form-row' }, [el('label', { for: 'filter-text', text: t('Search question text') }), search]));
      ui.view.appendChild(el('div', { className: 'filters', role: 'search', 'aria-label': t('Filter questions') }, filters));
    }

    ui.view.appendChild(holder);
    draw();
  }

  function deleteFromList(key, item) {
    var info = rowDetails(key, item);
    var names = { kind: t(TYPES[key].singular), name: String(info.title).slice(0, 80) };
    var message = t('Delete the {kind} “{name}”?', names);
    if (key === 'units') {
      var inUnit = unitContents(item.id);
      var total = inUnit.lessons + inUnit.summaries + inUnit.questions + inUnit.passages;
      if (total) {
        message += '\n\n' + t('{lessons}, {summaries}, {questions} and {passages} are in this unit. They will be kept, but will no longer belong to a unit.', {
          lessons: G12.plural(inUnit.lessons, 'lesson'),
          summaries: G12.plural(inUnit.summaries, 'summary', 'summaries'),
          questions: G12.plural(inUnit.questions, 'question'),
          passages: G12.plural(inUnit.passages, 'passage')
        });
      }
    }
    if (key === 'lessons') {
      var links = Store.countLessonLinks(library, item.id);
      if (links.questions || links.summaries) {
        message += '\n\n' + t('{summaries} and {questions} are linked to this topic. They will be kept, but no longer linked to it.', {
          summaries: G12.plural(links.summaries, 'summary', 'summaries'),
          questions: G12.plural(links.questions, 'question')
        });
      }
    }
    if (key === 'passages' && Array.isArray(item.questions) && item.questions.length) {
      message += '\n\n' + t('Its {questions} will be deleted too.', { questions: G12.plural(item.questions.length, 'question') });
    }
    if (!window.confirm(message + '\n\n' + t('This cannot be undone.'))) return;
    commit(Store.deleteItem(library, key, item.id), t('Deleted the {kind} “{name}”.', names));
    route();
  }

  /* ---------- Editors ---------- */

  function renderEditor(key, id) {
    var item = id ? G12.byId(library[key], id) : null;
    if (id && !item) {
      var missing = {
        units: [t('Unit not found'), t('Back to units')],
        lessons: [t('Lesson not found'), t('Back to lessons')],
        summaries: [t('Summary not found'), t('Back to summaries')],
        questions: [t('Question not found'), t('Back to grammar questions')],
        passages: [t('Passage not found'), t('Back to reading passages')]
      }[key];
      notFound(missing[0], '#' + key, missing[1]);
      return;
    }
    if (key === 'units') unitEditor(item);
    else if (key === 'lessons') lessonEditor(item);
    else if (key === 'summaries') summaryEditor(item);
    else if (key === 'questions') grammarQuestionEditor(item);
    else passageEditor(item);
  }

  /* Title + ID pair. The ID follows the title until the ID is edited by hand. */
  function titleAndId(item, otherIds, idHint, fallbackBase) {
    var title = textField({ id: 'f-title', label: t('Title'), required: true, value: item && item.title });
    var idField = textField({ id: 'f-id', label: t('ID'), value: item && item.id, dir: 'ltr', hint: idHint });
    var idTouched = Boolean(item);
    title.control.addEventListener('input', function () {
      if (idTouched) return;
      var slug = Schema.slugify(title.control.value);
      idField.control.value = slug ? Schema.uniqueId(slug, otherIds) : '';
    });
    idField.control.addEventListener('input', function () { idTouched = true; });

    function read(errors) {
      var titleText = title.control.value.trim();
      if (!titleText) errors.push({ field: 'f-title', message: t('Enter a title.') });
      var id = idField.control.value.trim();
      if (!id) {
        id = Schema.uniqueId(Schema.slugify(titleText) || fallbackBase, otherIds);
        idField.control.value = id;
      }
      errors.push.apply(errors, idErrors(id, otherIds, 'f-id'));
      return { title: titleText, id: id };
    }
    return { rows: [title.row, idField.row], read: read };
  }

  /* ----- Lesson ----- */

  function lessonEditor(lesson) {
    var isNew = !lesson;
    var otherIds = library.lessons.map(function (l) { return l.id; }).filter(function (id) { return !lesson || id !== lesson.id; });
    var frame = editorFrame(isNew ? t('Add a lesson') : t('Edit lesson: {title}', { title: lesson.title || lesson.id }), '#lessons', t('Back to lessons'));
    var names = titleAndId(lesson, otherIds,
      t('This is the topic ID. It is used in the lesson’s web address (grammar.html?topic=your-id) and to link summaries and questions to this topic. Lowercase English letters, numbers and hyphens. Filled in from the title automatically.'),
      'lesson');
    var links = unitTopicFields(lesson, false);
    var description = textField({ id: 'f-description', label: t('Short description'), optional: true, multiline: true, rows: 2, value: lesson && lesson.description, hint: t('Shown under the title in the list of lessons.') });
    var reviewed = checkboxField({
      id: 'f-reviewed',
      label: t('A teacher has reviewed this lesson'),
      checked: lesson && lesson.reviewStatus === 'reviewed',
      hint: t('Leave unticked until the lesson has been checked. Students see a “Not yet reviewed” label until then.')
    });

    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Lesson details') })].concat(names.rows, links.rows, [description.row, reviewed.row])));

    var drafts = (lesson && Array.isArray(lesson.sections) ? lesson.sections : []).map(sectionDraft);
    frame.form.appendChild(sectionsEditor(drafts));

    frame.form.appendChild(formActions([el('button', { type: 'submit', className: 'btn', text: isNew ? t('Save lesson') : t('Save changes') })], '#lessons'));

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var base = names.read(errors);
      var item = Object.assign({ id: base.id }, links.read(errors), { title: base.title });
      if (hasText(description.control.value)) item.description = description.control.value.trim();
      item.reviewStatus = reviewStatusOf(reviewed.control);
      item.sections = drafts.map(sectionFromDraft);
      if (!errors.length) {
        errors = schemaErrors('lessons', item, function (detail) {
          return detail.meta && detail.meta.section !== undefined ? 'sec-' + detail.meta.section + '-type' : null;
        });
      }
      if (errors.length) {
        showErrors(frame, errors);
        return;
      }
      var renamed = !isNew && lesson.id !== item.id;
      var linked = renamed ? Store.countLessonLinks(library, lesson.id) : null;
      commit(Store.saveItem(library, 'lessons', item, isNew ? null : lesson.id),
        t('Lesson “{title}” saved.', { title: item.title }) + (linked && (linked.questions || linked.summaries) ? ' ' + t('Its linked summaries and questions now use the new topic ID.') : ''));
      go('lessons');
    });
  }

  /* ----- Unit ----- */

  function unitEditor(unit) {
    var isNew = !unit;
    var otherIds = library.units.map(function (u) { return u.id; }).filter(function (id) { return !unit || id !== unit.id; });
    var frame = editorFrame(isNew ? t('Add a unit') : t('Edit unit: {title}', { title: unit.title || unit.id }), '#units', t('Back to units'));
    var names = titleAndId(unit, otherIds,
      t('This is the unit ID. It is used in web addresses (for example grammar.html?unit=your-id) and to link content to this unit. Lowercase English letters, numbers and hyphens. Filled in from the title automatically.'),
      'unit');
    var description = textField({ id: 'f-description', label: t('Short description'), optional: true, multiline: true, rows: 2, value: unit && unit.description, hint: t('Shown under the unit title on the student pages.') });
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Unit details') })].concat(names.rows, [description.row])));
    frame.form.appendChild(formActions([el('button', { type: 'submit', className: 'btn', text: isNew ? t('Save unit') : t('Save changes') })], '#units'));

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var base = names.read(errors);
      var item = { id: base.id, title: base.title };
      if (hasText(description.control.value)) item.description = description.control.value.trim();
      if (!errors.length) errors = schemaErrors('units', item);
      if (errors.length) {
        showErrors(frame, errors);
        return;
      }
      var renamed = !isNew && unit.id !== item.id;
      commit(Store.saveItem(library, 'units', item, isNew ? null : unit.id),
        t('Unit “{title}” saved.', { title: item.title }) + (renamed ? ' ' + t('Content in this unit now uses the new unit ID.') : ''));
      go('units');
    });
  }

  function sectionDraft(section) {
    section = section || {};
    var list = function (value) { return Array.isArray(value) ? value : []; };
    var type = Schema.SECTION_TYPES.indexOf(section.type) !== -1 ? section.type : 'text';
    return {
      type: type,
      heading: typeof section.heading === 'string' ? section.heading : '',
      text: list(section.paragraphs).join('\n\n'),
      lang: section.lang === 'ar' ? 'ar' : 'en',
      items: type === 'list' || type === 'examples' ? list(section.items).join('\n') : '',
      columns: list(section.columns).join('\n'),
      rows: list(section.rows).map(function (row) { return list(row).join(' | '); }).join('\n'),
      mistakes: type === 'mistakes' ? list(section.items).map(function (m) {
        m = m || {};
        return { avoid: m.avoid || '', use: m.use || '', note: m.note || '' };
      }) : []
    };
  }

  function sectionFromDraft(draft) {
    var section = { type: draft.type };
    if (hasText(draft.heading)) section.heading = draft.heading.trim();
    switch (draft.type) {
      case 'text':
      case 'note':
        section.paragraphs = Schema.splitParagraphs(draft.text);
        if (draft.lang === 'ar') section.lang = 'ar';
        break;
      case 'list':
      case 'examples':
        section.items = Schema.splitLines(draft.items);
        break;
      case 'table':
        section.columns = Schema.splitLines(draft.columns);
        section.rows = Schema.splitLines(draft.rows).map(function (line) {
          return line.split('|').map(function (cell) { return cell.trim(); });
        });
        break;
      case 'mistakes':
        section.items = draft.mistakes.filter(function (m) {
          return hasText(m.avoid) || hasText(m.use) || hasText(m.note);
        }).map(function (m) {
          var item = { avoid: m.avoid.trim(), use: m.use.trim() };
          if (hasText(m.note)) item.note = m.note.trim();
          return item;
        });
        break;
    }
    return section;
  }

  function sectionLabel(type) {
    for (var i = 0; i < SECTION_TYPE_OPTIONS.length; i++) {
      if (SECTION_TYPE_OPTIONS[i].value === type) return SECTION_TYPE_OPTIONS[i].label;
    }
    return type;
  }

  function sectionsEditor(drafts) {
    var list = el('ol', { className: 'section-list' });
    var addButton = el('button', {
      type: 'button',
      className: 'btn btn--secondary',
      text: t('Add section'),
      onclick: function () {
        drafts.push(sectionDraft(null));
        dirty = true;
        draw();
        focusById('sec-' + (drafts.length - 1) + '-type');
      }
    });
    var box = el('fieldset', { className: 'editor-block' }, [
      el('legend', { text: t('Sections') }),
      el('p', { className: 'hint', text: t('A lesson is made of sections shown in this order. Choose a type for each section: text, a note box, a list, examples, a table or common mistakes.') }),
      list,
      addButton
    ]);

    function move(index, delta) {
      var target = index + delta;
      var moved = drafts.splice(index, 1)[0];
      drafts.splice(target, 0, moved);
      dirty = true;
      draw();
      var preferred = document.getElementById('sec-' + target + (delta < 0 ? '-up' : '-down'));
      if (preferred && !preferred.disabled) preferred.focus();
      else focusById('sec-' + target + '-title');
    }

    function remove(index) {
      if (!window.confirm(t('Remove section {n} ({type})? Its content will be deleted when you save.', { n: index + 1, type: sectionLabel(drafts[index].type) }))) return;
      drafts.splice(index, 1);
      dirty = true;
      draw();
      if (drafts.length) focusById('sec-' + Math.min(index, drafts.length - 1) + '-title');
      else addButton.focus();
    }

    function sectionEditor(draft, index) {
      var p = 'sec-' + index;
      var type = selectField({ id: p + '-type', label: t('Section type'), value: draft.type, options: SECTION_TYPE_OPTIONS });
      type.control.addEventListener('change', function () {
        draft.type = type.control.value;
        draw();
        focusById(p + '-type');
      });
      var heading = textField({ id: p + '-heading', label: t('Heading'), optional: true, value: draft.heading });
      bind(heading.control, draft, 'heading');

      var parts = [];
      if (draft.type === 'text' || draft.type === 'note') {
        var text = textField({ id: p + '-text', label: t('Text'), multiline: true, rows: 6, value: draft.text, hint: t('Leave an empty line between paragraphs.') });
        bind(text.control, draft, 'text');
        var lang = selectField({
          id: p + '-lang', label: t('Language'), value: draft.lang,
          options: [{ value: 'en', label: t('English (left to right)') }, { value: 'ar', label: t('Arabic (right to left)') }]
        });
        lang.control.addEventListener('change', function () { draft.lang = lang.control.value; });
        parts.push(text.row, lang.row);
      } else if (draft.type === 'list' || draft.type === 'examples') {
        var items = textField({ id: p + '-items', label: t('Items'), multiline: true, rows: 5, value: draft.items, hint: t('One item per line.') });
        bind(items.control, draft, 'items');
        parts.push(items.row);
      } else if (draft.type === 'table') {
        var columns = textField({ id: p + '-columns', label: t('Column headings'), multiline: true, rows: 3, value: draft.columns, hint: t('One heading per line.') });
        bind(columns.control, draft, 'columns');
        var rows = textField({
          id: p + '-rows', label: t('Rows'), multiline: true, rows: 5, value: draft.rows,
          hint: t('One row per line. Separate the cells with a vertical bar ( | ). Each row needs one cell for each column.')
        });
        bind(rows.control, draft, 'rows');
        parts.push(columns.row, rows.row);
      } else if (draft.type === 'mistakes') {
        parts.push(rowsEditor({
          idPrefix: p + '-m',
          legend: t('Mistakes'),
          hint: t('For each item, write the incorrect version to avoid and the correct version to use.'),
          itemLabel: 'Mistake',
          addLabel: t('Add mistake'),
          rows: draft.mistakes,
          fields: [
            { name: 'avoid', label: t('Avoid (incorrect version)') },
            { name: 'use', label: t('Use (correct version)') },
            { name: 'note', label: t('Note'), optional: true }
          ],
          nested: true
        }));
      }

      var last = index === drafts.length - 1;
      var up = smallButton(t('Move up'), t('Move section {n} up', { n: index + 1 }), function () { move(index, -1); }, { disabled: index === 0 });
      up.id = p + '-up';
      var down = smallButton(t('Move down'), t('Move section {n} down', { n: index + 1 }), function () { move(index, 1); }, { disabled: last });
      down.id = p + '-down';
      var del = smallButton(t('Remove section'), t('Remove section {n}', { n: index + 1 }), function () { remove(index); }, { danger: true });

      return el('li', { className: 'section-editor', id: p, 'aria-labelledby': p + '-title' }, [
        el('h3', { id: p + '-title', tabindex: '-1', text: t('Section {n}: {type}', { n: index + 1, type: sectionLabel(draft.type) }) }),
        type.row,
        heading.row
      ].concat(parts, [el('div', { className: 'row-actions' }, [up, down, del])]));
    }

    function draw() {
      G12.clear(list);
      if (drafts.length === 0) {
        list.appendChild(el('li', { className: 'hint', text: t('No sections yet. Use “Add section” to start writing the lesson.') }));
      }
      drafts.forEach(function (draft, index) { list.appendChild(sectionEditor(draft, index)); });
    }

    draw();
    return box;
  }

  /**
   * Repeating group of small text fields (used for mistakes and summary points).
   * opts: { idPrefix, legend, hint, itemLabel, addLabel, rows, fields: [{ name, label, optional }], nested }
   * Edits opts.rows in place.
   */
  function rowsEditor(opts) {
    var rows = opts.rows;
    var blank = function () {
      var row = {};
      opts.fields.forEach(function (field) { row[field.name] = ''; });
      return row;
    };
    if (rows.length === 0) rows.push(blank());

    var list = el('ol', { className: 'rows-list' });
    var add = el('button', {
      type: 'button',
      className: 'btn btn--secondary btn--small',
      text: opts.addLabel,
      onclick: function () {
        rows.push(blank());
        dirty = true;
        draw();
        focusById(opts.idPrefix + '-' + (rows.length - 1) + '-' + opts.fields[0].name);
      }
    });
    var box = el('fieldset', { className: opts.nested ? 'form-row' : 'editor-block' }, [
      el('legend', { text: opts.legend }),
      opts.hint ? el('p', { className: 'hint', text: opts.hint }) : null,
      list,
      add
    ]);

    function draw() {
      G12.clear(list);
      rows.forEach(function (row, index) {
        var p = opts.idPrefix + '-' + index;
        var label = t('{item} {n}', { item: t(opts.itemLabel), n: index + 1 });
        var spoken = G12.lang === 'en' ? label.toLowerCase() : label;
        var children = [el('p', { className: 'row-editor-title', id: p + '-label', text: label })];
        opts.fields.forEach(function (field) {
          var input = textField({ id: p + '-' + field.name, label: field.label, optional: field.optional, value: row[field.name] });
          bind(input.control, row, field.name);
          children.push(input.row);
        });
        children.push(el('div', { className: 'row-actions' }, [
          smallButton(t('Move up'), t('Move {item} up', { item: spoken }), function () { shift(index, -1); }, { disabled: index === 0 }),
          smallButton(t('Move down'), t('Move {item} down', { item: spoken }), function () { shift(index, 1); }, { disabled: index === rows.length - 1 }),
          smallButton(t('Remove'), t('Remove {item}', { item: spoken }), function () { removeRow(index); }, { danger: true })
        ]));
        list.appendChild(el('li', { className: 'row-editor', 'aria-labelledby': p + '-label' }, children));
      });
    }

    function shift(index, delta) {
      var moved = rows.splice(index, 1)[0];
      rows.splice(index + delta, 0, moved);
      dirty = true;
      draw();
      focusById(opts.idPrefix + '-' + (index + delta) + '-' + opts.fields[0].name);
    }

    function removeRow(index) {
      rows.splice(index, 1);
      dirty = true;
      draw();
      if (rows.length) focusById(opts.idPrefix + '-' + Math.min(index, rows.length - 1) + '-' + opts.fields[0].name);
      else add.focus();
    }

    draw();
    return box;
  }

  /* ----- Summary ----- */

  function summaryEditor(summary) {
    var isNew = !summary;
    var otherIds = library.summaries.map(function (s) { return s.id; }).filter(function (id) { return !summary || id !== summary.id; });
    var frame = editorFrame(isNew ? t('Add a summary') : t('Edit summary: {title}', { title: summary.title || summary.id }), '#summaries', t('Back to summaries'));
    var names = titleAndId(summary, otherIds,
      t('Used to link to this summary (summaries.html#your-id). Lowercase English letters, numbers and hyphens. Filled in from the title automatically.'),
      'summary');
    var links = unitTopicFields(summary, true);
    var reviewed = checkboxField({
      id: 'f-reviewed', label: t('A teacher has reviewed this summary'),
      checked: summary && summary.reviewStatus === 'reviewed',
      hint: t('Leave unticked until the summary has been checked.')
    });
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Summary details') })].concat(names.rows, links.rows, [reviewed.row])));

    var points = (summary && Array.isArray(summary.points) ? summary.points : []).map(function (point) {
      point = point || {};
      return { title: point.title || '', rule: point.rule || '', example: point.example || '' };
    });
    frame.form.appendChild(rowsEditor({
      idPrefix: 'pt',
      legend: t('Points'),
      hint: t('Each point is one row of the summary table. Only the rule is required.'),
      itemLabel: 'Point',
      addLabel: t('Add point'),
      rows: points,
      fields: [
        { name: 'title', label: t('Name'), optional: true },
        { name: 'rule', label: t('Rule') },
        { name: 'example', label: t('Example'), optional: true }
      ]
    }));

    var remember = textField({
      id: 'f-remember', label: t('Remember'), optional: true, multiline: true, rows: 4,
      value: summary && Array.isArray(summary.remember) ? summary.remember.join('\n') : '',
      hint: t('Short reminders shown as a list under the table. One reminder per line.')
    });
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Reminders') }), remember.row]));
    frame.form.appendChild(formActions([el('button', { type: 'submit', className: 'btn', text: isNew ? t('Save summary') : t('Save changes') })], '#summaries'));

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var base = names.read(errors);
      var item = Object.assign({ id: base.id }, links.read(errors), { title: base.title });
      item.reviewStatus = reviewStatusOf(reviewed.control);
      item.points = [];
      points.forEach(function (point, index) {
        if (!hasText(point.title) && !hasText(point.rule) && !hasText(point.example)) return;
        if (!hasText(point.rule)) {
          errors.push({ field: 'pt-' + index + '-rule', message: t('Point {n} needs a rule.', { n: index + 1 }) });
          return;
        }
        var clean = {};
        if (hasText(point.title)) clean.title = point.title.trim();
        clean.rule = point.rule.trim();
        if (hasText(point.example)) clean.example = point.example.trim();
        item.points.push(clean);
      });
      var reminders = Schema.splitLines(remember.control.value);
      if (reminders.length) item.remember = reminders;
      if (!errors.length) errors = schemaErrors('summaries', item);
      if (errors.length) {
        showErrors(frame, errors);
        return;
      }
      commit(Store.saveItem(library, 'summaries', item, isNew ? null : summary.id), t('Summary “{title}” saved.', { title: item.title }));
      go('summaries');
    });
  }

  /* ----- Questions (grammar practice and reading passages) ----- */

  function grammarQuestionEditor(question) {
    questionEditor({
      question: question,
      mode: 'grammar',
      siblingIds: library.questions.map(function (q) { return q.id; }),
      heading: question ? t('Edit question') : t('Add a question'),
      backHref: '#questions',
      backLabel: t('Back to grammar questions'),
      newHref: 'questions/new',
      doneHref: 'questions',
      save: function (item, originalId) {
        commit(Store.saveItem(library, 'questions', item, originalId), t('Question {id} saved.', { id: item.id }));
      }
    });
  }

  function renderPassageQuestionEditor(passageId, questionId) {
    var passage = G12.byId(library.passages, passageId);
    if (!passage) {
      notFound(t('Passage not found'), '#passages', t('Back to reading passages'));
      return;
    }
    var questions = Array.isArray(passage.questions) ? passage.questions : [];
    var question = questionId ? G12.byId(questions, questionId) : null;
    var passageHref = 'passages/edit/' + encodeURIComponent(passage.id);
    if (questionId && !question) {
      notFound(t('Question not found'), '#' + passageHref, t('Back to the passage'));
      return;
    }
    questionEditor({
      question: question,
      mode: 'passage',
      siblingIds: questions.map(function (q) { return q.id; }),
      heading: question ? t('Edit question for “{title}”', { title: passage.title || passage.id }) : t('Add a question to “{title}”', { title: passage.title || passage.id }),
      backHref: '#' + passageHref,
      backLabel: t('Back to the passage'),
      newHref: passageHref + '/questions/new',
      doneHref: passageHref,
      save: function (item, originalId) {
        var copy = Schema.clone(passage);
        copy.questions = Array.isArray(copy.questions) ? copy.questions : [];
        var position = -1;
        copy.questions.forEach(function (q, i) { if (originalId && q.id === originalId) position = i; });
        if (position === -1) copy.questions.push(item);
        else copy.questions[position] = item;
        commit(Store.saveItem(library, 'passages', copy, passage.id), t('Question {id} saved.', { id: item.id }));
      }
    });
  }

  function questionEditor(ctx) {
    var q = ctx.question || {};
    var isNew = !ctx.question;
    var otherIds = ctx.siblingIds.filter(function (id) { return id !== q.id; });
    var state = {
      type: q.type === 'short' ? 'short' : 'mcq',
      options: Array.isArray(q.options) && q.options.length ? q.options.map(String) : ['', '', '', ''],
      answerIndex: -1,
      modelAnswer: typeof q.modelAnswer === 'string' ? q.modelAnswer : ''
    };
    state.answerIndex = state.options.indexOf(q.answer);

    var frame = editorFrame(ctx.heading, ctx.backHref, ctx.backLabel);
    frame.form.appendChild(el('p', { className: 'hint', text: isNew ? t('An ID is created automatically when you save.') : t('Question ID: {id}', { id: q.id }) }));

    var typeName = 'f-type';
    var typeRadios = [
      { value: 'mcq', label: t('Multiple choice') },
      { value: 'short', label: t('Short written answer (not scored)') }
    ].map(function (option) {
      var input = el('input', { type: 'radio', name: typeName, id: 'f-type-' + option.value, value: option.value, checked: state.type === option.value });
      input.addEventListener('change', function () {
        if (input.checked) {
          state.type = option.value;
          drawSpecific();
        }
      });
      return el('label', { for: 'f-type-' + option.value }, [input, option.label]);
    });

    var prompt = textField({
      id: 'f-prompt', label: t('Question'), required: true, multiline: true, rows: 3, value: q.prompt,
      hint: t('Type three underscores ___ where a blank should appear.')
    });

    var details = [
      el('fieldset', { className: 'form-row' }, [el('legend', { text: t('Question type') }), el('div', { className: 'inline-choices' }, typeRadios)]),
      prompt.row
    ];

    var links = null;
    if (ctx.mode === 'grammar') {
      links = unitTopicFields(ctx.question, true, isNew ? lastQuestionLinks : null);
      details = details.concat(links.rows);
    }
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Question') })].concat(details)));

    var specific = el('fieldset', { className: 'editor-block' });
    frame.form.appendChild(specific);

    var explanation = textField({
      id: 'f-explanation', label: t('Explanation'), optional: true, multiline: true, rows: 3, value: q.explanation,
      hint: t('Shown to students after they answer.')
    });
    var difficulty = selectField({
      id: 'f-difficulty', label: t('Difficulty'), optional: true, value: q.difficulty,
      options: [{ value: '', label: t('— Not set —') }, { value: 'easy', label: t('Easy') }, { value: 'medium', label: t('Medium') }, { value: 'hard', label: t('Hard') }]
    });
    var reviewed = checkboxField({
      id: 'f-reviewed', label: t('A teacher has reviewed this question and its answer'),
      checked: q.reviewStatus === 'reviewed',
      hint: t('Until this is ticked, students see the answer as a “suggested answer”, never as definitely correct, and scores are marked provisional.')
    });
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Feedback and review') }), explanation.row, difficulty.row, reviewed.row]));

    var addAnother = false;
    var saveButton = el('button', { type: 'submit', className: 'btn', text: isNew ? t('Save question') : t('Save changes'), onclick: function () { addAnother = false; } });
    var saveNewButton = el('button', { type: 'submit', className: 'btn btn--secondary', text: t('Save and add another'), onclick: function () { addAnother = true; } });
    frame.form.appendChild(formActions([saveButton, saveNewButton], ctx.backHref));

    function drawSpecific() {
      G12.clear(specific);
      if (state.type === 'short') {
        specific.appendChild(el('legend', { text: t('Answer') }));
        var model = textField({
          id: 'f-model-answer', label: t('Model answer'), required: true, multiline: true, rows: 4, value: state.modelAnswer,
          hint: t('Students compare their own answer with this after submitting. Written answers are not scored automatically.')
        });
        bind(model.control, state, 'modelAnswer');
        specific.appendChild(model.row);
        return;
      }
      specific.appendChild(el('legend', { text: t('Answer options') }));
      specific.appendChild(el('p', { className: 'hint', text: t('Write {min} to {max} options and mark the correct one. Empty options are ignored.', { min: Schema.MIN_OPTIONS, max: Schema.MAX_OPTIONS }) }));
      var list = el('ol', { className: 'option-editor-list' });
      state.options.forEach(function (option, index) {
        var letter = LETTERS.charAt(index);
        var input = el('input', { type: 'text', id: 'f-option-' + index, dir: 'auto', autocomplete: 'off' });
        input.value = option;
        input.addEventListener('input', function () { state.options[index] = input.value; });
        var radio = el('input', { type: 'radio', name: 'f-correct', id: 'f-correct-' + index, checked: state.answerIndex === index });
        radio.addEventListener('change', function () { if (radio.checked) state.answerIndex = index; });
        list.appendChild(el('li', { className: 'option-editor' }, [
          el('label', { className: 'opt-label', for: 'f-option-' + index, text: t('Option {letter}', { letter: letter }) }),
          input,
          el('label', { className: 'correct-choice', for: 'f-correct-' + index }, [
            radio, t('Correct answer'), el('span', { className: 'visually-hidden', text: ' ' + t('(option {letter})', { letter: letter }) })
          ]),
          smallButton(t('Remove'), t('Remove option {letter}', { letter: letter }), function () { removeOption(index); }, { danger: true, disabled: state.options.length <= Schema.MIN_OPTIONS })
        ]));
      });
      specific.appendChild(list);
      var add = el('button', {
        type: 'button', className: 'btn btn--secondary btn--small', text: t('Add option'),
        disabled: state.options.length >= Schema.MAX_OPTIONS,
        onclick: function () {
          state.options.push('');
          dirty = true;
          drawSpecific();
          focusById('f-option-' + (state.options.length - 1));
        }
      });
      specific.appendChild(add);
    }

    function removeOption(index) {
      state.options.splice(index, 1);
      if (state.answerIndex === index) state.answerIndex = -1;
      else if (state.answerIndex > index) state.answerIndex -= 1;
      dirty = true;
      drawSpecific();
      focusById('f-option-' + Math.min(index, state.options.length - 1));
    }

    drawSpecific();

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var promptText = prompt.control.value.trim();
      if (!promptText) errors.push({ field: 'f-prompt', message: t('Write the question.') });

      var item = Object.assign({ id: isNew ? Schema.nextNumberedId('q', otherIds) : q.id, type: state.type },
        links ? links.read(errors) : {});
      item.prompt = promptText;

      if (state.type === 'mcq') {
        var filled = [];
        state.options.forEach(function (text, index) {
          if (hasText(text)) filled.push({ text: text.trim(), index: index });
        });
        if (filled.length < Schema.MIN_OPTIONS) {
          var firstEmpty = state.options.findIndex(function (text) { return !hasText(text); });
          errors.push({ field: 'f-option-' + Math.max(firstEmpty, 0), message: t('Write at least {min} answer options.', { min: Schema.MIN_OPTIONS }) });
        }
        var seen = {};
        filled.forEach(function (option) {
          if (seen[option.text]) errors.push({ field: 'f-option-' + option.index, message: t('Option {letter} is the same as another option.', { letter: LETTERS.charAt(option.index) }) });
          seen[option.text] = true;
        });
        if (state.answerIndex === -1) {
          errors.push({ field: 'f-correct-0', message: t('Mark which option is the correct answer.') });
        } else if (!hasText(state.options[state.answerIndex])) {
          errors.push({ field: 'f-option-' + state.answerIndex, message: t('The option marked as the correct answer is empty.') });
        }
        item.options = filled.map(function (option) { return option.text; });
        item.answer = state.answerIndex === -1 ? '' : String(state.options[state.answerIndex] || '').trim();
      } else {
        if (!hasText(state.modelAnswer)) errors.push({ field: 'f-model-answer', message: t('Write a model answer.') });
        item.modelAnswer = state.modelAnswer.trim();
      }

      if (hasText(explanation.control.value)) item.explanation = explanation.control.value.trim();
      if (hasText(difficulty.control.value)) item.difficulty = difficulty.control.value;
      item.reviewStatus = reviewStatusOf(reviewed.control);

      if (!errors.length) errors = schemaErrors('questions', item);
      if (errors.length) {
        showErrors(frame, errors);
        return;
      }
      if (ctx.mode === 'grammar') {
        lastQuestionLinks = { unitId: Schema.unitIdOf(item, library.lessons), topicId: item.topicId || '' };
      }
      ctx.save(item, isNew ? null : q.id);
      go(addAnother ? ctx.newHref : ctx.doneHref);
    });
  }

  /* ----- Reading passage ----- */

  function passageEditor(passage) {
    var isNew = !passage;
    var otherIds = library.passages.map(function (p) { return p.id; }).filter(function (id) { return !passage || id !== passage.id; });
    var frame = editorFrame(isNew ? t('Add a reading passage') : t('Edit passage: {title}', { title: passage.title || passage.id }), '#passages', t('Back to reading passages'));
    var names = titleAndId(passage, otherIds,
      t('Used in the passage’s web address (reading.html?passage=your-id). Lowercase English letters, numbers and hyphens. Filled in from the title automatically.'),
      'passage');
    var links = unitTopicFields(passage, false);
    var level = textField({ id: 'f-level', label: t('Level'), optional: true, value: passage && passage.level, hint: t('For example: Grade 12.') });
    var source = textField({
      id: 'f-source', label: t('Source or credit'), optional: true, value: passage && passage.source,
      hint: t('Where the text comes from. Only publish texts you wrote yourself or have permission to use.')
    });
    var reviewed = checkboxField({
      id: 'f-reviewed', label: t('A teacher has reviewed this passage'),
      checked: passage && passage.reviewStatus === 'reviewed',
      hint: t('Each question has its own review tick as well.')
    });
    var text = textField({
      id: 'f-text', label: t('Passage text'), required: true, multiline: true, rows: 14,
      value: passage && Array.isArray(passage.paragraphs) ? passage.paragraphs.join('\n\n') : '',
      hint: t('Leave an empty line between paragraphs. Line breaks and spacing inside a paragraph are shown exactly as typed.')
    });
    var numbers = checkboxField({
      id: 'f-numbers', label: t('Show paragraph numbers'),
      checked: !passage || passage.showParagraphNumbers !== false,
      hint: t('Numbers help when questions mention a paragraph. Untick to show the text without numbers.')
    });
    var count = el('p', { className: 'word-count', id: 'f-text-count' });
    function updateCount() {
      var paragraphs = Schema.splitParagraphs(text.control.value);
      count.textContent = G12.plural(paragraphs.length, 'paragraph') + ' · ' + G12.plural(G12.wordCount(paragraphs), 'word');
    }
    text.control.addEventListener('input', updateCount);
    updateCount();
    text.row.appendChild(count);

    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Passage details') })].concat(names.rows, links.rows, [level.row, source.row, reviewed.row])));
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: t('Text') }), text.row, numbers.row]));
    frame.form.appendChild(formActions([el('button', { type: 'submit', className: 'btn', text: isNew ? t('Save passage') : t('Save changes') })], '#passages'));

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var base = names.read(errors);
      var paragraphs = Schema.splitParagraphs(text.control.value);
      if (!paragraphs.length) errors.push({ field: 'f-text', message: t('Write or paste the passage text.') });
      var item = Object.assign({ id: base.id }, links.read(errors), { title: base.title });
      if (hasText(level.control.value)) item.level = level.control.value.trim();
      if (hasText(source.control.value)) item.source = source.control.value.trim();
      item.reviewStatus = reviewStatusOf(reviewed.control);
      if (!numbers.control.checked) item.showParagraphNumbers = false;
      item.paragraphs = paragraphs;
      item.questions = passage && Array.isArray(passage.questions) ? Schema.clone(passage.questions) : [];
      if (!errors.length) errors = schemaErrors('passages', item);
      if (errors.length) {
        showErrors(frame, errors);
        return;
      }
      commit(Store.saveItem(library, 'passages', item, isNew ? null : passage.id),
        isNew ? t('Passage “{title}” saved. You can now add questions to it below.', { title: item.title }) : t('Passage “{title}” saved.', { title: item.title }));
      go(isNew ? 'passages/edit/' + encodeURIComponent(item.id) : 'passages');
    });

    /* Questions belong to a saved passage, so they are managed below the form. */
    var section = el('section', { className: 'editor-block', 'aria-labelledby': 'passage-questions-heading' });
    ui.view.appendChild(section);
    if (isNew) {
      section.appendChild(el('h3', { id: 'passage-questions-heading', text: t('Questions') }));
      section.appendChild(el('p', { text: t('Save the passage first. Then you can add questions to it here.') }));
      return;
    }
    var questions = Array.isArray(passage.questions) ? passage.questions : [];
    var base = 'passages/edit/' + encodeURIComponent(passage.id);
    section.appendChild(el('div', { className: 'view-header' }, [
      el('h3', { id: 'passage-questions-heading', text: t('Questions about this passage ({n})', { n: questions.length }) }),
      el('a', { className: 'btn', href: '#' + base + '/questions/new', text: t('Add a question') })
    ]));
    if (!questions.length) {
      section.appendChild(el('p', { text: t('No questions yet. Students will see the passage without questions until you add some.') }));
      return;
    }

    function updateQuestions(change, message) {
      if (dirty && !window.confirm(t('You have unsaved changes to the passage above. Continue and lose those changes?'))) return false;
      var copy = Schema.clone(passage);
      change(copy.questions);
      commit(Store.saveItem(library, 'passages', copy, passage.id), message);
      return true;
    }

    section.appendChild(itemRows({
      items: questions,
      all: questions,
      kindLabel: 'question',
      describe: function (item) {
        var meta = [item.type === 'short' ? t('Short answer') : t('Multiple choice')];
        if (item.type === 'mcq' && hasText(item.answer)) meta.push(t('Answer: {answer}', { answer: item.answer }));
        meta.push(t('ID: {id}', { id: item.id }));
        return { title: item.prompt || item.id, meta: meta.join(' · ') };
      },
      editHref: function (item) { return '#' + base + '/questions/edit/' + encodeURIComponent(item.id); },
      onMove: function (item, delta) {
        var moved = updateQuestions(function (list) {
          var from = list.findIndex(function (q) { return q.id === item.id; });
          var to = from + delta;
          if (from === -1 || to < 0 || to >= list.length) return;
          list.splice(to, 0, list.splice(from, 1)[0]);
        }, null);
        if (moved) {
          focusMoved(item.id, delta);
          go(base);
        }
      },
      onDelete: function (item) {
        if (!window.confirm(t('Delete this question?') + '\n\n“' + String(item.prompt || item.id).slice(0, 100) + '”\n\n' + t('This cannot be undone.'))) return;
        if (updateQuestions(function (list) {
          var at = list.findIndex(function (q) { return q.id === item.id; });
          if (at !== -1) list.splice(at, 1);
        }, t('Question deleted.'))) {
          go(base);
        }
      }
    }));
  }

  /* ---------- Import & export ---------- */

  function download(fileName, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = el('a', { href: url, download: fileName });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadCollection(key) {
    download(Schema.COLLECTIONS[key].fileName, Schema.toJSON(Store.fileData(library, key)));
  }

  /* Messages are interface sentences, so they follow the page direction. */
  function reportList(messages) {
    return el('ul', { className: 'report-list' }, messages.map(function (message) {
      return el('li', { text: message });
    }));
  }

  function renderTools() {
    ui.view.appendChild(el('h2', { tabindex: '-1', text: t('Import & export') }));
    var check = Schema.validateLibrary(library);

    /* Publish */
    var publishButtons = Schema.COLLECTION_KEYS.map(function (key) {
      var info = Schema.COLLECTIONS[key];
      return el('button', {
        type: 'button',
        className: 'btn btn--secondary',
        text: t('Download {file} ({count})', { file: info.fileName, count: library[key].length }),
        onclick: function () {
          downloadCollection(key);
          showMessage(t('Downloaded {file}.', { file: info.fileName }));
        }
      });
    });
    publishButtons.unshift(el('button', {
      type: 'button',
      className: 'btn',
      text: t('Download all five files'),
      onclick: function () {
        Schema.COLLECTION_KEYS.forEach(function (key, i) {
          setTimeout(function () { downloadCollection(key); }, i * 400);
        });
        showMessage(t('Downloading the five data files. If your browser asks, allow it to download multiple files.'));
      }
    }));
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'publish-heading' }, [
      el('h3', { id: 'publish-heading', text: t('Publish your changes') }),
      el('ol', { className: 'steps' }, [
        el('li', { text: t('Download the five data files below.') }),
        el('li', { text: t('In your GitHub repository, open the data folder (not the top level), choose “Add file” → “Upload files”, and upload the files to replace the old ones. Then choose “Commit changes”.') }),
        el('li', { text: t('GitHub Pages updates the website, usually within a few minutes. Reload the website to check.') })
      ]),
      check.errors.length ? el('div', { className: 'notice notice--error', role: 'note' }, [
        el('p', { text: t('Some content has errors (see “Check content” below). Items with errors are not shown to students until they are fixed.') })
      ]) : null,
      el('div', { className: 'actions' }, publishButtons)
    ]));

    /* Check */
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'check-heading' }, [
      el('h3', { id: 'check-heading', text: t('Check content') }),
      el('p', {
        text: t('{units}, {lessons}, {summaries}, {questions} and {passages}.', {
          units: G12.plural(library.units.length, 'unit'),
          lessons: G12.plural(library.lessons.length, 'lesson'),
          summaries: G12.plural(library.summaries.length, 'summary', 'summaries'),
          questions: G12.plural(library.questions.length, 'grammar question'),
          passages: G12.plural(library.passages.length, 'reading passage')
        })
      }),
      check.errors.length
        ? el('div', null, [el('p', null, [el('strong', { text: t('{errors} found:', { errors: G12.plural(check.errors.length, 'error') }) })]), reportList(check.errors)])
        : el('p', { text: t('No errors found.') }),
      check.warnings.length
        ? el('div', null, [el('p', null, [el('strong', { text: t('{warnings} (the content still works):', { warnings: G12.plural(check.warnings.length, 'warning') }) })]), reportList(check.warnings)])
        : null
    ]));

    /* Backup */
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'backup-heading' }, [
      el('h3', { id: 'backup-heading', text: t('Backup') }),
      el('p', { text: t('Download all your content as one file. Keep it somewhere safe, or use it to move your draft to another computer (import it there).') }),
      el('div', { className: 'actions' }, [el('button', {
        type: 'button',
        className: 'btn btn--secondary',
        text: t('Download backup file'),
        onclick: function () {
          var date = new Date().toISOString().slice(0, 10);
          download('grade12-english-backup-' + date + '.json', Schema.toJSON(Store.backupData(library)));
          showMessage(t('Backup downloaded.'));
        }
      })])
    ]));

    /* Import */
    var fileInput = el('input', { type: 'file', id: 'import-files', accept: '.json,application/json', multiple: true });
    describe(fileInput, 'import-files-hint');
    var modeMerge = el('input', { type: 'radio', name: 'import-mode', id: 'import-merge', value: 'merge', checked: true });
    var modeReplace = el('input', { type: 'radio', name: 'import-mode', id: 'import-replace', value: 'replace' });
    var result = el('div', { id: 'import-result' });
    var importForm = el('form', { novalidate: true }, [
      el('div', { className: 'form-row' }, [
        el('label', { for: 'import-files', text: t('Files to import') }),
        el('p', {
          className: 'hint', id: 'import-files-hint',
          text: t('Choose one or more .json files: the website’s data files (such as grammar-questions.json) or a backup file.')
        }),
        fileInput
      ]),
      el('fieldset', { className: 'form-row' }, [
        el('legend', { text: t('How to import') }),
        el('div', { className: 'checkbox-row' }, [el('label', { for: 'import-merge' }, [modeMerge, t('Merge: add new items and update items with the same ID (recommended)')])]),
        el('div', { className: 'checkbox-row' }, [el('label', { for: 'import-replace' }, [modeReplace, t('Replace: remove the existing items of each imported type first')])])
      ]),
      el('div', { className: 'actions' }, [el('button', { type: 'submit', className: 'btn', text: t('Import') })]),
      result
    ]);
    importForm.addEventListener('submit', function (event) {
      event.preventDefault();
      runImport(Array.prototype.slice.call(fileInput.files || []), modeReplace.checked ? 'replace' : 'merge', result);
    });
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'import-heading' }, [
      el('h3', { id: 'import-heading', text: t('Import') }),
      el('p', { text: t('Imported files are checked first. If anything is wrong, nothing is changed.') }),
      importForm
    ]));
    if (importReport) {
      result.appendChild(importReport);
      importReport = null;
    }

    /* Discard */
    var discard = el('section', { className: 'tool-section', 'aria-labelledby': 'discard-heading' }, [
      el('h3', { id: 'discard-heading', text: t('Discard my draft') })
    ]);
    if (changed() && storage) {
      discard.appendChild(el('p', { text: t('Delete all unpublished changes in this browser and go back to the published files. Download a backup first if you might need your changes later.') }));
      discard.appendChild(el('div', { className: 'actions' }, [el('button', {
        type: 'button',
        className: 'btn btn--danger',
        text: t('Discard my draft'),
        onclick: function () {
          if (!window.confirm(t('Discard all unpublished changes in this browser and reload the published files?') + '\n\n' + t('This cannot be undone.'))) return;
          Store.clearDraft(storage);
          library = Store.normalizeLibrary(published);
          baseline = publishedFingerprint;
          savedAt = null;
          renderStatus();
          flash = { text: t('Draft discarded. You are now working from the published files.') };
          go('tools');
        }
      })]));
    } else {
      discard.appendChild(el('p', { text: t('There are no unpublished changes to discard.') }));
    }
    ui.view.appendChild(discard);
  }

  function runImport(files, mode, result) {
    G12.clear(result);
    if (!files.length) {
      result.appendChild(el('div', { className: 'error-summary', role: 'alert' }, [el('p', { text: t('Choose one or more .json files first.') })]));
      return;
    }

    Promise.all(files.map(function (file) {
      return file.text().then(function (text) { return { name: file.name, text: text }; });
    })).then(function (loaded) {
      var problems = [];
      var combined = {};
      loaded.forEach(function (file) {
        var data;
        try {
          data = JSON.parse(file.text);
        } catch (error) {
          problems.push(t('{file}: is not valid JSON ({reason}).', { file: file.name, reason: error.message }));
          return;
        }
        var read = Schema.readImport(data, file.name);
        problems = problems.concat(read.report.errors);
        if (read.report.errors.length) return;
        Object.keys(read.collections).forEach(function (key) {
          combined[key] = (combined[key] || []).concat(read.collections[key]);
        });
      });

      var applied = null;
      var warnings = [];
      if (!problems.length) {
        applied = Store.applyImport(library, combined, mode);
        var check = Schema.validateLibrary(applied.library);
        problems = check.errors;
        warnings = check.warnings;
      }

      if (problems.length) {
        result.appendChild(el('div', { className: 'error-summary', role: 'alert', tabindex: '-1' }, [
          el('h4', { text: t('Nothing was imported. Please fix these problems in the file and try again:') }),
          reportList(problems)
        ]));
        G12.focus(result.firstChild);
        return;
      }

      var keys = Object.keys(applied.summary);
      if (mode === 'replace') {
        var affected = keys.filter(function (key) { return library[key].length > 0; }).map(function (key) {
          return t('{title} ({items})', { title: TYPES[key].title, items: G12.plural(library[key].length, 'item') });
        });
        if (affected.length && !window.confirm(t('Replace your current {items} with the imported content?', { items: affected.join(G12.lang === 'ar' ? '، ' : ', ') }) + '\n\n' + t('This cannot be undone.'))) {
          return;
        }
      }

      var lines = keys.map(function (key) {
        var stats = applied.summary[key];
        if (mode === 'replace') return t('{type}: replaced ({removed} removed, {added} imported).', { type: TYPES[key].title, removed: stats.removed, added: stats.added });
        return t('{type}: {added} added, {updated} updated.', { type: TYPES[key].title, added: stats.added, updated: stats.updated });
      });
      importReport = el('div', { className: 'notice notice--info', role: 'status' }, [
        el('p', null, [el('strong', { text: t('Import complete.') + ' ' }), t('Your draft has been updated. Remember to publish it.')]),
        reportList(lines),
        warnings.length ? el('p', { text: t('Warnings (the content still works):') }) : null,
        warnings.length ? reportList(warnings) : null
      ]);
      commit(applied.library, t('Import complete.'));
      afterRender = function () { G12.focus(document.getElementById('import-result')); };
      go('tools');
    }).catch(function (error) {
      result.appendChild(el('div', { className: 'error-summary', role: 'alert' }, [el('p', { text: t('The file could not be read: {reason}', { reason: error.message }) })]));
    });
  }
})();
