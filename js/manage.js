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
  var hasText = Schema.hasText;
  var root = document.getElementById('page-root');

  var TYPES = {
    lessons: {
      title: 'Lessons', singular: 'lesson', add: 'Add a lesson',
      help: 'Lessons appear on the Grammar Lessons page in this order.',
      empty: 'Add your first grammar lesson, or import a lessons file.'
    },
    summaries: {
      title: 'Summaries', singular: 'summary', add: 'Add a summary',
      help: 'Summaries appear on the Grammar Summaries page in this order. Link each summary to its lesson.',
      empty: 'Add your first grammar summary, or import a summaries file.'
    },
    questions: {
      title: 'Grammar questions', singular: 'question', add: 'Add a question',
      help: 'These questions are used on the Grammar Practice page. Link each question to a lesson so students can practise by topic.',
      empty: 'Add your first practice question, or import a questions file.'
    },
    passages: {
      title: 'Reading passages', singular: 'passage', add: 'Add a passage',
      help: 'Passages appear on the Reading page in this order. Each passage has its own questions.',
      empty: 'Add your first reading passage, or import a passages file.'
    }
  };

  var SECTION_TYPE_OPTIONS = [
    { value: 'text', label: 'Text (paragraphs)' },
    { value: 'note', label: 'Note (highlighted box)' },
    { value: 'list', label: 'Bulleted list' },
    { value: 'examples', label: 'Examples' },
    { value: 'table', label: 'Table' },
    { value: 'mistakes', label: 'Common mistakes (avoid / use)' }
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
  var lastQuestionTopic = ''; // remembered for "Save and add another"
  var firstRender = true;
  var ui = {};

  G12.setTitle('Content Manager');

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
    G12.showError(root, error);
  });

  function loadPublished() {
    return Promise.all(Schema.COLLECTION_KEYS.map(function (key) {
      var path = Schema.COLLECTIONS[key].path;
      return G12.loadJSON(path).then(function (data) {
        if (!data || !Array.isArray(data[key])) {
          throw new Error('"' + path + '" does not contain a "' + key + '" list.');
        }
        published[key] = data[key];
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
      return 'Warning: your changes could not be saved in this browser (' + error.message + '). Download a backup now from Import & export.';
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
    root.appendChild(el('h1', { text: 'Content Manager' }));
    root.appendChild(el('p', {
      className: 'lead',
      text: 'Add, edit, organise, import and export the lessons, summaries, practice questions and reading passages shown on the website.'
    }));
    root.appendChild(el('div', { className: 'notice notice--info' }, [
      el('p', null, [
        el('strong', { text: 'How saving works: ' }),
        'your changes are saved automatically as a draft in this browser, on this device only. Students see them after you publish: open ',
        el('a', { href: '#tools', text: 'Import & export' }),
        ', download the data files and upload them to the data folder of your GitHub repository.'
      ])
    ]));
    ui.status = el('div', { className: 'status-bar', role: 'region', 'aria-label': 'Draft status' });
    ui.nav = el('nav', { className: 'manager-nav', 'aria-label': 'Content types' });
    ui.message = el('div', { className: 'manager-message', role: 'status' });
    ui.view = el('div', { id: 'manager-view' });
    root.appendChild(ui.status);
    root.appendChild(ui.nav);
    root.appendChild(ui.message);
    root.appendChild(ui.view);
    renderStatus();
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (error) {
      return iso;
    }
  }

  function renderStatus() {
    var box = G12.clear(ui.status);
    if (publishedErrors.length) {
      box.appendChild(el('div', { className: 'notice notice--error', role: 'alert' }, [
        el('p', null, [el('strong', { text: 'The published data files could not be loaded. ' }), publishedErrors.join(' ')]),
        el('p', { text: 'The manager is showing your browser draft, or an empty library if there is no draft. Be careful: publishing from here could replace content that is already on the website. Reload the page to try again.' })
      ]));
    }

    if (!storage) {
      box.appendChild(el('p', null, [
        el('strong', { text: 'Drafts cannot be saved in this browser' }),
        ' (for example, in private browsing). Your changes will be lost when you close this page, so download a backup often from ',
        el('a', { href: '#tools', text: 'Import & export' }), '.'
      ]));
    } else if (changed()) {
      box.appendChild(el('p', null, [
        el('strong', { text: 'You have unpublished changes. ' }),
        'They are saved in this browser' + (savedAt ? ' (last saved ' + formatTime(savedAt) + ')' : '') +
        '. Students cannot see them until you publish them from ',
        el('a', { href: '#tools', text: 'Import & export' }), '.'
      ]));
      if (baseline && baseline !== publishedFingerprint) {
        box.appendChild(el('div', { className: 'notice notice--demo', role: 'note' }, [
          el('p', null, [
            el('strong', { text: 'The published files have changed since you started this draft. ' }),
            'For example, new files may have been uploaded from another computer. Publishing this draft will replace them. To start again from the published files, use “Discard my draft” in ',
            el('a', { href: '#tools', text: 'Import & export' }), '.'
          ])
        ]));
      }
    } else {
      box.appendChild(el('p', { text: 'No unpublished changes: everything here matches the published files.' }));
    }

    var toggle = el('input', { type: 'checkbox', id: 'preview-toggle', checked: Store.isPreviewOn(storage), disabled: !storage });
    toggle.addEventListener('change', function () {
      Store.setPreview(storage, toggle.checked);
      showMessage(toggle.checked
        ? 'Preview is on: the student pages in this browser now show your draft.'
        : 'Preview is off: the student pages show the published files.');
    });
    box.appendChild(el('div', { className: 'checkbox-row' }, [
      el('label', { for: 'preview-toggle' }, [toggle, 'Preview my draft on the student pages (only in this browser)'])
    ]));
    box.appendChild(el('p', null, [el('a', { href: 'index.html', text: 'Open the website' })]));
  }

  function renderNav() {
    var section = currentHash.split('/')[0] || 'lessons';
    var links = Schema.COLLECTION_KEYS.map(function (key) {
      return el('li', null, [el('a', {
        href: '#' + key,
        'aria-current': section === key ? 'page' : null,
        text: TYPES[key].title + ' (' + library[key].length + ')'
      })]);
    });
    links.push(el('li', null, [el('a', { href: '#tools', 'aria-current': section === 'tools' ? 'page' : null, text: 'Import & export' })]));
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
    if (dirty && !window.confirm('You have unsaved changes on this form. Leave without saving them?')) {
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
    return el('label', { for: id }, [text, mark ? el('span', { className: 'hint', text: ' (' + mark + ')' }) : null]);
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

  function selectField(opts) {
    var control = el('select', { id: opts.id }, opts.options.map(function (option) {
      return el('option', { value: option.value, text: option.label });
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
    ui.view.appendChild(el('p', null, [el('a', { href: backHref, text: '← ' + backLabel })]));
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
      el('a', { className: 'btn btn--secondary', href: cancelHref, text: 'Cancel' })
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
      el('h3', { text: errors.length === 1 ? 'Please fix this problem before saving:' : 'Please fix these ' + errors.length + ' problems before saving:' }),
      list
    ]);
    frame.errors.appendChild(box);
    box.focus();
  }

  /* Problems found by the shared schema rules, as form errors. */
  function schemaErrors(key, item, fieldFor) {
    return Schema.validateItem(key, item, 0).errors.map(function (message) {
      var text = message.replace(/^(Lesson|Summary|Question|Passage) \d+( “[^”]*”)?(, )?/, '').replace(/^: /, '');
      text = text.charAt(0).toUpperCase() + text.slice(1);
      return { field: fieldFor ? fieldFor(text) : null, message: text };
    });
  }

  function idErrors(id, otherIds, field) {
    if (!Schema.ID_PATTERN.test(id)) {
      return [{ field: field, message: 'The ID can only use lowercase English letters (a–z), numbers and single hyphens, for example: passive-voice.' }];
    }
    if (otherIds.indexOf(id) !== -1) {
      return [{ field: field, message: 'Another item already uses the ID “' + id + '”. Choose a different ID.' }];
    }
    return [];
  }

  function reviewStatusOf(checkbox) {
    return checkbox.checked ? 'reviewed' : 'unreviewed';
  }

  function notFound(what, backHref, backLabel) {
    ui.view.appendChild(el('h2', { tabindex: '-1', text: what + ' not found' }));
    ui.view.appendChild(el('p', { text: 'It may have been deleted, or the link is wrong.' }));
    ui.view.appendChild(el('a', { className: 'btn', href: backHref, text: backLabel }));
  }

  function lessonOptions(currentValue, noneLabel) {
    var options = [{ value: '', label: noneLabel }].concat(library.lessons.map(function (lesson) {
      return { value: lesson.id, label: lesson.title || lesson.id };
    }));
    if (hasText(currentValue) && !G12.byId(library.lessons, currentValue)) {
      options.push({ value: currentValue, label: currentValue + ' (lesson not found)' });
    }
    return options;
  }

  /* ---------- Lists ---------- */

  function rowDetails(key, item) {
    var details = [];
    var count;
    switch (key) {
      case 'lessons':
        count = Array.isArray(item.sections) ? item.sections.length : 0;
        details.push('ID: ' + item.id, G12.plural(count, 'section'));
        var links = Store.countLessonLinks(library, item.id);
        if (links.questions) details.push(G12.plural(links.questions, 'question'));
        return { title: item.title || item.id, meta: details.join(' · ') };
      case 'summaries':
        var lesson = hasText(item.lessonId) ? G12.byId(library.lessons, item.lessonId) : null;
        details.push('Lesson: ' + (lesson ? lesson.title : (hasText(item.lessonId) ? item.lessonId + ' (not found)' : 'none')));
        details.push(G12.plural(Array.isArray(item.points) ? item.points.length : 0, 'point'));
        return { title: item.title || item.id, meta: details.join(' · ') };
      case 'questions':
        details.push(item.type === 'short' ? 'Short answer' : 'Multiple choice');
        var topic = hasText(item.topic) ? G12.byId(library.lessons, item.topic) : null;
        details.push('Topic: ' + (topic ? topic.title : (hasText(item.topic) ? item.topic + ' (not found)' : 'none')));
        if (item.type === 'mcq' && hasText(item.answer)) details.push('Answer: ' + item.answer);
        details.push('ID: ' + item.id);
        return { title: item.prompt || item.id, meta: details.join(' · ') };
      case 'passages':
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
      var name = '“' + String(info.title).slice(0, 60) + '”';
      var actions = [el('a', {
        className: 'btn btn--small btn--secondary',
        href: opts.editHref(item),
        text: 'Edit',
        'aria-label': 'Edit ' + opts.kindLabel + ' ' + name
      })];
      if (opts.onMove) {
        actions.push(smallButton('Move up', 'Move ' + opts.kindLabel + ' ' + name + ' up', function () { opts.onMove(item, -1); },
          { disabled: position === 0, action: 'up', id: item.id }));
        actions.push(smallButton('Move down', 'Move ' + opts.kindLabel + ' ' + name + ' down', function () { opts.onMove(item, 1); },
          { disabled: position === opts.all.length - 1, action: 'down', id: item.id }));
      }
      actions.push(smallButton('Delete', 'Delete ' + opts.kindLabel + ' ' + name, function () { opts.onDelete(item); },
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
        'No ' + type.title.toLowerCase() + ' added yet',
        type.empty,
        [{ label: type.add, href: '#' + key + '/new' }, { label: 'Import a file', href: '#tools' }],
        'h3'
      ));
      return;
    }

    var holder = el('div');
    var filterState = { topic: '__all__', text: '' };

    function draw() {
      var shown = items;
      if (key === 'questions') {
        shown = items.filter(function (question) {
          var topicOk = filterState.topic === '__all__' ||
            (filterState.topic === '' ? !hasText(question.topic) : question.topic === filterState.topic);
          var textOk = !filterState.text || String(question.prompt || '').toLowerCase().indexOf(filterState.text) !== -1;
          return topicOk && textOk;
        });
      }
      var filtering = shown.length !== items.length || filterState.text || filterState.topic !== '__all__';
      G12.clear(holder);
      if (filtering) {
        holder.appendChild(el('p', { className: 'hint', role: 'status', text: 'Showing ' + shown.length + ' of ' + items.length + ' questions. Clear the filters to reorder questions.' }));
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
      var topicFilter = el('select', { id: 'filter-topic' }, [
        el('option', { value: '__all__', text: 'All topics' }),
        el('option', { value: '', text: 'No topic' })
      ].concat(library.lessons.map(function (lesson) {
        return el('option', { value: lesson.id, text: lesson.title || lesson.id });
      })));
      var search = el('input', { type: 'search', id: 'filter-text', autocomplete: 'off', dir: 'auto' });
      topicFilter.addEventListener('change', function () { filterState.topic = topicFilter.value; draw(); });
      search.addEventListener('input', function () { filterState.text = search.value.trim().toLowerCase(); draw(); });
      ui.view.appendChild(el('div', { className: 'filters', role: 'search', 'aria-label': 'Filter questions' }, [
        el('div', { className: 'form-row' }, [el('label', { for: 'filter-topic', text: 'Show topic' }), topicFilter]),
        el('div', { className: 'form-row' }, [el('label', { for: 'filter-text', text: 'Search question text' }), search])
      ]));
    }

    ui.view.appendChild(holder);
    draw();
  }

  function deleteFromList(key, item) {
    var info = rowDetails(key, item);
    var message = 'Delete the ' + TYPES[key].singular + ' “' + String(info.title).slice(0, 80) + '”?';
    if (key === 'lessons') {
      var links = Store.countLessonLinks(library, item.id);
      if (links.questions || links.summaries) {
        message += '\n\n' + G12.plural(links.summaries, 'summary', 'summaries') + ' and ' + G12.plural(links.questions, 'question') +
          ' are linked to this lesson. They will be kept, but no longer linked to it.';
      }
    }
    if (key === 'passages' && Array.isArray(item.questions) && item.questions.length) {
      message += '\n\nIts ' + G12.plural(item.questions.length, 'question') + ' will be deleted too.';
    }
    if (!window.confirm(message + '\n\nThis cannot be undone.')) return;
    commit(Store.deleteItem(library, key, item.id), 'Deleted the ' + TYPES[key].singular + ' “' + String(info.title).slice(0, 80) + '”.');
    route();
  }

  /* ---------- Editors ---------- */

  function renderEditor(key, id) {
    var item = id ? G12.byId(library[key], id) : null;
    if (id && !item) {
      notFound(TYPES[key].singular.charAt(0).toUpperCase() + TYPES[key].singular.slice(1), '#' + key, 'Back to ' + TYPES[key].title.toLowerCase());
      return;
    }
    if (key === 'lessons') lessonEditor(item);
    else if (key === 'summaries') summaryEditor(item);
    else if (key === 'questions') grammarQuestionEditor(item);
    else passageEditor(item);
  }

  /* Title + ID pair. The ID follows the title until the ID is edited by hand. */
  function titleAndId(item, otherIds, idHint, fallbackBase) {
    var title = textField({ id: 'f-title', label: 'Title', required: true, value: item && item.title });
    var idField = textField({ id: 'f-id', label: 'ID', value: item && item.id, dir: 'ltr', hint: idHint });
    var idTouched = Boolean(item);
    title.control.addEventListener('input', function () {
      if (idTouched) return;
      var slug = Schema.slugify(title.control.value);
      idField.control.value = slug ? Schema.uniqueId(slug, otherIds) : '';
    });
    idField.control.addEventListener('input', function () { idTouched = true; });

    function read(errors) {
      var titleText = title.control.value.trim();
      if (!titleText) errors.push({ field: 'f-title', message: 'Enter a title.' });
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
    var frame = editorFrame(isNew ? 'Add a lesson' : 'Edit lesson: ' + (lesson.title || lesson.id), '#lessons', 'Back to lessons');
    var names = titleAndId(lesson, otherIds,
      'Used in the lesson’s web address (grammar.html?lesson=your-id). Lowercase English letters, numbers and hyphens. Filled in from the title automatically.',
      'lesson');
    var description = textField({ id: 'f-description', label: 'Short description', optional: true, multiline: true, rows: 2, value: lesson && lesson.description, hint: 'Shown under the title in the list of lessons.' });
    var reviewed = checkboxField({
      id: 'f-reviewed',
      label: 'A teacher has reviewed this lesson',
      checked: lesson && lesson.reviewStatus === 'reviewed',
      hint: 'Leave unticked until the lesson has been checked. Students see a “Not yet reviewed” label until then.'
    });

    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: 'Lesson details' })].concat(names.rows, [description.row, reviewed.row])));

    var drafts = (lesson && Array.isArray(lesson.sections) ? lesson.sections : []).map(sectionDraft);
    frame.form.appendChild(sectionsEditor(drafts));

    frame.form.appendChild(formActions([el('button', { type: 'submit', className: 'btn', text: isNew ? 'Save lesson' : 'Save changes' })], '#lessons'));

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var base = names.read(errors);
      var item = { id: base.id, title: base.title };
      if (hasText(description.control.value)) item.description = description.control.value.trim();
      item.reviewStatus = reviewStatusOf(reviewed.control);
      item.sections = drafts.map(sectionFromDraft);
      if (!errors.length) {
        errors = schemaErrors('lessons', item, function (text) {
          var match = /^Section (\d+)/.exec(text);
          return match ? 'sec-' + (Number(match[1]) - 1) + '-type' : null;
        });
      }
      if (errors.length) {
        showErrors(frame, errors);
        return;
      }
      var renamed = !isNew && lesson.id !== item.id;
      var links = renamed ? Store.countLessonLinks(library, lesson.id) : null;
      commit(Store.saveItem(library, 'lessons', item, isNew ? null : lesson.id),
        'Lesson “' + item.title + '” saved.' + (links && (links.questions || links.summaries) ? ' Its linked summaries and questions now use the new ID.' : ''));
      go('lessons');
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
      text: 'Add section',
      onclick: function () {
        drafts.push(sectionDraft(null));
        dirty = true;
        draw();
        focusById('sec-' + (drafts.length - 1) + '-type');
      }
    });
    var box = el('fieldset', { className: 'editor-block' }, [
      el('legend', { text: 'Sections' }),
      el('p', { className: 'hint', text: 'A lesson is made of sections shown in this order. Choose a type for each section: text, a note box, a list, examples, a table or common mistakes.' }),
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
      if (!window.confirm('Remove section ' + (index + 1) + ' (' + sectionLabel(drafts[index].type) + ')? Its content will be deleted when you save.')) return;
      drafts.splice(index, 1);
      dirty = true;
      draw();
      if (drafts.length) focusById('sec-' + Math.min(index, drafts.length - 1) + '-title');
      else addButton.focus();
    }

    function sectionEditor(draft, index) {
      var p = 'sec-' + index;
      var type = selectField({ id: p + '-type', label: 'Section type', value: draft.type, options: SECTION_TYPE_OPTIONS });
      type.control.addEventListener('change', function () {
        draft.type = type.control.value;
        draw();
        focusById(p + '-type');
      });
      var heading = textField({ id: p + '-heading', label: 'Heading', optional: true, value: draft.heading });
      bind(heading.control, draft, 'heading');

      var parts = [];
      if (draft.type === 'text' || draft.type === 'note') {
        var text = textField({ id: p + '-text', label: 'Text', multiline: true, rows: 6, value: draft.text, hint: 'Leave an empty line between paragraphs.' });
        bind(text.control, draft, 'text');
        var lang = selectField({
          id: p + '-lang', label: 'Language', value: draft.lang,
          options: [{ value: 'en', label: 'English (left to right)' }, { value: 'ar', label: 'Arabic (right to left)' }]
        });
        lang.control.addEventListener('change', function () { draft.lang = lang.control.value; });
        parts.push(text.row, lang.row);
      } else if (draft.type === 'list' || draft.type === 'examples') {
        var items = textField({ id: p + '-items', label: 'Items', multiline: true, rows: 5, value: draft.items, hint: 'One item per line.' });
        bind(items.control, draft, 'items');
        parts.push(items.row);
      } else if (draft.type === 'table') {
        var columns = textField({ id: p + '-columns', label: 'Column headings', multiline: true, rows: 3, value: draft.columns, hint: 'One heading per line.' });
        bind(columns.control, draft, 'columns');
        var rows = textField({
          id: p + '-rows', label: 'Rows', multiline: true, rows: 5, value: draft.rows,
          hint: 'One row per line. Separate the cells with a vertical bar ( | ). Each row needs one cell for each column.'
        });
        bind(rows.control, draft, 'rows');
        parts.push(columns.row, rows.row);
      } else if (draft.type === 'mistakes') {
        parts.push(rowsEditor({
          idPrefix: p + '-m',
          legend: 'Mistakes',
          hint: 'For each item, write the incorrect version to avoid and the correct version to use.',
          itemLabel: 'Mistake',
          addLabel: 'Add mistake',
          rows: draft.mistakes,
          fields: [
            { name: 'avoid', label: 'Avoid (incorrect version)' },
            { name: 'use', label: 'Use (correct version)' },
            { name: 'note', label: 'Note', optional: true }
          ],
          nested: true
        }));
      }

      var last = index === drafts.length - 1;
      var up = smallButton('Move up', 'Move section ' + (index + 1) + ' up', function () { move(index, -1); }, { disabled: index === 0 });
      up.id = p + '-up';
      var down = smallButton('Move down', 'Move section ' + (index + 1) + ' down', function () { move(index, 1); }, { disabled: last });
      down.id = p + '-down';
      var del = smallButton('Remove section', 'Remove section ' + (index + 1), function () { remove(index); }, { danger: true });

      return el('li', { className: 'section-editor', id: p, 'aria-labelledby': p + '-title' }, [
        el('h3', { id: p + '-title', tabindex: '-1', text: 'Section ' + (index + 1) + ': ' + sectionLabel(draft.type) }),
        type.row,
        heading.row
      ].concat(parts, [el('div', { className: 'row-actions' }, [up, down, del])]));
    }

    function draw() {
      G12.clear(list);
      if (drafts.length === 0) {
        list.appendChild(el('li', { className: 'hint', text: 'No sections yet. Use “Add section” to start writing the lesson.' }));
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
        var label = opts.itemLabel + ' ' + (index + 1);
        var children = [el('p', { className: 'row-editor-title', id: p + '-label', text: label })];
        opts.fields.forEach(function (field) {
          var input = textField({ id: p + '-' + field.name, label: field.label, optional: field.optional, value: row[field.name] });
          bind(input.control, row, field.name);
          children.push(input.row);
        });
        children.push(el('div', { className: 'row-actions' }, [
          smallButton('Move up', 'Move ' + label.toLowerCase() + ' up', function () { shift(index, -1); }, { disabled: index === 0 }),
          smallButton('Move down', 'Move ' + label.toLowerCase() + ' down', function () { shift(index, 1); }, { disabled: index === rows.length - 1 }),
          smallButton('Remove', 'Remove ' + label.toLowerCase(), function () { removeRow(index); }, { danger: true })
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
    var frame = editorFrame(isNew ? 'Add a summary' : 'Edit summary: ' + (summary.title || summary.id), '#summaries', 'Back to summaries');
    var names = titleAndId(summary, otherIds,
      'Used to link to this summary (summaries.html#your-id). Lowercase English letters, numbers and hyphens. Filled in from the title automatically.',
      'summary');
    var lesson = selectField({
      id: 'f-lesson', label: 'Linked lesson', optional: true,
      value: summary && summary.lessonId,
      options: lessonOptions(summary && summary.lessonId, '— No linked lesson —'),
      hint: library.lessons.length ? 'Students can jump between a lesson and its summary.' : 'There are no lessons yet. You can link this summary to a lesson later.'
    });
    var reviewed = checkboxField({
      id: 'f-reviewed', label: 'A teacher has reviewed this summary',
      checked: summary && summary.reviewStatus === 'reviewed',
      hint: 'Leave unticked until the summary has been checked.'
    });
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: 'Summary details' })].concat(names.rows, [lesson.row, reviewed.row])));

    var points = (summary && Array.isArray(summary.points) ? summary.points : []).map(function (point) {
      point = point || {};
      return { title: point.title || '', rule: point.rule || '', example: point.example || '' };
    });
    frame.form.appendChild(rowsEditor({
      idPrefix: 'pt',
      legend: 'Points',
      hint: 'Each point is one row of the summary table. Only the rule is required.',
      itemLabel: 'Point',
      addLabel: 'Add point',
      rows: points,
      fields: [
        { name: 'title', label: 'Name', optional: true },
        { name: 'rule', label: 'Rule' },
        { name: 'example', label: 'Example', optional: true }
      ]
    }));

    var remember = textField({
      id: 'f-remember', label: 'Remember', optional: true, multiline: true, rows: 4,
      value: summary && Array.isArray(summary.remember) ? summary.remember.join('\n') : '',
      hint: 'Short reminders shown as a list under the table. One reminder per line.'
    });
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: 'Reminders' }), remember.row]));
    frame.form.appendChild(formActions([el('button', { type: 'submit', className: 'btn', text: isNew ? 'Save summary' : 'Save changes' })], '#summaries'));

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var base = names.read(errors);
      var item = { id: base.id, title: base.title };
      if (hasText(lesson.control.value)) item.lessonId = lesson.control.value;
      item.reviewStatus = reviewStatusOf(reviewed.control);
      item.points = [];
      points.forEach(function (point, index) {
        if (!hasText(point.title) && !hasText(point.rule) && !hasText(point.example)) return;
        if (!hasText(point.rule)) {
          errors.push({ field: 'pt-' + index + '-rule', message: 'Point ' + (index + 1) + ' needs a rule.' });
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
      commit(Store.saveItem(library, 'summaries', item, isNew ? null : summary.id), 'Summary “' + item.title + '” saved.');
      go('summaries');
    });
  }

  /* ----- Questions (grammar practice and reading passages) ----- */

  function grammarQuestionEditor(question) {
    questionEditor({
      question: question,
      mode: 'grammar',
      siblingIds: library.questions.map(function (q) { return q.id; }),
      heading: question ? 'Edit question' : 'Add a question',
      backHref: '#questions',
      backLabel: 'Back to grammar questions',
      newHref: 'questions/new',
      doneHref: 'questions',
      save: function (item, originalId) {
        commit(Store.saveItem(library, 'questions', item, originalId), 'Question ' + item.id + ' saved.');
      }
    });
  }

  function renderPassageQuestionEditor(passageId, questionId) {
    var passage = G12.byId(library.passages, passageId);
    if (!passage) {
      notFound('Passage', '#passages', 'Back to reading passages');
      return;
    }
    var questions = Array.isArray(passage.questions) ? passage.questions : [];
    var question = questionId ? G12.byId(questions, questionId) : null;
    var passageHref = 'passages/edit/' + encodeURIComponent(passage.id);
    if (questionId && !question) {
      notFound('Question', '#' + passageHref, 'Back to the passage');
      return;
    }
    questionEditor({
      question: question,
      mode: 'passage',
      siblingIds: questions.map(function (q) { return q.id; }),
      heading: (question ? 'Edit question for “' : 'Add a question to “') + (passage.title || passage.id) + '”',
      backHref: '#' + passageHref,
      backLabel: 'Back to the passage',
      newHref: passageHref + '/questions/new',
      doneHref: passageHref,
      save: function (item, originalId) {
        var copy = Schema.clone(passage);
        copy.questions = Array.isArray(copy.questions) ? copy.questions : [];
        var position = -1;
        copy.questions.forEach(function (q, i) { if (originalId && q.id === originalId) position = i; });
        if (position === -1) copy.questions.push(item);
        else copy.questions[position] = item;
        commit(Store.saveItem(library, 'passages', copy, passage.id), 'Question ' + item.id + ' saved.');
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
    frame.form.appendChild(el('p', { className: 'hint', text: isNew ? 'An ID is created automatically when you save.' : 'Question ID: ' + q.id }));

    var typeName = 'f-type';
    var typeRadios = [
      { value: 'mcq', label: 'Multiple choice' },
      { value: 'short', label: 'Short written answer (not scored)' }
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
      id: 'f-prompt', label: 'Question', required: true, multiline: true, rows: 3, value: q.prompt,
      hint: 'Type three underscores ___ where a blank should appear.'
    });

    var details = [
      el('fieldset', { className: 'form-row' }, [el('legend', { text: 'Question type' }), el('div', { className: 'inline-choices' }, typeRadios)]),
      prompt.row
    ];

    var topic = null;
    if (ctx.mode === 'grammar') {
      var defaultTopic = isNew ? lastQuestionTopic : q.topic;
      topic = selectField({
        id: 'f-topic', label: 'Topic (lesson)', optional: true,
        value: defaultTopic,
        options: lessonOptions(defaultTopic, '— No topic —'),
        hint: library.lessons.length
          ? 'On the practice page, questions are grouped by lesson.'
          : 'There are no lessons yet. You can link this question to a lesson later.'
      });
      details.push(topic.row);
    }
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: 'Question' })].concat(details)));

    var specific = el('fieldset', { className: 'editor-block' });
    frame.form.appendChild(specific);

    var explanation = textField({
      id: 'f-explanation', label: 'Explanation', optional: true, multiline: true, rows: 3, value: q.explanation,
      hint: 'Shown to students after they answer.'
    });
    var difficulty = selectField({
      id: 'f-difficulty', label: 'Difficulty', optional: true, value: q.difficulty,
      options: [{ value: '', label: '— Not set —' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]
    });
    var reviewed = checkboxField({
      id: 'f-reviewed', label: 'A teacher has reviewed this question and its answer',
      checked: q.reviewStatus === 'reviewed',
      hint: 'Until this is ticked, students see the answer as a “suggested answer”, never as definitely correct, and scores are marked provisional.'
    });
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: 'Feedback and review' }), explanation.row, difficulty.row, reviewed.row]));

    var addAnother = false;
    var saveButton = el('button', { type: 'submit', className: 'btn', text: isNew ? 'Save question' : 'Save changes', onclick: function () { addAnother = false; } });
    var saveNewButton = el('button', { type: 'submit', className: 'btn btn--secondary', text: 'Save and add another', onclick: function () { addAnother = true; } });
    frame.form.appendChild(formActions([saveButton, saveNewButton], ctx.backHref));

    function drawSpecific() {
      G12.clear(specific);
      if (state.type === 'short') {
        specific.appendChild(el('legend', { text: 'Answer' }));
        var model = textField({
          id: 'f-model-answer', label: 'Model answer', required: true, multiline: true, rows: 4, value: state.modelAnswer,
          hint: 'Students compare their own answer with this after submitting. Written answers are not scored automatically.'
        });
        bind(model.control, state, 'modelAnswer');
        specific.appendChild(model.row);
        return;
      }
      specific.appendChild(el('legend', { text: 'Answer options' }));
      specific.appendChild(el('p', { className: 'hint', text: 'Write ' + Schema.MIN_OPTIONS + ' to ' + Schema.MAX_OPTIONS + ' options and mark the correct one. Empty options are ignored.' }));
      var list = el('ol', { className: 'option-editor-list' });
      state.options.forEach(function (option, index) {
        var letter = LETTERS.charAt(index);
        var input = el('input', { type: 'text', id: 'f-option-' + index, dir: 'auto', autocomplete: 'off' });
        input.value = option;
        input.addEventListener('input', function () { state.options[index] = input.value; });
        var radio = el('input', { type: 'radio', name: 'f-correct', id: 'f-correct-' + index, checked: state.answerIndex === index });
        radio.addEventListener('change', function () { if (radio.checked) state.answerIndex = index; });
        list.appendChild(el('li', { className: 'option-editor' }, [
          el('label', { className: 'opt-label', for: 'f-option-' + index, text: 'Option ' + letter }),
          input,
          el('label', { className: 'correct-choice', for: 'f-correct-' + index }, [
            radio, 'Correct answer', el('span', { className: 'visually-hidden', text: ' (option ' + letter + ')' })
          ]),
          smallButton('Remove', 'Remove option ' + letter, function () { removeOption(index); }, { danger: true, disabled: state.options.length <= Schema.MIN_OPTIONS })
        ]));
      });
      specific.appendChild(list);
      var add = el('button', {
        type: 'button', className: 'btn btn--secondary btn--small', text: 'Add option',
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
      if (!promptText) errors.push({ field: 'f-prompt', message: 'Write the question.' });

      var item = { id: isNew ? Schema.nextNumberedId('q', otherIds) : q.id, type: state.type };
      if (topic && hasText(topic.control.value)) item.topic = topic.control.value;
      item.prompt = promptText;

      if (state.type === 'mcq') {
        var filled = [];
        state.options.forEach(function (text, index) {
          if (hasText(text)) filled.push({ text: text.trim(), index: index });
        });
        if (filled.length < Schema.MIN_OPTIONS) {
          var firstEmpty = state.options.findIndex(function (text) { return !hasText(text); });
          errors.push({ field: 'f-option-' + Math.max(firstEmpty, 0), message: 'Write at least ' + Schema.MIN_OPTIONS + ' answer options.' });
        }
        var seen = {};
        filled.forEach(function (option) {
          if (seen[option.text]) errors.push({ field: 'f-option-' + option.index, message: 'Option ' + LETTERS.charAt(option.index) + ' is the same as another option.' });
          seen[option.text] = true;
        });
        if (state.answerIndex === -1) {
          errors.push({ field: 'f-correct-0', message: 'Mark which option is the correct answer.' });
        } else if (!hasText(state.options[state.answerIndex])) {
          errors.push({ field: 'f-option-' + state.answerIndex, message: 'The option marked as the correct answer is empty.' });
        }
        item.options = filled.map(function (option) { return option.text; });
        item.answer = state.answerIndex === -1 ? '' : String(state.options[state.answerIndex] || '').trim();
      } else {
        if (!hasText(state.modelAnswer)) errors.push({ field: 'f-model-answer', message: 'Write a model answer.' });
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
      if (ctx.mode === 'grammar') lastQuestionTopic = item.topic || '';
      ctx.save(item, isNew ? null : q.id);
      go(addAnother ? ctx.newHref : ctx.doneHref);
    });
  }

  /* ----- Reading passage ----- */

  function passageEditor(passage) {
    var isNew = !passage;
    var otherIds = library.passages.map(function (p) { return p.id; }).filter(function (id) { return !passage || id !== passage.id; });
    var frame = editorFrame(isNew ? 'Add a reading passage' : 'Edit passage: ' + (passage.title || passage.id), '#passages', 'Back to reading passages');
    var names = titleAndId(passage, otherIds,
      'Used in the passage’s web address (reading.html?passage=your-id). Lowercase English letters, numbers and hyphens. Filled in from the title automatically.',
      'passage');
    var level = textField({ id: 'f-level', label: 'Level', optional: true, value: passage && passage.level, hint: 'For example: Grade 12, or Unit 3.' });
    var source = textField({
      id: 'f-source', label: 'Source or credit', optional: true, value: passage && passage.source,
      hint: 'Where the text comes from. Only publish texts you wrote yourself or have permission to use.'
    });
    var reviewed = checkboxField({
      id: 'f-reviewed', label: 'A teacher has reviewed this passage',
      checked: passage && passage.reviewStatus === 'reviewed',
      hint: 'Each question has its own review tick as well.'
    });
    var text = textField({
      id: 'f-text', label: 'Passage text', required: true, multiline: true, rows: 14,
      value: passage && Array.isArray(passage.paragraphs) ? passage.paragraphs.join('\n\n') : '',
      hint: 'Leave an empty line between paragraphs. Paragraphs are numbered on the website.'
    });
    var count = el('p', { className: 'word-count', id: 'f-text-count' });
    function updateCount() {
      var paragraphs = Schema.splitParagraphs(text.control.value);
      count.textContent = G12.plural(paragraphs.length, 'paragraph') + ' · ' + G12.plural(G12.wordCount(paragraphs), 'word');
    }
    text.control.addEventListener('input', updateCount);
    updateCount();
    text.row.appendChild(count);

    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: 'Passage details' })].concat(names.rows, [level.row, source.row, reviewed.row])));
    frame.form.appendChild(el('fieldset', { className: 'editor-block' }, [el('legend', { text: 'Text' }), text.row]));
    frame.form.appendChild(formActions([el('button', { type: 'submit', className: 'btn', text: isNew ? 'Save passage' : 'Save changes' })], '#passages'));

    frame.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var errors = [];
      var base = names.read(errors);
      var paragraphs = Schema.splitParagraphs(text.control.value);
      if (!paragraphs.length) errors.push({ field: 'f-text', message: 'Write or paste the passage text.' });
      var item = { id: base.id, title: base.title };
      if (hasText(level.control.value)) item.level = level.control.value.trim();
      if (hasText(source.control.value)) item.source = source.control.value.trim();
      item.reviewStatus = reviewStatusOf(reviewed.control);
      item.paragraphs = paragraphs;
      item.questions = passage && Array.isArray(passage.questions) ? Schema.clone(passage.questions) : [];
      if (!errors.length) errors = schemaErrors('passages', item);
      if (errors.length) {
        showErrors(frame, errors);
        return;
      }
      commit(Store.saveItem(library, 'passages', item, isNew ? null : passage.id),
        isNew ? 'Passage “' + item.title + '” saved. You can now add questions to it below.' : 'Passage “' + item.title + '” saved.');
      go(isNew ? 'passages/edit/' + encodeURIComponent(item.id) : 'passages');
    });

    /* Questions belong to a saved passage, so they are managed below the form. */
    var section = el('section', { className: 'editor-block', 'aria-labelledby': 'passage-questions-heading' });
    ui.view.appendChild(section);
    if (isNew) {
      section.appendChild(el('h3', { id: 'passage-questions-heading', text: 'Questions' }));
      section.appendChild(el('p', { text: 'Save the passage first. Then you can add questions to it here.' }));
      return;
    }
    var questions = Array.isArray(passage.questions) ? passage.questions : [];
    var base = 'passages/edit/' + encodeURIComponent(passage.id);
    section.appendChild(el('div', { className: 'view-header' }, [
      el('h3', { id: 'passage-questions-heading', text: 'Questions about this passage (' + questions.length + ')' }),
      el('a', { className: 'btn', href: '#' + base + '/questions/new', text: 'Add a question' })
    ]));
    if (!questions.length) {
      section.appendChild(el('p', { text: 'No questions yet. Students will see the passage without questions until you add some.' }));
      return;
    }

    function updateQuestions(change, message) {
      if (dirty && !window.confirm('You have unsaved changes to the passage above. Continue and lose those changes?')) return false;
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
        var meta = [item.type === 'short' ? 'Short answer' : 'Multiple choice'];
        if (item.type === 'mcq' && hasText(item.answer)) meta.push('Answer: ' + item.answer);
        meta.push('ID: ' + item.id);
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
        if (!window.confirm('Delete this question?\n\n“' + String(item.prompt || item.id).slice(0, 100) + '”\n\nThis cannot be undone.')) return;
        if (updateQuestions(function (list) {
          var at = list.findIndex(function (q) { return q.id === item.id; });
          if (at !== -1) list.splice(at, 1);
        }, 'Question deleted.')) {
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

  function reportList(messages) {
    return el('ul', { className: 'report-list' }, messages.map(function (message) {
      return el('li', { dir: 'auto', text: message });
    }));
  }

  function renderTools() {
    ui.view.appendChild(el('h2', { tabindex: '-1', text: 'Import & export' }));
    var check = Schema.validateLibrary(library);

    /* Publish */
    var publishButtons = Schema.COLLECTION_KEYS.map(function (key) {
      var info = Schema.COLLECTIONS[key];
      return el('button', {
        type: 'button',
        className: 'btn btn--secondary',
        text: 'Download ' + info.fileName + ' (' + library[key].length + ')',
        onclick: function () {
          downloadCollection(key);
          showMessage('Downloaded ' + info.fileName + '.');
        }
      });
    });
    publishButtons.unshift(el('button', {
      type: 'button',
      className: 'btn',
      text: 'Download all four files',
      onclick: function () {
        Schema.COLLECTION_KEYS.forEach(function (key, i) {
          setTimeout(function () { downloadCollection(key); }, i * 400);
        });
        showMessage('Downloading the four data files. If your browser asks, allow it to download multiple files.');
      }
    }));
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'publish-heading' }, [
      el('h3', { id: 'publish-heading', text: 'Publish your changes' }),
      el('ol', { className: 'steps' }, [
        el('li', { text: 'Download the four data files below.' }),
        el('li', { text: 'In your GitHub repository, open the data folder, choose “Add file” → “Upload files”, and upload the files to replace the old ones. Then choose “Commit changes”.' }),
        el('li', { text: 'GitHub Pages updates the website, usually within a few minutes. Reload the website to check.' })
      ]),
      check.errors.length ? el('div', { className: 'notice notice--error', role: 'note' }, [
        el('p', { text: 'Some content has errors (see “Check content” below). Items with errors are not shown to students until they are fixed.' })
      ]) : null,
      el('div', { className: 'actions' }, publishButtons)
    ]));

    /* Check */
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'check-heading' }, [
      el('h3', { id: 'check-heading', text: 'Check content' }),
      el('p', {
        text: library.lessons.length + ' lessons, ' + library.summaries.length + ' summaries, ' + library.questions.length +
          ' grammar questions and ' + library.passages.length + ' reading passages.'
      }),
      check.errors.length
        ? el('div', null, [el('p', null, [el('strong', { text: G12.plural(check.errors.length, 'error') + ' found:' })]), reportList(check.errors)])
        : el('p', { text: 'No errors found.' }),
      check.warnings.length
        ? el('div', null, [el('p', null, [el('strong', { text: G12.plural(check.warnings.length, 'warning') + ' (the content still works):' })]), reportList(check.warnings)])
        : null
    ]));

    /* Backup */
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'backup-heading' }, [
      el('h3', { id: 'backup-heading', text: 'Backup' }),
      el('p', { text: 'Download all your content as one file. Keep it somewhere safe, or use it to move your draft to another computer (import it there).' }),
      el('div', { className: 'actions' }, [el('button', {
        type: 'button',
        className: 'btn btn--secondary',
        text: 'Download backup file',
        onclick: function () {
          var date = new Date().toISOString().slice(0, 10);
          download('grade12-english-backup-' + date + '.json', Schema.toJSON(Store.backupData(library)));
          showMessage('Backup downloaded.');
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
        el('label', { for: 'import-files', text: 'Files to import' }),
        el('p', {
          className: 'hint', id: 'import-files-hint',
          text: 'Choose one or more .json files: the website’s data files (such as grammar-questions.json) or a backup file.'
        }),
        fileInput
      ]),
      el('fieldset', { className: 'form-row' }, [
        el('legend', { text: 'How to import' }),
        el('div', { className: 'checkbox-row' }, [el('label', { for: 'import-merge' }, [modeMerge, 'Merge: add new items and update items with the same ID (recommended)'])]),
        el('div', { className: 'checkbox-row' }, [el('label', { for: 'import-replace' }, [modeReplace, 'Replace: remove the existing items of each imported type first'])])
      ]),
      el('div', { className: 'actions' }, [el('button', { type: 'submit', className: 'btn', text: 'Import' })]),
      result
    ]);
    importForm.addEventListener('submit', function (event) {
      event.preventDefault();
      runImport(Array.prototype.slice.call(fileInput.files || []), modeReplace.checked ? 'replace' : 'merge', result);
    });
    ui.view.appendChild(el('section', { className: 'tool-section', 'aria-labelledby': 'import-heading' }, [
      el('h3', { id: 'import-heading', text: 'Import' }),
      el('p', { text: 'Imported files are checked first. If anything is wrong, nothing is changed.' }),
      importForm
    ]));
    if (importReport) {
      result.appendChild(importReport);
      importReport = null;
    }

    /* Discard */
    var discard = el('section', { className: 'tool-section', 'aria-labelledby': 'discard-heading' }, [
      el('h3', { id: 'discard-heading', text: 'Discard my draft' })
    ]);
    if (changed() && storage) {
      discard.appendChild(el('p', { text: 'Delete all unpublished changes in this browser and go back to the published files. Download a backup first if you might need your changes later.' }));
      discard.appendChild(el('div', { className: 'actions' }, [el('button', {
        type: 'button',
        className: 'btn btn--danger',
        text: 'Discard my draft',
        onclick: function () {
          if (!window.confirm('Discard all unpublished changes in this browser and reload the published files?\n\nThis cannot be undone.')) return;
          Store.clearDraft(storage);
          library = Store.normalizeLibrary(published);
          baseline = publishedFingerprint;
          savedAt = null;
          renderStatus();
          flash = { text: 'Draft discarded. You are now working from the published files.' };
          go('tools');
        }
      })]));
    } else {
      discard.appendChild(el('p', { text: 'There are no unpublished changes to discard.' }));
    }
    ui.view.appendChild(discard);
  }

  function runImport(files, mode, result) {
    G12.clear(result);
    if (!files.length) {
      result.appendChild(el('div', { className: 'error-summary', role: 'alert' }, [el('p', { text: 'Choose one or more .json files first.' })]));
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
          problems.push(file.name + ': is not valid JSON (' + error.message + ').');
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
          el('h4', { text: 'Nothing was imported. Please fix these problems in the file and try again:' }),
          reportList(problems)
        ]));
        G12.focus(result.firstChild);
        return;
      }

      var keys = Object.keys(applied.summary);
      if (mode === 'replace') {
        var affected = keys.filter(function (key) { return library[key].length > 0; }).map(function (key) {
          return TYPES[key].title + ' (' + G12.plural(library[key].length, 'item') + ')';
        });
        if (affected.length && !window.confirm('Replace your current ' + affected.join(', ') + ' with the imported content?\n\nThis cannot be undone.')) {
          return;
        }
      }

      var lines = keys.map(function (key) {
        var stats = applied.summary[key];
        if (mode === 'replace') return TYPES[key].title + ': replaced (' + stats.removed + ' removed, ' + stats.added + ' imported).';
        return TYPES[key].title + ': ' + stats.added + ' added, ' + stats.updated + ' updated.';
      });
      importReport = el('div', { className: 'notice notice--info', role: 'status' }, [
        el('p', null, [el('strong', { text: 'Import complete. ' }), 'Your draft has been updated. Remember to publish it.']),
        reportList(lines),
        warnings.length ? el('p', { text: 'Warnings (the content still works):' }) : null,
        warnings.length ? reportList(warnings) : null
      ]);
      commit(applied.library, 'Import complete.');
      afterRender = function () { G12.focus(document.getElementById('import-result')); };
      go('tools');
    }).catch(function (error) {
      result.appendChild(el('div', { className: 'error-summary', role: 'alert' }, [el('p', { text: 'The file could not be read: ' + error.message })]));
    });
  }
})();
