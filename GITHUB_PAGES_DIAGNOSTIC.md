# Diagnostic report: why the live site showed plain, unstyled HTML

_Site:_ https://abdo098765432110-ux.github.io/grade12-english/
_Repository:_ https://github.com/abdo098765432110-ux/grade12-english (branch `main`, commit `5eb4af4` “Add files via upload”)
_Checked:_ 20 October 2026

## Conclusion

**The `css`, `js` and `data` folders were never uploaded to the repository.**
The HTML pages were uploaded and are served correctly, but every stylesheet,
script and data file they load is missing, so GitHub Pages returns
“404 Not Found” for each one. The browser then shows the raw HTML with its
default styling, and pages that build their content with JavaScript stay on
“Loading…” forever.

The paths in the pages were already correct (relative, lower-case, matching
the project folders). No code change was needed to fix the problem itself.
The fix is to upload the missing folders.

## Evidence

**1. What is in the repository.** The commit contains only these 10 top-level files:

```
.nojekyll  PROJECT_STATUS.md  README.md  grammar.html  index.html
manage.html  package.json  practice.html  reading.html  summaries.html
```

There are no `css/`, `js/`, `data/`, `docs/`, `tools/` or `tests/` folders.
Each uploaded file is byte-for-byte identical to the project delivered at the
end of Phase 1, so the files themselves were not damaged.

**2. What the pages ask for.** Every local file referenced by the uploaded
HTML, checked against the repository with exact upper/lower case:

| Referenced file | In repository? |
|---|---|
| `css/style.css` | **missing** |
| `js/content-schema.js`, `js/content-store.js`, `js/common.js` | **missing** |
| `js/home.js`, `js/grammar.js`, `js/summaries.js`, `js/practice.js`, `js/reading.js`, `js/manage.js` | **missing** |
| `js/quiz-engine.js`, `js/quiz-ui.js` | **missing** |
| `data/*.json` (4 files, loaded by the scripts) | **missing** |
| `index.html`, `grammar.html`, `summaries.html`, `practice.html`, `reading.html`, `manage.html` | present |

**3. The live site.** The HTML pages load. Requests for
`/grade12-english/css/style.css`, `/grade12-english/js/common.js` and
`/grade12-english/data/grammar-lessons.json` fail. The live Grammar Lessons
page shows only its heading and “Loading…”.

**4. Reproduced locally.** The repository was served exactly as published,
under the same `/grade12-english/` subfolder, in headless Chromium:

- `index.html` → 404 for `css/style.css`, `js/content-schema.js`,
  `js/content-store.js`, `js/common.js`, `js/home.js`. The page rendered in
  the browser’s default Times font with bullet lists and blue underlined
  links, matching the live site.
- `grammar.html` → same 404s; the page stayed on “Loading…”.
- A style check confirmed no CSS was applied (the “Skip to main content” link
  was in normal flow instead of hidden off-screen).

## Other possible causes that were checked and ruled out

| Possible cause | Result |
|---|---|
| **Absolute paths** (`/css/style.css`) that break inside the `/grade12-english/` subfolder | Ruled out. Every path is relative (`css/style.css`, `js/…`, `grammar.html`, `data/…`). No path starts with `/` or contains the full site address. |
| **Upper/lower case mismatch** (e.g. `CSS/Style.css` vs `css/style.css`). GitHub Pages is case-sensitive; Windows and macOS usually are not, so these errors often work locally but fail online. | Ruled out. All folder and file names, and every reference to them, are lower-case and match exactly. |
| **Wrong folder structure** (e.g. files inside an extra `grade12-english/` folder, or pages not at the top level) | Ruled out for the uploaded files. `index.html` is at the top level of the repository, so the site address is correct. Only the sub-folders are missing. |
| **GitHub Pages / Jekyll settings** | Ruled out. Pages serves `main` from the root, and `.nojekyll` is present. |

## Most likely way this happened

The commit message “Add files via upload” shows the files were added through
GitHub’s web page. On that page, the **“choose your files”** button lets you
select files but **not folders**. Folders are only included when they are
**dragged and dropped** onto the page. Selecting everything in the project
folder with the file picker therefore uploads the top-level files and
silently skips `css`, `js` and `data`.

## The fix

Upload the missing folders, keeping their names and contents exactly as they
are. The full steps are in README.md under “Publish on GitHub Pages”. In short:

1. Unzip the project and open the `grade12-english` folder.
2. On GitHub, open the repository → **Add file → Upload files**.
3. Select **everything** inside the folder, including the `css`, `js`,
   `data`, `docs`, `tools` and `tests` folders, and **drag** it onto the
   upload area. Do not use the “choose your files” button.
4. Before committing, check that the list shows paths such as
   `css/style.css` and `js/common.js`. Then commit.
5. Wait 1–2 minutes, then reload the site with **Ctrl+F5** (Windows) or
   **Cmd+Shift+R** (Mac). Browsers may keep the old unstyled page in their
   cache.

## Changes made so this cannot happen silently again

- **Missing-file message on every page.** A small inline script in each
  page’s `<head>` notices when a CSS or JS file fails to load. It shows a red
  message naming the missing files and says to check that the `css`, `js` and
  `data` folders are uploaded. It also replaces the endless “Loading…”.
- **`tools/check-site.js`.** Run `node tools/check-site.js` before uploading.
  It reports missing folders, missing files, upper/lower-case mismatches and
  absolute paths. On the published repository it reports 37 problems; on the
  fixed project it reports none.
- **Clear error states.** If a data file is missing, slow or broken, each page
  shows a heading, the reason (for example “The file "data/grammar-lessons.json"
  was not found (HTTP 404)”) and a **Try again** button, instead of a blank page.
