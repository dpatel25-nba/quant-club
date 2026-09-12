"""Exercise the quote proxy with fake credentials and mocked upstream data."""
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
source = (root / "api/quote.js").read_text().replace("export default async function handler", "async function handler")
checks = r'''
var process = {env: {TOOLS_PASSWORD: 'test-password', TWELVE_DATA_KEY: 'test-key'}};
var calls = [], responseBody;
function assert(ok, message) { if (!ok) throw new Error(message); }
var fetch = async function(url) { calls.push(url); return {json: async function() {return responseBody;}}; };
async function request(query) {
  var res = {code: 200, headers: {}, status: function(n) {this.code=n; return this;},
    setHeader: function(k,v) {this.headers[k]=v;}, json: function(v) {this.body=v; return this;}};
  await handler({query:query},res); return res;
}
(async function() {
  var denied = await request({symbol:'XAU/USD'});
  assert(denied.code===401 && calls.length===0, 'authentication must precede upstream calls');
  var symbols=['XAU/USD','XAG/USD','WTI/USD','XBR/USD','HG1','XPT/USD','XPD/USD','GLD','AAPL','BTC/USD'];
  for (var symbol of symbols) {
    responseBody={meta:{name:'Test instrument',type:'Commodity',currency:'USD'},
      values:[{datetime:'2026-09-11',close:'105'},{datetime:'2026-09-10',close:'100'}]};
    calls=[];
    var r=await request({k:'test-password',symbol:symbol,range:'1y',quote:'0'});
    assert(r.code===200 && r.body.symbol===symbol, 'symbol was substituted');
    assert(calls.length===1 && calls[0].indexOf('symbol='+encodeURIComponent(symbol)+'&')>=0, 'wrong upstream symbol');
    assert(r.body.name==='Test instrument' && r.body.type==='Commodity', 'metadata missing without quote');
    assert(r.body.points[0].c===100 && r.body.points[1].c===105, 'chronological series');
  }
  for (var failure of [
    {body:{status:'error',code:403,message:'Upgrade your subscription plan. test-key'},code:403},
    {body:{status:'error',code:400,message:'This symbol requires a higher plan'},code:403},
    {body:{status:'error',code:429,message:'Credits per minute exhausted'},code:429},
    {body:{status:'error',code:404,message:'Symbol not found'},code:404}
  ]) {
    responseBody=failure.body;
    var r=await request({k:'test-password',symbol:'XAU/USD',range:'1y',quote:'0'});
    assert(r.code===failure.code, 'wrong error classification');
    assert(JSON.stringify(r.body).indexOf('test-key')<0, 'upstream key exposed');
  }
  calls=[];
  var invalid=await request({k:'test-password',symbol:'XAU/USD&apikey=bad'});
  assert(invalid.code===400 && calls.length===0,'invalid symbol reached provider');
  print('PASS: commodity symbols, metadata, authentication, plan errors, rate limits and key redaction');
})().catch(function(e) {print('FAIL: '+e.message);});
'''
with tempfile.TemporaryDirectory() as tmp:
    path = pathlib.Path(tmp) / "quote.js"
    path.write_text(source + "\n" + checks)
    result = subprocess.run([
        "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc", str(path)
    ], capture_output=True, text=True)
assert result.returncode == 0 and "PASS:" in result.stdout and "FAIL:" not in result.stdout, result.stdout + result.stderr
print(result.stdout.strip())
