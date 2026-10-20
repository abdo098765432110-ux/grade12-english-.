#!/usr/bin/env node
/* ==========================================================================
   Site file check — run before uploading to GitHub Pages.

   Checks that:
     - the folders the site needs exist (css, js, data) and .nojekyll is there;
     - every file referenced by an HTML page (stylesheets, scripts, links) and
       every data file used by the scripts exists, with EXACTLY the same
       upper/lower case (GitHub Pages is case-sensitive, Windows and macOS
       usually are not, so a case mistake can work locally and fail online);
     - no path starts with "/" or uses the site's full address, so the site
       works inside a repository subfolder such as /grade12-english/.

   Usage (from the project folder):  node tools/check-site.js [folder]
   Needs Node.js only. Exits with code 1 if a problem is found.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const errors = [];
const warnings = [];
let checked = 0;

/* True only if every part of the path exists with exactly this case. */
function existsExactCase(relativePath) {
  let current = root;
  for (const part of relativePath.split('/')) {
    if (!part || part === '.') continue;
    let entries;
    try {
      entries = fs.readdirSync(current);
    } catch (error) {
      return false;
    }
    if (!entries.includes(part)) {
      const other = entries.find((entry) => entry.toLowerCase() === part.toLowerCase());
      if (other) return 'case:' + other;
      return false;
    }
    current = path.join(current, part);
  }
  return true;
}

/* baseFolder: the folder the path is relative to. Links in a page are relative
   to that page; data paths fetched by scripts are relative to the page too. */
function checkReference(from, reference, baseFolder) {
  // Ignore page anchors, external links, data: URLs, mail links.
  if (!reference || /^(#|data:|mailto:|tel:|javascript:)/i.test(reference)) return;
  if (/^(https?:)?\/\//i.test(reference)) {
    if (/github\.io/i.test(reference)) {
      errors.push(from + ': uses the full site address "' + reference + '". Use a relative path instead (for example "css/style.css").');
    }
    return;
  }
  if (reference.startsWith('/')) {
    errors.push(from + ': "' + reference + '" starts with "/". On GitHub Pages this points outside the /<repository>/ folder. Remove the leading "/".');
    return;
  }
  const file = reference.split(/[?#]/)[0];
  if (!file) return;
  const base = baseFolder !== undefined ? baseFolder : path.posix.dirname(from);
  const target = path.posix.normalize(path.posix.join(base, file));
  checked += 1;
  const found = existsExactCase(target);
  if (found === true) return;
  if (typeof found === 'string') {
    errors.push(from + ': "' + reference + '" has different upper/lower case from the file on disk ("' + found.slice(5) + '"). GitHub Pages will not find it.');
  } else {
    errors.push(from + ': "' + reference + '" was not found. Upload it, or fix the path.');
  }
}

// 1. Folders and files the site needs.
['css', 'js', 'data'].forEach((folder) => {
  if (existsExactCase(folder) !== true) errors.push('The "' + folder + '" folder is missing. Upload the whole folder.');
});
if (existsExactCase('.nojekyll') !== true) {
  warnings.push('.nojekyll is missing. Add an empty file named .nojekyll so GitHub Pages serves every file as it is.');
}
if (existsExactCase('index.html') !== true) errors.push('index.html is missing from the top level.');

// 2. References in HTML pages.
const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html')).sort();
pages.forEach((page) => {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const pattern = /\s(?:href|src)\s*=\s*"([^"]*)"/gi;
  let match;
  while ((match = pattern.exec(html))) checkReference(page, match[1]);
});

// 3. url(...) references in CSS.
if (existsExactCase('css') === true) {
  fs.readdirSync(path.join(root, 'css')).filter((name) => name.endsWith('.css')).forEach((name) => {
    const css = fs.readFileSync(path.join(root, 'css', name), 'utf8');
    const pattern = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let match;
    while ((match = pattern.exec(css))) checkReference('css/' + name, match[1]);
  });
}

// 4. Data files and links built by the scripts.
const schemaPath = path.join(root, 'js', 'content-schema.js');
if (fs.existsSync(schemaPath)) {
  const Schema = require(schemaPath);
  Schema.COLLECTION_KEYS.forEach((key) => checkReference('js/content-schema.js', Schema.COLLECTIONS[key].path, '.'));
}
if (existsExactCase('js') === true) {
  const referenced = new Set();
  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    (html.match(/src="js\/[^"]+"/g) || []).forEach((tag) => referenced.add(tag.slice(8, -1)));
  });
  fs.readdirSync(path.join(root, 'js')).filter((name) => name.endsWith('.js')).forEach((name) => {
    const code = fs.readFileSync(path.join(root, 'js', name), 'utf8');
    const absolute = code.match(/(?:href|src|path)\s*:\s*['"]\/[^'"]*['"]/g);
    if (absolute) errors.push('js/' + name + ': absolute path ' + absolute[0] + '. Remove the leading "/".');
    if (!referenced.has(name)) warnings.push('js/' + name + ' is not used by any page.');
  });
}

// 5. Capital letters in site file or folder names (allowed, but easy to get wrong).
function walk(folder) {
  fs.readdirSync(path.join(root, folder)).forEach((name) => {
    if (name === '.git' || name === 'node_modules') return;
    const relative = folder ? folder + '/' + name : name;
    const isFolder = fs.statSync(path.join(root, relative)).isDirectory();
    if (/[A-Z]/.test(name) && (isFolder || /\.(html|css|js|json)$/.test(name))) {
      warnings.push(relative + ' has capital letters in its name. Lower-case names avoid case mistakes.');
    }
    if (isFolder) walk(relative);
  });
}
walk('');

console.log('Site check: ' + root);
console.log('  Pages: ' + pages.join(', '));
console.log('  File references checked: ' + checked);
if (warnings.length) {
  console.log('\nWarnings (' + warnings.length + '):');
  warnings.forEach((message) => console.log('  - ' + message));
}
if (errors.length) {
  console.log('\nProblems (' + errors.length + '):');
  errors.forEach((message) => console.log('  - ' + message));
  console.log('\nResult: FAILED — the site will not work correctly on GitHub Pages until these are fixed.');
  process.exit(1);
}
console.log('\nResult: OK — every referenced file exists with the correct case, and all paths are relative.');
