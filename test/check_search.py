"""Symbol search proxy tests with mocked upstream requests and fake credentials."""
import pathlib
import re
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
source = (root / "api/search.js").read_text()
# The fallback digest must match the site's existing gate. No live password is used.
assert re.search(r'=== "([a-f0-9]{64})"', source).group(1) == re.search(r'var PW_HASH = "([a-f0-9]{64})"', (root / "index.html").read_text()).group(1)
source = re.sub(r'^import .*?;\n', '', source).replace('export default async function handler', 'async function handler')
checks = r'''
var process={env:{TOOLS_PASSWORD:'test-password',TWELVE_DATA_KEY:'test-provider-key'}};
var calls=[], data, http=200, fail=false;
function assert(ok,message){if(!ok)throw new Error(message);}
var fetch=async function(url){calls.push(url);if(fail)throw new Error('test-provider-key');return {ok:http===200,status:http,json:async function(){return data;}};};
async function request(q,headers,method){
 var res={code:200,headers:{},setHeader:function(k,v){this.headers[k]=v;},status:function(n){this.code=n;return this;},json:function(x){this.body=x;return this;}};
 await handler({method:method||'GET',query:{q:q,k:'test-password'},headers:headers||{}},res);return res;
}
(async function(){
 var auth={'x-tools-password':'test-password'};
 assert((await request('aa')).code===401 && calls.length===0,'must require header authentication');
 assert((await request('aa',auth,'POST')).code===405,'method gate');
 for(var q of ['a','',Array(51).join('a'),'aa\n'])assert((await request(q==='aa\n'?'a\u0000a':q,auth)).code===400,'query validation');
 data={data:[null,{symbol:'AAPL',instrument_name:'Apple',exchange:'NASDAQ',country:'United States',instrument_type:'Common Stock'},
 {symbol:'AAPL',instrument_name:'Apple duplicate',exchange:'NASDAQ'},
 {symbol:'AAPL',instrument_name:'Apple other listing',exchange:'XETRA'},
 {symbol:'XAU/USD',instrument_name:'Gold',exchange:'Aggregate',instrument_type:'Commodity'},
 {symbol:'BAD&apikey=x',instrument_name:'Unsafe'},
 {symbol:'ABC',exchange:'BAD&key=x'}]};
 var r=await request('Apple & Co',auth);
 assert(r.code===200 && r.body.results.length===3,'normalization and deduplication');
 assert(r.body.results[0].exchange==='NASDAQ' && r.body.results[1].exchange==='XETRA','exchange identity');
 assert(r.body.results[2].exchange==='','commodity aggregate is not a listing filter');
 assert(calls[0].indexOf('symbol=Apple%20%26%20Co&outputsize=30')>=0,'encoded query');
 assert(r.headers['Cache-Control']==='private, no-store','private response');
 data={data:Array.from({length:30},function(_,i){return {symbol:'TEST'+i};})};
 assert((await request('test',auth)).body.results.length===12,'bounded results');
 data={status:'error',code:429,message:'test-provider-key credits exhausted'};
 r=await request('test',auth);assert(r.code===429 && r.headers['Retry-After']==='60','rate limit');
 assert(JSON.stringify(r.body).indexOf('test-provider-key')<0,'key leaked');
 fail=true;r=await request('test',auth);assert(r.code===502 && JSON.stringify(r.body).indexOf('test-provider-key')<0,'network error sanitized');
 print('PASS: search authentication, validation, exchange identity, deduplication, limits and sanitized errors');
})().catch(function(e){print('FAIL: '+e.message);});
'''
with tempfile.TemporaryDirectory() as tmp:
    path = pathlib.Path(tmp) / "search.js"
    path.write_text(source + checks)
    result = subprocess.run(["/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc", str(path)], capture_output=True, text=True)
assert result.returncode == 0 and 'PASS:' in result.stdout and 'FAIL:' not in result.stdout, result.stdout + result.stderr
print(result.stdout.strip())
