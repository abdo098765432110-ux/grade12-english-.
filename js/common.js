/* ==========================================================================
   Shared helpers used by every page.
   Everything lives on one global object, window.G12, so pages can share code
   without a build step or modules.
   All content from JSON is inserted with textContent (never innerHTML), so
   text in the data files can never inject HTML or scripts into the page.
   ========================================================================== */
(function (global) {
  'use strict';

  var G12 = global.G12 || (global.G12 = {});

  G12.SITE_NAME = 'Grade 12 English';
  G12.MANAGER_PAGE = 'manage.html';

  /* ---------- Data loading ----------
     All paths are relative (no leading slash), so the site also works inside
     a GitHub Pages repository subfolder such as https://user.github.io/repo/ */

  G12.loadJSON = function (path) {
    return fetch(path, { cache: 'no-cache' }).then(
      function (response) {
        if (!response.ok) {
          throw new Error('Could not load "' + path + '" (HTTP ' + response.status + ').');
        }
        return response.json().catch(function () {
          throw new Error('The file "' + path + '" contains invalid JSON. Check it with the content validator.');
        });
      },
      function () {
        var hint = global.location && global.location.protocol === 'file:'
          ? ' Pages opened directly from your computer (file://) cannot load data files. Use GitHub Pages or a local web server instead (see README.md).'
          : ' Check your internet connection and try again.';
        throw new Error('Could not load "' + path + '".' + hint);
      }
    );
  };

  /**
   * Loads the content collections a page needs, e.g. ['lessons', 'questions'].
   * Resolves to { lessons: [...], questions: [...], skipped: <number> }.
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
      if (draft) return draft.library[key];
      var path = Schema.COLLECTIONS[key].path;
      return G12.loadJSON(path).then(function (data) {
        if (!data || !Array.isArray(data[key])) {
          throw new Error('The file "' + path + '" must contain a "' + key + '" list. Check it with the content validator.');
        }
        return data[key];
      });
    })).then(function (lists) {
      var content = { skipped: 0 };
      keys.forEach(function (key, i) {
        var usable = Schema.usableItems(key, lists[i]);
        content[key] = usable.items;
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
        G12.el('strong', { text: 'Preview mode. ' }),
        'You are seeing the unpublished draft saved in this browser. Students do not see these changes until you export the files and upload them.'
      ]),
      G12.el('div', { className: 'actions' }, [
        G12.el('a', { className: 'btn btn--secondary', href: G12.MANAGER_PAGE, text: 'Open content manager' }),
        G12.el('button', {
          type: 'button',
          className: 'btn btn--secondary',
          text: 'Stop preview',
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

  G12.setTitle = function (text) {
    document.title = text ? text + ' — ' + G12.SITE_NAME : G12.SITE_NAME;
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
        fragment.appendChild(G12.el('span', { className: 'visually-hidden', text: ' blank ' }));
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
    var list = G12.el('ul', { className: 'badges', 'aria-label': 'Labels' });
    (extra || []).forEach(function (label) {
      if (label) list.appendChild(G12.el('li', { className: 'badge', text: label }));
    });
    if (G12.isReviewed(item)) {
      list.appendChild(G12.el('li', { className: 'badge badge--reviewed', text: 'Teacher-reviewed' }));
    } else {
      list.appendChild(G12.el('li', { className: 'badge badge--unreviewed', text: 'Not yet reviewed' }));
    }
    return list;
  };

  /**
   * Returns a notice if any of the given items has not been reviewed by a
   * teacher, or null when all of them have been reviewed.
   */
  G12.reviewNotice = function (items, what) {
    items = Array.isArray(items) ? items : [items];
    var hasUnreviewed = items.some(function (item) { return !G12.isReviewed(item); });
    if (!hasUnreviewed) return null;
    return G12.el('div', { className: 'notice notice--demo', role: 'note' }, [
      G12.el('p', null, [
        G12.el('strong', { text: 'Not yet reviewed: ' }),
        'a teacher has not checked this ' + what + ' yet, so treat any answers and explanations as suggestions, not final answers.'
      ])
    ]);
  };

  /* Notice for list pages where some items may not be reviewed yet. */
  G12.listReviewNotice = function (items) {
    var hasUnreviewed = (items || []).some(function (item) { return !G12.isReviewed(item); });
    if (!hasUnreviewed) return null;
    return G12.el('div', { className: 'notice notice--demo', role: 'note' }, [
      G12.el('p', null, [
        G12.el('strong', { text: 'Please note: ' }),
        'items labelled “Not yet reviewed” have not been checked by a teacher yet, so treat their answers and explanations as suggestions, not final answers.'
      ])
    ]);
  };

  /* Notice shown when some items in a data file were broken and left out. */
  G12.skippedNotice = function (count) {
    if (!count) return null;
    return G12.el('div', { className: 'notice notice--demo', role: 'note' }, [
      G12.el('p', null, [
        G12.plural(count, 'item') + ' could not be shown because ' + (count === 1 ? 'it is' : 'they are') +
        ' incomplete or ' + (count === 1 ? 'contains' : 'contain') + ' errors. A teacher can fix this in the ',
        G12.el('a', { href: G12.MANAGER_PAGE + '#tools', text: 'content manager' }),
        '.'
      ])
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

  /* ---------- Status messages ---------- */

  G12.showLoading = function (container, message) {
    G12.clear(container).appendChild(
      G12.el('p', { className: 'loading', role: 'status', text: message || 'Loading…' })
    );
  };

  G12.showError = function (container, error) {
    var message = error && error.message ? error.message : String(error);
    G12.clear(container).appendChild(
      G12.el('div', { className: 'notice notice--error', role: 'alert' }, [
        G12.el('p', null, [G12.el('strong', { text: 'Something went wrong. ' }), message])
      ])
    );
    if (global.console) console.error(error);
  };

  /* ---------- Small utilities ---------- */

  G12.wordCount = function (paragraphs) {
    return (paragraphs || []).join(' ').split(/\s+/).filter(Boolean).length;
  };

  G12.plural = function (count, word, pluralWord) {
    return count + ' ' + (count === 1 ? word : (pluralWord || word + 's'));
  };

  G12.byId = function (list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  };
})(window);
