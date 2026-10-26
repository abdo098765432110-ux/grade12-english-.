/* ==========================================================================
   Shared helpers used by every page.
   Everything lives on one global object, window.G12, so pages can share code
   without a build step or modules.
   All content from JSON is inserted with textContent (never innerHTML), so
   text in the data files can never inject HTML or scripts into the page.
   Interface text goes through G12.t() (js/i18n.js) so it can be shown in
   English or Arabic. Content from the data files is never translated.
   ========================================================================== */
(function (global) {
  'use strict';

  var G12 = global.G12 || (global.G12 = {});
  var t = G12.t;

  G12.SITE_NAME = 'Grade 12 English';
  G12.MANAGER_PAGE = 'manage.html';
  G12.SLOW_NOTICE_MS = 8000;   // show "still loading" after this long
  G12.LOAD_TIMEOUT_MS = 30000; // give up on a data file after this long

  /* ---------- Data loading ----------
     All paths are relative (no leading slash), so the site also works inside
     a GitHub Pages repository subfolder such as https://user.github.io/repo/ */

  G12.loadJSON = function (path) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, G12.LOAD_TIMEOUT_MS) : null;
    var options = { cache: 'no-cache' };
    if (controller) options.signal = controller.signal;

    return fetch(path, options).then(
      function (response) {
        clearTimeout(timer);
        if (!response.ok) {
          var failure = new Error(response.status === 404
            ? t('The file "{path}" was not found (HTTP 404).', { path: path })
            : t('Could not load "{path}" (HTTP {status}).', { path: path, status: response.status }));
          failure.status = response.status;
          throw failure;
        }
        return response.json().catch(function (error) {
          if (error && error.name === 'SyntaxError') {
            throw new Error(t('The file "{path}" contains invalid JSON. Check it with the content validator.', { path: path }));
          }
          throw new Error(t('The file "{path}" could not be downloaded completely. Check your internet connection and try again.', { path: path }));
        });
      },
      function (error) {
        clearTimeout(timer);
        if (error && error.name === 'AbortError') {
          throw new Error(t('Could not load "{path}". It took too long to load. Check your internet connection and try again.', { path: path }));
        }
        if (global.location && global.location.protocol === 'file:') {
          throw new Error(t('Could not load "{path}". Pages opened directly from your computer (file://) cannot load data files. Use GitHub Pages or a local web server instead (see README.md).', { path: path }));
        }
        throw new Error(t('Could not load "{path}". Check your internet connection and try again.', { path: path }));
      }
    );
  };

  /**
   * Loads one data file and returns its list (old field names upgraded).
   * data/units.json is optional: if it is missing, there are simply no units
   * (so a site uploaded before units existed keeps working).
   */
  G12.loadCollection = function (key) {
    var Schema = G12.Schema;
    var path = Schema.COLLECTIONS[key].path;
    return G12.loadJSON(path).then(function (data) {
      if (!data || !Array.isArray(data[key])) {
        throw new Error(t('The file "{path}" must contain a "{key}" list. Check it with the content validator.', { path: path, key: key }));
      }
      return Schema.upgradeCollection(key, data[key]);
    }, function (error) {
      if (key === 'units' && error.status === 404) {
        console.warn('data/units.json was not found, so no units are shown.');
        return [];
      }
      throw error;
    });
  };

  /**
   * Loads the content collections a page needs, e.g. ['units', 'lessons'].
   * Resolves to { units: [...], lessons: [...], skipped: <number> }.
   * Broken items are left out and counted in "skipped".
   * In preview mode (switched on in the content manager) the browser draft
   * is used instead of the published files.
   */
  G12.loadContent = function (keys) {
    var Schema = G12.Schema;
    var Store = G12.Store;
    var storage = Store.browserStorage();
    var draft = Store.isPreviewOn(storage) ? Store.loadDraft(storage) : null;
    G12.previewing = Boolean(draft);
    if (draft) showPreviewBanner(storage);

    return Promise.all(keys.map(function (key) {
      return draft ? draft.library[key] : G12.loadCollection(key);
    })).then(function (lists) {
      var content = { skipped: 0, skippedBy: {} };
      keys.forEach(function (key, i) {
        var usable = Schema.usableItems(key, lists[i]);
        content[key] = usable.items;
        content.skippedBy[key] = usable.skipped + usable.skippedQuestions;
        content.skipped += usable.skipped + usable.skippedQuestions;
        if (usable.skipped || usable.skippedQuestions) {
          console.warn(key + ': skipped ' + usable.skipped + ' item(s) and ' + usable.skippedQuestions + ' passage question(s) with errors.');
        }
      });
      return content;
    });
  };

  function showPreviewBanner(storage) {
    var main = document.getElementById('main');
    if (!main || document.getElementById('preview-banner')) return;
    var banner = G12.el('div', { id: 'preview-banner', className: 'notice notice--info', role: 'note' }, [
      G12.el('p', null, [
        G12.el('strong', { text: t('Preview mode.') + ' ' }),
        t('You are seeing the unpublished draft saved in this browser. Students do not see these changes until you export the files and upload them.')
      ]),
      G12.el('div', { className: 'actions' }, [
        G12.el('a', { className: 'btn btn--secondary', href: G12.MANAGER_PAGE, text: t('Open content manager') }),
        G12.el('button', {
          type: 'button',
          className: 'btn btn--secondary',
          text: t('Stop preview'),
          onclick: function () {
            G12.Store.setPreview(storage, false);
            global.location.reload();
          }
        })
      ])
    ]);
    main.insertBefore(banner, main.firstChild);
  }

  /* ---------- DOM helpers ---------- */

  function appendChildren(node, children) {
    if (children === undefined || children === null || children === false) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (child) {
      if (child === undefined || child === null || child === false) return;
      if (Array.isArray(child)) {
        appendChildren(node, child);
      } else if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    });
  }

  /**
   * Create an element.
   *   G12.el('a', { href: 'x.html', className: 'btn', text: 'Go' })
   *   G12.el('ul', null, [G12.el('li', { text: 'one' })])
   * Keys starting with "on" and holding a function become event listeners.
   */
  G12.el = function (tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'className') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, String(value));
        }
      });
    }
    appendChildren(node, children);
    return node;
  };

  G12.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  G12.param = function (name) {
    return new URLSearchParams(global.location.search).get(name);
  };

  /* Page title in the browser tab: "<text> — Grade 12 English" (translated). */
  G12.setTitle = function (text) {
    var site = t(G12.SITE_NAME);
    document.title = text ? text + ' — ' + site : site;
  };

  /* Move keyboard and screen-reader focus to an element (e.g. a new heading). */
  G12.focus = function (node) {
    if (!node) return;
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
    node.focus();
  };

  /**
   * Render prompt text, turning blanks written as "___" (3+ underscores)
   * into a visible line that screen readers announce as "blank".
   */
  G12.renderPrompt = function (text) {
    var fragment = document.createDocumentFragment();
    String(text).split(/_{3,}/).forEach(function (part, index) {
      if (index > 0) {
        fragment.appendChild(G12.el('span', { className: 'blank', 'aria-hidden': 'true' }));
        fragment.appendChild(G12.el('span', { className: 'visually-hidden', text: ' ' + t('blank') + ' ' }));
      }
      fragment.appendChild(document.createTextNode(part));
    });
    return fragment;
  };

  /* ---------- Review status ---------- */

  /* Only items explicitly marked "reviewed" are treated as checked by a teacher. */
  G12.isReviewed = function (item) {
    return Boolean(item) && item.reviewStatus === 'reviewed';
  };

  G12.badges = function (item, extra) {
    var list = G12.el('ul', { className: 'badges', 'aria-label': t('Labels') });
    (extra || []).forEach(function (label) {
      if (label) list.appendChild(G12.el('li', { className: 'badge', dir: 'auto', text: label }));
    });
    if (G12.isReviewed(item)) {
      list.appendChild(G12.el('li', { className: 'badge badge--reviewed', text: t('Teacher-reviewed') }));
    } else {
      list.appendChild(G12.el('li', { className: 'badge badge--unreviewed', text: t('Not yet reviewed') }));
    }
    return list;
  };

  /**
   * Returns a notice if any of the given items has not been reviewed by a
   * teacher, or null when all of them have been reviewed.
   * kind: 'lesson' or 'passage'.
   */
  G12.reviewNotice = function (items, kind) {
    items = Array.isArray(items) ? items : [items];
    var hasUnreviewed = items.some(function (item) { return !G12.isReviewed(item); });
    if (!hasUnreviewed) return null;
    var text = kind === 'passage'
      ? t('a teacher has not checked this passage and its questions yet, so treat any answers and explanations as suggestions, not final answers.')
      : t('a teacher has not checked this lesson yet, so treat any answers and explanations as suggestions, not final answers.');
    return G12.el('div', { className: 'notice notice--demo', role: 'note' }, [
      G12.el('p', null, [G12.el('strong', { text: t('Not yet reviewed:') + ' ' }), text])
    ]);
  };

  /* Notice for list pages where some items may not be reviewed yet. */
  G12.listReviewNotice = function (items) {
    var hasUnreviewed = (items || []).some(function (item) { return !G12.isReviewed(item); });
    if (!hasUnreviewed) return null;
    return G12.el('div', { className: 'notice notice--demo', role: 'note' }, [
      G12.el('p', null, [
        G12.el('strong', { text: t('Please note:') + ' ' }),
        t('items labelled “Not yet reviewed” have not been checked by a teacher yet, so treat their answers and explanations as suggestions, not final answers.')
      ])
    ]);
  };

  /* Notice shown when some items in a data file were broken and left out.
     Pass a number, or the loaded content plus the collections the page shows:
       G12.skippedNotice(content, ['units', 'lessons']) */
  G12.skippedNotice = function (count, keys) {
    if (count && typeof count === 'object') {
      var byKey = count.skippedBy || {};
      count = (keys || Object.keys(byKey)).reduce(function (sum, key) { return sum + (byKey[key] || 0); }, 0);
    }
    if (!count) return null;
    var link = G12.el('a', { href: G12.MANAGER_PAGE + '#tools', text: t('content manager') });
    return G12.el('div', { className: 'notice notice--demo', role: 'note' }, [
      G12.el('p', null, G12.tNodes(count === 1
        ? '{items} could not be shown because it is incomplete or contains errors. A teacher can fix this in the {link}.'
        : '{items} could not be shown because they are incomplete or contain errors. A teacher can fix this in the {link}.',
      { items: G12.plural(count, 'item') }, { link: link }))
    ]);
  };

  /**
   * Friendly message for a section with no content yet.
   *   G12.emptyState('No lessons added yet', 'Explain…', [{ label, href }])
   */
  G12.emptyState = function (title, text, links, headingLevel) {
    return G12.el('div', { className: 'empty-state' }, [
      G12.el(headingLevel || 'h2', { text: title }),
      G12.el('p', { text: text }),
      G12.el('div', { className: 'actions' }, (links || []).map(function (link, i) {
        return G12.el('a', { className: i === 0 ? 'btn' : 'btn btn--secondary', href: link.href, text: link.label });
      }))
    ]);
  };

  /* ---------- Status messages ----------
     Loading:  every page starts with <p class="loading" role="status">Loading…</p>
               in its HTML, so something is shown before any script runs.
     Slow:     after SLOW_NOTICE_MS the loading text says it is taking longer.
     Error:    G12.showError replaces the page content with a heading, the
               reason, and "Try again" / "Go to the home page" buttons.
     Missing CSS/JS files are handled by the small inline script in each
     page's <head>, because shared scripts cannot report their own absence. */

  G12.watchSlowLoading = function () {
    setTimeout(function () {
      var loading = document.querySelector('#page-root .loading, #home-status .loading');
      if (loading) {
        loading.textContent = t('Still loading… This is taking longer than usual. Please check your internet connection.');
      }
    }, G12.SLOW_NOTICE_MS);
  };

  /**
   * Show a page-level error.
   *   G12.showError(container, error, { title: 'Grammar Lessons', homeLink: true })
   */
  G12.showError = function (container, error, options) {
    options = options || {};
    var message = error && error.message ? error.message : String(error);
    var actions = [G12.el('button', {
      type: 'button',
      className: 'btn',
      text: t('Try again'),
      onclick: function () { global.location.reload(); }
    })];
    if (options.homeLink !== false) {
      actions.push(G12.el('a', { className: 'btn btn--secondary', href: 'index.html', text: t('Go to the home page') }));
    }
    G12.clear(container);
    if (options.title) container.appendChild(G12.el('h1', { text: options.title }));
    container.appendChild(G12.el('div', { className: 'notice notice--error error-state', role: 'alert' }, [
      G12.el('h2', { text: t('This content could not be loaded') }),
      G12.el('p', { text: message }),
      G12.el('div', { className: 'actions' }, actions)
    ]));
    if (global.console) console.error(error);
  };

  /* ---------- Mobile menu ----------
     The menu button is hidden in the HTML. It is shown only when this script
     runs, so without JavaScript the full navigation stays visible. */

  G12.setupMenu = function () {
    var toggle = document.querySelector('.nav-toggle');
    var header = document.querySelector('.site-header');
    var nav = toggle ? document.getElementById(toggle.getAttribute('aria-controls')) : null;
    if (!toggle || !header || !nav) return;

    header.classList.add('has-menu');
    toggle.hidden = false;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      header.classList.toggle('menu-open', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
  };

  G12.setupMenu();
  G12.watchSlowLoading();
  if (G12.translatePage) G12.translatePage(document);

  /* ---------- Units ---------- */

  /* Link to a page filtered to one unit, e.g. grammar.html?unit=unit-1 */
  G12.unitHref = function (page, unitId) {
    return unitId ? page + '?unit=' + encodeURIComponent(unitId) : page;
  };

  /**
   * Row of links to filter a page by unit: "All units", then each unit.
   * counts (optional): { unitId: number } shown after each unit title.
   * Returns null when there are no units.
   */
  G12.unitNav = function (units, currentId, page, counts) {
    if (!units || !units.length) return null;
    var items = [G12.el('li', null, [G12.el('a', {
      href: page,
      'aria-current': currentId ? null : 'page',
      text: t('All units')
    })])];
    units.forEach(function (unit) {
      var count = counts && counts[unit.id] !== undefined ? counts[unit.id] : null;
      items.push(G12.el('li', null, [G12.el('a', {
        href: G12.unitHref(page, unit.id),
        'aria-current': currentId === unit.id ? 'page' : null,
        dir: 'auto'
      }, [unit.title, count === null ? null : G12.el('span', { className: 'unit-nav-count', text: ' (' + count + ')' })])]));
    });
    return G12.el('nav', { className: 'unit-nav', 'aria-label': t('Units') }, [G12.el('ul', null, items)]);
  };

  /* Count items per unit id (items without a unit are not counted). */
  G12.countByUnit = function (items, lessons) {
    var counts = {};
    (items || []).forEach(function (item) {
      var unitId = G12.Schema.unitIdOf(item, lessons);
      if (unitId) counts[unitId] = (counts[unitId] || 0) + 1;
    });
    return counts;
  };

  /* Message for a unit id in the address that does not exist.
     what: 'lessons', 'summaries' or 'passages'. */
  G12.unitNotFound = function (container, page, what) {
    var labels = {
      lessons: t('Show all lessons'),
      summaries: t('Show all summaries'),
      passages: t('Show all passages')
    };
    container.appendChild(G12.el('div', { className: 'empty-state' }, [
      G12.el('h2', { text: t('Unit not found') }),
      G12.el('p', { text: t('This unit does not exist or has been removed.') }),
      G12.el('div', { className: 'actions' }, [G12.el('a', { className: 'btn', href: page, text: labels[what] })])
    ]));
  };

  /* ---------- Small utilities ---------- */

  G12.wordCount = function (paragraphs) {
    return (paragraphs || []).join(' ').split(/\s+/).filter(Boolean).length;
  };

  G12.byId = function (list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  };
})(window);
