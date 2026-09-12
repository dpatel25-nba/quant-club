"""Local commodity UI checks. All market responses are fixtures; no credentials
or live market services are used. Requires Python Playwright and Chromium.
"""
import functools
import http.server
import pathlib
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
requests = []
blocked = False


def market(route):
    q = parse_qs(urlparse(route.request.url).query)
    symbol = q["symbol"][0]
    requests.append(q)
    if blocked:
        route.fulfill(status=403, json={"error": "This symbol is not included in the site's market-data plan."})
        return
    route.fulfill(json={
        "symbol": symbol, "name": symbol, "currency": "USD", "exchange": "",
        # Verify curated spot symbols are identified even if provider type is missing.
        "type": "", "range": q.get("range", [""])[0], "label": "fixture period",
        "points": [{"t": f"2026-09-{day:02d}", "c": price} for day, price in enumerate([100, 104, 101, 106, 109], 1)],
        "quote": {"close": 109, "previous_close": 106, "low": 105, "high": 110, "volume": 0, "average_volume": 0},
    })


try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route(base + "/api/**", market)
        page.goto(base + "/#tools")
        # Reveal only this local test page; the server auth gate is covered separately.
        page.evaluate("document.getElementById('toolsWrap').hidden=false;document.getElementById('lock').hidden=true")
        page.locator("#benchBtn").click()
        options = page.locator("#commodity option[data-kind]").evaluate_all("xs => xs.map(x=>({symbol:x.value,kind:x.dataset.kind}))")
        assert len(options) == 16
        for option in options:
            page.select_option("#commodity", option["symbol"])
            expect(page.locator("#meta")).to_contain_text(option["symbol"])
            expect(page.locator("#ticker")).to_have_value(option["symbol"])
            expect(page.locator("#go")).to_be_enabled()
            assert requests[-1]["symbol"] == [option["symbol"]]
            expect(page.locator("#chart")).to_be_visible()
            if option["kind"] == "spot":
                expect(page.locator("#meta")).to_contain_text("Commodity price")
                expect(page.locator("#stats")).not_to_contain_text("Volume")
                expect(page.locator("#note")).to_contain_text("252-observation")
            else:
                expect(page.locator("#meta")).to_contain_text("share price")
                expect(page.locator("#note")).to_contain_text("contract rolls")
        page.select_option("#commodity", "XAU/USD")
        for period in ("1h", "1d", "1m", "5y", "all", "1y"):
            page.locator(f'#ranges [data-r="{period}"]').click()
            expect(page.locator("#go")).to_be_enabled()
            volatility = page.locator("#stats .stat").filter(has=page.get_by_text("Volatility (ann.)", exact=True)).locator(".v")
            if period in ("1h", "1d"):
                expect(volatility).to_have_text("—")
            else:
                expect(volatility).not_to_have_text("—")
        page.locator("#chooseBtn").click()
        page.locator("#pkGrid button:not([disabled])").first.click()
        expect(page.locator("#go")).to_be_enabled()
        assert "month" in requests[-1]
        page.locator('#ranges [data-r="1y"]').click()
        page.locator("#ticker").fill("GOLD")
        page.locator("#go").click()
        expect(page.locator("#meta")).to_contain_text("GOLD")
        expect(page.locator("#commodity")).to_have_value("")
        assert requests[-1]["symbol"] == ["GOLD"], "stock ticker must not be aliased to a commodity"
        page.locator('#ranges [data-r="1m"]').click()
        expect(page.locator("#go")).to_be_enabled()
        blocked = True
        before = len(requests)
        page.select_option("#commodity", "WTI/USD")
        expect(page.locator("#msg")).to_contain_text("not included")
        expect(page.locator("#result")).to_be_hidden()
        expect(page.locator("#go")).to_be_enabled()
        assert len(requests) == before + 1, "must not silently fetch a different instrument"
        blocked = False
        page.locator("#go").click()
        expect(page.locator("#meta")).to_contain_text("WTI/USD")
        for width in (320, 390, 768, 1280):
            page.set_viewport_size({"width": width, "height": 1000})
            bounds = page.locator("#commodity").bounding_box()
            assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width
        page.set_viewport_size({"width": 1280, "height": 1000})
        page.screenshot(path=str(pathlib.Path(tempfile.gettempdir()) / "gpmc-commodities.png"), full_page=True)
        assert not errors, errors
        browser.close()
        print("PASS: all 16 selections, chart ranges, month selection, stock symbols, plan errors, retry and responsive picker")
finally:
    server.shutdown()
    server.server_close()
