"""Quarter reconstruction, TTM, growth and valuation using synthetic SEC facts."""
import pathlib
import subprocess
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
source=(ROOT/'lib/sec-financials.js').read_text().replace('export ','')
analysis=(ROOT/'fundamental-analysis.js').read_text()
checks=r'''
function assert(ok,msg){if(!ok)throw new Error(msg);}
function near(a,b,msg){assert(Math.abs(a-b)<1e-8,msg+': '+a+' vs '+b);}
var facts={facts:{'us-gaap':{}}};
function add(tag,unit,start,end,val,form,filed){
 var g=facts.facts['us-gaap']; if(!g[tag])g[tag]={units:{}}; if(!g[tag].units[unit])g[tag].units[unit]=[];
 var yr=end.slice(0,4);g[tag].units[unit].push({start:start,end:end,val:val,form:form,filed:filed||String(Number(yr)+1)+'-02-01',accn:'0000000123-'+yr.slice(2)+'-000001',fy:2099,fp:'FY'});
}
for(var yr=2023;yr<=2026;yr++){
 var ends=['03-31','06-30','09-30','12-31'], starts=['01-01','04-01','07-01','10-01'];
 var factor=yr-2022, cumulative=0, cash=0, capex=0;
 for(var q=0;q<(yr===2026?2:4);q++){
  var end=yr+'-'+ends[q], start=yr+'-'+starts[q], form=q===3?'10-K':'10-Q', filed=yr+'-'+['05-01','08-01','11-01','12-31'][q];
  cumulative+=(q+1)*100*factor;cash+=[20,30,50,80][q]*factor;capex+=(q+1)*5*factor;
  if(q<3)add('Revenues','USD',start,end,(q+1)*100*factor,form,filed);
  add('Revenues','USD',yr+'-01-01',end,cumulative,form,filed);
  add('NetIncomeLoss','USD',yr+'-01-01',end,cumulative*.2,form,filed);
  add('NetCashProvidedByUsedInOperatingActivities','USD',yr+'-01-01',end,cash,form,filed);
  add('PaymentsToAcquirePropertyPlantAndEquipment','USD',yr+'-01-01',end,capex,form,filed);
  add('EarningsPerShareDiluted','USD/shares',yr+'-01-01',end,1+q,form,filed);
  add('WeightedAverageNumberOfDilutedSharesOutstanding','shares',yr+'-01-01',end,100+q,form,filed);
  add('Assets','USD',undefined,end,1000+factor*100,form,filed);
  add('StockholdersEquity','USD',undefined,end,500,form,filed);
 }
}
var sub={cik:123,name:'Test',filings:{recent:{}}};
var d=normalizeFinancials(facts,sub,'TEST','2026-09-13');
var latest=d.quarterly[0], v=latest.values;
assert(latest.start==='2026-04-01' && latest.end==='2026-06-30','quarter dates');
near(v.revenue.value,800,'direct quarterly revenue');
near(v.ocf.value,120,'YTD cash flow subtraction');
near(v.capex.value,40,'YTD capex subtraction');
near(v.fcf.value,80,'quarter FCF');
assert(v.ocf.derived && v.ocf.inputs.length===2 && v.ocf.inputs[0].tag==='us-gaap:NetCashProvidedByUsedInOperatingActivities','derived sources');
var q4=d.quarterly.find(p=>p.end==='2025-12-31');
near(q4.values.revenue.value,1200,'Q4 = annual minus nine months');
assert(q4.values.eps===null && q4.values.shares===null,'EPS and weighted shares are not additive');
assert(v.eps===null && v.shares===null,'YTD EPS/shares not mislabeled as quarterly');
near(v.revenueGrowth.value,4/3-1,'quarter growth is YoY, not QoQ');
near(v.roa.value,160/1400,'quarter ROA uses beginning quarter balance without annualization');
var ttm=d.ttm[0];
assert(ttm.start==='2025-07-01' && ttm.end==='2026-06-30','four contiguous quarters');
near(ttm.values.revenue.value,3300,'TTM revenue');
near(ttm.values.ocf.value,590,'TTM cash flow');
near(ttm.values.capex.value,165,'TTM capex');
near(ttm.values.fcf.value,425,'TTM FCF');
near(ttm.values.assets.value,1400,'ending balance, not sum of balances');
near(ttm.values.revenueGrowth.value,3300/2300-1,'TTM YoY');
assert(ttm.values.eps===null && ttm.values.shares===null,'no invented TTM EPS');
assert(d.ttm.find(p=>p.end==='2025-12-31').values.eps.value===4,'exact reported annual EPS allowed');
var missing=JSON.parse(JSON.stringify(facts));
missing.facts['us-gaap'].PaymentsToAcquirePropertyPlantAndEquipment.units.USD=missing.facts['us-gaap'].PaymentsToAcquirePropertyPlantAndEquipment.units.USD.filter(f=>f.end!=='2025-09-30');
var m=normalizeFinancials(missing,sub,'TEST','2026-09-13');assert(m.ttm[0].values.capex===null && m.ttm[0].values.fcf===null,'missing component does not become zero');
var gap=JSON.parse(JSON.stringify(facts));
Object.values(gap.facts['us-gaap']).forEach(tag=>Object.values(tag.units).forEach(rows=>{for(var i=rows.length-1;i>=0;i--)if(rows[i].end==='2025-09-30')rows.splice(i,1);}));
assert(!normalizeFinancials(gap,sub,'TEST','2026-09-13').ttm.some(p=>p.end==='2026-06-30'),'no TTM over a gap');
// A newer amendment to a cumulative figure must win, and inputs retain dates.
var amended=JSON.parse(JSON.stringify(facts));
var rows=amended.facts['us-gaap'].NetCashProvidedByUsedInOperatingActivities.units.USD;
rows.push(Object.assign({},rows.find(f=>f.end==='2026-06-30'),{val:220,form:'10-Q/A',filed:'2026-09-01',accn:'0000000123-26-000002'}));
near(normalizeFinancials(amended,sub,'TEST','2026-09-13').quarterly[0].values.ocf.value,140,'amended cumulative quarter');
print('PASS: quarter/YTD separation, Q4, TTM continuity, missing components, EPS safeguards, amendments, YoY and balance timing');
var A=window.FundamentalAnalysis;
var result=A.valuation(ttm,6600,'2026-09-13','2026-09-13');assert(!result.error,'valuation accepted');
near(result.metrics.find(m=>m.id==='salesMultiple').value,2,'price sales');
near(result.metrics.find(m=>m.id==='fcfYield').value,425/6600,'FCF yield');
assert(A.valuation(ttm,0,'2026-09-13').error,'zero market cap');
assert(A.valuation(latest,6600,'2026-09-13').error,'no quarterly valuation');
assert(A.valuation(ttm,6600,'2026-07-01').error,'filing availability cutoff');
assert(A.valuation(ttm,6600,'2027-01-01','2026-09-13').error,'future date');
var negative=JSON.parse(JSON.stringify(ttm));negative.values.netIncome.value=-10;negative.values.fcf.value=-20;
result=A.valuation(negative,6600,'2026-09-13');assert(result.metrics[0].value===null && result.metrics[2].value<0,'loss earnings NM, negative FCF yield retained');
assert(A.filedDate(ttm.values.fcf)>='2026-08-01','recursive source date');
print('PASS: valuation periods, market-cap validation, financial availability dates and negative earnings/cash flow');
'''
with tempfile.TemporaryDirectory() as tmp:
    file=pathlib.Path(tmp)/'interim.js';file.write_text('var window={};\n'+source+'\n'+analysis+'\n'+checks)
    r=subprocess.run(['/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc',str(file)],capture_output=True,text=True)
assert r.returncode==0 and r.stdout.count('PASS:')==2,r.stdout+r.stderr
print(r.stdout.strip())
