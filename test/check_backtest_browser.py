"""Live DOM workflow with synthetic daily prices and a mocked account session."""
import csv,functools,http.server,io,json,pathlib,tempfile,threading,datetime,math
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
requests=[];state={'fail':False,'hold':False};pending=[]
def api(route):
    path=urlparse(route.request.url).path;q=parse_qs(urlparse(route.request.url).query)
    if path=='/api/auth':route.fulfill(json={'mode':'accounts','user':{'id':'test-backtest-member','email':'preview@example.test'}});return
    if path=='/api/search':route.fulfill(json={'results':[]});return
    assert path=='/api/quote',path
    assert q['range']==['backtest'] and q['quote']==['0'],q
    assert route.request.headers.get('x-tools-password')=='__session__'
    assert 'k' not in q,'Account credentials must not appear in history URLs'
    requests.append(q)
    if state['hold']:pending.append(route);return
    if state['fail'] and q['symbol']==['MSFT']:route.fulfill(status=429,json={'error':'Rate limit. Wait and retry.'});return
    start=datetime.date.fromisoformat(q['start'][0]);end=datetime.date.fromisoformat(q['end'][0]);points=[];date=start
    symbol=q['symbol'][0];seed=sum(map(ord,symbol))
    while date<=end:
        if date.weekday()<5:
            i=len(points);points.append({'t':date.isoformat(),'c':100*math.exp((.00013+seed%9*.000025)*i+.09*math.sin(i/32+seed))})
        date+=datetime.timedelta(days=1)
    if symbol=='GAP':points.pop(20)
    route.fulfill(json={'symbol':symbol,'currency':'USD','interval':'1day','type':'ETF','adjustment':'splits','returnBasis':'price','points':points})
try:
    with sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.route(base+'/api/**',api)
        page.goto(base+'/#portfolio')
        expect(page.locator('#v-portfolio')).to_be_visible()
        expect(page.locator('#account-bar')).to_be_visible()
        assert not requests,'Portfolio deep link must not fetch unrelated quotes'
        page.locator('#bt-start').fill('2020-01-01');page.locator('#bt-end').fill('2025-12-31')
        weights=page.locator('#rows .wt');weights.first.fill('30');page.locator('#bt-run').click()
        expect(page.locator('#bt-status')).to_contain_text('must total 100%');assert not requests
        weights.first.fill('40');page.locator('#bt-rebalance').select_option('monthly');page.locator('#bt-cost').fill('10');page.locator('#bt-run').click()
        expect(page.locator('#bt-results')).to_be_visible(timeout=15000)
        expect(page.locator('#bt-metrics .fd-metric')).to_have_count(6)
        expect(page.locator('#bt-holdings tbody tr')).to_have_count(4)
        expect(page.locator('#bt-rebalance-log tbody tr')).to_have_count(71)
        assert len(requests)==5,'One request per holding and benchmark'
        assert 'NaN' not in page.locator('#bt-results').inner_html()
        page.locator('#bt-date').fill('0');expect(page.locator('#bt-readout')).to_contain_text('2020-01-01')
        page.locator('#bt-date').press('ArrowRight');expect(page.locator('#bt-readout')).to_contain_text('2020-01-02')
        page.locator('#bt-monthly-series').select_option('benchmark');expect(page.locator('#bt-months tbody tr')).to_have_count(6)
        before=len(requests);page.locator('#bt-rebalance').select_option('hold');expect(page.locator('#bt-results')).to_be_hidden();expect(page.locator('#bt-csv')).to_be_disabled()
        page.locator('#bt-run').click();expect(page.locator('#bt-results')).to_be_visible();assert len(requests)==before,'Assumption-only edits reuse history'
        with page.expect_download() as download:
            page.locator('#bt-csv').click()
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/'backtest.csv';download.value.save_as(path)
            rows=list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
        assert rows[0]==['Portfolio backtest','Price returns; dividends excluded']
        assert any(r and r[0]=='Date' and 'Portfolio USD' in r for r in rows)
        # Real screenshots from simulated data for reviewing layouts; no provider calls.
        shots=pathlib.Path(tempfile.mkdtemp(prefix='gpmc-backtest-'))
        for theme in ['light','dark']:
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
            for width in [1440,390]:
                page.set_viewport_size({'width':width,'height':1000})
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(theme,width)
                page.locator('#bt-results').screenshot(path=str(shots/f'results-{theme}-{width}.png'))
        page.set_viewport_size({'width':1440,'height':1000})
        page.locator('#bt-example').select_option('market');page.locator('#bt-load-example').click()
        expect(page.locator('#rows .tk')).to_have_count(1);expect(page.locator('#rows .tk')).to_have_value('VTI')
        page.locator('#bt-benchmark').fill('VTI');page.locator('#bt-run').click();expect(page.locator('#bt-results')).to_be_visible()
        assert len(requests)==before+1,'Benchmark matching a holding should reuse its data'
        expect(page.locator('#bt-comparison')).to_contain_text('0.00 percentage points')
        # Missing histories are rejected, not silently filled.
        page.locator('#bt-example').select_option('large');page.locator('#bt-load-example').click()
        page.locator('#rows .tk').first.fill('GAP');page.locator('#bt-run').click()
        expect(page.locator('#bt-status')).to_contain_text('missing prices');expect(page.locator('#bt-results')).to_be_hidden()
        # A failed fetch can be retried using completed cached responses.
        page.locator('#bt-load-example').click();page.locator('#bt-start').fill('2021-01-01');page.locator('#bt-benchmark').fill('SPY')
        state['fail']=True;page.locator('#bt-run').click();expect(page.locator('#bt-status')).to_contain_text('Rate limit')
        state['fail']=False;before=len(requests);page.locator('#bt-run').click();expect(page.locator('#bt-results')).to_be_visible()
        assert len(requests)==before+4,'Successful first holding must remain cached on retry'
        # Edits cancel in-flight work; late responses must not reveal obsolete results.
        state['hold']=True;page.locator('#bt-start').fill('2022-01-01');page.locator('#bt-run').click()
        expect(page.locator('#bt-cancel')).to_be_visible();page.locator('#bt-capital').fill('25000')
        expect(page.locator('#bt-run')).to_be_enabled();expect(page.locator('#bt-results')).to_be_hidden()
        for route in pending:
            try:route.fulfill(status=503,json={'error':'Late canceled response'})
            except Exception:pass
        state['hold']=False
        page.locator('#bt-benchmark').fill('');page.locator('#bt-run').click();expect(page.locator('#bt-results')).to_be_visible()
        expect(page.locator('#bt-comparison')).to_have_text('No benchmark selected.')
        expect(page.locator('#bt-benchmark-legend')).to_be_hidden()
        assert not errors,errors
        browser.close();print('PASS: deep link, validation, benchmark, cached reruns, CSV, presets, missing data, retry, cancellation, no benchmark and mobile/light/dark layouts')
        print('Screenshots:',shots)
finally:server.shutdown()
