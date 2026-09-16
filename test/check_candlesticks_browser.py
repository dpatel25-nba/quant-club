"""Candlestick browser regression checks with synthetic OHLC; no credentials
or external market requests. Requires Playwright and Chromium.
"""
import datetime as dt
import functools
import http.server
import math
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
requests, fixtures = [], {}
counts = {"1h": 60, "1d": 78, "1m": 23, "1y": 252, "5y": 261, "all": 1200}
intervals = {"1h": "1min", "1d": "5min", "1m": "1day", "1y": "1day", "5y": "1week", "all": "1month"}


def market(route):
    if urlparse(route.request.url).path == "/api/auth":
        route.fulfill(json={"mode":"legacy","user":None})
        return
    q = parse_qs(urlparse(route.request.url).query)
    requests.append(q)
    symbol, period = q["symbol"][0], q.get("range", ["1m"])[0]
    interval = "1day" if "month" in q else intervals[period]
    points = []
    for i in range(23 if "month" in q else counts[period]):
        opening = 100 + i / 4 + math.sin(i / 2) * 4
        close = opening + [3, -2, 0][i % 3]
        stamp = dt.datetime(2024, 1, 1) + dt.timedelta(minutes=i if interval == "1min" else i * 5 if interval == "5min" else i * 1440)
        points.append({"t": stamp.isoformat(sep=" "), "o": opening, "h": max(opening, close) + 4,
                       "l": min(opening, close) - 5, "c": close})
    if symbol == "SPY":
        for i, point in enumerate(points):
            point["c"] = 100 + 12 * i
    if symbol == "MISSING":
        points[0]["o"] = None
    if symbol == "INVALID":
        points[0]["h"] = points[0]["l"] - 1
    if symbol == "FLAT":
        for point in points:
            point.update(o=0, h=0, l=0, c=0)
    if symbol == "NEGATIVE":
        for point in points:
            for field in ("o", "h", "l", "c"):
                point[field] -= 150
    fixtures[symbol] = points
    route.fulfill(json={"symbol": symbol, "name": symbol, "currency": "USD", "type": "Common Stock",
                        "range": period, "month": q.get("month", [None])[0], "interval": interval,
                        "label": "synthetic test period", "points": points, "quote": None})


try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route(base + "/api/**", market)
        page.goto(base + "/#tools")
        page.evaluate("document.getElementById('toolsWrap').hidden=false;document.getElementById('lock').hidden=true")
        page.locator("#benchBtn").click()
        page.locator('#ranges [data-r="1m"]').click()
        expect(page.locator("#result")).to_be_visible()
        expect(page.locator("#go")).to_be_enabled()
        assert requests[-1]["ohlc"] == ["1"], "new OHLC requests must bypass legacy close-only cache URLs"
        stats = page.locator("#stats").inner_text()
        before = len(requests)
        page.locator('[data-chart="candlestick"]').click()
        expect(page.locator(".candle")).to_have_count(23)
        assert len(requests) == before, "switching chart type spent an API request"
        assert page.locator("#stats").inner_text() == stats
        geometry = page.locator(".candle").evaluate_all("gs=>gs.map(g=>{let w=g.querySelector('line'),b=g.querySelector('rect');return {high:+w.getAttribute('y1'),low:+w.getAttribute('y2'),top:+b.getAttribute('y'),height:+b.getAttribute('height'),fill:b.getAttribute('fill')};})")
        points = fixtures["AAPL"]
        low, high = min(x["l"] for x in points), max(x["h"] for x in points)
        padding = (high - low) * .08
        low, high = low - padding, high + padding
        y = lambda value: 18 + (1 - (value - low) / (high - low)) * (320 - 18 - 26)
        for candle, point in zip(geometry, points):
            assert abs(candle["high"] - y(point["h"])) < .02
            assert abs(candle["low"] - y(point["l"])) < .02
            assert abs(candle["height"] - max(1, abs(y(point["o"]) - y(point["c"])))) < .02
        assert geometry[0]["fill"] == "var(--panel)" and geometry[1]["fill"] == "var(--bad)"
        assert geometry[2]["height"] == 1, "doji should remain visible"
        page.locator("#chart").focus()
        page.keyboard.press("Home")
        expect(page.locator("#chart-readout")).to_contain_text("2024-01-01 00:00:00")
        expect(page.locator("#chart-readout")).to_contain_text("O 100.00  H 107.00  L 95.00  C 103.00")
        page.keyboard.press("ArrowRight")
        expect(page.locator("#chart-readout")).to_contain_text("2024-01-02")
        page.locator('.candle[data-bar="0"]').hover()
        expect(page.locator("#chart-readout")).to_contain_text("2024-01-01")
        page.locator('[data-chart="line"]').click()
        expect(page.locator(".candle")).to_have_count(0)
        expect(page.locator(".lookup-line")).to_have_count(1)
        assert len(requests) == before
        page.locator('[data-chart="candlestick"]').click()
        for period in counts:
            page.locator(f'#ranges [data-r="{period}"]').click()
            expect(page.locator(".candle")).to_have_count(counts[period])
            expect(page.locator("#go")).to_be_enabled()
            assert "NaN" not in page.locator("#chart").inner_html()
        assert page.locator("#chart-scroll").evaluate("el=>el.scrollLeft>0"), "long histories should open at latest bars"
        page.locator("#chart").focus()
        page.keyboard.press("Home")
        assert page.locator("#chart-scroll").evaluate("el=>el.scrollLeft===0")
        page.keyboard.press("End")
        assert page.locator("#chart-scroll").evaluate("el=>el.scrollLeft>0")
        page.locator("#chooseBtn").click()
        page.locator("#pkGrid button:not([disabled])").first.click()
        expect(page.locator(".candle")).to_have_count(23)
        expect(page.locator("#chart-help")).to_contain_text("Daily bars")
        page.locator('#ranges [data-r="1m"]').click()
        for symbol in ("XAU/USD", "BTC/USD", "MISSING", "INVALID", "FLAT", "NEGATIVE"):
            page.locator("#ticker").fill(symbol)
            page.locator("#go").click()
            expect(page.locator("#meta")).to_contain_text(symbol)
            expect(page.locator("#go")).to_be_enabled()
            if symbol in ("MISSING", "INVALID"):
                expect(page.locator(".candle")).to_have_count(0)
                expect(page.locator(".lookup-line")).to_have_count(1)
                expect(page.locator("#chart-help")).to_contain_text("incomplete or invalid")
            else:
                expect(page.locator(".candle")).to_have_count(23)
            assert "NaN" not in page.locator("#chart").inner_html()
        page.locator("#ticker").fill("AAPL")
        page.locator("#go").click()
        page.locator("#benchBtn").click()
        expect(page.locator("#chart .bench")).to_have_count(1)
        path = page.locator("#chart .bench").evaluate("el=>({length:el.getTotalLength(),box:{y:el.getBBox().y,height:el.getBBox().height}})")
        assert path["box"]["y"] >= 18 and path["box"]["y"] + path["box"]["height"] <= 294
        page.locator("#benchBtn").click()
        for width in (390, 768, 1280):
            page.set_viewport_size({"width": width, "height": 1000})
            page.wait_for_function("Math.abs(document.getElementById('chart').viewBox.baseVal.width - Math.max(220, document.getElementById('chart-scroll').clientWidth - 6)) < 1")
            assert page.locator("#chart-scroll").bounding_box()["width"] <= width
        page.screenshot(path=str(pathlib.Path(tempfile.gettempdir()) / "gpmc-candlesticks.png"), full_page=True)
        assert not errors, errors
        browser.close()
        print("PASS: OHLC geometry, direction/doji, keyboard readouts, cached switching, all ranges, scroll, missing data, zero/negative prices and benchmark")
finally:
    server.shutdown()
    server.server_close()
