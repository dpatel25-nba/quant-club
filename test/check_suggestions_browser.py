"""Autocomplete integration tests with a fake local gate and mocked APIs.
No existing credentials are read or transmitted, and no live market calls run.
Requires Python Playwright and Chromium.
"""
import functools
import hashlib
import http.server
import pathlib
import re
import tempfile
import threading
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright, expect


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


root = pathlib.Path(__file__).resolve().parents[1]
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
fake_password = "local-autocomplete-test"
html = re.sub(r'var PW_HASH = "[a-f0-9]{64}";', f'var PW_HASH = "{hashlib.sha256(fake_password.encode()).hexdigest()}";', (root / "index.html").read_text())
searches, quotes, pending = [], [], []


def market(route):
    query = parse_qs(urlparse(route.request.url).query)
    if urlparse(route.request.url).path == "/api/search":
        q = query["q"][0]
        searches.append(q)
        assert route.request.headers.get("x-tools-password") == fake_password
        assert "k" not in query and fake_password not in route.request.url
        if q == "slow":
            pending.append(route)
            return
        if q == "limit":
            route.fulfill(status=429, json={"error": "Rate limited"})
            return
        rows = []
        if q == "apple":
            rows = [{"symbol": "AAPL", "name": "Apple Inc.", "type": "Common Stock", "exchange": "NASDAQ", "country": "United States"},
                    {"symbol": "AAPL", "name": "Apple Inc. alternate listing", "type": "Common Stock", "exchange": "XETRA", "country": "Germany"}]
        if q == "remote":
            rows = [{"symbol": "REMOTE", "name": "Remote Example", "type": "Common Stock", "exchange": "NYSE", "country": "United States"}]
        if q == "unsafe":
            rows = [{"symbol": "SAFE", "name": '<img src=x onerror="window.injected=true">', "type": "Stock", "exchange": "NYSE", "country": ""}]
        route.fulfill(json={"results": rows})
        return
    quotes.append(query)
    route.fulfill(json={"symbol": query["symbol"][0], "name": query["symbol"][0], "currency": "USD", "type": "Stock",
                        "exchange": query.get("exchange", [""])[0], "range": query.get("range", ["1m"])[0], "label": "test period",
                        "points": [{"t": "2026-09-01", "c": 100}, {"t": "2026-09-02", "c": 103}, {"t": "2026-09-03", "c": 101}], "quote": None})


try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route(base + "/", lambda route: route.fulfill(content_type="text/html", body=html))
        page.route(base + "/api/**", market)
        page.goto(base + "/#tools")
        page.locator("#pw").fill(fake_password)
        page.locator("#pw").press("Enter")
        expect(page.locator("#toolsWrap")).to_be_visible()
        expect(page.locator("#result")).to_be_visible()
        expect(page.locator("#go")).to_be_enabled()
        page.locator("#benchBtn").click()
        expect(page.locator("#go")).to_be_enabled()
        ticker, popup = page.locator("#ticker"), page.locator("#ticker-popup")
        before = len(quotes)
        ticker.fill("gold")
        expect(popup).to_be_visible()
        expect(popup.get_by_role("option").filter(has_text="XAU/USD")).to_be_visible()
        expect(popup.get_by_role("option").filter(has_text="GLD")).to_be_visible()
        assert len(quotes) == before, "typing must not load prices"
        popup.get_by_role("option").filter(has_text="XAU/USD").click()
        expect(ticker).to_have_value("XAU/USD")
        expect(popup).to_be_hidden()
        expect(page.locator("#meta")).to_contain_text("XAU/USD")
        ticker.fill("apple")
        expect(popup.get_by_role("option").filter(has_text="NASDAQ")).to_be_visible()
        ticker.press("ArrowDown")
        assert ticker.get_attribute("aria-activedescendant")
        ticker.press("Enter")
        expect(page.locator("#meta")).to_contain_text("NASDAQ")
        assert quotes[-1].get("exchange") == ["NASDAQ"]
        # Focusing an unchanged ticker must preserve the selected exchange.
        page.locator("#chart").focus()
        ticker.focus()
        ticker.press("Escape")
        page.locator('#ranges [data-r="1m"]').click()
        expect(page.locator("#go")).to_be_enabled()
        assert quotes[-1].get("exchange") == ["NASDAQ"]
        ticker.fill("apple")
        expect(popup.get_by_role("option").filter(has_text="XETRA")).to_be_visible()
        popup.get_by_role("option").filter(has_text="XETRA").click()
        expect(page.locator("#meta")).to_contain_text("XETRA")
        assert quotes[-1].get("exchange") == ["XETRA"], "listing cache collision"
        count = searches.count("apple")
        ticker.fill("apple")
        expect(popup.get_by_role("option").filter(has_text="NASDAQ")).to_be_visible()
        ticker.press("Escape")
        assert searches.count("apple") == count, "repeat queries should use cached results"
        ticker.fill("gold")
        ticker.press("Enter")
        expect(page.locator("#meta")).to_contain_text("GOLD")
        assert quotes[-1]["symbol"] == ["GOLD"] and "exchange" not in quotes[-1], "unselected text must remain a direct ticker"
        ticker.fill("remote")
        expect(popup.get_by_role("option").filter(has_text="Remote Example")).to_be_visible()
        ticker.press("ArrowUp")
        ticker.press("Enter")
        expect(page.locator("#meta")).to_contain_text("REMOTE")
        with page.expect_request(base + "/api/search?q=slow"):
            ticker.fill("slow")
        ticker.fill("apple")
        assert pending
        expect(popup.get_by_role("option").filter(has_text="NASDAQ")).to_be_visible()
        try:
            pending.pop().fulfill(json={"results": [{"symbol": "STALE", "name": "Stale", "type": "Stock", "exchange": "", "country": ""}]})
        except Exception:
            pass  # An aborted request may already have been released by Chromium.
        expect(popup).not_to_contain_text("STALE")
        ticker.press("Tab")
        expect(popup).to_be_hidden()
        ticker.fill("unsafe")
        expect(popup).to_contain_text("<img src=x")
        assert page.locator("#ticker-matches img").count() == 0 and not page.evaluate("window.injected || false")
        ticker.fill("zzzzunknown")
        expect(page.locator("#ticker-search-status")).to_contain_text("No matches")
        ticker.fill("limit")
        expect(page.locator("#ticker-search-status")).to_contain_text("unavailable")
        for width in (320, 390, 768, 1280):
            page.set_viewport_size({"width": width, "height": 1000})
            ticker.fill("gold")
            expect(popup).to_be_visible()
            bounds = popup.bounding_box()
            assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width
            ticker.press("Escape")
        ticker.fill("gold")
        page.screenshot(path=str(pathlib.Path(tempfile.gettempdir()) / "gpmc-suggestions.png"), full_page=True)
        assert not errors, errors
        browser.close()
        print("PASS: names/symbols, commodity/fund labels, keyboard/mouse selection, exchange identity, cache, stale replies, escaping, errors and responsive popup")
finally:
    server.shutdown()
    server.server_close()
