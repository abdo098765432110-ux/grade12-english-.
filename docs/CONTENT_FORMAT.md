# Content format

All educational content lives in four JSON files in the `data/` folder. The
website starts with all four empty. The easiest way to fill them is the
**content manager** (`manage.html`), which writes these files for you. This
page is for checking or editing the files by hand.

After editing by hand, check the files:

```
node tools/validate-content.js
```

| File | List inside it | Shown on |
|---|---|---|
| `data/grammar-lessons.json` | `lessons` | Grammar Lessons |
| `data/grammar-summaries.json` | `summaries` | Summaries |
| `data/grammar-questions.json` | `questions` | Practice |
| `data/reading-passages.json` | `passages` | Reading |

Every file has the same outer shape:

```json
{
  "schemaVersion": 1,
  "lessons": []
}
```

## Rules for every item

- **`id`** — required, unique within its list. Lowercase English letters,
  numbers and single hyphens only (for example `unit-3-lesson-2`). IDs appear
  in web addresses, so avoid changing them after publishing.
- **`reviewStatus`** — `"unreviewed"` or `"reviewed"`. Only `"reviewed"`
  items are treated as checked by a teacher. For anything else, students see
  “Not yet reviewed”, answers are called *suggested answers* (never
  “correct”/“incorrect”), and scores are marked *provisional*.
- Text fields are plain text. HTML is not interpreted (it is shown as typed),
  so content can never break the page. Arabic and English can be mixed; the
  text direction is detected automatically.

## Lesson

| Field | Required | Notes |
|---|---|---|
| `id`, `title`, `reviewStatus` | yes | |
| `description` | no | Shown in the lesson list. |
| `sections` | yes (may be empty) | Shown in order. Types below. |

Section types (each may also have an optional `heading`):

| `type` | Fields |
|---|---|
| `text` | `paragraphs`: list of text; optional `lang`: `"en"` or `"ar"` (Arabic shows right to left) |
| `note` | same as `text`, shown in a highlighted box |
| `list` | `items`: list of text (bullets) |
| `examples` | `items`: list of text (example boxes) |
| `table` | `columns`: list of headings; `rows`: list of rows, each a list with one cell per column |
| `mistakes` | `items`: list of `{ "avoid": "...", "use": "...", "note": "..." }` (`note` optional) |

```json
{
  "id": "lesson-id",
  "title": "Lesson title",
  "description": "One-line description",
  "reviewStatus": "unreviewed",
  "sections": [
    { "type": "text", "heading": "Heading", "paragraphs": ["First paragraph.", "Second paragraph."] },
    { "type": "table", "columns": ["Column 1", "Column 2"], "rows": [["cell", "cell"]] },
    { "type": "mistakes", "items": [{ "avoid": "Incorrect version", "use": "Correct version" }] }
  ]
}
```

## Summary

| Field | Required | Notes |
|---|---|---|
| `id`, `title`, `reviewStatus` | yes | |
| `lessonId` | no | The `id` of a lesson. Links the summary and the lesson together. |
| `points` | no | List of `{ "title": "...", "rule": "...", "example": "..." }`. Only `rule` is required. |
| `remember` | no | List of short reminders. |

## Question (grammar practice)

| Field | Required | Notes |
|---|---|---|
| `id`, `prompt`, `reviewStatus` | yes | Write `___` (three underscores) in `prompt` to show a blank. |
| `type` | yes | `"mcq"` (multiple choice, scored) or `"short"` (written answer, not scored). |
| `topic` | no | The `id` of a lesson. Questions without a topic appear under “Other questions”. |
| `options` | for `mcq` | 2 to 6 different, non-empty options. |
| `answer` | for `mcq` | Must be **exactly** the text of one option. |
| `modelAnswer` | for `short` | Students compare their own answer with it. |
| `explanation` | no | Shown after answering. |
| `difficulty` | no | `"easy"`, `"medium"` or `"hard"`. |

```json
{
  "id": "q-001",
  "type": "mcq",
  "topic": "lesson-id",
  "prompt": "Question text with a ___ blank",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "answer": "Option 2",
  "explanation": "Why this option is right",
  "reviewStatus": "unreviewed"
}
```

## Reading passage

| Field | Required | Notes |
|---|---|---|
| `id`, `title`, `reviewStatus` | yes | |
| `paragraphs` | yes | At least one paragraph. Paragraphs are numbered on the page. |
| `level` | no | For example “Grade 12”. |
| `source` | no | Credit for the text. Only publish texts you wrote or may use. |
| `questions` | yes (may be empty) | Same format as grammar questions (without `topic`). Shown in this order. Question ids must be unique within the passage. |

## Errors and warnings

- **Errors** make an item unusable. On the student pages, an item with errors
  is skipped and a short notice says how many were skipped; the rest of the
  page still works. The content manager never saves an item with errors and
  refuses imports that contain errors.
- **Warnings** do not stop anything (for example a lesson with no sections
  yet, or a question whose `topic` is not the id of any lesson).
