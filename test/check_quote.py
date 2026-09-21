"""Exercise the quote proxy with fake credentials and mocked upstream data."""
import pathlib
import re
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
source = (root / "api/quote.js").read_text().replace("export default async function handler", "async function handler")
source = re.sub(r'^import .*?;\n', '', source, flags=re.M) + (root / "test/auth-fixture.js").read_text()
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
  responseBody={meta:{type:'Commodity'},values:[
    {datetime:'2026-09-11',open:'102',high:'112',low:'98',close:'105'},
    {datetime:'2026-09-10',open:'0',high:'2',low:'-3',close:'1'},
    {datetime:'2026-09-09',open:null,high:'',low:'bad',close:'100'},
    {datetime:'2026-09-08',close:null},
    {datetime:'2026-09-07',close:''}
  ]};
  for (var range of ['1h','1d','1m','1y','5y','all']) {
    var r=await request({k:'test-password',symbol:'XAU/USD',range:range,quote:'0',ohlc:'1'});
    assert(r.body.points.length===3,'missing closes must not become zero');
    var first=r.body.points[0], zero=r.body.points[1], last=r.body.points[2];
    assert(first.o===null && first.h===null && first.l===null,'missing OHLC must remain missing');
    assert(zero.o===0 && zero.l===-3,'valid zero and negative prices must survive');
    assert(last.o===102 && last.h===112 && last.l===98 && last.c===105,'OHLC not preserved');
    assert(r.body.interval===RANGES[range].interval,'bar interval missing');
  }
  var monthly=await request({k:'test-password',symbol:'AAPL',month:'2026-08',quote:'0'});
  assert(monthly.body.month==='2026-08' && monthly.body.interval==='1day','calendar month metadata');
  calls=[];
  await request({k:'test-password',symbol:'AAPL',exchange:'NASDAQ',range:'1m'});
  assert(calls.length===2 && calls.every(function(url){return url.indexOf('&exchange=NASDAQ&')>=0;}),'exchange must reach both series and quote');
  calls=[];
  var badExchange=await request({k:'test-password',symbol:'AAPL',exchange:'NYSE&apikey=bad'});
  assert(badExchange.code===400 && calls.length===0,'invalid exchange reached provider');
  calls=[];
  var invalid=await request({k:'test-password',symbol:'XAU/USD&apikey=bad'});
  assert(invalid.code===400 && calls.length===0,'invalid symbol reached provider');
  responseBody={meta:{type:'ETF',currency:'USD'},values:[{datetime:'2024-01-03',close:'102'},{datetime:'2024-01-02',close:'100'}]};
  calls=[];
  var backtest=await request({k:'test-password',symbol:'SPY',range:'backtest',start:'2024-01-01',end:'2024-12-31'});
  assert(backtest.code===200 && calls.length===1,'backtests need one history call, no quote');
  assert(calls[0].includes('interval=1day&outputsize=5000') && calls[0].includes('start_date=2024-01-01&end_date=2024-12-31&adjust=splits'),'bounded split-adjusted daily request');
  assert(backtest.body.adjustment==='splits' && backtest.body.returnBasis==='price','explicit price-return basis');
  assert(backtest.headers['Cache-Control']==='private, no-store','private historical response');
  for(var dates of [['2024-02-30','2024-12-31'],['2025-01-01','2024-01-01'],['1900-01-01','2024-01-01'],['2024-01-01','2099-01-01']]) {
    calls=[];var invalid=await request({k:'test-password',symbol:'SPY',range:'backtest',start:dates[0],end:dates[1]});
    assert(invalid.code===400 && !calls.length,'invalid dates reached provider');
  }
  assert((await request({k:'test-password',symbol:'SPY',start:'2024-01-01',end:'2024-12-31'})).code===400,'dates require explicit backtest mode');
  responseBody={meta:{type:'ETF'},values:[{datetime:'2024-01-02',close:'100'},{datetime:'2024-01-03',close:'102'}]};
  backtest=await request({k:'test-password',symbol:'SPY',range:'backtest',start:'2024-01-01',end:'2024-12-31'});
  assert(backtest.body.currency==='' && backtest.body.points[0].t==='2024-01-02','unknown currency cannot be assumed USD; sort dates');
  responseBody.values[1].close=null;
  assert((await request({k:'test-password',symbol:'SPY',range:'backtest',start:'2024-01-01',end:'2024-12-31'})).code===502,'missing backtest close cannot silently disappear');
  print('PASS: symbols, OHLC, interval/month metadata, missing/zero/negative prices, authentication and provider errors');
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
