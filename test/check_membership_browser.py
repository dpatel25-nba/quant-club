"""Browser checks for the public club pages and navigation.

Requires Playwright and Chromium. Run with the project's Python environment:
PLAYWRIGHT_BROWSERS_PATH=/tmp/gpmc-browsers ../venv/bin/python test/check_membership_browser.py
Screenshots are saved outside the repository in the temporary directory.
"""
import functools
import http.server
import pathlib
import tempfile
import threading

from playwright.sync_api import sync_playwright, expect


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


root = pathlib.Path(__file__).resolve().parents[1]
server = http.server.ThreadingHTTPServer(
    ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(root))
)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
screenshots = pathlib.Path(tempfile.gettempdir()) / "gpmc-membership"
screenshots.mkdir(exist_ok=True)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        for width in (320, 390, 620, 768, 1024, 1440):
            for scheme in ("light", "dark"):
                page.set_viewport_size({"width": width, "height": 1000})
                page.emulate_media(color_scheme=scheme, reduced_motion="reduce")
                page.goto(base + "/#membership")
                expect(page.locator("#m-membership")).to_be_visible()
                expect(page.locator("#m-overview")).to_be_hidden()
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, scheme)
                if scheme == "light" and width in (390, 1440):
                    page.screenshot(path=str(screenshots / f"membership-{width}.png"), full_page=True)
                teams = page.locator(".membership-team-list details")
                for i in range(4):
                    summary = teams.nth(i).locator("summary")
                    summary.focus()
                    if not teams.nth(i).evaluate("el => el.open"):
                        page.keyboard.press("Enter")
                    expect(teams.nth(i).locator(".membership-team-content")).to_be_visible()
                    assert page.locator(".membership-team-list details[open]").count() == 1
                page.locator(".membership-text-link").click()
                expect(page).to_have_url(base + "/#membership-teams")
                page.reload()
                expect(page.locator("#m-membership")).to_be_visible()
                for index in range(2):
                    page.locator("#m-membership [data-m=apply]").nth(index).click()
                    expect(page.locator("#m-apply")).to_be_visible()
                    page.go_back()
                    expect(page.locator("#m-membership")).to_be_visible()
                page.locator(".mtab[data-m=overview]").click()
                expect(page.locator("#m-overview")).to_be_visible()
                page.go_back()
                expect(page.locator("#m-membership")).to_be_visible()
                page.goto(base + "/#overview")
                expect(page.locator("#m-overview")).to_be_visible()
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), ("overview", width, scheme)
                if scheme == "light" and width in (390, 1440):
                    page.screenshot(path=str(screenshots / f"overview-{width}.png"), full_page=True)
                page.locator("#m-overview [data-m=membership]").click()
                expect(page.locator("#m-membership")).to_be_visible()
                page.go_back()
                for index in range(2):
                    page.locator("#m-overview [data-m=apply]").nth(index).click()
                    expect(page.locator("#m-apply")).to_be_visible()
                    page.go_back()
                    expect(page.locator("#m-overview")).to_be_visible()
        page.goto(base + "/#style-rotation")
        expect(page.locator("#m-tools")).to_be_visible()
        expect(page.locator(".tab[data-v=style-rotation]")).to_have_class("tab on")
        assert not errors, errors
        browser.close()
        print("PASS: Overview and Membership at six widths, both color schemes, keyboard team selection, application links, history and research deep link")
        print(f"Screenshots: {screenshots}")
finally:
    server.shutdown()
    server.server_close()
