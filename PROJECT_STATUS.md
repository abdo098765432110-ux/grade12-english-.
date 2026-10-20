# Project status — Grade 12 English

_Last updated: 19 October 2026 (end of Phase 1)_

## Summary

Phase 1 is complete: a working static website for GitHub Pages with four
student sections (Grammar Lessons, Grammar Summaries, Grammar Practice,
Reading Comprehension) and a content manager for adding, editing, deleting,
reordering, importing and exporting content.

The content library is **empty**. No lessons, summaries, questions, answers,
explanations or reading passages have been written for the site. All
educational content will be added by the project owner.

## Requirement changes during Phase 1

| Date | Change |
|---|---|
| 19 Oct 2026 | Original Phase 1 brief asked for clearly labelled demonstration content and said the content editor belonged to Phase 3. |
| 19 Oct 2026 | **Corrected by the owner:** no invented educational content at all; start with an empty library; build the content-management tools (add, edit, delete, import, export) now. Demonstration content that had already been drafted (6 lessons, 6 summaries, 48 questions) was deleted; nothing from it remains in the project. |

## Project structure

```
index.html                 Home (section cards with content counts)
grammar.html               Lesson list / single lesson (?lesson=<id>)
summaries.html             All summaries (printable)
practice.html              Topic + question-count selection, then quiz (?topic=<id>)
reading.html               Passage list / passage with questions (?passage=<id>)
manage.html                Content manager (teachers)
css/style.css              All styles
js/content-schema.js       Data format + validation (browser and Node)
js/content-store.js        Library changes (save/delete/move/import), browser draft, preview flag
js/common.js               Shared helpers: loading, notices, empty states, preview banner
js/quiz-engine.js          Quiz rules (no page code)
js/quiz-ui.js              Quiz screens (shared by Practice and Reading)
js/home.js, grammar.js, summaries.js, practice.js, reading.js, manage.js
data/grammar-lessons.json  { "schemaVersion": 1, "lessons": [] }
data/grammar-summaries.json, data/grammar-questions.json, data/reading-passages.json (all empty)
tools/validate-content.js  Command-line content check (Node.js, no packages)
tests/*.test.js            Unit tests (Node built-in test runner)
tests/e2e_test.py          Browser tests (Playwright; development only)
docs/CONTENT_FORMAT.md     Data format reference
README.md                  Running, publishing and content workflow
.nojekyll                  Makes GitHub Pages serve files as they are
package.json               Test/validate commands only (no dependencies)
```

## Completed features

**Student pages**
- Responsive layout and navigation (desktop and 375 px phone width), skip link, visible focus, semantic HTML.
- Empty states on every page (“No lessons added yet”, etc.) with a button to the matching “add” form.
- Grammar lessons with six section types: text, note box, bulleted list, examples, table, common mistakes (avoid/use). Arabic sections display right to left.
- Summaries page with table of contents, rule tables, reminders, links to lesson and practice; print styles.
- Practice: topic selection (lessons with questions, plus “Other questions”), number of questions (5/10/20/all), random selection.
- Quiz (Practice and Reading): answer selection, submit, feedback with explanation, **try again** (tried options disabled), show answer, next, results with per-question review, **retry missed questions**, **restart quiz**, change settings.
- Scoring counts the first attempt of multiple-choice questions only. Short written answers are never auto-scored; students compare with the model answer.
- **Answer-key honesty:** unless a question is marked `reviewed`, the site says “matches / different from the suggested answer” (never “correct / incorrect”), shows a “not yet reviewed” note, and marks the score as provisional.
- Broken items in hand-edited files are skipped with a notice; invalid or missing files show a clear error message instead of a blank page.
- All content is inserted as text (no HTML injection from data files).

**Content manager (`manage.html`)**
- Add / edit / delete / reorder lessons, summaries, grammar questions, reading passages, and each passage’s questions.
- Lesson section editor (add, remove, reorder, change type); repeating rows for mistakes and summary points.
- Multiple-choice editor (2–6 options, mark the correct one) and short-answer questions; “Save and add another” keeps the topic.
- Validation before saving, with an error summary linked to the fields.
- IDs generated from titles; renaming a lesson ID updates linked summaries and questions; deleting a lesson unlinks them (asks first).
- Question filters (topic, text search).
- Automatic draft saving in the browser; warning when the published files changed since the draft began; warning before leaving a form with unsaved changes.
- Preview the draft on the real student pages (this browser only).
- Export the four data files (individually or all), backup file, import (merge or replace) with full validation before any change, content check report, discard draft.

## Test results (run on 19 Oct 2026)

Environment: Linux, Node.js 22.22.0, Python 3.13, Playwright with headless Chromium 141. The site was served from a **subfolder** (`http://127.0.0.1:<port>/grade12-english/`) to match GitHub Pages project sites.

| Test | Result |
|---|---|
| `npm test` — unit tests (schema, store, quiz engine) | **36 / 36 passed** |
| `node tools/validate-content.js` on the empty data files | **OK** |
| `python tests/e2e_test.py` — browser tests | **77 / 77 checks passed** |
| Project `data/` files after the browser tests | Still empty (verified) |

The browser tests cover: empty states on all pages; adding/editing/deleting/reordering every content type in the manager; form validation messages; lesson ID rename cascade; unsaved-changes prompt; preview on all student pages; practice quiz (unreviewed and reviewed wording, try again, show answer, results, retry missed, restart, change settings); reading quiz; export of all files and backup; exported files passing the command-line validator; published files shown without preview; broken item skipped; invalid JSON and missing file messages; import merge, re-import, invalid import rejected, replace import; discard draft; phone-width layout; no browser console errors.

Accessibility checks performed (custom, in the browser tests, on every tested screen): every form control labelled, every link/button named, one `h1`, no skipped heading levels, no duplicate IDs, no broken `aria-describedby`/`aria-labelledby` references, no sideways scrolling at 375 px, and text colour pairs at least 4.5:1 contrast (WCAG AA). Focus movement after submitting an answer and after reordering items was checked.

Visual review of screenshots led to three fixes, all re-tested: result colours on selected options, right-hand border for Arabic notes, and spacing above quiz results.

## Not tested / known limitations

- **Not deployed to GitHub Pages yet** — tested with a local server in a subfolder only.
- Tested in **Chromium only**. Not tested in Firefox, Safari, or on real phones.
- The automated accessibility tool axe-core could not be installed (package download blocked in this environment); custom checks were used instead. Not tested with a real screen reader.
- Opening pages directly from disk (`file://`) is not supported; a message explains this. Use GitHub Pages or a local server.
- Drafts are stored per browser (usually about 5 MB available). Clearing site data deletes the draft — download backups.
- “Download all four files” may trigger a browser prompt to allow multiple downloads.
- Publishing requires uploading the exported files to GitHub manually (by design: no accounts or server).
- No student progress saving between visits.
- Topic and wording of the student pages have not been checked against the current official Egyptian Grade 12 syllabus.

## Remaining tasks (not started)

- Owner: add all educational content and publish it.
- Deploy to GitHub Pages and re-check the live site.
- Cross-browser and real-device testing (Firefox, Safari, Android/iOS phones); screen-reader check.
- Possible later additions (only if wanted): saving student progress in the browser, more question types (e.g. typed fill-in-the-blank, matching), search, Arabic interface text, an automatic content check on GitHub (GitHub Actions running `tools/validate-content.js`).

## Exact next steps

1. Create a GitHub repository and upload every file in this folder, including `.nojekyll`.
2. Settings → Pages → Deploy from a branch → `main`, `/ (root)` → Save.
3. Open `https://<user>.github.io/<repository>/` and confirm the empty-state pages load.
4. Open `manage.html` on the live site, add content, tick preview to check it, then Import & export → Download all four files.
5. Upload the four files into the repository’s `data/` folder (replace existing) and commit. Reload the site after a few minutes.
6. Download a backup file regularly.
