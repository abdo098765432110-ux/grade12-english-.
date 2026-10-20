/* Tests for tools/check-site.js — run with: node --test tests/*.test.js
   Builds small throw-away copies of the site in a temporary folder. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT = path.join(__dirname, '..');
const CHECKER = path.join(PROJECT, 'tools', 'check-site.js');
const SITE_ITEMS = ['index.html', 'grammar.html', 'summaries.html', 'practice.html', 'reading.html', 'manage.html', '.nojekyll', 'css', 'js', 'data'];

function copySite(skip) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'g12-site-'));
  SITE_ITEMS.filter((item) => !(skip || []).includes(item)).forEach((item) => {
    fs.cpSync(path.join(PROJECT, item), path.join(folder, item), { recursive: true });
  });
  return folder;
}

function check(folder) {
  const run = spawnSync(process.execPath, [CHECKER, folder], { encoding: 'utf8' });
  return { code: run.status, out: run.stdout + run.stderr };
}

test('the project itself passes', () => {
  const result = check(PROJECT);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Result: OK/);
});

test('missing css, js and data folders are reported (the original GitHub Pages problem)', () => {
  const result = check(copySite(['css', 'js', 'data']));
  assert.equal(result.code, 1);
  assert.match(result.out, /The "css" folder is missing/);
  assert.match(result.out, /The "js" folder is missing/);
  assert.match(result.out, /The "data" folder is missing/);
  assert.match(result.out, /index\.html: "css\/style\.css" was not found/);
});

test('a file name with different upper/lower case is reported', () => {
  const folder = copySite();
  fs.renameSync(path.join(folder, 'css', 'style.css'), path.join(folder, 'css', 'Style.css'));
  const result = check(folder);
  assert.equal(result.code, 1);
  assert.match(result.out, /"css\/style\.css" has different upper\/lower case from the file on disk \("Style\.css"\)/);
  assert.match(result.out, /css\/Style\.css has capital letters/);
});

test('absolute paths and full site addresses are reported', () => {
  const folder = copySite();
  const page = path.join(folder, 'index.html');
  let html = fs.readFileSync(page, 'utf8');
  html = html.replace('href="css/style.css"', 'href="/css/style.css"');
  html = html.replace('href="grammar.html"', 'href="https://someone.github.io/grade12-english/grammar.html"');
  fs.writeFileSync(page, html);
  const result = check(folder);
  assert.equal(result.code, 1);
  assert.match(result.out, /"\/css\/style\.css" starts with "\/"/);
  assert.match(result.out, /uses the full site address/);
});

test('a missing data file is reported', () => {
  const folder = copySite();
  fs.rmSync(path.join(folder, 'data', 'reading-passages.json'));
  const result = check(folder);
  assert.equal(result.code, 1);
  assert.match(result.out, /"data\/reading-passages\.json" was not found/);
});
