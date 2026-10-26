/* Helper for tests/i18n.test.js: finds every interface text that is
   translated, so the test can check that js/i18n-ar.js has all of them.

   Looks for:
   - t('…'), G12.t('…'), tr('…'), G12.tNodes('…') and tNodes('…') in js/*.js
     (every string in the first argument, so  t(a ? 'x' : 'y')  gives x and y);
   - G12.plural(n, 'word') and plural(n, 'word') (the counted words);
   - data-i18n="…" and data-i18n-aria="…" in the HTML pages.
   Not a full JavaScript parser, but enough for this project's code. */
'use strict';

const fs = require('fs');
const path = require('path');

const TRANSLATE = new Set(['t', 'tr', 'tNodes']);
const PLURAL = new Set(['plural']);

/* Splits JavaScript into tokens: strings, names, punctuation. Comments and
   regular expressions are skipped. */
function tokenize(source) {
  const tokens = [];
  let i = 0;
  let last = null;
  const regexAllowedAfter = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', 'return', 'typeof', '+', '-', '*', '%', '<', '>', '~', '^']);
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (source.startsWith('//', i)) { i = source.indexOf('\n', i); if (i === -1) break; continue; }
    if (source.startsWith('/*', i)) { i = source.indexOf('*/', i + 2) + 2; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') {
      let j = i + 1;
      let value = '';
      while (j < source.length && source[j] !== ch) {
        if (source[j] === '\\') {
          const next = source[j + 1];
          const map = { n: '\n', t: '\t', '\\': '\\', '\'': '\'', '"': '"', '`': '`' };
          if (next === 'u') {
            value += String.fromCharCode(parseInt(source.slice(j + 2, j + 6), 16));
            j += 6;
            continue;
          }
          value += map[next] !== undefined ? map[next] : next;
          j += 2;
          continue;
        }
        value += source[j];
        j += 1;
      }
      last = { type: 'string', value, template: ch === '`' };
      tokens.push(last);
      i = j + 1;
      continue;
    }
    if (ch === '/' && (!last || (last.type === 'punct' && regexAllowedAfter.has(last.value)) || (last.type === 'name' && regexAllowedAfter.has(last.value)))) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) break;
        j += 1;
      }
      j += 1;
      while (/[a-z]/i.test(source[j] || '')) j += 1;
      last = { type: 'regex' };
      tokens.push(last);
      i = j;
      continue;
    }
    const name = /^[A-Za-z_$][\w$]*/.exec(source.slice(i, i + 80));
    if (name) {
      last = { type: 'name', value: name[0] };
      tokens.push(last);
      i += name[0].length;
      continue;
    }
    const number = /^\d[\d.]*/.exec(source.slice(i, i + 40));
    if (number) {
      last = { type: 'number', value: number[0] };
      tokens.push(last);
      i += number[0].length;
      continue;
    }
    last = { type: 'punct', value: ch };
    tokens.push(last);
    i += 1;
  }
  return tokens;
}

/* The tokens of each argument of the call that starts at tokens[open] ('('). */
function callArguments(tokens, open) {
  const args = [[]];
  let depth = 0;
  for (let k = open + 1; k < tokens.length; k += 1) {
    const token = tokens[k];
    if (token.type === 'punct' && '([{'.includes(token.value)) depth += 1;
    if (token.type === 'punct' && ')]}'.includes(token.value)) {
      if (depth === 0) return args;
      depth -= 1;
    }
    if (depth === 0 && token.type === 'punct' && token.value === ',') {
      args.push([]);
      continue;
    }
    args[args.length - 1].push(Object.assign({ depth }, token));
  }
  return args;
}

function stringsIn(argument) {
  return argument.filter((token) => token.type === 'string' && token.depth === 0 && !token.template).map((token) => token.value);
}

function fromScript(source) {
  const keys = new Set();
  const nouns = new Set();
  const tokens = tokenize(source);
  tokens.forEach((token, k) => {
    if (token.type !== 'name') return;
    const previous = tokens[k - 1];
    const isMember = previous && previous.type === 'punct' && previous.value === '.';
    const owner = isMember ? tokens[k - 2] : null;
    if (isMember && !(owner && owner.type === 'name' && owner.value === 'G12')) return;
    const next = tokens[k + 1];
    if (!next || next.type !== 'punct' || next.value !== '(') return;
    const before = tokens[k - 1];
    if (before && before.type === 'name' && before.value === 'function') return;
    const args = callArguments(tokens, k + 1);
    if (TRANSLATE.has(token.value)) stringsIn(args[0] || []).forEach((key) => keys.add(key));
    if (PLURAL.has(token.value)) stringsIn(args[1] || []).forEach((word) => nouns.add(word));
  });
  return { keys, nouns };
}

function decodeEntities(text) {
  return text.replace(/&quot;/g, '"').replace(/&#x27;/g, '\'').replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function fromHtml(source) {
  const keys = new Set();
  const pattern = /data-i18n(?:-aria|-content)?="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(source))) keys.add(decodeEntities(match[1]));
  return keys;
}

/* Every key and counted word used by the project in folder. */
function collect(folder) {
  const keys = new Set();
  const nouns = new Set();
  const where = {};
  fs.readdirSync(path.join(folder, 'js')).filter((file) => file.endsWith('.js') && !file.startsWith('i18n')).forEach((file) => {
    const found = fromScript(fs.readFileSync(path.join(folder, 'js', file), 'utf8'));
    found.keys.forEach((key) => { keys.add(key); where[key] = where[key] || 'js/' + file; });
    found.nouns.forEach((word) => nouns.add(word));
  });
  fs.readdirSync(folder).filter((file) => file.endsWith('.html')).forEach((file) => {
    fromHtml(fs.readFileSync(path.join(folder, file), 'utf8')).forEach((key) => { keys.add(key); where[key] = where[key] || file; });
  });
  return { keys, nouns, where };
}

module.exports = { tokenize, fromScript, fromHtml, collect };

if (require.main === module) {
  const result = collect(path.join(__dirname, '..'));
  console.log(JSON.stringify({ keys: [...result.keys], nouns: [...result.nouns] }, null, 1));
}
