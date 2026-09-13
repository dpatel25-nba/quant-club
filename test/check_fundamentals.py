"""SEC fiscal-period normalization and API tests. Uses synthetic data and fake auth only."""
import pathlib
import re
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
model = (ROOT / "lib/sec-financials.js").read_text().replace("export ", "")
api = (ROOT / "api/fundamentals.js").read_text()
assert re.search(r'=== "([a-f0-9]{64})"', api).group(1) == re.search(r'var PW_HASH = "([a-f0-9]{64})"', (ROOT / "index.html").read_text()).group(1)
api = re.sub(r'^import .*?;\n', '', api, flags=re.M).replace("export default async function handler", "async function handler")
checks = r'''
function assert(ok,msg){if(!ok)throw new Error(msg);}
function near(a,b,msg){assert(Math.abs(a-b)<1e-9,msg);}
var facts={cik:123,entityName:'Test Inc.',facts:{'us-gaap':{}}};
function put(tag,unit,row){var g=facts.facts['us-gaap']; if(!g[tag])g[tag]={units:{}}; if(!g[tag].units[unit])g[tag].units[unit]=[];g[tag].units[unit].push(row);}
function fact(year,value,instant){return {start:instant?undefined:(year-1)+'-07-01',end:year+'-06-30',val:value,fy:2099,fp:'FY',form:'10-K',filed:year+'-08-01',accn:'0000000123-'+String(year).slice(2)+'-000001'};}
for(var y=2020;y<=2025;y++){
 for(var entry of [['Revenues',100+y-2020],['NetIncomeLoss',20],['NetCashProvidedByUsedInOperatingActivities',30],['PaymentsToAcquirePropertyPlantAndEquipment',8],['GrossProfit',50],['OperatingIncomeLoss',25]])put(entry[0],'USD',fact(y,entry[1]));
 for(var entry of [['Assets',200],['StockholdersEquity',100],['AssetsCurrent',50],['LiabilitiesCurrent',25],['Liabilities',100],['CashAndCashEquivalentsAtCarryingValue',0]])put(entry[0],'USD',fact(y,entry[1],true));
}
var sub={cik:123,name:'Test Inc.',sic:'1234',exchanges:['Nasdaq'],filings:{recent:{accessionNumber:['0000000123-25-000001'],form:['10-K'],filingDate:['2025-08-01'],reportDate:['2025-06-30']}}};
// Comparative values with a deliberately wrong fy still belong to their actual period.
put('Revenues','USD',Object.assign(fact(2025,999),{start:'2025-04-01'}));
put('Revenues','EUR',fact(2025,9999));
put('Assets','USD',Object.assign(fact(2025,999),{start:'2024-07-01'}));
put('Revenues','USD',Object.assign(fact(2025,999),{form:'10-Q'}));
var d=normalizeFinancials(facts,sub,'TEST','test'), p=d.periods[0].values;
assert(d.periods.length===5 && d.periods[0].start==='2024-07-01' && d.periods[0].end==='2025-06-30','fiscal dates and five annual periods');
assert(p.revenue.value===105 && p.assets.value===200,'reject quarterly, mismatched currency and duration balances');
assert(p.cash.value===0 && p.inventory===null,'zero is real; missing is not zero');
assert(p.fcf.value===22 && p.fcf.derived,'cash minus capex');
near(p.netMargin.value,20/105,'net margin');near(p.currentRatio.value,2,'liquidity');
near(p.roe.value,.2,'average equity');near(d.periods[4].values.revenueGrowth.value,101/100-1,'hidden sixth year for oldest growth');
assert(p.revenue.url==='https://www.sec.gov/Archives/edgar/data/123/000000012325000001/0000000123-25-000001-index.html','source URL');
assert(p.fcfMargin.inputs[0].sources.length===2,'recursive calculation provenance');
// Newer amendment wins across alias tags; don't prefer an older popular tag.
put('RevenueFromContractWithCustomerExcludingAssessedTax','USD',Object.assign(fact(2025,110),{form:'10-K/A',filed:'2025-09-01',accn:'0000000123-25-000002'}));
d=normalizeFinancials(facts,sub,'TEST','test');assert(d.periods[0].values.revenue.value===110 && d.periods[0].values.revenue.form==='10-K/A','amendment and alias priority');
// Negative prior earnings and equity: not meaningful, not fabricated ratios.
put('NetIncomeLoss','USD',Object.assign(fact(2024,-2),{filed:'2026-01-01'}));
put('StockholdersEquity','USD',Object.assign(fact(2025,-10,true),{filed:'2026-01-01'}));
d=normalizeFinancials(facts,sub,'TEST','test');p=d.periods[0].values;
assert(p.earningsGrowth===null && p.roe===null && p.liabilitiesEquity===null,'negative denominator guard');
// Gaps in fiscal histories cannot become year-over-year growth or average balances.
var gap=JSON.parse(JSON.stringify(facts));
Object.values(gap.facts['us-gaap']).forEach(function(tag){Object.keys(tag.units).forEach(function(unit){tag.units[unit]=tag.units[unit].filter(function(f){return f.end!=='2024-06-30';});});});
d=normalizeFinancials(gap,sub,'TEST','test');assert(d.periods[0].values.revenueGrowth===null && d.periods[0].values.roa===null,'missing consecutive year');
assert(normalizeFinancials({},sub,'TEST','test').coverage==='filings-only','filings-only issuer');
assert(filingURL('123','../../evil')===null && filingURL('evil','0000000123-25-000001')===null,'safe source URL');
print('PASS: fiscal dates, amendments, currencies, annual/quarter separation, missing/zero values, ratios and provenance');

var process={env:{TOOLS_PASSWORD:'test-password'}};
var calls=[],failStatus=0,throwNetwork=false;
var setTimeout=function(fn,ms){if(ms<8000)fn();return 1;},clearTimeout=function(){};
var AbortController=function(){this.signal={};this.abort=function(){};};
var fetch=async function(url,options){
 calls.push(url);assert(options.headers['User-Agent'].indexOf('GPMC')===0,'identified requests');
 if(throwNetwork)throw new Error('secret upstream details');
 return {ok:failStatus===0,status:failStatus||200,json:async function(){
  if(url.indexOf('company_tickers.json')>=0)return {0:{ticker:'TEST',title:'Test Inc.',cik_str:123},1:{ticker:'BRK-B',title:'Berkshire Hathaway',cik_str:1067983}};
  if(url.indexOf('/submissions/')>=0)return sub;
  return facts;
 }};
};
async function request(query,auth,method){var res={code:200,headers:{},setHeader:function(k,v){this.headers[k]=v;},status:function(n){this.code=n;return this;},json:function(x){this.body=x;return this;}};
 await handler({method:method||'GET',query:query,headers:auth?{'x-tools-password':'test-password'}:{}},res);return res;}
(async function(){
 assert((await request({symbol:'TEST',k:'test-password'})).code===401 && calls.length===0,'header auth before fetch');
 assert((await request({symbol:'TEST'},true,'POST')).code===405,'GET only');
 for(var symbol of ['XAU/USD','../TEST','TEST&x=1',''])assert((await request({symbol:symbol},true)).code===400,'symbol input validation');
 assert((await request({q:'x'},true)).code===400,'query validation');
 var r=await request({q:'berkshire'},true);assert(r.body.results[0].symbol==='BRK-B','SEC company search');
 r=await request({symbol:'TEST'},true);assert(r.code===200 && r.body.cik==='0000000123','issuer resolution');
 assert(r.headers['Cache-Control']==='private, no-store','no public auth cache');
 var count=calls.length;await request({symbol:'TEST'},true);assert(calls.length===count,'server cache');
 assert((await request({symbol:'UNKNOWN'},true)).code===404,'unsupported ticker');
 cache.clear();failStatus=429;r=await request({symbol:'TEST'},true);assert(r.code===503 && r.headers['Retry-After']==='60','SEC fair access error');
 cache.clear();failStatus=0;throwNetwork=true;r=await request({symbol:'TEST'},true);assert(r.code===502 && !JSON.stringify(r.body).includes('secret'),'sanitized errors');
 print('PASS: SEC search, auth, input validation, identity, cache and upstream failure handling');
})().catch(function(e){print('FAIL: '+e.stack);});
'''
with tempfile.TemporaryDirectory() as tmp:
    path = pathlib.Path(tmp) / "fundamentals.js"
    path.write_text(model + "\n" + api + "\n" + checks)
    result = subprocess.run([JSC, str(path)], capture_output=True, text=True)
assert result.returncode == 0 and result.stdout.count("PASS:") == 2 and "FAIL:" not in result.stdout, result.stdout + result.stderr
print(result.stdout.strip())
