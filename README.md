# Grade 12 English

A free English learning website for Egyptian Grade 12 students: grammar
lessons, grammar summaries, grammar practice with feedback and scoring, and
reading comprehension.

- Plain HTML, CSS, JavaScript and JSON. No build step, frameworks, packages,
  database, accounts, paid services or AI APIs.
- Works on GitHub Pages, including inside a repository subfolder
  (`https://<user>.github.io/<repository>/`). All paths are relative.
- **Starts with an empty content library.** All lessons, summaries, questions
  and passages are added by the teacher with the built-in content manager.

## Folder structure

```
grade12-english/
├── index.html             Home
├── grammar.html           Grammar Lessons   (?unit=<id> one unit, ?topic=<id> one lesson)
├── summaries.html         Grammar Summaries (?unit=<id>, ?topic=<id>)
├── practice.html          Grammar Practice  (?unit=<id>, ?topic=<id> preselect)
├── reading.html           Reading Comprehension (?unit=<id>, ?passage=<id>)
├── manage.html            Content manager (for teachers)
├── .nojekyll              Empty file: tells GitHub Pages to serve files as they are
├── css/
│   └── style.css          All styles
├── js/
│   ├── i18n.js            Interface language: English/Arabic button, page direction, saved choice
│   ├── i18n-ar.js         Arabic text for the interface (not for the content)
│   ├── content-schema.js  Data format, validation rules, units and topics
│   ├── content-store.js   Add/edit/delete/move/import logic, browser drafts
│   ├── common.js          Shared helpers: data loading, unit links, empty and error states, menu
│   ├── quiz-engine.js     Quiz rules: answer keys, scoring, unanswered questions
│   ├── quiz-ui.js         Quiz screens: one at a time, or all questions then check
│   └── home.js, grammar.js, summaries.js, practice.js, reading.js, manage.js
├── data/                  The content (empty to start)
│   ├── units.json
│   ├── grammar-lessons.json
│   ├── grammar-summaries.json
│   ├── grammar-questions.json
│   └── reading-passages.json
├── docs/
│   ├── CONTENT_FORMAT.md          Data format reference
│   └── GITHUB_PAGES_DIAGNOSTIC.md Why the first upload showed unstyled pages
├── tools/
│   ├── check-site.js       Checks files, folders, letter case and paths before upload
│   └── validate-content.js Checks the content in data/
├── tests/                 Automated tests (development only, not used by the site)
├── README.md
└── PROJECT_STATUS.md
```

The website itself needs only the six `.html` files, `.nojekyll`, and the
`css`, `js` and `data` **folders** — the files must stay inside them. The
other folders are documentation and tools; uploading them is recommended.

## Publish on GitHub Pages

**Upload the folders, not just the files.** The site breaks (plain, unstyled
pages that keep saying “Loading…”) if `css`, `js` or `data` is missing. See
[docs/GITHUB_PAGES_DIAGNOSTIC.md](docs/GITHUB_PAGES_DIAGNOSTIC.md).

1. Unzip the project and open the `grade12-english` folder, so you can see
   `index.html`, `css`, `js`, `data` and the other items.
2. On GitHub, open your repository and choose **Add file → Upload files**.
3. Select **everything** in the folder (Ctrl+A on Windows, Cmd+A on Mac) and
   **drag it onto the upload area**. The selection must include the
   **folders** `css`, `js`, `data`, `docs`, `tools` and `tests` themselves —
   not the files from inside them. Do **not** use the “choose your files”
   button: it cannot select folders, and files chosen with it all land at the
   top level, where the website cannot find them. Dragging folders works in
   Chrome, Edge and Firefox on a computer, not on a phone.
4. Before committing, scroll through the list of files and check that the
   names include their folder: `css/style.css`, `js/common.js`,
   `data/units.json`. If you see only `style.css` or `common.js`, the folders
   were not included — cancel and drag the folders again. Then choose
   **Commit changes**.
5. The first time only: open **Settings → Pages**, choose **Deploy from a
   branch**, then branch `main` and folder `/ (root)`, and save.
6. Wait 1–2 minutes and open `https://<user>.github.io/<repository>/`. If you
   still see the old page, force a reload: **Ctrl+F5** (Windows) or
   **Cmd+Shift+R** (Mac).

If the folders still do not upload, use **GitHub Desktop** (free), which
always keeps folders.

If something is still missing, every page shows a red message naming the
missing files.

## Interface language (English / العربية)

- Every page has a language button in the header: **العربية** on English
  pages, **English** on Arabic pages. It switches the interface — menus,
  buttons, headings, labels and messages, including the content manager —
  and the page direction (left-to-right for English, right-to-left for
  Arabic).
- **Educational content is never translated.** Lessons, summaries,
  questions, answer choices, answers, explanations and passages always
  appear exactly as written, and each keeps its own text direction.
- The choice is saved in the browser (`localStorage`, key `g12-lang`) and
  applies to every page after reloading. If the browser blocks storage, the
  site stays in English.
- The Arabic text is in `js/i18n-ar.js`: English on the left, Arabic on the
  right. To change a translation, edit the right-hand side and keep any
  `{placeholders}`. Text missing there is shown in English.

## Run it on your computer

Browsers block data files when a page is opened directly from disk
(`file://`), so use any local web server, for example with Python:

```
cd grade12-english
python -m http.server 8000
```

Then open <http://localhost:8000/>.

## Adding and managing content

Open `manage.html` (also linked at the bottom of every page).

1. **Add and edit** units, lessons (topics), summaries, grammar questions and
   reading passages (with their questions). Link each item to its unit, and
   summaries and questions to their topic. You can also delete items, reorder
   them, filter questions by unit and topic, and search question text.
2. Your work is **saved automatically as a draft in this browser** (on this
   device only). Nothing is sent anywhere.
3. Tick **“Preview my draft on the student pages”** to see the draft on the
   real pages in your browser. Students do not see it.
4. **Publish:** open *Import & export* and choose *Download all five files*.
   Then, in your GitHub repository, **open the `data` folder first**, choose
   **Add file → Upload files**, upload the five files (they replace the old
   ones) and commit.
5. **Back up** regularly with *Download backup file*. A backup (or any data
   file) can be **imported** on any computer. *Merge* adds new items and
   updates items with the same ID; *Replace* swaps the imported type
   completely. Files are checked before anything changes.

Notes:

- Anyone can open `manage.html` on the public site, but it only changes a
  draft in **their own** browser. Only people who can push to the GitHub
  repository can change the published website.
- The **“A teacher has reviewed this …”** tick decides how answers are shown.
  Until it is ticked, students see answers as *suggested answers*, never as
  definitely correct, and scores are marked *provisional*.
- Drafts live in the browser’s storage (usually about 5 MB). Clearing the
  browser’s site data deletes the draft, so download backups.

The data format is described in [docs/CONTENT_FORMAT.md](docs/CONTENT_FORMAT.md).

## Checks (need Node.js; no packages to install)

```
node tools/check-site.js        # before uploading: folders, files, letter case, relative paths
node tools/validate-content.js  # after editing data/*.json by hand
```

## Tests (for developers)

```
node --test tests/*.test.js     # unit tests (Node.js 18+), including a check that every interface text has Arabic
python tests/e2e_test.py        # browser tests; needs: pip install playwright && python -m playwright install chromium
```

The browser tests serve the site from a subfolder (like GitHub Pages), type
placeholder test text into the content manager, and never change the files
in `data/`.
