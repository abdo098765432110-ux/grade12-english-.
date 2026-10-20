# Grade 12 English

A free English learning website for Egyptian Grade 12 students: grammar
lessons, grammar summaries, grammar practice with feedback and scoring, and
reading comprehension.

- Plain HTML, CSS, JavaScript and JSON. No build step, no frameworks, no
  database, no accounts, no paid services, no AI APIs.
- Works on GitHub Pages, including inside a repository subfolder
  (`https://<user>.github.io/<repository>/`). All paths are relative.
- **Starts with an empty content library.** All lessons, summaries, questions
  and passages are added by the teacher with the built-in content manager.

## Pages

| Page | What it does |
|---|---|
| `index.html` | Home page with links and content counts |
| `grammar.html` | Lesson list; `grammar.html?lesson=<id>` shows one lesson |
| `summaries.html` | All summaries on one printable page |
| `practice.html` | Choose a topic and number of questions, then practise |
| `reading.html` | Passage list; `reading.html?passage=<id>` shows a passage with its questions |
| `manage.html` | Content manager for teachers |

## Run it on your computer

The pages load their content from JSON files, which browsers block when a
page is opened directly from disk (`file://`). Use any local web server, for
example with Python installed:

```
cd grade12-english
python -m http.server 8000
```

Then open <http://localhost:8000/>.

## Publish on GitHub Pages

1. Create a repository on GitHub and upload **all** the files in this folder
   (keep the folder structure, including the empty `.nojekyll` file).
2. In the repository, open **Settings → Pages**. Under “Build and
   deployment”, choose **Deploy from a branch**, select the `main` branch
   and the `/ (root)` folder, and save.
3. After a minute or two the site is available at
   `https://<your-user-name>.github.io/<repository-name>/`.

## Adding and managing content

Open `manage.html` (also linked at the bottom of every page).

1. **Add and edit** lessons, summaries, grammar questions and reading
   passages (with their questions). You can also delete items, change their
   order, filter questions by topic, and search question text.
2. Your work is **saved automatically as a draft in this browser** (on this
   device only). Nothing is sent anywhere.
3. Tick **“Preview my draft on the student pages”** to see your draft on the
   real pages in your browser. Students do not see it.
4. **Publish:** open *Import & export*, choose *Download all four files*, then
   in your GitHub repository open the `data` folder → **Add file → Upload
   files**, upload the four files (they replace the old ones) and commit.
5. **Back up** regularly with *Download backup file*. A backup (or any data
   file) can be **imported** on any computer: *Merge* adds new items and
   updates items with the same ID; *Replace* swaps the imported type
   completely. Files are checked before anything changes.

Notes:

- Anyone can open `manage.html` on the public site, but it can only change a
  draft in **their own** browser. Only people who can push to your GitHub
  repository can change the published website.
- The **“A teacher has reviewed this …”** tick decides how answers are shown.
  Until it is ticked, students see answers as *suggested answers*, never as
  definitely correct, and scores are marked *provisional*.
- Drafts live in the browser’s storage (usually around 5 MB). Clearing the
  browser’s site data deletes the draft, so download backups.

The data format is described in [docs/CONTENT_FORMAT.md](docs/CONTENT_FORMAT.md).
If you edit the JSON files by hand, check them with:

```
node tools/validate-content.js
```

## Project structure

```
index.html  grammar.html  summaries.html  practice.html  reading.html  manage.html
css/style.css              all styles
js/content-schema.js       data format and validation rules (browser + Node)
js/content-store.js        add/edit/delete/move/import logic and browser drafts
js/common.js               shared page helpers (loading, notices, empty states)
js/quiz-engine.js          quiz rules: answers, retry, scoring (no page code)
js/quiz-ui.js              quiz screens used by Practice and Reading
js/home.js grammar.js summaries.js practice.js reading.js manage.js   one per page
data/*.json                the content (empty to start)
tools/validate-content.js  command-line content check (Node.js)
tests/                     automated tests (development only)
docs/CONTENT_FORMAT.md     data format reference
PROJECT_STATUS.md          progress, test results and next steps
```

## Tests (for developers)

```
npm test                    # unit tests, needs Node.js 18+ (no packages)
python tests/e2e_test.py    # browser tests, needs: pip install playwright && python -m playwright install chromium
```

The browser tests serve the site from a subfolder (like GitHub Pages), type
placeholder test content into the content manager, and never change the
files in `data/`.
