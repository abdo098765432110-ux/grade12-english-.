#!/usr/bin/env node
/* ==========================================================================
   Checks the four data files with the same rules the website uses.

   Usage (from the project folder):
     node tools/validate-content.js
     node tools/validate-content.js path/to/project

   Exits with code 1 if any file has errors, so it can also run in GitHub
   Actions later. Needs Node.js only — no packages to install.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Schema = require('../js/content-schema.js');

const projectRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const library = Schema.emptyLibrary();
const report = new Schema.Report();

for (const key of Schema.COLLECTION_KEYS) {
  const info = Schema.COLLECTIONS[key];
  const filePath = path.join(projectRoot, info.path);

  if (!fs.existsSync(filePath)) {
    report.error(info.path, 'file not found.');
    continue;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    report.error(info.path, 'is not valid JSON (' + error.message + ').');
    continue;
  }

  const fileReport = Schema.validateFile(key, data);
  report.errors.push(...fileReport.errors);
  report.warnings.push(...fileReport.warnings);
  if (data && Array.isArray(data[key])) library[key] = Schema.upgradeCollection(key, data[key]);
}

Schema.checkLinks(library, report);

console.log('Content check: ' + projectRoot);
for (const key of Schema.COLLECTION_KEYS) {
  console.log('  ' + Schema.COLLECTIONS[key].label + ': ' + library[key].length);
}

if (report.warnings.length) {
  console.log('\nWarnings (' + report.warnings.length + '):');
  report.warnings.forEach((message) => console.log('  - ' + message));
}

if (report.errors.length) {
  console.log('\nErrors (' + report.errors.length + '):');
  report.errors.forEach((message) => console.log('  - ' + message));
  console.log('\nResult: FAILED');
  process.exit(1);
}

console.log('\nResult: OK');
