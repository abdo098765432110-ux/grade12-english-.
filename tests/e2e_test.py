"""
End-to-end browser tests (development only — not needed to run the website).

Runs the real pages in headless Chromium. The site is served from a
SUBFOLDER (http://127.0.0.1:<port>/<project-folder>/) to check that every
path works the way it will on GitHub Pages (https://user.github.io/repo/).

Requirements:  pip install playwright  &&  python -m playwright install chromium
Run:           python tests/e2e_test.py

All test content is typed into the content manager during the test (or
served from inside this script). It is placeholder text such as
"Test prompt one", not educational content, and it is never written to the
project's data folder.
"""
import functools
import http.server
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import threading
import traceback

from playwright.sync_api import expect, sync_playwright

PROJECT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path(os.environ.get("E2E_SCREENSHOTS", tempfile.mkdtemp(prefix="g12-shots-")))
SHOTS.mkdir(parents=True, exist_ok=True)
DOWNLOADS = pathlib.Path(tempfile.mkdtemp(prefix="g12-downloads-"))

results = []  # (section, ok, detail)


def record(section, ok, detail=""):
    results.append((section, ok, detail))
    print(("PASS " if ok else "FAIL ") + section + (": " + detail if detail else ""))


# ---------------------------------------------------------------- server

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_server():
    handler = functools.partial(QuietHandler, directory=str(PROJECT.parent))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, "http://127.0.0.1:%d/%s/" % (server.server_address[1], PROJECT.name)


# ---------------------------------------------------------------- helpers

AUDIT_JS = r"""
() => {
  const problems = [];
  const seen = {};
  document.querySelectorAll('[id]').forEach(n => {
    if (seen[n.id]) problems.push('duplicate id: ' + n.id);
    seen[n.id] = true;
  });
  document.querySelectorAll('input, select, textarea').forEach(n => {
    if (n.type === 'hidden') return;
    const ok = (n.labels && n.labels.length) || n.getAttribute('aria-label') || n.getAttribute('aria-labelledby');
    if (!ok) problems.push('control without label: ' + (n.id || n.name || n.outerHTML.slice(0, 80)));
  });
  document.querySelectorAll('a[href], button').forEach(n => {
    const name = (n.getAttribute('aria-label') || n.textContent || '').trim();
    if (!name) problems.push('link/button without a name: ' + n.outerHTML.slice(0, 80));
  });
  const h1 = document.querySelectorAll('h1').length;
  if (h1 !== 1) problems.push('page has ' + h1 + ' h1 headings');
  if (!document.documentElement.lang) problems.push('html lang missing');
  let previous = 0;
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
    if (h.closest('[hidden]')) return;
    const level = Number(h.tagName[1]);
    if (previous && level > previous + 1) problems.push('heading jumps from h' + previous + ' to h' + level + ': ' + h.textContent.trim().slice(0, 40));
    previous = level;
  });
  ['aria-describedby', 'aria-labelledby'].forEach(attr => {
    document.querySelectorAll('[' + attr + ']').forEach(n => {
      n.getAttribute(attr).split(/\s+/).filter(Boolean).forEach(id => {
        if (!document.getElementById(id)) problems.push(attr + ' points to missing id: ' + id);
      });
    });
  });
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    problems.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + window.innerWidth);
  }
  return problems;
}
"""


def audit(page, label):
    problems = page.evaluate(AUDIT_JS)
    record("accessibility checks: " + label, not problems, "; ".join(problems[:6]))


def watch(page):
    """Collect console errors, page errors and failed requests."""
    page.errors = []
    page.on("console", lambda m: page.errors.append("console %s: %s" % (m.type, m.text)) if m.type == "error" else None)
    page.on("pageerror", lambda e: page.errors.append("page error: %s" % e))
    page.on("requestfailed", lambda r: page.errors.append("request failed: %s" % r.url))
    return page


def no_errors(page, label):
    record("no browser errors: " + label, not page.errors, "; ".join(page.errors[:5]))
    page.errors.clear()


def draft(page):
    raw = page.evaluate("() => localStorage.getItem('g12-content-draft-v1')")
    return json.loads(raw)["library"] if raw else None


def run_section(name, fn, *args):
    try:
        fn(*args)
    except Exception as error:  # noqa: BLE001 - report and continue with the next section
        record(name + " (section stopped)", False, "%s\n%s" % (error, traceback.format_exc(limit=3)))


# ---------------------------------------------------------------- 1. empty site

def empty_site(browser, base):
    context = browser.new_context()
    page = watch(context.new_page())
    pages = {
        "index.html": ("No content added yet", "manage.html"),
        "grammar.html": ("No lessons added yet", "manage.html#lessons/new"),
        "summaries.html": ("No summaries added yet", "manage.html#summaries/new"),
        "practice.html": ("No practice questions added yet", "manage.html#questions/new"),
        "reading.html": ("No reading passages added yet", "manage.html#passages/new"),
    }
    for path, (heading, href) in pages.items():
        page.goto(base + path)
        expect(page.locator(".empty-state h2")).to_have_text(heading)
        link = page.locator(".empty-state a").first
        record("empty state on " + path, link.get_attribute("href") == href, "button links to " + str(link.get_attribute("href")))
        audit(page, path + " (empty)")
        no_errors(page, path + " (empty)")
    page.goto(base + "index.html")
    page.screenshot(path=str(SHOTS / "01-home-empty.png"), full_page=True)
    # Unknown lesson / passage ids show a friendly message.
    page.goto(base + "grammar.html?lesson=does-not-exist")
    expect(page.locator("h1")).to_have_text("Lesson not found")
    page.goto(base + "reading.html?passage=does-not-exist")
    expect(page.locator("h1")).to_have_text("Passage not found")
    record("unknown lesson and passage show 'not found'", True)
    no_errors(page, "not-found pages")
    context.close()


# ---------------------------------------------------------------- 2. content manager

def manager_flow(context, base):
    page = watch(context.new_page())
    dialogs = []

    def on_dialog(dialog):
        dialogs.append(dialog.message)
        if getattr(page, "dismiss_next", False):
            page.dismiss_next = False
            dialog.dismiss()
        else:
            dialog.accept()

    page.on("dialog", on_dialog)
    page.goto(base + "manage.html")
    expect(page.locator("#manager-view .empty-state h3")).to_have_text("No lessons added yet")
    expect(page.locator(".status-bar")).to_contain_text("No unpublished changes")
    audit(page, "manager (empty)")

    # --- Lesson 1: validation, then four section types
    page.click("text=Add a lesson >> nth=0")
    expect(page).to_have_url(re.compile(r"#lessons/new$"))
    page.click("button:has-text('Save lesson')")
    expect(page.locator(".error-summary")).to_contain_text("Enter a title")
    record("empty lesson form shows an error summary",
           page.evaluate("() => document.activeElement.classList.contains('error-summary')")
           and page.get_attribute("#f-title", "aria-invalid") == "true")

    page.fill("#f-title", "Test lesson one")
    record("lesson ID fills in from the title", page.input_value("#f-id") == "test-lesson-one", page.input_value("#f-id"))
    page.fill("#f-description", "Placeholder description")
    page.click("button:has-text('Add section')")
    page.fill("#sec-0-heading", "Heading A")
    page.fill("#sec-0-text", "Paragraph one.\n\nParagraph two.")
    page.click("button:has-text('Add section')")
    page.select_option("#sec-1-type", "table")
    page.fill("#sec-1-columns", "Col 1\nCol 2")
    page.fill("#sec-1-rows", "a | b\nc")
    page.click("button:has-text('Add section')")
    page.select_option("#sec-2-type", "mistakes")
    page.fill("#sec-2-m-0-avoid", "wrong text")
    page.fill("#sec-2-m-0-use", "right text")
    page.click("button:has-text('Add section')")
    page.select_option("#sec-3-type", "note")
    page.fill("#sec-3-text", "نص تجريبي")
    page.select_option("#sec-3-lang", "ar")
    page.click("button:has-text('Save lesson')")
    expect(page.locator(".error-summary")).to_contain_text("row 2 has 1 cell, but the table has 2 columns")
    record("bad table row is reported and linked to its section", page.get_attribute("#sec-1-type", "aria-invalid") == "true")
    page.fill("#sec-1-rows", "a | b\nc | d")
    page.screenshot(path=str(SHOTS / "02-lesson-editor.png"), full_page=True)
    audit(page, "lesson editor")
    page.click("button:has-text('Save lesson')")
    expect(page).to_have_url(re.compile(r"#lessons$"))
    expect(page.locator(".manager-message")).to_contain_text("Lesson “Test lesson one” saved.")
    record("lesson saved and listed", page.locator(".manager-row").count() == 1)

    # --- Lesson 2 (reviewed), then reorder
    page.click("text=Add a lesson >> nth=0")
    page.fill("#f-title", "Test lesson two")
    page.check("#f-reviewed")
    page.click("button:has-text('Add section')")
    page.fill("#sec-0-text", "Only paragraph.")
    page.click("button:has-text('Save lesson')")
    expect(page.locator(".manager-row")).to_have_count(2)
    page.click("[data-id='test-lesson-two'][data-action='up']")
    expect(page.locator(".manager-row-title").first).to_have_text("Test lesson two")
    focused = page.evaluate("() => document.activeElement.getAttribute('data-id')")
    record("move up reorders lessons and keeps focus on the moved item", focused == "test-lesson-two", "focus on " + str(focused))

    # --- Summary with a point-level validation error
    page.click(".manager-nav >> text=Summaries")
    page.click("text=Add a summary >> nth=0")
    page.fill("#f-title", "Test summary")
    page.select_option("#f-lesson", "test-lesson-one")
    page.fill("#pt-0-title", "P1")
    page.fill("#pt-0-rule", "Rule one")
    page.fill("#pt-0-example", "Example one")
    page.click("button:has-text('Add point')")
    page.fill("#pt-1-example", "Example without a rule")
    page.fill("#f-remember", "Reminder one\nReminder two")
    page.click("button:has-text('Save summary')")
    expect(page.locator(".error-summary")).to_contain_text("Point 2 needs a rule.")
    page.fill("#pt-1-rule", "Rule two")
    page.click("button:has-text('Save summary')")
    expect(page.locator(".manager-row")).to_have_count(1)
    record("summary saved after fixing the point error", True)

    # --- Grammar questions
    page.click(".manager-nav >> text=Grammar questions")
    page.click("text=Add a question >> nth=0")
    page.select_option("#f-topic", "test-lesson-one")
    page.fill("#f-prompt", "Test prompt ___ one")
    for i, text in enumerate(["Opt A", "Opt B", "Opt C", "Opt D"]):
        page.fill("#f-option-%d" % i, text)
    page.check("#f-correct-1")
    page.fill("#f-explanation", "Placeholder explanation")
    page.select_option("#f-difficulty", "easy")
    audit(page, "question editor")
    page.click("button:has-text('Save and add another')")
    expect(page.locator(".manager-message")).to_contain_text("Question q-001 saved.")
    expect(page).to_have_url(re.compile(r"#questions/new$"))
    record("'Save and add another' keeps the same topic", page.input_value("#f-topic") == "test-lesson-one")

    page.fill("#f-prompt", "Test prompt two")
    page.fill("#f-option-0", "X")
    page.fill("#f-option-1", "Y")
    page.check("#f-correct-0")
    page.check("#f-reviewed")
    page.click("button:has-text('Save question')")
    expect(page.locator(".manager-row")).to_have_count(2)

    page.click("text=Add a question >> nth=0")
    page.click("button:has-text('Save question')")
    summary = page.locator(".error-summary").inner_text()
    record("question form requires a prompt and a correct option",
           "Write the question." in summary and "Mark which option is the correct answer." in summary, summary.replace("\n", " | "))
    page.fill("#f-prompt", "Test prompt three")
    page.fill("#f-option-0", "Same")
    page.fill("#f-option-1", "Same")
    page.check("#f-correct-0")
    page.click("button:has-text('Save question')")
    expect(page.locator(".error-summary")).to_contain_text("is the same as another option")
    page.check("#f-type-short")
    page.fill("#f-model-answer", "Placeholder model answer")
    page.click("button:has-text('Save question')")
    expect(page.locator(".manager-row")).to_have_count(3)
    record("three grammar questions saved (2 multiple choice, 1 short answer)", True)

    page.select_option("#filter-topic", "")
    expect(page.locator("#manager-view")).to_contain_text("Showing 0 of 3 questions")
    page.select_option("#filter-topic", "__all__")
    page.fill("#filter-text", "two")
    expect(page.locator(".manager-row")).to_have_count(1)
    record("question filters work", True)
    page.fill("#filter-text", "")

    # --- Reading passage and its questions
    page.click(".manager-nav >> text=Reading passages")
    page.click("text=Add a passage >> nth=0")
    page.fill("#f-title", "Test passage")
    page.fill("#f-level", "Test level")
    page.fill("#f-text", "First paragraph has five words.\n\nSecond paragraph.")
    expect(page.locator("#f-text-count")).to_have_text("2 paragraphs · 7 words")
    page.click("button:has-text('Save passage')")
    expect(page).to_have_url(re.compile(r"#passages/edit/test-passage$"))
    expect(page.locator(".manager-message")).to_contain_text("You can now add questions")
    page.click("text=Add a question")
    page.fill("#f-prompt", "Passage question one")
    page.fill("#f-option-0", "P")
    page.fill("#f-option-1", "Q")
    page.check("#f-correct-1")
    page.click("button:has-text('Save question')")
    expect(page).to_have_url(re.compile(r"#passages/edit/test-passage$"))
    page.click("text=Add a question")
    page.check("#f-type-short")
    page.fill("#f-prompt", "Passage question two")
    page.fill("#f-model-answer", "Placeholder passage answer")
    page.click("button:has-text('Save question')")
    expect(page.locator("#passage-questions-heading")).to_have_text("Questions about this passage (2)")
    page.click("[data-id='q-002'][data-action='up']")
    expect(page.locator(".manager-row-title").first).to_have_text("Passage question two")
    record("passage questions added and reordered", True)

    # --- Rename a lesson id: links follow
    page.click(".manager-nav >> text=Lessons")
    page.click("[aria-label='Edit lesson “Test lesson one”']")
    page.fill("#f-id", "renamed-lesson")
    page.click("button:has-text('Save changes')")
    expect(page.locator(".manager-message")).to_contain_text("now use the new ID")
    library = draft(page)
    record("renaming a lesson updates linked questions and summaries",
           all(q.get("topic") == "renamed-lesson" for q in library["questions"]) and library["summaries"][0]["lessonId"] == "renamed-lesson")

    # --- Delete lesson two
    page.click("[data-id='test-lesson-two'][data-action='delete']")
    expect(page.locator(".manager-row")).to_have_count(1)
    record("delete asks for confirmation and removes the lesson", any("Delete the lesson" in d for d in dialogs))

    # --- Unsaved-changes guard
    page.click("text=Add a lesson >> nth=0")
    page.fill("#f-title", "Unsaved title")
    page.dismiss_next = True
    page.click(".manager-nav >> text=Summaries")
    page.wait_for_timeout(200)
    record("leaving a form with unsaved changes asks first (Cancel stays)",
           page.url.endswith("#lessons/new") and page.input_value("#f-title") == "Unsaved title")
    page.click(".manager-nav >> text=Summaries")  # accept this time
    expect(page).to_have_url(re.compile(r"#summaries$"))

    nav = page.locator(".manager-nav").inner_text()
    record("navigation counts", all(s in nav for s in ["Lessons (1)", "Summaries (1)", "Grammar questions (3)", "Reading passages (1)"]), nav.replace("\n", " "))
    expect(page.locator(".status-bar")).to_contain_text("You have unpublished changes")
    page.click(".manager-nav >> text=Import & export")
    expect(page.locator("#check-heading + p + p")).to_have_text("No errors found.")
    audit(page, "import & export view")
    page.screenshot(path=str(SHOTS / "03-manager-tools.png"), full_page=True)
    no_errors(page, "content manager")
    return page


# ---------------------------------------------------------------- 3. preview on student pages

def answer_current(page, choice):
    page.click(".options label:has-text('%s')" % choice)
    page.click("button:has-text('Submit answer')")


def student_pages_in_preview(page, base):
    page.goto(base + "manage.html")
    page.check("#preview-toggle")
    expect(page.locator(".manager-message")).to_contain_text("Preview is on")

    page.goto(base + "index.html")
    expect(page.locator("#preview-banner")).to_be_visible()
    counts = [page.inner_text("[data-count='%s']" % k) for k in ["lessons", "summaries", "questions", "passages"]]
    record("home page counts in preview", counts == ["1 lesson", "1 summary", "3 questions", "1 passage"], str(counts))

    page.goto(base + "grammar.html")
    page.click("text=Read lesson")
    expect(page.locator("h1")).to_have_text("Test lesson one")
    expect(page.locator(".lesson-body h2").first).to_have_text("Heading A")
    record("lesson sections render (text, table, mistakes, Arabic note)",
           page.locator(".lesson-body p").first.inner_text() == "Paragraph one."
           and page.locator(".lesson-body table tbody tr").count() == 2
           and page.locator(".mistake-list li").count() == 1
           and page.locator(".lesson-section[lang='ar'][dir='rtl']").count() == 1)
    expect(page.locator(".next-steps")).to_contain_text("Practise this topic (3 questions)")
    audit(page, "lesson page")
    page.screenshot(path=str(SHOTS / "04-lesson-page.png"), full_page=True)

    page.click("text=Read the summary")
    expect(page).to_have_url(re.compile(r"summaries\.html#test-summary$"))
    expect(page.locator(".summary-card tbody tr")).to_have_count(2)
    audit(page, "summaries page")

    # --- Practice: unreviewed wording, retry, reviewed wording, short answer, results
    page.goto(base + "practice.html?topic=renamed-lesson")
    record("practice topic is preselected from the link", page.input_value("#practice-topic") == "renamed-lesson")
    expect(page.locator("label[for='practice-count-all']")).to_have_text("All (3)")
    audit(page, "practice setup")
    page.click("button:has-text('Start practice')")
    seen = set()
    for _ in range(3):
        legend = page.locator(".question-legend").inner_text()
        if "one" in legend:
            answer_current(page, "Opt A")
            expect(page.locator(".feedback")).to_contain_text("different from the suggested answer")
            record("unreviewed wrong answer is not called 'incorrect'", "Not correct" not in page.locator(".feedback").inner_text())
            record("focus moves to the feedback after submitting",
                   page.evaluate("() => document.activeElement.classList.contains('feedback')"))
            page.click("button:has-text('Try again')")
            record("tried option is disabled on retry", page.is_disabled(".options input >> nth=0"))
            answer_current(page, "Opt B")
            expect(page.locator(".feedback")).to_contain_text("matches the suggested answer")
            expect(page.locator(".feedback .review-note")).to_be_visible()
            page.screenshot(path=str(SHOTS / "05-practice-feedback.png"), full_page=True)
            seen.add("unreviewed")
        elif "two" in legend:
            answer_current(page, "X")
            expect(page.locator(".feedback-title")).to_have_text("Correct!")
            seen.add("reviewed")
        else:
            page.fill(".question-form textarea", "My placeholder answer")
            page.click("button:has-text('Submit answer')")
            expect(page.locator(".feedback")).to_contain_text("Placeholder model answer")
            seen.add("short")
        audit(page, "practice question")
        page.click(".actions button:has-text('Next question'), .actions button:has-text('See results')")
    record("all three question kinds were shown", seen == {"unreviewed", "reviewed", "short"}, str(seen))
    expect(page.locator(".score-number")).to_have_text("1 / 2")
    expect(page.locator(".quiz .notice")).to_contain_text("Provisional score")
    audit(page, "practice results")
    page.screenshot(path=str(SHOTS / "06-practice-results.png"), full_page=True)
    page.click("button:has-text('Retry missed questions (1)')")
    expect(page.locator(".quiz-progress-text")).to_have_text("Missed questions — Question 1 of 1")
    answer_current(page, "Opt C")
    page.click("button:has-text('Show suggested answer')")
    expect(page.locator(".feedback-title")).to_have_text("Suggested answer: Opt B")
    page.click("button:has-text('See results')")
    expect(page.locator(".score-number")).to_have_text("0 / 1")
    page.click("button:has-text('Restart quiz')")
    expect(page.locator(".quiz-progress-text")).to_have_text("Question 1 of 3")
    page.click("text=← Change practice settings")
    expect(page.locator("#setup-heading")).to_be_visible()
    record("practice: score, retry missed, show answer, restart and change settings work", True)

    # --- Reading
    page.goto(base + "reading.html")
    expect(page.locator(".card .passage-meta")).to_contain_text("2 questions")
    page.click("text=Read passage")
    expect(page.locator(".passage-paragraphs li")).to_have_count(2)
    expect(page.locator(".question-legend, .question-form label.question-legend").first).to_contain_text("Passage question two")
    page.fill(".question-form textarea", "Reading answer")
    page.click("button:has-text('Submit answer')")
    page.click("button:has-text('Next question')")
    answer_current(page, "P")
    page.click("button:has-text('Show suggested answer')")
    page.click("button:has-text('See results')")
    expect(page.locator(".score-number")).to_have_text("0 / 1")
    expect(page.locator(".review-list li")).to_have_count(2)
    record("reading: passage, questions in set order, short answer and results work", True)
    audit(page, "reading results")
    page.screenshot(path=str(SHOTS / "07-reading.png"), full_page=True)

    # --- Phone width
    page.set_viewport_size({"width": 375, "height": 800})
    for path in ["index.html", "grammar.html?lesson=renamed-lesson", "summaries.html", "practice.html", "reading.html?passage=test-passage", "manage.html#lessons/edit/renamed-lesson"]:
        page.goto(base + path)
        page.wait_for_timeout(250)
        audit(page, "phone width " + path)
    page.screenshot(path=str(SHOTS / "08-phone-lesson-editor.png"), full_page=True)
    page.goto(base + "practice.html")
    page.click("button:has-text('Start practice')")
    page.screenshot(path=str(SHOTS / "09-phone-practice.png"), full_page=True)
    page.set_viewport_size({"width": 1280, "height": 900})

    # --- Stop preview: back to the (empty) published files
    page.goto(base + "grammar.html")
    page.click("#preview-banner button:has-text('Stop preview')")
    expect(page.locator(".empty-state h2")).to_have_text("No lessons added yet")
    record("stopping preview shows the published files again", page.locator("#preview-banner").count() == 0)
    no_errors(page, "student pages in preview")


# ---------------------------------------------------------------- 4. export and publish

def export_files(page, base):
    page.goto(base + "manage.html#tools")
    names = {}
    for key, file in [("lessons", "grammar-lessons.json"), ("summaries", "grammar-summaries.json"),
                      ("questions", "grammar-questions.json"), ("passages", "reading-passages.json")]:
        with page.expect_download() as info:
            page.click("button:has-text('Download %s')" % file)
        download = info.value
        target = DOWNLOADS / "data" / download.suggested_filename
        target.parent.mkdir(exist_ok=True)
        download.save_as(target)
        names[key] = target
    with page.expect_download() as info:
        page.click("button:has-text('Download backup file')")
    backup = DOWNLOADS / info.value.suggested_filename
    info.value.save_as(backup)
    record("four data files and a backup downloaded",
           all(p.exists() for p in names.values()) and re.match(r"grade12-english-backup-\d{4}-\d{2}-\d{2}\.json", backup.name) is not None,
           ", ".join(sorted(p.name for p in names.values())) + ", " + backup.name)

    check = subprocess.run(["node", str(PROJECT / "tools" / "validate-content.js"), str(DOWNLOADS)], capture_output=True, text=True)
    record("exported files pass the command-line validator", check.returncode == 0, check.stdout.strip().splitlines()[-1] if check.stdout else check.stderr)
    return names, backup


def serve_json(body, status=200):
    """Route handler that answers with the given text (one argument only: route)."""
    def handler(route):
        route.fulfill(status=status, content_type="application/json", body=body)
    return handler


def published_site(browser, base, files):
    """Serve the exported files as if they were uploaded to GitHub (no draft in this browser)."""
    context = browser.new_context()
    for key, path in files.items():
        context.route("**/data/" + path.name, serve_json(path.read_text(encoding="utf-8")))
    page = watch(context.new_page())
    page.goto(base + "grammar.html")
    expect(page.locator(".card h2")).to_have_text("Test lesson one")
    record("published files show on the student pages without preview", page.locator("#preview-banner").count() == 0)
    page.goto(base + "manage.html")
    expect(page.locator(".status-bar")).to_contain_text("No unpublished changes")
    record("manager loads published content as its starting point", "Lessons (1)" in page.locator(".manager-nav").inner_text())
    no_errors(page, "published site")
    context.close()

    # A hand-edited file with one broken question: the rest still works.
    context = browser.new_context()
    broken = {"schemaVersion": 1, "questions": [
        {"id": "q-001", "type": "mcq", "prompt": "Works", "options": ["A", "B"], "answer": "A", "reviewStatus": "unreviewed"},
        {"id": "q-002", "type": "mcq", "prompt": "Broken", "options": ["A", "B"], "answer": "C", "reviewStatus": "unreviewed"}]}
    context.route("**/data/grammar-questions.json", serve_json(json.dumps(broken)))
    page = watch(context.new_page())
    page.goto(base + "practice.html")
    expect(page.locator("main")).to_contain_text("1 item could not be shown")
    expect(page.locator("#practice-topic option").first).to_have_text("All topics (1)")
    record("a broken item is skipped with a notice; the rest still works", True)
    no_errors(page, "broken item")
    context.close()

    # Invalid JSON and a missing file show a clear message instead of a blank page.
    context = browser.new_context()
    context.route("**/data/reading-passages.json", serve_json("{ not json"))
    context.route("**/data/grammar-lessons.json", serve_json("missing", status=404))
    page = context.new_page()
    page.goto(base + "reading.html")
    expect(page.locator(".notice--error")).to_contain_text("contains invalid JSON")
    page.goto(base + "grammar.html")
    expect(page.locator(".notice--error")).to_contain_text("HTTP 404")
    record("invalid or missing data files show an error message", True)
    context.close()


# ---------------------------------------------------------------- 5. import

def import_flow(browser, base, backup):
    context = browser.new_context()
    page = watch(context.new_page())
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(base + "manage.html#tools")

    page.set_input_files("#import-files", str(backup))
    page.click("#import-result >> xpath=.. >> button:has-text('Import')")
    expect(page.locator("#import-result")).to_contain_text("Import complete")
    nav = page.locator(".manager-nav").inner_text()
    record("backup import (merge) restores everything", "Lessons (1)" in nav and "Grammar questions (3)" in nav and "Reading passages (1)" in nav, nav.replace("\n", " "))

    page.set_input_files("#import-files", str(backup))
    page.click("#import-result >> xpath=.. >> button:has-text('Import')")
    expect(page.locator("#import-result")).to_contain_text("Lessons: 0 added, 1 updated.")
    record("importing the same backup again updates instead of duplicating", True)

    bad = DOWNLOADS / "bad-questions.json"
    bad.write_text(json.dumps({"schemaVersion": 1, "questions": [
        {"id": "q-900", "type": "mcq", "prompt": "Bad", "options": ["A", "B"], "answer": "Z", "reviewStatus": "unreviewed"}]}))
    page.set_input_files("#import-files", str(bad))
    page.click("#import-result >> xpath=.. >> button:has-text('Import')")
    expect(page.locator("#import-result")).to_contain_text("Nothing was imported")
    expect(page.locator("#import-result")).to_contain_text("does not exactly match any option")
    record("an invalid file is rejected and nothing changes", "Grammar questions (3)" in page.locator(".manager-nav").inner_text())

    notjson = DOWNLOADS / "not-json.json"
    notjson.write_text("hello")
    page.set_input_files("#import-files", str(notjson))
    page.click("#import-result >> xpath=.. >> button:has-text('Import')")
    expect(page.locator("#import-result")).to_contain_text("is not valid JSON")

    single = DOWNLOADS / "one-question.json"
    single.write_text(json.dumps({"schemaVersion": 1, "questions": [
        {"id": "q-777", "type": "mcq", "prompt": "Replacement", "options": ["A", "B"], "answer": "A", "reviewStatus": "unreviewed"}]}))
    page.set_input_files("#import-files", str(single))
    page.check("#import-replace")
    page.click("#import-result >> xpath=.. >> button:has-text('Import')")
    expect(page.locator(".manager-nav")).to_contain_text("Grammar questions (1)")
    record("replace import swaps only the imported type", "Lessons (1)" in page.locator(".manager-nav").inner_text())

    page.click("button:has-text('Discard my draft')")
    expect(page.locator(".manager-nav")).to_contain_text("Lessons (0)")
    record("discarding the draft returns to the published (empty) files", draft(page) is None)
    no_errors(page, "import")
    context.close()


# ---------------------------------------------------------------- 6. colour contrast

def contrast():
    def luminance(hex_color):
        channels = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        channels = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

    def ratio(a, b):
        la, lb = sorted([luminance(a), luminance(b)], reverse=True)
        return (la + 0.05) / (lb + 0.05)

    css = (PROJECT / "css" / "style.css").read_text()
    var = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", css))
    pairs = [
        ("text", "bg"), ("text", "surface"), ("muted", "surface"), ("muted", "bg"), ("primary", "surface"),
        ("primary", "primary-light"), ("primary", "bg"), ("success", "success-bg"), ("danger", "danger-bg"),
        ("danger", "surface"), ("warning", "warning-bg"), ("info", "info-bg"),
    ]
    failures = []
    for fg, bg in pairs:
        r = ratio(var["color-" + fg], var["color-" + bg])
        if r < 4.5:
            failures.append("%s on %s = %.2f" % (fg, bg, r))
    white_on_primary = ratio("#ffffff", var["color-primary"])
    if white_on_primary < 4.5:
        failures.append("white on primary = %.2f" % white_on_primary)
    record("colour contrast of text colour pairs is at least 4.5:1 (WCAG AA)", not failures, "; ".join(failures))


# ---------------------------------------------------------------- main

def main():
    server, base = start_server()
    print("Serving the site from a subfolder: " + base)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        run_section("empty site", empty_site, browser, base)
        context = browser.new_context(accept_downloads=True)
        page = None
        try:
            page = manager_flow(context, base)
        except Exception as error:  # noqa: BLE001
            record("content manager (section stopped)", False, "%s\n%s" % (error, traceback.format_exc(limit=3)))
        files = backup = None
        if page:
            run_section("student pages in preview", student_pages_in_preview, page, base)
            try:
                files, backup = export_files(page, base)
            except Exception as error:  # noqa: BLE001
                record("export (section stopped)", False, "%s\n%s" % (error, traceback.format_exc(limit=3)))
        context.close()
        if files:
            run_section("published site", published_site, browser, base, files)
            run_section("import", import_flow, browser, base, backup)
        browser.close()
    server.shutdown()
    contrast()

    passed = sum(1 for _, ok, _ in results if ok)
    print("\n%d checks, %d passed, %d failed" % (len(results), passed, len(results) - passed))
    print("Screenshots: %s" % SHOTS)
    data_untouched = all(
        json.loads((PROJECT / "data" / f).read_text())[k] == []
        for f, k in [("grammar-lessons.json", "lessons"), ("grammar-summaries.json", "summaries"),
                     ("grammar-questions.json", "questions"), ("reading-passages.json", "passages")])
    print("Project data files still empty after the test: %s" % data_untouched)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
