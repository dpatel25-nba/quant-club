"""Browser workflow checks with synthetic SEC responses and a fake tools password."""
import copy
import csv
import functools
import hashlib
import http.server
import io
import json
import pathlib
import re
import subprocess
import tempfile
import threading
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
PASSWORD = "local-fundamentals-test"
html = re.sub(r'var PW_HASH = "[a-f0-9]{64}";', f'var PW_HASH = "{hashlib.sha256(PASSWORD.encode()).hexdigest()}";', (ROOT / "index.html").read_text())
fixture_js = r'''
var facts={facts:{'us-gaap':{}}};
FIELDS.forEach(function(f,i){
 var rows=[];
 for(var y=2020;y<=2025;y++) rows.push({start:f.section==='balance'?undefined:(y-1)+'-10-01',end:y+'-09-30',form:'10-K',filed:y+'-11-01',accn:'0000320193-'+String(y).slice(2)+'-000001',val:f.id==='eps'?6.5:f.id==='revenue'?100000000000+(y-2020)*10000000000:f.id==='netIncome'?20000000000:f.id==='ocf'?30000000000:f.id==='capex'?8000000000:f.id==='cash'?0:f.id==='inventory'?0:5000000000+i*1000000000});
 facts.facts['us-gaap'][f.tags[0]]={units:{}};facts.facts['us-gaap'][f.tags[0]].units[f.unit]=rows;
 var annualBase=rows[rows.length-1].val;
 for(var y=2023;y<=2026;y++){
  var total=f.id==='revenue'?100000000000+(y-2020)*10000000000:annualBase;
  ['12-31','03-31','06-30'].forEach(function(suffix,q){
   var start=q===0?(y-1)+'-10-01':y+(q===1?'-01-01':'-04-01'),end=(q===0?y-1:y)+'-'+suffix;
   var base={end:end,form:'10-Q',filed:y+'-'+['02-01','05-01','08-01'][q],accn:'0000320193-'+String(y).slice(2)+'-000001'};
   if(f.section==='balance')rows.push(Object.assign({},base,{val:total}));
   else {
    if(f.unit==='USD')rows.push(Object.assign({},base,{start:(y-1)+'-10-01',val:total*(q+1)/4}));
    if(f.section!=='cashflow')rows.push(Object.assign({},base,{start:start,val:f.unit==='shares'?total:total/4}));
   }
  });
 }
});
delete facts.facts['us-gaap'].InventoryNet;
delete facts.facts['us-gaap'].PaymentsToAcquireBusinessesNetOfCashAcquired;
var recent={accessionNumber:[],form:[],filingDate:[],reportDate:[]};
['10-K','10-Q','8-K','DEF 14A','4'].forEach(function(form,i){for(var n=0;n<(form==='4'?25:1);n++){
recent.accessionNumber.push('0000320193-25-'+String(i*100+n+1).padStart(6,'0'));recent.form.push(form);recent.filingDate.push('2025-11-01');recent.reportDate.push('2025-09-30');}});
recent.filingDate[1]='2026-08-01';recent.reportDate[1]='2026-06-30';
var sub={cik:320193,name:'Apple fixture <img src=x onerror="window.injected=true">',sic:'3571',sicDescription:'Electronic Computers',exchanges:['Nasdaq'],filings:{recent:recent}};
print(JSON.stringify(normalizeFinancials(facts,sub,'AAPL','2026-09-13T12:00:00Z')));
'''
with tempfile.TemporaryDirectory() as tmp:
    script = pathlib.Path(tmp) / "fixture.js"
    script.write_text((ROOT / "lib/sec-financials.js").read_text().replace("export ", "") + fixture_js)
    data = json.loads(subprocess.check_output(["/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc", str(script)], text=True))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
requests, pending = [], []


def api(route):
    path = urlparse(route.request.url).path
    q = parse_qs(urlparse(route.request.url).query)
    requests.append((path, q))
    if path == "/api/fundamentals":
        assert route.request.headers.get("x-tools-password") == PASSWORD
        assert PASSWORD not in route.request.url
        if "q" in q:
            route.fulfill(json={"results": [{"symbol": "MSFT", "name": "Microsoft Corporation", "type": "SEC issuer", "exchange": "", "country": ""}]})
            return
        symbol = q["symbol"][0]
        if symbol == "SLOW":
            pending.append(route)
            return
        if symbol in ("XAU/USD", "UNKNOWN", "ERROR"):
            route.fulfill(status=503 if symbol == "ERROR" else 404, json={"error": "SEC data access is temporarily unavailable." if symbol == "ERROR" else "No SEC company matches this ticker."})
            return
        result = copy.deepcopy(data)
        result["symbol"] = symbol
        if symbol == "MSFT":
            result["cik"] = "0000789019"
        if symbol != "AAPL":
            result["name"] = "Microsoft Corporation" if symbol == "MSFT" else symbol
        if symbol == "BANK":
            result["sic"]="6020"
            result["cik"]="0000000124"
        if symbol == "FOREIGN":
            result.update(periods=[], quarterly=[], ttm=[], coverage="filings-only", message="Standardized USD annual financials are unavailable for this issuer.")
        route.fulfill(json=result)
    elif path == "/api/search":
        route.fulfill(json={"results": []})
    elif path == "/api/quote":
        symbol = q["symbol"][0]
        route.fulfill(json={"symbol": symbol, "type": "Commodity" if "/" in symbol else "Common Stock", "name": symbol,
                            "currency": "USD", "exchange": "NASDAQ", "range": "1y", "label": "test period", "quote": None,
                            "points": [{"t": "2025-09-01", "c": 100}, {"t": "2025-09-02", "c": 101}]})
    else:
        route.fulfill(status=404, json={"error": "Test route not configured"})


try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000}, accept_downloads=True)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route(base + "/", lambda route: route.fulfill(content_type="text/html", body=html))
        page.route(base + "/api/**", api)
        page.goto(base + "/#fundamentals")
        expect(page.locator("#lock")).to_be_visible()
        assert requests == [], "No data requests before unlock"
        page.locator("#pw").fill(PASSWORD)
        page.locator("#pw").press("Enter")
        expect(page.locator("#v-fundamentals")).to_be_visible()
        expect(page.locator("#fd-result")).to_be_visible()
        expect(page.locator("#fd-name")).to_contain_text("Apple fixture <img")
        assert page.locator("#fd-name img").count() == 0 and page.evaluate("window.injected") is None
        assert all(path != "/api/quote" for path, _ in requests), "Fundamental deep link must not spend quote credits"
        expect(page.locator("#fd-period-label")).to_contain_text("2024-10-01 to 2025-09-30")
        expect(page.locator("#fd-metrics")).to_contain_text("$150B")
        expect(page.locator("#fd-metrics")).to_contain_text("$0")
        expect(page.locator("#fd-chart")).to_have_attribute("aria-label", re.compile("2025-09-30"))

        page.locator('[data-fd-view="statements"]').click()
        expect(page.locator("#fd-statements-table thead")).to_contain_text("2021-09-30")
        first = page.locator("#fd-statements-table tbody tr").first
        expect(first).to_contain_text("150,000")
        first.locator(".fd-value").first.click()
        expect(page.locator("#fd-source")).to_contain_text("us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax")
        assert page.locator("#fd-source a").first.get_attribute("href").startswith("https://www.sec.gov/Archives/")
        page.locator("#fd-units").select_option("1000000000")
        expect(first.locator(".fd-value").first).to_have_text("150")
        page.locator('[data-fd-statement="balance"]').click()
        inventory = page.locator("#fd-statements-table tr").filter(has_text=re.compile("^Inventory"))
        expect(inventory).to_contain_text("—")
        cash = page.locator("#fd-statements-table tr").filter(has_text=re.compile("^Cash & cash equivalents"))
        expect(cash.locator(".fd-value").first).to_have_text("0")
        page.locator('[data-fd-statement="cashflow"]').click()
        page.locator("#fd-statements-table tr").filter(has_text="Free cash flow (calculated)").locator(".fd-value").first.click()
        expect(page.locator("#fd-source")).to_contain_text("22,000,000,000")
        expect(page.locator("#fd-source a")).to_have_count(2)
        page.locator('[data-fd-view="ratios"]').click()
        margin = page.locator("#fd-ratios-table tr").filter(has_text=re.compile("^Net profit margin"))
        expect(margin.locator(".fd-value").first).to_have_text("13.3%")
        margin.locator(".fd-value").first.click()
        expect(page.locator("#fd-source")).to_contain_text("Calculated:")

        with page.expect_download() as download_info:
            page.locator("#fd-download").click()
        with tempfile.TemporaryDirectory() as tmp:
            dest = pathlib.Path(tmp) / "financials.csv"
            download_info.value.save_as(dest)
            rows = list(csv.DictReader(io.StringIO(dest.read_text(encoding="utf-8-sig"))))
        assert len(rows) == len(data["fields"]) * 5
        revenue = next(r for r in rows if r["Metric"] == "Revenue" and r["Period end"] == "2025-09-30")
        assert revenue["Value"] == "150000000000" and revenue["Unit"] == "USD" and revenue["Filed"] == "2025-11-01"
        assert next(r for r in rows if r["Metric"] == "Inventory")["Value"] == ""

        page.locator('[data-fd-view="filings"]').click()
        expect(page.locator("#fd-filing-list article")).to_have_count(2)
        page.locator("#fd-filing-type").select_option("governance")
        expect(page.locator("#fd-filing-list")).to_contain_text("Proxy statement")
        page.locator("#fd-filing-type").select_option("ownership")
        expect(page.locator("#fd-filing-list article")).to_have_count(20)
        page.locator("#fd-more-filings").click()
        expect(page.locator("#fd-filing-list article")).to_have_count(25)

        ticker = page.locator("#fd-ticker")
        ticker.fill("microsoft")
        popup = page.locator("#fd-ticker-popup")
        expect(popup).to_contain_text("SEC issuer")
        ticker.press("ArrowDown")
        ticker.press("Enter")
        expect(page.locator("#fd-name")).to_have_text("Microsoft Corporation")
        expect(page.locator("#fd-overview")).to_be_visible()
        count = len(requests)
        page.locator("#fd-form").evaluate("form => form.requestSubmit()")
        expect(page.locator("#fd-result")).to_be_visible()
        assert len(requests) == count, "Repeated company uses local cache"

        ticker.fill("SLOW")
        page.locator("#fd-form").evaluate("form => form.requestSubmit()")
        expect(page.locator("#fd-status")).to_contain_text("Loading")
        ticker.fill("AAPL")
        page.locator("#fd-form").evaluate("form => form.requestSubmit()")
        expect(page.locator("#fd-name")).to_contain_text("Apple fixture")
        expect(page.locator("#fd-result")).to_have_attribute("aria-busy", "false")
        for route in pending:
            route.fulfill(json={**data, "name": "Stale response"})
        expect(page.locator("#fd-name")).to_contain_text("Apple fixture")

        for symbol, message in [("UNKNOWN", "No SEC company"), ("ERROR", "temporarily unavailable")]:
            ticker.fill(symbol)
            page.locator("#fd-form").evaluate("form => form.requestSubmit()")
            expect(page.locator("#fd-status")).to_contain_text(message)
            expect(page.locator("#fd-result")).to_be_hidden()
        ticker.fill("FOREIGN")
        page.locator("#fd-form").evaluate("form => form.requestSubmit()")
        expect(page.locator("#fd-filings")).to_be_visible()
        expect(page.locator("#fd-download")).to_be_disabled()
        expect(page.locator('[data-fd-view="statements"]')).to_be_disabled()

        page.locator('.tab[data-v="lookup"]').click()
        page.locator("#ticker").fill("AAPL")
        page.locator("#form").evaluate("form => form.requestSubmit()")
        expect(page.locator("#lookup-fundamentals")).to_be_visible()
        page.locator("#lookup-fundamentals").click()
        expect(page.locator("#v-fundamentals")).to_be_visible()
        expect(page.locator("#fd-name")).to_contain_text("Apple fixture")

        # Quarterly/TTM selection and row charts.
        page.locator("#fd-basis").select_option("quarterly")
        expect(page.locator("#fd-period-label")).to_contain_text("Quarterly financials · 2026-04-01 to 2026-06-30")
        page.locator('[data-fd-view="statements"]').click()
        page.locator('[data-fd-statement="cashflow"]').click()
        ocf=page.locator("#fd-statements-table tr").filter(has_text=re.compile("^Operating cash flow"))
        ocf.locator(".fd-value").first.click()
        expect(page.locator("#fd-source")).to_contain_text("Single quarter")
        ocf.locator(".fd-row-chart").click()
        expect(page.locator("#fd-overview")).to_be_visible()
        expect(page.locator("#fd-chart")).to_have_attribute("aria-label", re.compile("Quarterly Operating cash flow"))
        page.locator("#fd-basis").select_option("ttm")
        expect(page.locator("#fd-period-label")).to_contain_text("2025-07-01 to 2026-06-30")
        with page.expect_download() as ttm_download:
            page.locator("#fd-download").click()
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/'ttm.csv'
            ttm_download.value.save_as(path)
            ttm_rows=list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
        assert ttm_rows[0]['Reporting basis']=='ttm' and ttm_rows[0]['Period end']=='2026-06-30'

        # Entered market cap is explicit; no price-provider request is needed.
        before_prices=sum(path=="/api/quote" for path,_ in requests)
        page.locator('[data-fd-view="valuation"]').click()
        page.locator("#fd-market-cap").fill("1575")
        page.locator("#fd-market-date").fill("2026-09-13")
        page.locator("#fd-valuation-form").evaluate("f => f.requestSubmit()")
        expect(page.locator("#fd-valuation-status")).to_contain_text("Member-entered market cap")
        expect(page.locator("#fd-valuation-metrics")).to_contain_text("10.00×")
        assert sum(path=="/api/quote" for path,_ in requests)==before_prices
        page.locator("#fd-market-date").fill("2025-01-01")
        page.locator("#fd-valuation-form").evaluate("f => f.requestSubmit()")
        expect(page.locator("#fd-valuation-status")).to_contain_text("on or after")
        expect(page.locator("#fd-valuation-metrics .fd-metric")).to_have_count(0)
        page.locator("#fd-market-date").fill("2026-09-13")
        page.locator("#fd-valuation-form").evaluate("f => f.requestSubmit()")

        # Mixed successes, issuer deduplication and valuation inputs in peers.
        page.locator('[data-fd-view="peers"]').click()
        peer=page.locator('#fd-peer-symbols')
        peer.fill('ALIAS, microsoft corporation')
        expect(page.locator('#fd-peer-symbols-popup')).to_contain_text('Microsoft Corporation')
        peer.press('ArrowDown')
        peer.press('Enter')
        expect(peer).to_have_value('ALIAS, MSFT, ')
        expect(page.locator('#fd-peer-status')).to_contain_text('Choose companies')
        # Editing an earlier token preserves the tickers after it.
        peer.fill('microsoft, ALIAS')
        peer.evaluate('e=>e.setSelectionRange(4,4)')
        peer.dispatch_event('click')
        expect(page.locator('#fd-peer-symbols-popup')).to_contain_text('Microsoft Corporation')
        peer.press('ArrowDown')
        peer.press('Enter')
        expect(peer).to_have_value('MSFT, ALIAS')
        peer.fill('gold')
        expect(page.locator('#fd-peer-symbols-popup')).not_to_contain_text('XAU/USD')
        page.locator("#fd-peer-symbols").fill("MSFT, ALIAS, UNKNOWN")
        page.locator("#fd-peer-form").evaluate("f => f.requestSubmit()")
        expect(page.locator("#fd-peer-status")).to_contain_text("Duplicate SEC issuers")
        expect(page.locator("#fd-peer-table thead th")).to_have_count(4)
        expect(page.locator("#fd-peer-table")).to_contain_text("No SEC company")
        page.get_by_label("MSFT market capitalization in USD billions").fill("3150")
        page.get_by_label("MSFT market capitalization in USD billions").press("Tab")
        page.get_by_label("MSFT market-cap date").fill("2026-09-13")
        page.get_by_label("MSFT market-cap date").press("Tab")
        expect(page.locator("#fd-peer-table")).to_contain_text("20.00×")
        page.locator("#fd-basis").select_option("quarterly")
        expect(page.locator("#fd-peer-table thead")).to_contain_text("2026-04-01 to 2026-06-30")
        # Allocation calculations, source controls and company research/report workflow.
        page.locator('[data-fd-view="allocation"]').click()
        expect(page.locator("#fd-allocation-period")).to_contain_text("Quarterly")
        expect(page.locator("#fd-allocation-bars")).to_contain_text("$7.5B")
        missing_bar=page.locator(".fd-allocation-bar").filter(has_text="Acquisitions")
        expect(missing_bar).to_contain_text("—")
        assert missing_bar.locator(".fd-bar-track span").evaluate("e=>e.getBoundingClientRect().width")==0, "Missing cash flow must not render a full bar"
        expect(page.locator("#fd-allocation-metrics")).to_contain_text("An ending balance")
        page.locator("#fd-allocation-table .fd-value").first.click()
        expect(page.locator("#fd-source")).to_contain_text("Operating cash flow")
        page.locator('[data-fd-view="notes"]').click()
        thesis='Durable cash generation. <script>window.notesInjected=true</script> & source checks.'
        page.locator("#fd-note-thesis").fill(thesis)
        page.locator("#fd-note-risks").fill("Margin pressure\nExecution risk")
        expect(page.locator("#fd-notes-status")).to_contain_text("Saved on this device")
        with page.expect_download() as notes_download:
            page.locator("#fd-notes-download").click()
        assert thesis in pathlib.Path(notes_download.value.path()).read_text()
        page.locator('[data-fd-view="report"]').click()
        preview=page.locator("#fd-report-preview")
        expect(preview).to_contain_text(thesis)
        expect(preview).to_contain_text("Microsoft Corporation")
        expect(preview).to_contain_text("20.00×")
        expect(preview).to_contain_text("No SEC company matches")
        expect(preview).to_contain_text("Sources & calculation notes")
        assert preview.locator("script, img").count()==0
        assert preview.locator('a[href^="https://www.sec.gov/"]').count()>2
        page.locator("#fd-report-notes").uncheck()
        expect(preview).not_to_contain_text(thesis)
        page.locator("#fd-report-notes").check()
        with page.expect_download() as report_download:
            page.locator("#fd-report-download").click()
        report_text=pathlib.Path(report_download.value.path()).read_text()
        assert '<script>' not in report_text and '&lt;script&gt;' in report_text
        assert '20.00×' in report_text and 'fundamental-workspace.js' not in report_text
        exported=browser.new_page()
        exported.set_content(report_text)
        expect(exported.locator('main')).to_contain_text(thesis)
        assert exported.evaluate('window.notesInjected') is None
        exported.pdf(path=str(pathlib.Path(tempfile.gettempdir())/'gpmc-research-report.pdf'),format='A4')
        exported.close()
        page.evaluate("window.print = () => { window.testPrinted = true; }")
        page.locator("#fd-report-print").click()
        assert page.evaluate("window.testPrinted")
        page.emulate_media(media="print")
        expect(page.locator("#fd-print-document")).to_be_visible()
        expect(page.locator("#m-tools")).to_be_hidden()
        page.pdf(path=str(pathlib.Path(tempfile.gettempdir())/'gpmc-research-print.pdf'),format='A4')
        page.emulate_media(media="screen")
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        expect(page.locator("#fd-print-document")).to_have_count(0)
        page.locator('[data-fd-view="peers"]').click()
        # Forward model: manual opening review, three scenarios, linked statements,
        # stale-result invalidation, JSON persistence/import, CSV and report integration.
        page.locator('[data-fd-view="forecast"]').click()
        expect(page.locator('#fm-opening')).to_be_visible()
        page.locator('#fm-run').click()
        expect(page.locator('#fm-status')).to_contain_text('Review the opening')
        opening={"Revenue run rate":1000,"Total assets":1000,"Total liabilities":400,"Cash & equivalents":100,
                 "Accounts receivable":100,"Inventory":100,"Accounts payable":50,"Modeled depreciable assets":400,
                 "Total interest-bearing debt (book value)":200,"Current fully diluted shares (millions)":100,
                 "Excess cash & nonoperating assets":50,"Debt claims for valuation":200,
                 "Preferred, NCI & other senior claims":0,"Market capitalization for comparison":1000}
        for label,value in opening.items():
            page.locator('#fm-opening').get_by_label(label,exact=True).fill(str(value))
        driver={"Revenue growth":10,"Gross margin":50,"R&D / revenue":5,"SG&A / revenue":10,"Other operating costs / revenue":5,
                "Cash tax rate":25,"Capex / revenue":5,"Depreciation / opening depreciable assets":10,
                "Receivable days":36.5,"Inventory days":73,"Payable days":36.5,
                "SBC / revenue (included in operating costs)":2,"Interest / opening debt":5,
                "Dividends / positive net income":25,"New borrowing":20,"Debt repayment":30,"Cash equity issuance":5,
                "Cash buybacks":10,"Minimum cash / revenue":2}
        for case,label in [('base','Base'),('upside','Upside'),('downside','Downside')]:
            page.locator('#fm-case').select_option(case)
            for field,value in driver.items():
                page.get_by_label(label+' Year 1 '+field,exact=True).fill(str(value))
            page.locator('#fm-fill').click()
        page.locator('#fm-case').select_option('base')
        page.locator('#fm-date').fill('2026-09-15')
        page.locator('#fm-reviewed').check()
        page.locator('#fm-run').click()
        expect(page.locator('#fm-results')).to_be_visible()
        expect(page.locator('#fm-projections')).to_contain_text('217.5')
        expect(page.locator('#fm-diagnostics')).to_contain_text('residual: $0m')
        expect(page.locator('#fm-reverse')).to_contain_text('constant annual revenue growth')
        expect(page.locator('#fm-scenarios tbody tr')).to_have_count(3)
        page.locator('#fm-result-case').select_option('downside')
        expect(page.locator('#fm-projection-label')).to_contain_text('Downside')
        page.locator('#fm-result-case').select_option('base')
        page.locator('#fm-opening').get_by_label('Debt claims for valuation',exact=True).fill('210')
        expect(page.locator('#fm-results')).to_be_hidden()
        expect(page.locator('#fm-csv')).to_be_disabled()
        page.locator('#fm-run').click()
        page.locator('#fm-save').click()
        expect(page.locator('#fm-storage')).to_contain_text('Saved on this device')
        with page.expect_download() as model_download:
            page.locator('#fm-json').click()
        model=json.loads(pathlib.Path(model_download.value.path()).read_text())
        assert model['opening']['debtClaims']==210 and len(model['cases']['base']['years'])==10
        wrong={**model,'cik':'999999'}
        page.locator('#fm-import').set_input_files({'name':'wrong.json','mimeType':'application/json','buffer':json.dumps(wrong).encode()})
        expect(page.locator('#fm-storage')).to_contain_text('Import failed')
        model['notes']='Model rationale <img src=x onerror="window.modelInjected=true">'
        page.locator('#fm-import').set_input_files({'name':'model.json','mimeType':'application/json','buffer':json.dumps(model).encode()})
        expect(page.locator('#fm-storage')).to_contain_text('Imported into this tab')
        expect(page.locator('#fm-reviewed')).not_to_be_checked()
        expect(page.locator('#fm-results')).to_be_hidden()
        page.locator('#fm-reviewed').check()
        page.locator('#fm-run').click()
        with page.expect_download() as projections_download:
            page.locator('#fm-csv').click()
        exported_csv=pathlib.Path(projections_download.value.path()).read_text(encoding='utf-8-sig')
        assert '217.5' in exported_csv and 'Terminal' in exported_csv and 'Assets − liabilities − equity' in exported_csv
        page.locator('[data-fd-view="report"]').click()
        expect(page.locator('#fd-report-preview')).to_contain_text('Forward financial model')
        expect(page.locator('#fd-report-preview')).to_contain_text(model['notes'])
        assert page.evaluate('window.modelInjected') is None
        page.locator('#fd-report-forecast').uncheck()
        expect(page.locator('#fd-report-preview')).not_to_contain_text('Forward financial model')
        page.locator('#fd-report-forecast').check()
        page.locator('[data-fd-view="forecast"]').click()
        page.locator('#fm-horizon').select_option('10')
        page.locator('#fm-run').click()
        expect(page.locator('#fm-projections thead th')).to_have_count(11)
        page.locator('#fm-save').click()
        for width in (320,390,768,1280):
            page.set_viewport_size({'width':width,'height':1000})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),('financial model',width,page.evaluate("""() => [...document.querySelectorAll('#fd-forecast *')].filter(e=>{let b=e.getBoundingClientRect();return b.height && b.right>innerWidth+1 && !e.closest('.fd-table-wrap,.fd-chart-wrap');}).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right]).slice(0,12)"""))
        page.locator('#fd-forecast').screenshot(path=str(pathlib.Path(tempfile.gettempdir())/'gpmc-forward-model.png'))
        page.locator('[data-fd-view="peers"]').click()
        # A peer response arriving after a company change cannot repopulate it.
        pending.clear()
        page.locator("#fd-peer-symbols").fill("SLOW")
        page.locator("#fd-peer-form").evaluate("f => f.requestSubmit()")
        expect(page.locator("#fd-peer-status")).to_contain_text("Loading SLOW")
        ticker.fill("MSFT")
        page.locator("#fd-form").evaluate("f => f.requestSubmit()")
        expect(page.locator("#fd-name")).to_have_text("Microsoft Corporation")
        for route in pending:
            route.fulfill(json={**data,"name":"Late peer"})
        expect(page.locator("#fd-peer-table")).to_be_empty()
        expect(page.locator("#fd-peer-go")).to_be_enabled()

        page.locator('[data-fd-view="forecast"]').click()
        expect(page.locator('#fm-results')).to_be_hidden()
        expect(page.locator('#fm-opening').get_by_label('Total interest-bearing debt (book value)',exact=True)).to_have_value('')
        # Issuer separation, reload persistence and storage failure preserve the draft.
        page.locator('[data-fd-view="notes"]').click()
        expect(page.locator("#fd-note-thesis")).to_have_value("")
        ticker.fill("AAPL")
        page.locator("#fd-form").evaluate("f => f.requestSubmit()")
        expect(page.locator("#fd-note-thesis")).to_have_value(thesis)
        page.reload()
        if page.locator("#lock").is_visible():
            page.locator("#pw").fill(PASSWORD)
            page.locator("#pw").press("Enter")
        expect(page.locator("#fd-result")).to_be_visible()
        page.locator('[data-fd-view="notes"]').click()
        expect(page.locator("#fd-note-thesis")).to_have_value(thesis)
        page.locator('[data-fd-view="forecast"]').click()
        expect(page.locator('#fm-opening').get_by_label('Debt claims for valuation',exact=True)).to_have_value('210')
        expect(page.locator('#fm-horizon')).to_have_value('10')
        expect(page.locator('#fm-reviewed')).not_to_be_checked()
        page.locator('[data-fd-view="notes"]').click()
        page.evaluate("""() => {
          const original=Storage.prototype.setItem;
          Storage.prototype.setItem=function(k,v){if(k.startsWith('gpmc-research-notes'))throw new Error('Quota exceeded');return original.call(this,k,v);};
        }""")
        page.locator("#fd-note-thesis").fill("Unsaved research draft")
        expect(page.locator("#fd-notes-status")).to_contain_text("Not saved")
        page.locator('[data-fd-view="report"]').click()
        expect(page.locator("#fd-report-preview")).to_contain_text("Unsaved research draft")
        page.locator('[data-fd-view="notes"]').click()
        expect(page.locator("#fd-note-thesis")).to_have_value("Unsaved research draft")
        for width in (320, 390, 768, 1280):
            page.set_viewport_size({"width":width,"height":1000})
            for view in ("allocation","notes","report"):
                page.locator('[data-fd-view="'+view+'"]').click()
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), f"{view} overflow at {width}"
        page.locator("#v-fundamentals").screenshot(path=str(pathlib.Path(tempfile.gettempdir())/'gpmc-report-preview.png'))
        for width in (320, 390, 768, 1280):
            page.set_viewport_size({"width": width, "height": 1000})
            page.locator('[data-fd-view="statements"]').click()
            overflow = page.evaluate("""() => Array.from(document.querySelectorAll('body *')).filter(e => {
                const b=e.getBoundingClientRect(); return b.height && b.right>window.innerWidth+1 && !e.closest('.fd-table-wrap') && !e.closest('.tabs');
            }).map(e => [e.tagName,e.id,e.className,Math.round(e.getBoundingClientRect().right)]).slice(0,15)""")
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), f"Page overflow at {width}: {overflow}"
            box = page.locator("#fd-statements-table").bounding_box()
            assert box["x"] + box["width"] <= width + 1
        page.locator('[data-fd-view="overview"]').click()
        page.locator("#v-fundamentals").screenshot(path=str(pathlib.Path(tempfile.gettempdir()) / "gpmc-fundamentals.png"))
        ticker=page.locator('#fd-ticker')
        ticker.fill('BANK')
        page.locator('#fd-form').evaluate('f=>f.requestSubmit()')
        page.locator('[data-fd-view="forecast"]').click()
        expect(page.locator('#fm-unavailable')).to_contain_text('sector-specific')
        expect(page.locator('#fm-editor')).to_be_hidden()
        assert not errors, errors
        browser.close()
        print("PASS: fundamental workflows plus quarterly/TTM, row charts, entered-cap valuation, peer comparisons, partial failures, issuer deduplication, stale peer cancellation, allocation sources, note persistence/isolation/storage failure, safe HTML/PDF export, forward model/scenarios/reverse DCF/persistence/CSV/reports/sector restrictions and responsive layout")
finally:
    server.shutdown()
