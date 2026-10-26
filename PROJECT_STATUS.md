# Project status — Grade 12 English

_Last updated: 26 October 2026 (Phase 2 + the Arabic/English interface button)_

Live site: https://abdo098765432110-ux.github.io/grade12-english/
Repository: https://github.com/abdo098765432110-ux/grade12-english

## Summary

| Work | Status |
|---|---|
| Phase 1 — student pages, quiz engine, content manager, empty content library | Done (19 Oct 2026) |
| Phase 1.5 — audit of the live site, fallback/loading/error states, navigation | Done (20 Oct 2026) |
| Phase 2 — data-driven content by unit and topic, answer checking, validation | Done in the project files (20 Oct 2026) |
| Addition — Arabic/English interface button | Done in the project files (26 Oct 2026) |

As the owner asked, this version adds **only** the language button. The
other Phase 3 work prepared earlier (home banner, new import/restore and
publishing workflow in the content manager) is **not** included.

The content library is still **empty**. No lessons, summaries, questions,
answers, explanations or reading passages have been written for the site.
All educational content will be supplied by the project owner.

## ⚠ The live site is still not working

Checked on 26 Oct 2026, repository commit `38a1343`: the files are still
**at the top level of the repository**, with no `css`, `js` or `data`
folders. The pages load `css/style.css`, `js/…` and `data/…`, so they show
without styles and scripts. The steps below fix this and add the language
button in the same upload.

## Addition: Arabic/English interface button (26 Oct 2026)

**What changed**
- A button in the header of every page: **العربية** on English pages,
  **English** on Arabic pages. On phones it sits next to the Menu button.
- Arabic: all interface text in Arabic, including the content manager and
  its messages. The pages use `lang="ar"` and `dir="rtl"`, and the layout is
  mirrored. English: the English text and `dir="ltr"` come back.
- The choice is saved in the browser (`localStorage`, key `g12-lang`). It
  applies to every page and after reloading. Nothing else is stored.
- Educational content is not translated or changed. It is shown exactly as
  written, with its own text direction.
- Files:
  - **new:** `js/i18n.js` (the button and the switching) and `js/i18n-ar.js`
    (the Arabic interface text);
  - **changed:** the six pages (header button, two script lines, translation
    markers), `css/style.css` (header layout and right-to-left styles), and
    the page scripts (interface text passed through the translator);
  - **unchanged:** `js/content-store.js`, `js/quiz-engine.js`, all `data/`
    files, `tools/`, file names and links.

**Test results** (Linux, Node.js 22, Playwright with headless Chromium; the
site was served from a `/grade12-english/` subfolder, as on GitHub Pages)

| Test | Result |
|---|---|
| `node --test tests/*.test.js` | **70 / 70 passed** (57 from Phase 2 + 13 for the language) |
| `python tests/e2e_test.py` | **209 / 209 checks passed** on two runs (161 from Phase 2 + 48 for the language) |
| `node tools/check-site.js` | OK |
| `node tools/validate-content.js` | OK (empty library) |
| Upload simulated on a copy of the repository | 209 / 209 checks passed |

The language checks cover:
- the button on all six pages;
- English → Arabic → English;
- the choice kept after reloading and on every page;
- `rtl` and `ltr`, Arabic navigation with the same links, the phone menu in
  Arabic;
- storage blocked;
- accessibility checks on every Arabic page;
- no interface text missing from the Arabic file.

Placeholder test content — lesson text, unit titles, questions, answer
choices and passage spacing — stayed exactly as written on Arabic pages, and
the project's `data/` files were still empty after the tests. All Phase 2
checks (lessons, summaries, practice, reading, content manager, navigation,
error states) still pass.

**Not tested:** the live site (nothing was uploaded from here), Firefox,
Safari, real phones, and screen readers. The Arabic interface text has not
been reviewed by a native speaker; it can be edited in `js/i18n-ar.js`.

## How to upload this version

1. On a **computer**, unzip `grade12-english.zip` and open the
   `grade12-english` folder inside it. You should see `index.html`, `css`,
   `js`, `data` and the other items.
2. Open https://github.com/abdo098765432110-ux/grade12-english and choose
   **Add file → Upload files**.
3. Select everything in the folder (Ctrl+A, or Cmd+A on a Mac) and **drag**
   it onto the upload area. Don't use “choose your files”, because it cannot
   upload folders.
4. Wait until the list finishes. It must show names **with** their folders,
   such as `css/style.css`, `js/i18n.js` and `data/units.json`. If you see
   only `style.css`, close the page without committing and drag again (or
   use GitHub Desktop).
5. Choose **Commit changes**. Files with the same name (for example
   `index.html`) are replaced; nothing is deleted.
6. Wait 1–2 minutes. Open https://abdo098765432110-ux.github.io/grade12-english/
   and reload with **Ctrl+F5** (Cmd+Shift+R on a Mac). Expected: a styled
   page with the **العربية** button at the top. Click it: the page turns
   Arabic and right-to-left. Reload: it stays Arabic. Click **English** to
   switch back.
7. Optional: the old loose copies at the top level (`style.css`,
   `common.js`, `grammar-lessons.json`, the uploaded zip, `download`, and so
   on) are no longer used. The site works with them in place; deleting them
   only tidies the repository. All the data files are empty, so no content
   is lost either way.

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

### Phase 2 known limitations (still apply)

- Text formatting covers paragraphs, line breaks and spacing. Bold or
  italic text inside content is not supported.
- Only multiple-choice questions are scored; written answers are compared by
  the student.
- Drafts are per browser; publishing is a manual upload; there is no saved
  student progress; the wording has not been checked against the official
  syllabus.

## Next steps

1. Upload this version (see “How to upload this version” above) and check
   the live site with Ctrl+F5.
2. Add units first, then lessons (topics), summaries, questions and
   passages, with the content manager or JSON files that follow
   docs/CONTENT_FORMAT.md.
