"""Execute the shipped dashboard against its real snapshot without API credits."""
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'


def run(js):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp)/'check.js'
        path.write_text(js)
        result = subprocess.run([JSC, str(path)], capture_output=True, text=True)
    if result.returncode or 'PASS' not in result.stdout:
        raise AssertionError(result.stdout+'\n'+result.stderr)
    print(result.stdout.strip())


def main():
    api = (ROOT/'api/style-rotation.js').read_text()
    payload = api.split('const SNAPSHOT = ', 1)[1].rstrip().removesuffix(';')
    snapshot = json.loads(payload)
    assert len(snapshot['tables']) == 23 and len(snapshot['reports']) == 13
    assert len(payload.encode()) < 4_000_000
    assert len(snapshot['provenance']) == 23
    html = (ROOT/'index.html').read_text()
    ids = re.findall(r'\bid="([^"]+)"', re.sub(r'<script>.*?</script>', '', html, flags=re.S))
    assert len(ids) == len(set(ids)), 'duplicate HTML IDs'
    assert 'data-v="style-rotation"' in html and 'id="v-style-rotation"' in html
    frontend = (ROOT/'style-rotation.js').read_text()
    for identifier in re.findall(r"el\('(sr-[^']+)'\)", frontend):
        assert identifier in ids, identifier
    assert 'x-tools-password' in api and 'private, no-store' in api
    assert 'req.query' not in api
    assert not list(ROOT.glob('**/style-rotation-data.json')), 'public snapshot file'
    stub = r'''
function assert(ok, message) { if (!ok) throw new Error(message); }
function close(a,b) { assert(Math.abs(a-b)<1e-7, String(a)+' != '+String(b)); }
var nodes = {}, calls = [], downloads = [], chartCalls = [], fetchMode = 'ok';
function Node(id) { this.id=id; this.value=''; this.hidden=true; this.innerHTML=''; this.textContent=''; this.dataset={}; this.events={};
 this.addEventListener=function(k,f){this.events[k]=f;}; this.querySelectorAll=function(){return [];};
 this.scrollIntoView=function(){}; this.remove=function(){}; this.click=function(){if(this.download)downloads.push(this.download);}; }
var document={getElementById:function(id){return nodes[id]||(nodes[id]=new Node(id));},createElement:function(){return new Node('');},body:{appendChild:function(){}}};
var window={location:{hash:''}};
var URL={createObjectURL:function(){return 'blob:test';},revokeObjectURL:function(){}};
function Blob(x){this.parts=x;}
function setTimeout(f){f();}
function P(value, error) { return {then:function(fn){if(error)return P(null,error);try{var next=fn(value);return next&&next.then?next:P(next);}catch(e){return P(null,e);}},catch:function(fn){if(error)fn(error);return this;}}; }
function fetch(url, options){ calls.push({url:url,options:options}); if(fetchMode==='network')return P(null,new Error('offline'));
 return P({ok:fetchMode==='ok',status:fetchMode==='auth'?401:503,json:function(){return P(SNAPSHOT);}}); }
'''
    setup = "var SNAPSHOT = "+payload+";\n"+r'''
document.getElementById('sr-panel').value='raw'; document.getElementById('sr-delay').value='0';
document.getElementById('sr-period').value='post_2000'; document.getElementById('sr-cost').value='10';
document.getElementById('sr-out-panel').value='raw'; document.getElementById('sr-out-delay').value='1';
document.getElementById('sr-horizon').value='1'; document.getElementById('sr-corr-window').value='36';
'''
    # Capture chart inputs while executing the real SVG builder and readouts.
    frontend = frontend.replace('function chart(id, dates, series, unit) {', 'function chart(id, dates, series, unit) { chartCalls.push({id:id,dates:dates,series:series,unit:unit});')
    frontend = frontend.replace('window.StyleRotation = {open:open};', 'window.StyleRotation = {open:open}; window.check = {render:render,rows:rows,csv:csv,reset:function(){data=null;}};')
    probes = r'''
window.StyleRotation.open(''); assert(calls.length===0,'locked page fetched data');
window.StyleRotation.open('test-password'); assert(calls.length===1,'expected one snapshot fetch');
assert(calls[0].url==='/api/style-rotation' && calls[0].options.headers['X-Tools-Password']==='test-password','auth header');
assert(!document.getElementById('sr-content').hidden,'dashboard did not load');
var cases=0;
['raw','hedged'].forEach(function(panel){[0,1,2].forEach(function(delay){
['full','pre_2000','post_2000','macro_overlap','through_1989','1990s','2000s','2010s','2020_onward'].forEach(function(period){
[0,5,10,25].forEach(function(cost){
 document.getElementById('sr-panel').value=panel; document.getElementById('sr-delay').value=String(delay);
 document.getElementById('sr-period').value=period; document.getElementById('sr-cost').value=String(cost);
 chartCalls=[]; window.check.render(); assert(chartCalls.length===2,'missing charts');
 chartCalls.forEach(function(c){assert(c.dates.length>1,'empty chart'); c.series.forEach(function(s){assert(s.values.length===c.dates.length,'chart alignment');assert(s.values.every(isFinite),'nonfinite chart');});});
 var summary=window.check.rows('portfolio_summary').filter(function(r){return r.panel===panel&&r.delay===delay&&r.period===period&&r.cost_bps===cost;});
 chartCalls[1].series.forEach(function(s,i){var model=['technical','frozen','equal_style'][i];var expected=summary.filter(function(r){return r.model===model;})[0]; close(s.values[s.values.length-1],expected.total_pnl*100);close(s.values[0],0);});
 assert(document.getElementById('sr-primary').textContent.indexOf('2000 onward, 10 bps')>=0,'primary test changes with exploratory controls');
 assert(document.getElementById('sr-selection').innerHTML.indexOf('select_joint')>=0,'selection results missing');
 assert(document.getElementById('sr-pnl-chart').innerHTML.indexOf('NaN')<0,'invalid svg'); cases++;
});});});});
assert(cases===216,'scenario coverage'); assert(calls.length===1,'controls fetched data again');
var outlookCases=0;
['raw','hedged'].forEach(function(panel){[0,1,2].forEach(function(delay){[1,6,12].forEach(function(horizon){[12,36,60].forEach(function(lookback){
 document.getElementById('sr-out-panel').value=panel;document.getElementById('sr-out-delay').value=String(delay);
 document.getElementById('sr-horizon').value=String(horizon);document.getElementById('sr-corr-window').value=String(lookback);
 document.getElementById('sr-horizon').events.change();
 var latest=window.check.rows('outlook_latest').filter(function(r){return r.panel===panel&&r.delay===delay&&r.horizon===horizon&&r.model==='dma';});
 latest.sort(function(a,b){return a.rank-b.rank||a.style.localeCompare(b.style);});
 var ranking=document.getElementById('sr-ranking').innerHTML;
 assert((ranking.match(/scope="row"/g)||[]).length===15,'ranking universe');
 assert(ranking.indexOf(latest[0].style+' ·')<ranking.indexOf(latest[14].style+' ·'),'rank ordering');
 assert(document.getElementById('sr-out-date').textContent.indexOf(latest[0].formation_date.slice(0,10))>=0,'forecast date');
 var heatmap=document.getElementById('sr-correlation').innerHTML;
 assert((heatmap.match(/<td /g)||[]).length===225,'correlation cell count');
 assert(heatmap.indexOf(lookback+' complete monthly returns')>=0,'correlation window');
 assert(document.getElementById('sr-dma-note').textContent.indexOf('not a confidence interval')>=0,'uncertainty label');
 outlookCases++;
});});});});
assert(outlookCases===54,'outlook coverage'); assert(calls.length===1,'outlooks refetched snapshot');
document.getElementById('sr-table-choice').value='portfolio_summary'; document.getElementById('sr-csv').events.click();
document.getElementById('sr-bundle').events.click(); document.getElementById('sr-source').events.click();
assert(downloads.length===3,'download handlers failed');
assert(window.check.csv({columns:['a'],rows:[['=1+1'],['a"b'],[-1]]}).indexOf("'=1+1")>=0,'csv formula escaping');
window.check.reset();fetchMode='network';window.StyleRotation.open('test-password');assert(!document.getElementById('sr-retry').hidden,'network error has no retry');
fetchMode='auth';window.StyleRotation.open('test-password');assert(document.getElementById('sr-status').textContent.indexOf('verified')>=0,'auth error missing');
fetchMode='ok';document.getElementById('sr-retry').events.click();assert(!document.getElementById('sr-content').hidden,'retry failed');
print('PASS: 216 scenarios, SVG/chart P&L reconciliation, auth headers, caching, downloads and retry');
print('PASS: 54 outlook/correlation scenarios, rank ordering, dates, DMA labels and heatmap cells');
'''
    run(stub+setup+frontend+probes)
    # Execute the server handler with deterministic crypto and response adapters.
    # Real SHA-256 fixtures originate in Python; Node's crypto stays unmodified
    # in production. The test asserts gate control flow and no-store responses.
    handler = api.split('const SNAPSHOT = ', 1)[0]
    handler = re.sub(r"import .*?from 'node:crypto';", '', handler).replace('export default ', '')
    fixtures = {s: hashlib.sha256(s.encode()).hexdigest() for s in ('', 'wrong', 'configured-secret')}
    server = 'var hashes = '+json.dumps(fixtures)+';\n'+r'''
function createHash(){return {update:function(v){this.v=v;return this;},digest:function(){return hashes[this.v];}};}
function timingSafeEqual(a,b){return a===b;}
var Buffer={from:function(s){return s;}}, process={env:{TOOLS_PASSWORD:'configured-secret'}}, SNAPSHOT={schema:1};
function response(){return {headers:{},setHeader:function(k,v){this.headers[k]=v;},status:function(s){this.code=s;return this;},json:function(b){this.body=b;return this;}};}
function assert(c,m){if(!c)throw new Error(m);}
'''+handler+r'''
['','wrong','configured-secret'].forEach(function(p){var res=response();handler({method:'GET',headers:{'x-tools-password':p}},res);assert(res.code===(p==='configured-secret'?200:401),'server gate');assert(res.headers['Cache-Control']==='private, no-store','cache policy');});
var res=response();handler({method:'POST',headers:{}},res);assert(res.code===405,'method allowed');
process.env={};res=response();handler({method:'GET',headers:{'x-tools-password':'wrong'}},res);assert(res.code===401,'fallback open');
print('PASS: server authorization, method checks and private cache policy');
'''
    run(server)
    print('PASS: export coverage, payload budget, unique IDs and source integration')


if __name__ == '__main__':
    main()
