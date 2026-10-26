# Project status — Grade 12 English

_Last updated: 21 October 2026 (end of Phase 3, waiting for approval before any Phase 4)_

Published website (the address the owner gave):
https://abdo098765432110-ux.github.io/grade12-english-./
It is served from the repository
https://github.com/abdo098765432110-ux/grade12-english-.
(the name ends with a hyphen and a full stop).

## Summary

| Phase | Status |
|---|---|
| Phase 1 — student pages, quiz engine, content manager, empty content library | Done (19 Oct 2026) |
| Phase 1.5 — audit of the live site, fallback/loading/error states, navigation | Done (20 Oct 2026) |
| Phase 2 — data-driven content by unit and topic, answer checking, validation | Done in the project files (20 Oct 2026) |
| Phase 3 — home banner, English/Arabic interface, content manager workflow | Done in the project files (21 Oct 2026) |

The content library is still **empty**. No lessons, summaries, questions,
answers, explanations or reading passages have been written for the site.
All educational content will be supplied by the project owner.

## Live site: working, but still the Phase 1 version

Checked on 21 Oct 2026. Nothing from Phase 2 or Phase 3 has been uploaded
yet. This session can read the repositories but cannot upload to them.

| Repository | Address | State |
|---|---|---|
| `grade12-english-.` (commit `851117f`, 20 Oct 23:24) | `https://abdo098765432110-ux.github.io/grade12-english-./` | **Works**, with the `css`, `js` and `data` folders, but its pages and scripts are the **Phase 1** version: no units, no banner, no language button (`js/i18n.js` is not there). The data files are empty, so there is no content to lose. |
| `grade12-english` (commit `38a1343`, 20 Oct 23:20) | `https://abdo098765432110-ux.github.io/grade12-english/` | Broken: every file is at the top level with no folders, so the pages load without styles and scripts. |
| `grade12-english-` (commit `c72020c`, 20 Oct 22:28) | `https://abdo098765432110-ux.github.io/grade12-english-/` | An older test copy with folders (Phase 1). |

**Uploading this project on top of `grade12-english-.` was simulated:**
- a copy of the repository files was overwritten with the zip's files, the
  same result as an upload on GitHub;
- the copy was served at the same path, `/grade12-english-./`.

Results on that copy:
- site check OK;
- 73 / 73 unit tests passed;
- 274 / 274 browser checks passed.

The extra `package.json` in that repository is harmless and can stay.

**Sharing the link:** many apps cut a final full stop off a link. If you
share `…/grade12-english-.` without the slash, it can turn into
`…/grade12-english-`, which opens the old test copy. Always share it with the
slash at the end: `https://abdo098765432110-ux.github.io/grade12-english-./`.

## Phase 3 report — what changed

Files: 2 new (`js/i18n.js`, `js/i18n-ar.js`). Changed: the six HTML pages,
`css/style.css`, all files in `js/`, the tests and the documentation. File
names, folders, data files and web addresses are unchanged.

**1. Home page banner**
- The phrase “سمي الله وصلي علي النبي وخش عيش حياتك” appears exactly as
  given (checked character by character), centred at the top of the home page,
  under the navigation.
- It is marked as Arabic and right-to-left, wraps on small screens, and is
  the same in both interface languages. It never covers the navigation: the
  menu sits above it and pushes it down when opened on a phone.

**2. English / Arabic interface**
- A language button in the header of every page (“العربية” on English pages,
  “English” on Arabic pages). The choice is saved in the browser
  (`localStorage`, key `g12-lang`) and applies to every page, including the
  content manager. Switching reloads the page in the other language; links
  and web addresses do not change.
- Arabic pages use `lang="ar"` and `dir="rtl"`. The layout is mirrored with
  logical CSS properties, and arrows such as “← previous” point the right way.
- Translated: navigation, buttons, headings, labels, form hints, validation
  and error messages, notices, empty states, loading and error states, score
  summaries, confirmations, page titles, and every content manager control.
  Counted words use the correct Arabic forms (درس واحد، درسان، 3 دروس، 11 درسًا).
- **Not translated:** lessons, summaries, questions, options, answers,
  explanations and passages. They are shown exactly as written, and each
  item's text direction comes from its own text, so English content stays
  left-to-right on Arabic pages.
- The Arabic text lives in `js/i18n-ar.js` (English on the left, Arabic on
  the right), so wording can be corrected without touching the code. A
  missing translation falls back to English instead of breaking the page.
- If the browser blocks storage, the site works in English.

**3. Content manager (`manage.html`)**
- Create, edit, delete, reorder and organise units, lessons, summaries,
  practice questions, and passages with their questions (as before), now in
  both languages.
- **Draft vs published is visible everywhere:**
  - the status box says “Draft — not published yet” or “Published — no
    unpublished changes”, and counts new, changed and removed items;
  - items that exist only in the draft are labelled “New — not published” or
    “Changed — not published”;
  - each item has a **Preview** link that opens its student page with the
    draft (single practice questions open at `practice.html?question=<id>`).
- **Publish:** the five data files can be downloaded only when the draft has
  no errors. The page gives the exact GitHub steps (open the `data` folder,
  upload the five files with exact names, commit, reload with Ctrl+F5).
- **Import** (data files or a backup): files are checked first, with useful
  messages for malformed JSON, wrong answer keys, duplicate IDs (also across
  several files), missing fields and unknown file contents. If they are valid,
  a table shows, per type, how many items are new, already in the draft, and
  would be removed by Replace. Nothing changes until the owner chooses:
  - **Cancel** — nothing changes;
  - **Merge** — adds new items; for items with the same ID, keep the current
    version (default) or use the imported one; nothing is removed;
  - **Replace** — replaces each imported type completely, after a warning
    that lists what will be removed.
  The result is validated again before it is saved.
- **Backup and restore:** one backup file with everything. Restore shows the
  backup's date and contents next to the current draft, offers to download
  the current draft first, and asks before replacing the whole draft.
- Deleting asks for confirmation, as before. IDs and links between items are
  preserved, and renames still update linked items.

**4. Saving and security**
- No server, passwords, tokens or keys anywhere in the code. The manager
  states that it has no password, that it only changes a draft in the
  visitor's own browser, and that only people with access to the GitHub
  repository can publish.
- Stored in the browser: the draft, the preview switch and the language
  choice. No student information is stored or sent anywhere.
- No paid services, packages or external files were added.

## Phase 3 test results (21 Oct 2026)

Environment: Linux, Node.js 22.22.0, Python 3.13, Playwright 1.56 with
headless Chromium. The site was served from a `/grade12-english/` subfolder,
the same path as on GitHub Pages. All test content is placeholder text, such
as “Test prompt q1”. It is supplied by the tests and never written to `data/`.

| Test | Result |
|---|---|
| `node --test tests/*.test.js` (unit tests) | **73 / 73 passed** (57 before + 16 new) |
| `python tests/e2e_test.py` (browser tests) | **274 / 274 checks passed** on two runs in a row (161 before; the new and updated checks are listed below) |
| `node tools/check-site.js` | OK: every referenced file exists with exact case; all paths are relative |
| `node tools/validate-content.js` | OK (empty library, version 2) |
| Project `data/` files after the tests | Still empty (verified) |

What the new tests check:

- **Translations (unit tests):**
  - every interface text in the code and pages (about 660) has Arabic;
  - placeholders match between the two languages;
  - no leftover or untranslated entries;
  - all Arabic plural forms;
  - arrows reversed;
  - English stays the default, and an unknown saved value falls back to English;
  - content-check messages come out in Arabic.
- **Language switch (browser):**
  - the button on all six pages;
  - `lang`/`dir` switching;
  - the choice is remembered across pages and reloads;
  - Arabic navigation with the same links;
  - Arabic page titles;
  - the phone menu in Arabic;
  - switching back;
  - storage blocked;
  - accessibility checks on every Arabic page;
  - no missing Arabic text reported by any page visited.
- **Banner (browser), in both languages at 320, 375, 768 and 1280 px:**
  - exact phrase, `dir="rtl"`, centred and first on the page;
  - the text fits and does not overflow;
  - below the header, with every header link and button still clickable;
  - the opened phone menu pushes it down;
  - no sideways scrolling.
- **Content untouched in Arabic (browser):**
  - lesson text, unit titles, question prompts, options and passage spacing
    stay exactly as written and left-to-right;
  - feedback, worksheet warnings, “not answered” and scores appear in Arabic;
  - manager form, answer-key and import errors appear in Arabic.
- **Content manager (browser):**
  - the change counts and the “New/Changed — not published” labels;
  - preview links opening the draft in a new tab;
  - the single-question link;
  - downloads blocked while the draft has an error.
  - Import:
    - the description table;
    - Cancel;
    - Merge into an empty draft;
    - Merge with “keep” and with “use imported”;
    - re-importing never duplicates;
    - Replace warning (declining it changes nothing, then Replace);
    - rejected files: wrong key, malformed JSON, duplicate IDs across two
      files, empty object.
  - Restore:
    - a non-backup file is refused;
    - the comparison shown before restoring;
    - Cancel;
    - downloading the current draft first;
    - the confirmation, then the restore itself.
  - Discard.
- **Visual review** of screenshots in both languages found and fixed:
  - the banner text was too small (an Arabic-content style overrode it);
  - scores like “0 / 2” read backwards on Arabic pages;
  - question numbers in the all-questions view were misaligned on Arabic
    pages.
  All three were re-tested.

## Not tested / known limitations

- **The live site was not tested.** The repository still has the files
  outside their folders. This session can read the repository but cannot
  write to it, so nothing was uploaded or deployed.
- Tested in **headless Chromium only**: not tested in Firefox, Safari, on
  real phones or tablets, or with a screen reader.
- The Arabic interface text was written for this project and checked by
  automated tests for completeness, not by a native-speaker review. It can
  be edited in `js/i18n-ar.js`.
- Switching language reloads the page. In the content manager, unsaved form
  changes are protected by the browser's “Leave page?” prompt (existing
  Phase 1 behaviour; not covered by the automated tests).
- Downloading “all five files” relies on the browser allowing several
  downloads; each file also has its own button.
- Phase 1–2 limitations still apply: drafts are per browser, publishing is a
  manual upload, there is no saved student progress, and only
  multiple-choice questions are scored.

## How to deploy Phase 3

These steps update the repository behind the published address
(`grade12-english-.`). Its folders are already correct, so the upload only
adds and replaces files. It deletes nothing.

1. On a **computer**, unzip `grade12-english.zip` and open the
   `grade12-english` folder inside it. You should see `index.html`, `css`,
   `js`, `data` and the other items.
2. Open https://github.com/abdo098765432110-ux/grade12-english-. and choose
   **Add file → Upload files**.
3. Select everything in the folder (Ctrl+A, or Cmd+A on a Mac) and **drag**
   it onto the upload area. Don't use “choose your files”: it cannot upload
   folders. If `.nojekyll` does not come along (Macs hide it), that is fine.
4. Wait until the list has finished loading. Then check that it shows the
   files **with** their folders, such as `css/style.css`, `js/i18n.js` and
   `js/i18n-ar.js`. If it shows only `style.css`, close the page without
   committing and drag again.
5. Choose **Commit changes**. Files with the same name are replaced; nothing
   else is removed.
6. Wait 1–2 minutes. Open
   https://abdo098765432110-ux.github.io/grade12-english-./ and reload with
   **Ctrl+F5** (Cmd+Shift+R on a Mac). Expected:
   - the dark-blue banner with “سمي الله وصلي علي النبي وخش عيش حياتك”;
   - the “العربية” button in the header;
   - “No content added yet”.
7. Optional, your decision: the `grade12-english` and `grade12-english-`
   repositories are not needed by the published site. Keep them, or delete
   them in each repository's Settings, so that only one address exists.
8. Later, to publish content: in the content manager, follow *Import &
   export* → *Publish your changes* (upload the five files inside the `data`
   folder of `grade12-english-.`).

## Phase 2 report (20 Oct 2026) — implemented features

**1. Content by unit and topic**
- New file `data/units.json` (empty). Units group all content and appear in
  the order listed.
- A topic is a grammar lesson, and its `id` is the topic ID.
- Lessons, summaries, questions and passages can have `unitId`. Summaries and
  questions can have `topicId`, and then belong to that lesson’s unit
  automatically.
- **Grammar Lessons:** grouped by unit, with unit filter links. Pages work by
  address: `?unit=<id>` for one unit, `?topic=<id>` for one lesson (the old
  `?lesson=<id>` still works). The breadcrumb shows the unit, and the
  previous/next links follow unit order.
- **Grammar Summaries:** grouped by unit, with `?unit=<id>` and
  `?topic=<id>`. Lessons link to their own summary.
- **Grammar Practice:** choose a unit, then a topic (both with question
  counts), the number of questions, and how to answer. `?unit=` and `?topic=`
  preselect the choices.
- **Reading:** grouped by unit, with `?unit=<id>`.

**2. Grammar practice — answering and marking**
- Multiple-choice questions come only from `data/grammar-questions.json`.
- Two ways to answer:
  - *One at a time*: as before, with feedback, try again and show answer.
  - *All at once* (new): every question on one page, then “Check my answers”.
- Answers are checked against the answer key in the data. Only exact matches
  count.
- **Unanswered questions:**
  - Before checking, the page lists the blank question numbers and offers
    “Go to question N” or “Check anyway”.
  - Blank questions are marked “Not answered” and score 0. A blank answer is
    never counted as correct.
  - Any choice that is not one of the options counts as unanswered.
- **Score summary:** the score, the percentage, and separate counts for
  correct, not correct and not answered. Each question gets its own feedback
  and explanation. “Retry missed questions” includes the unanswered ones.
- The review-honesty rules from Phase 1 still apply: unreviewed answers are
  “suggested”, and scores that include them are “provisional”.

**3. Reading comprehension**
- Each passage is shown beside its questions. Questions appear **exactly in
  the stored order** in both modes and are never shuffled.
- “All questions” is the default mode, and “One at a time” is a button away.
- **Formatting is kept exactly:** paragraphs, line breaks, and spacing inside
  a paragraph. Paragraph numbers can be turned off per passage
  (`showParagraphNumbers: false`).
- On wide screens the passage stays in view while students scroll through
  the questions. A long passage scrolls inside its own box, which can also
  be scrolled with the keyboard.
- Line breaks are also kept in lesson text, summaries, question prompts,
  options and explanations.

**4. Safety and validation**
- Missing required fields, invalid IDs, and links to units or topics that
  don’t exist are all reported.
- **Answer keys get specific messages:**
  - a letter (`"B"`) or a number (`2`) instead of the option text, with the
    option it probably meant;
  - a difference only in spaces or capital letters;
  - a missing answer.
- Questions with an invalid key are never shown to students, and the quiz
  engine refuses to mark them as a second safeguard.
- A `unitId` that disagrees with its topic’s unit gets a warning, and the
  topic’s unit is used.
- Each page’s “N items could not be shown” notice now counts only the
  content that page shows.
- **Empty states:**
  - every unit with no content says so (“No lessons in this unit yet”);
  - a filtered empty unit or topic gets its own message;
  - Practice disables Start for an empty unit or topic;
  - unknown unit or topic addresses show “Unit not found” or “Topic not
    found”.
- **Older files keep working:** version 1 files are upgraded when loaded
  (`lessonId` → `topicId`, `topic` → `topicId`), with a validator reminder. If
  `data/units.json` is missing, the site behaves as if there are no units.

**5. Content manager**
- New **Units** tab: add, edit, reorder and delete units.
  - Renaming a unit’s ID updates everything linked to it.
  - Deleting a unit keeps its content and only removes the link.
- Every editor has a Unit field. Summaries and questions also have a Topic
  field, grouped by unit; choosing a topic selects its unit.
- Questions can be filtered by unit. The passage editor has a “Show
  paragraph numbers” option.
- Export, import and backup now include `units.json` (five data files).
  Imports of version 1 files are upgraded automatically.

### Data format

Version 2, documented in [docs/CONTENT_FORMAT.md](docs/CONTENT_FORMAT.md)
(units and topics, web addresses, answer-key rules, formatting, older files).

### Phase 2 test results (20 Oct 2026)

Environment: Linux, Node.js 22.22.0, Python 3.13, Playwright 1.56 with
headless Chromium 141. The site was served from a `/grade12-english/`
subfolder, the same path as on GitHub Pages. All test content is placeholder
text such as “Test prompt q1”, supplied by the tests and never written to
`data/`.

| Test | Result |
|---|---|
| `node --test tests/*.test.js` (unit tests) | **57 / 57 passed** (41 before + 16 new) |
| `python tests/e2e_test.py` (browser tests) | **161 / 161 checks passed**, on two runs in a row (115 before + 46 new) |
| `node tools/check-site.js` | OK: every referenced file exists with exact case; all paths are relative |
| `node tools/validate-content.js` | OK (empty library, version 2) |
| Project `data/` files after the tests | Still empty (verified) |

New tests in Phase 2:

- **Unit tests** cover:
  - unit validation;
  - `unitId`/`topicId` checks;
  - the version 1 → 2 upgrade (files, imports, drafts);
  - answer-key messages (letter, number, case, missing);
  - grouping and ordering by unit;
  - unit rename and delete cascades;
  - `gradeAll`: blank and invalid answers are never correct, nothing
    answered scores 0, unreviewed wording, written answers not scored;
  - blank-question numbers;
  - the quiz refusing a question without a valid key.
- **Browser tests (student pages)** cover:
  - unit links and grouping, including per-unit empty states;
  - `?unit=` / `?topic=` / `?lesson=` addresses, “Unit not found”, and the
    unit in the breadcrumb;
  - line breaks kept in lessons, and the old `lessonId` upgraded on the
    summaries page;
  - practice unit/topic counts, an empty unit disabling Start, a question
    with key `"B"` skipped with a notice, and `?topic=` preselecting the unit;
  - answer-all mode: blank questions listed, “Check anyway” scoring 0 with
    “Not answered” on each, retry missed, full score;
  - reading: spacing kept exactly, questions in stored order in both modes,
    sticky passage, matched/different/not answered counts, paragraph numbers
    off;
  - a missing `units.json`, and accessibility checks on the new screens.
- **Browser tests (content manager)** cover:
  - adding units, and a lesson in a unit;
  - choosing a topic selecting its unit, and a conflicting unit being
    refused;
  - what each question stores; the unit filter;
  - passage line breaks and the paragraph-number setting;
  - unit contents counts, unit ID rename and delete cascades;
  - the `units.json` download;
  - a version 1 import upgraded, and a letter answer key rejected with a
    hint.
- **Visual review** of screenshots found three layout issues, all fixed and
  re-tested: extra space above the question list, single cards stretching
  the full width, and extra space at the top of the practice panel.
