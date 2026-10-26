/* ==========================================================================
   Interface language: English (default) or Arabic.

   - Only the website's own interface text is translated: menus, buttons,
     headings, labels, messages. Educational content (lessons, questions,
     options, explanations, passages) is always shown exactly as written.
   - The choice is saved in this browser (localStorage, key "g12-lang") and
     applies to every page. Nothing else is stored.
   - English text is the key: G12.t('Grammar Lessons') returns the Arabic
     text from js/i18n-ar.js when Arabic is chosen, or the English text.
     Placeholders: G12.t('Question {n} of {total}', { n: 1, total: 5 }).
   - Fixed text in the HTML is marked with data-i18n="English text";
     aria-label text with data-i18n-aria="English text".
   ========================================================================== */
(function (global) {
  'use strict';

  var G12 = global.G12 || (global.G12 = {});
  var STORAGE_KEY = 'g12-lang';
  var LANGUAGES = ['en', 'ar'];

  function savedLanguage() {
    try {
      var value = global.localStorage.getItem(STORAGE_KEY);
      return LANGUAGES.indexOf(value) !== -1 ? value : null;
    } catch (error) {
      return null;
    }
  }

  G12.LANG_STORAGE_KEY = STORAGE_KEY;
  G12.lang = savedLanguage() || 'en';
  G12.dir = G12.lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = G12.lang;
  document.documentElement.dir = G12.dir;

  function format(text, params) {
    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, function (match, name) {
      return params[name] !== undefined && params[name] !== null ? String(params[name]) : match;
    });
  }
  G12.format = format;

  function dictionary() {
    return G12.lang === 'ar' && G12.I18N_AR ? G12.I18N_AR : null;
  }

  /* Translate interface text. Unknown text is shown in English. */
  G12.t = function (text, params) {
    var dict = dictionary();
    var translated = dict ? dict.strings[text] : undefined;
    if (dict && translated === undefined && global.console) console.warn('[i18n] No Arabic text for: ' + text);
    return format(translated !== undefined ? translated : text, params);
  };

  /**
   * Translate text that contains other elements, such as a link:
   *   G12.tNodes('Fix this in the {link}.', null, { link: someLinkElement })
   * Returns a list of strings and elements for G12.el(...) children.
   */
  G12.tNodes = function (text, params, nodes) {
    var translated = G12.t(text, params);
    var parts = [];
    var pattern = /\{(\w+)\}/g;
    var last = 0;
    var match;
    while ((match = pattern.exec(translated))) {
      if (nodes && nodes[match[1]]) {
        parts.push(translated.slice(last, match.index), nodes[match[1]]);
        last = pattern.lastIndex;
      }
    }
    parts.push(translated.slice(last));
    return parts.filter(function (part) { return part !== ''; });
  };

  /* Arabic plural categories (zero, one, two, few, many, other). */
  function arabicCategory(n) {
    n = Math.abs(n);
    if (n === 0) return 'zero';
    if (n === 1) return 'one';
    if (n === 2) return 'two';
    var rest = n % 100;
    if (rest >= 3 && rest <= 10) return 'few';
    if (rest >= 11 && rest <= 99) return 'many';
    return 'other';
  }
  G12.arabicCategory = arabicCategory;

  /**
   * A number with a counted word: G12.plural(3, 'question') → "3 questions",
   * or the correct Arabic form. pluralWord is the English plural when it is
   * not word + "s" (e.g. 'summary', 'summaries').
   */
  G12.plural = function (count, word, pluralWord) {
    var dict = dictionary();
    var forms = dict && dict.nouns[word];
    if (forms) {
      var form = forms[arabicCategory(count)] || forms.other;
      return format(form, { n: count });
    }
    if (dict && global.console) console.warn('[i18n] No Arabic word for: ' + word);
    return count + ' ' + (count === 1 ? word : (pluralWord || word + 's'));
  };

  /* Dates and times in the interface language (digits stay 0–9). */
  G12.formatDateTime = function (iso) {
    try {
      return new Date(iso).toLocaleString(G12.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (error) {
      return iso;
    }
  };

  /* Translate the fixed text marked in the HTML. Safe to call more than once. */
  G12.translatePage = function (root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (node) {
      node.textContent = G12.t(node.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-aria]'), function (node) {
      node.setAttribute('aria-label', G12.t(node.getAttribute('data-i18n-aria')));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-content]'), function (node) {
      node.setAttribute('content', G12.t(node.getAttribute('data-i18n-content')));
    });
  };

  /* Switch language: save the choice and reload, so every part of the page
     (including content loaded from the data files) is drawn again. */
  G12.setLanguage = function (lang) {
    if (LANGUAGES.indexOf(lang) === -1) return;
    try {
      global.localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      // Private browsing may block saving: switch for this visit only.
      G12.lang = lang;
    }
    global.location.reload();
  };

  /* The button in the header shows the language you can switch to. */
  G12.setupLanguageToggle = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.lang-toggle'), function (button) {
      var other = G12.lang === 'ar' ? 'en' : 'ar';
      button.textContent = other === 'ar' ? 'العربية' : 'English';
      button.setAttribute('lang', other);
      button.setAttribute('aria-label', other === 'ar' ? 'العربية — عرض الموقع باللغة العربية' : 'English — show the website in English');
      button.hidden = false;
      if (!button.getAttribute('data-ready')) {
        button.setAttribute('data-ready', '1');
        button.addEventListener('click', function () { G12.setLanguage(other); });
      }
    });
  };

  function ready() {
    G12.translatePage(document);
    G12.setupLanguageToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})(window);
