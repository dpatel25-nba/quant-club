"""Exercise the published synthetic demo and member-workspace integration."""
import functools
import hashlib
import http.server
import json
from pathlib import Path
import tempfile
import threading
import zipfile

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    release = json.loads((ROOT/"portfolio-lab/release.json").read_text())
    assert release["data_kind"] == "synthetic"
    for name, digest in release["files"].items():
        assert hashlib.sha256((ROOT/"portfolio-lab"/name).read_bytes()).hexdigest() == digest, name
    with zipfile.ZipFile(ROOT/"portfolio-lab/source.zip") as archive:
        assert archive.testzip() is None
        assert "portfolio-lab/pyproject.toml" in archive.namelist()
        assert not any("outputs/" in name or name.endswith(".env") for name in archive.namelist())
    with zipfile.ZipFile(ROOT/"portfolio-lab/simulation.zip") as archive:
        assert archive.testzip() is None
        assert {"paths_0.npz", "paths_1.npz", "manifest.json", "inputs/metadata.json"}.issubset(archive.namelist())
        assert json.loads(archive.read("inputs/metadata.json"))["data_kind"] == "synthetic"
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    state = {"signed_in": False}
    api_calls, report_requests, errors = [], [], []

    def api(route):
        api_calls.append(route.request.url)
        assert route.request.url == base+"/api/auth", "Portfolio Outlook must not consume market API credits"
        route.fulfill(json={"mode": "accounts", "user": {"id": "outlook-test", "email": "preview@example.test"} if state["signed_in"] else None})

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.on("request", lambda req: report_requests.append(req.url) if req.url == base+"/portfolio-lab/" else None)
            page.route(base+"/api/**", api)
            page.goto(base+"/#portfolio-outlook")
            expect(page.locator("#account-form")).to_be_visible()
            expect(page.locator("#toolsWrap")).to_be_hidden()
            assert page.locator("#portfolio-outlook-frame").get_attribute("src") is None
            assert not report_requests, "The embed should load only after opening the signed-in tool"
            state["signed_in"] = True
            page.locator("#account-retry").click()
            expect(page.locator("#v-portfolio-outlook")).to_be_visible()
            frame = page.frame_locator("#portfolio-outlook-frame")
            expect(frame.locator("#badge")).to_have_text("SYNTHETIC DATA DEMO")
            expect(frame.locator("#value")).to_contain_text("$")
            expect(frame.locator("#error")).to_be_empty()
            baseline = frame.locator("#value").inner_text()
            frame.locator("#w0").fill("50")
            frame.locator("#update").click()
            expect(frame.locator("#error")).to_contain_text("sum to 100%")
            frame.locator("#w0").fill("25")
            frame.locator("#scenario").select_option("User macro scenario")
            frame.locator("#update").click()
            expect(frame.locator("#error")).to_be_empty()
            expect(frame.locator("#scenarioNote")).to_contain_text("Conditional what-if")
            assert frame.locator("#value").inner_text() != baseline
            frame.locator("#horizon").select_option("6")
            frame.locator("#rebalance").select_option("buy_hold")
            frame.locator("#initial").fill("25000")
            frame.locator("#update").click()
            expect(frame.locator("#error")).to_be_empty()
            assert "NaN" not in frame.locator("main").inner_text()
            page.locator('.tab[data-v="portfolio"]').click()
            expect(page.locator("#v-portfolio")).to_be_visible()
            assert page.url.endswith("#portfolio")
            page.locator('.tab[data-v="portfolio-outlook"]').click()
            assert page.url.endswith("#portfolio-outlook")
            assert len(report_requests) == 1, "Returning to the tab should reuse its loaded simulation"
            shots = Path(tempfile.mkdtemp(prefix="portfolio-outlook-shots-"))
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1100})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1"), width
                inner = page.locator("#portfolio-outlook-frame").content_frame
                assert inner.locator("body").evaluate("() => document.documentElement.scrollWidth <= innerWidth+1"), width
                page.screenshot(path=str(shots/f"workspace-{width}.png"), full_page=True)
            # The deliberately public demo must also work without a member session.
            state["signed_in"] = False
            page.goto(base+"/portfolio-lab/")
            expect(page.locator("#badge")).to_have_text("SYNTHETIC DATA DEMO")
            expect(page.locator("#error")).to_be_empty()
            for width in (1440, 390):
                page.set_viewport_size({"width": width, "height": 1100})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1"), width
                page.screenshot(path=str(shots/f"demo-{width}.png"), full_page=True)
            assert not errors, errors
            browser.close()
            print("PASS: release hashes, source ZIP, sign-in gate, lazy embed, deep links, portfolio controls, scenarios, standalone demo and desktop/mobile overflow")
            print("Screenshots:", shots)
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
