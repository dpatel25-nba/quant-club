"""Independent arithmetic checks for the forward financial model, using JSCore."""
import pathlib, subprocess, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
checks=r'''
var E=window.ForwardModel;
function assert(x,msg){if(!x)throw new Error(msg);}
function near(a,b,msg){assert(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),msg+': '+a+' vs '+b);}
var driver={growth:10,grossMargin:50,rd:5,sga:10,otherOpex:5,tax:25,capex:5,depreciation:10,dso:36.5,dio:73,dpo:36.5,sbc:2,interest:5,payout:25,borrow:20,repay:30,issuance:5,buybacks:10,minCash:2};
var m={version:1,cik:'123',symbol:'TEST',period:{start:'2024-01-01',end:'2024-12-31',kind:'annual'},asOf:'2026-09-15',horizon:5,reviewed:true,notes:'',opening:{revenue:1000,assets:1000,liabilities:400,cash:100,ar:100,inventory:100,ap:50,ppe:400,debt:200,shares:100,excessCash:50,debtClaims:200,otherClaims:0,marketCap:1000},cases:{}};
E.scenarios.forEach(function(s){m.cases[s]={wacc:10,terminalGrowth:2,terminalROIC:10,weight:s==='base'?50:25,years:Array.from({length:10},()=>Object.assign({},driver))};});
var result=E.run(m,'2026-09-15');assert(!result.errors.length,'valid model');
var r=result.cases.base.rows[0];
Object.entries({revenue:1100,cogs:550,grossProfit:550,rd:55,sga:110,otherOpex:55,ebit:330,capex:55,da:40,ppe:415,ebitda:370,sbc:22,interest:10,pretax:320,tax:80,netIncome:240,nopat:247.5,ar:110,inventory:110,ap:55,nwc:165,deltaNwc:15,cfo:287,cfi:-55,dividends:60,cff:-75,cash:257,debt:190,equity:797,assets:1192,liabilities:395,balanceCheck:0,fcff:217.5,fundingGap:0}).forEach(([k,v])=>near(r[k],v,'Year 1 '+k));
var v=result.cases.base.valuation, final=result.cases.base.rows[4];
var expectedPV=result.cases.base.rows.reduce((s,r,i)=>s+r.fcff/(1.1**(i+1)),0);
var expectedTerminal=final.nopat*1.02*.8/.08;
near(v.terminal,expectedTerminal,'terminal reinvestment included');near(v.ev,expectedPV+expectedTerminal/1.1**5,'enterprise value');near(v.equity,v.ev+50-200,'bridge once');near(v.perShare,v.equity/100,'current diluted denominator');near(result.weightedEquity,v.equity,'scenario weights');
assert(E.value(m,'base',result.cases.base.rows,{wacc:11}).perShare<v.perShare,'discount sensitivity');
assert(E.value(m,'base',result.cases.base.rows,{wacc:2}).error,'WACC growth collision');
function copy(){return JSON.parse(JSON.stringify(m));}
var changed=copy();changed.cases.base.years.forEach(y=>y.sbc=3);
var sbc=E.run(changed).cases.base;near(sbc.valuation.ev,v.ev,'no SBC valuation addback');assert(sbc.rows[0].cfo>r.cfo && sbc.rows[0].equity>r.equity,'SBC increases accounting cash and paid-in equity');
changed=copy();changed.opening.otherClaims=100;near(E.run(changed).cases.base.valuation.equity,v.equity-100,'senior claims deducted once');
changed=copy();changed.opening.shares=200;near(E.run(changed).cases.base.valuation.perShare,v.perShare/2,'diluted share sensitivity');
changed=copy();changed.cases.base.years[0].repay=500;assert(E.run(changed).cases.base.valuation.error,'overpayment blocked');
changed=copy();changed.cases.base.years[0].buybacks=1000;var gap=E.run(changed).cases.base;assert(gap.rows[0].cash<0 && gap.fundingGap>0,'negative cash exposed, no plug');near(gap.rows[0].balanceCheck,0,'unfunded statements still reconcile');
changed=copy();changed.cases.base.years.forEach(y=>y.grossMargin=5);var loss=E.run(changed).cases.base;assert(loss.rows[0].tax===0 && loss.rows[0].nopat<0,'no tax refund on losses');assert(loss.valuation.error,'loss perpetuity unavailable');
changed=copy();changed.cases.base.years[0].sbc=100;assert(E.run(changed).cases.base.errors.length,'noncash charges cannot exceed embedded expenses');
changed=copy();changed.opening.debt=null;assert(E.run(changed).errors.length,'missing debt not zero');
changed=copy();changed.opening.inventory=10000;assert(E.run(changed).errors.length,'inconsistent opening assets');
changed=copy();changed.cases.base.weight=70;var weights=E.run(changed);assert(!weights.errors.length && weights.weightedEquity===null && weights.messages.length,'invalid weights block only weighted valuation');
changed=copy();changed.cases.base.terminalROIC=1;var terminal=E.run(changed);assert(!terminal.errors.length && terminal.cases.base.valuation.error && terminal.cases.base.rows.length===5,'invalid terminal inputs preserve forecasts');
changed=copy();changed.cases.downside.weight=0;changed.cases.base.weight=75;changed.cases.downside.years.forEach(y=>y.grossMargin=5);
assert(E.run(changed).weightedEquity>0,'zero-weight invalid case does not poison weighted result');
changed=copy();changed.asOf='2027-09-15';assert(E.run(changed,'2026-09-15').errors.length,'future model date');
changed=copy();changed.reviewed=false;assert(E.run(changed).errors.length,'review required');
changed=copy();changed.opening.marketCap=v.equity;near(E.reverse(changed,'base').growth,10,'reverse DCF recovers known growth');
changed.opening.marketCap=1e10;assert(E.reverse(changed,'base').error,'unbracketed solution is explicit');
var seed=E.make({cik:123,symbol:'TEST',retrievedAt:'2026-09-15',fields:[]},{start:'2025-01-01',end:'2025-12-31',kind:'annual',values:{revenue:{value:1e9},assets:{value:2e9},cash:{value:0}}},'2026-09-15');
assert(seed.opening.cash===0 && seed.opening.debt===null && seed.opening.shares===null,'seed zero/missing/manual inputs');
assert(seed.cases.base.years[0].grossMargin===null,'unavailable margin requires input');
// Optional valuation inputs never become implicit zeros or block operating forecasts.
changed=copy();['shares','marketCap','excessCash','debtClaims','otherClaims'].forEach(id=>changed.opening[id]=null);
var partial=E.run(changed);assert(!partial.errors.length,'forecast without valuation inputs');
near(partial.cases.base.rows[0].fcff,217.5,'partial forecast unchanged');near(partial.cases.base.valuation.ev,v.ev,'EV independent of bridge');
assert(partial.cases.base.valuation.equity===null && partial.cases.base.valuation.perShare===null && partial.cases.base.valuation.upside===null && partial.weightedEquity===null,'missing bridge remains unavailable');
assert(E.reverse(changed,'base').error,'reverse requires bridge and cap');
changed=copy();changed.opening.shares=null;changed.opening.marketCap=null;
partial=E.run(changed);near(partial.weightedEquity,v.equity,'equity without shares or cap');assert(partial.cases.base.valuation.perShare===null && partial.cases.base.valuation.upside===null,'no invalid division');
changed.opening.marketCap=v.equity;near(E.reverse(changed,'base').growth,10,'reverse independent of shares');
changed=copy();changed.opening.shares=-1;changed.opening.otherClaims=-5;
partial=E.run(changed);assert(!partial.errors.length && partial.cases.base.valuation.equity===null && partial.cases.base.valuation.perShare===null,'invalid optional inputs suppress only affected outputs');
changed=copy();changed.cases.base.wacc=null;assert(!E.run(changed).errors.length && E.run(changed).cases.base.valuation.error,'missing WACC does not become zero');
var period={start:'2025-01-01',end:'2025-12-31',kind:'annual',values:{}};
Object.entries({revenue:1000,cash:100,longDebt:180,currentLongDebt:30,noncurrentDebt:150,shortDebt:20,commercialPaper:10,assets:1000,liabilities:400,equity:590}).forEach(([id,n])=>period.values[id]={value:n*1e6,url:'https://www.sec.gov/Archives/test',filed:'2026-02-01'});
var estimates=E.suggestions(period);
near(estimates.debt.value,200,'do not add current portion or commercial paper twice');near(estimates.debtClaims.value,200,'book proxy');near(estimates.excessCash.value,80,'cash reserve assumption');near(estimates.otherClaims.value,10,'NCI book proxy');
delete period.values.longDebt;delete period.values.shortDebt;
near(E.suggestions(period).debt.value,190,'current plus noncurrent plus commercial paper fallback');
delete period.values.currentLongDebt;assert(!E.suggestions(period).debt,'missing current debt is not assumed zero');
period.values.longDebt={value:180e6};period.values.cash={value:0};
var auto=E.make({cik:123,symbol:'TEST'},period,'2026-09-15');near(auto.opening.debt,190,'new draft debt prefill');near(auto.opening.excessCash,0,'zero cash preserved');
assert(auto.opening.shares===null && auto.opening.marketCap===null,'no historical share count or market cap inferred');
auto.opening.debt=777;auto.opening.debtClaims=null;E.fillMissing(auto,period);
near(auto.opening.debt,777,'prefill preserves user overrides');near(auto.opening.debtClaims,190,'prefill repairs only blank inputs');assert(auto.references.debtClaims.inputs.length===2,'derived debt sources retained');
delete period.values.commercialPaper;assert(!E.suggestions(period).debt,'missing short-term debt is not assumed zero');
var shareData={cik:'123',symbol:'TEST',exchanges:['Nasdaq'],commonShareSnapshots:[{symbol:'TEST',value:100e6,end:'2026-07-17',filed:'2026-07-31',url:'https://www.sec.gov/Archives/test'}]};
changed=copy();changed.opening.shares=null;
assert(E.fillShares(changed,shareData)===1 && changed.shareBasis==='reported-common','reported share basis explicitly selected');
near(changed.opening.shares,100,'shares converted to millions');changed.opening.shares=200;assert(E.fillShares(changed,shareData)===0 && changed.opening.shares===200,'manual shares preserved');
assert(!E.shareSnapshot(shareData,'2026-07-30'),'share disclosure unavailable before filed');assert(!E.shareSnapshot(shareData,'2027-03-01'),'stale share counts skipped');
var quote={symbol:'TEST',exchange:'NASDAQ',currency:'USD',type:'Common Stock',interval:'1day',points:[{t:'2026-09-14',c:20},{t:'2026-09-16',c:999}]};
var estimate=E.marketEstimate(shareData,'2026-09-15',quote);near(estimate.value,2000,'market cap uses reported shares, not diluted override');assert(estimate.priceDate==='2026-09-14','future price excluded');
['symbol','currency','exchange','type','interval'].forEach(function(id){var wrong=Object.assign({},quote);wrong[id]='wrong';assert(E.marketEstimate(shareData,'2026-09-15',wrong).error,'reject mismatched '+id);});
assert(E.marketEstimate(shareData,'2026-09-25',quote).error,'stale price rejected');
assert(E.marketEstimate(shareData,'2026-09-15',Object.assign({},quote,{points:[{t:'2026-09-14',c:0}]})).error,'zero price rejected');
changed.marketCapBasis='price-times-shares';var basisImport=E.importModel(changed,'123');assert(basisImport.shareBasis==='reported-common' && basisImport.marketCapBasis==='price-times-shares' && !basisImport.references.shares,'estimate labels survive import without trusting provenance');
assert(E.run(changed).cases.base.valuation.messages.some(s=>s.includes('excludes potential dilution')),'valuation discloses share basis');
changed.asOf='2026-07-30';assert(E.run(changed).cases.base.valuation.perShare===null,'backdating does not retain a future share disclosure');
changed=copy();changed.marketCapBasis='price-times-shares';changed.references={marketCap:{priceDate:'2026-09-16'}};assert(E.run(changed).cases.base.valuation.upside===null && E.reverse(changed,'base').error,'future price suppressed after date edit');
var imported=E.importModel(m,'123');assert(!imported.reviewed && Object.keys(imported.references).length===0,'import requires review and does not trust sources');
try{E.importModel(m,'124');throw new Error('wrong issuer accepted');}catch(e){assert(e.message!=='wrong issuer accepted','issuer check');}
changed=copy();changed.horizon=1e9;
try{E.importModel(changed,'123');throw new Error('huge horizon accepted');}catch(e){assert(e.message!=='huge horizon accepted','bounded import horizon');}
changed=copy();changed.period.end='2024-02-31';
try{E.importModel(changed,'123');throw new Error('invalid date accepted');}catch(e){assert(e.message!=='invalid date accepted','import date validation');}
assert(!E.supported({sic:6020}) && E.supported({sic:3571}),'sector restriction');
// Randomized accounting identity, independently checking the cash bridge.
var seedNum=42;function random(){seedNum=(seedNum*1664525+1013904223)>>>0;return seedNum/4294967296;}
for(var trial=0;trial<100;trial++){
 var x=copy();x.horizon=10;
 x.cases.base.years.forEach(y=>{y.growth=-10+random()*30;y.grossMargin=35+random()*25;y.dso=random()*80;y.dio=random()*80;y.dpo=random()*80;y.borrow=random()*30;y.repay=0;y.issuance=random()*5;y.buybacks=random()*20;});
 var p=E.project(x,'base');assert(!p.errors.length,'random projection inputs');
 var cash=100;p.rows.forEach(y=>{near(y.assets,y.liabilities+y.equity,'random balance identity');near(y.cash,cash+y.cfo+y.cfi+y.cff,'random cash bridge');cash=y.cash;});
}
print('PASS: linked statements, independent DCF, terminal reinvestment, SBC, debt, dilution, funding gaps, reverse solver, import and randomized reconciliation');
'''
with tempfile.TemporaryDirectory() as tmp:
    script=pathlib.Path(tmp)/'model.js';script.write_text('var window={};\n'+(ROOT/'forward-model.js').read_text()+'\n'+checks)
    r=subprocess.run(['/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc',str(script)],capture_output=True,text=True)
    assert r.returncode==0,r.stdout+r.stderr
    print(r.stdout.strip())
