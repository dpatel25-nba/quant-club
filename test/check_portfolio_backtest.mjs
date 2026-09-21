import assert from 'node:assert/strict';
import '../portfolio-backtest.js';
const E=globalThis.PortfolioBacktest;
const dates=[];
for(let d=new Date('2024-01-15');d<=new Date('2024-02-14');d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()!==0&&d.getUTCDay()!==6)dates.push(d.toISOString().slice(0,10));
const series=(symbol,fn)=>({symbol,interval:'1day',currency:'USD',type:'ETF',adjustment:'splits',returnBasis:'price',points:dates.map((t,i)=>({t,c:fn(t,i)}))});
const a=series('AAA',t=>t==='2024-02-01'?200:100),b=series('BBB',()=>100),bench=series('SPY',()=>100);
const config={holdings:[{symbol:'AAA',weight:50},{symbol:'BBB',weight:50}],start:dates[0],end:dates.at(-1),capital:1000,rebalance:'hold',costBps:0,benchmark:'SPY'};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b}`);
let r=E.run(config,[a,b],bench);
near(r.stats.ending,1000,'Buy-and-hold ending value');near(r.stats.maxDrawdown,-1/3,'Buy-and-hold drawdown');assert.equal(r.trades.length,0);
r=E.run({...config,rebalance:'monthly'},[a,b],bench);
near(r.stats.ending,1125,'Monthly rebalance hand calculation');assert.equal(r.trades.length,1);assert.equal(r.trades[0].date,'2024-02-01');near(r.trades[0].turnover,500,'Buys plus sells');
near(r.holdings[0].pnl,125,'Trade-aware P&L');near(r.holdings[0].endingWeight,1/3,'Weight drift after rebalance');
r=E.run({...config,rebalance:'monthly',costBps:100},[a,b],bench);
near(r.stats.ending,1000/1.01*(1.5-.01*.5)*.75,'Self-financed trading costs');
near(r.costs,1000-1000/1.01+1000/1.01*.5*.01,'Entry plus rebalance costs');
near(r.benchmarkStats.ending,1000/1.01,'Same entry-cost basis for benchmark');
near(r.holdings.reduce((s,h)=>s+h.pnl,0)-r.costs,r.stats.ending-config.capital,'P&L reconciliation');
near(r.months.reduce((growth,m)=>growth*(1+m.portfolio),1),r.stats.ending/config.capital,'Monthly compounding');
near(r.stats.cagr,(r.stats.ending/1000)**(365.25/30)-1,'Calendar-time CAGR');
for(const frequency of ['hold','monthly','quarterly','annual'])for(const fee of [0,3,100]) {
 const generated=[series('AAA',(_,i)=>100*Math.exp(.01*Math.sin(i)+.002*i)),series('BBB',(_,i)=>40*Math.exp(-.003*i))];
 const test=E.run({...config,rebalance:frequency,costBps:fee},generated,bench);
 near(test.holdings.reduce((s,h)=>s+h.pnl,0)-test.costs,test.stats.ending-1000,'Generated reconciliation');
 test.curve.forEach(p=>near(p.weights.reduce((s,w)=>s+w,0),1,'Weights conserve capital'));
 assert.ok(Number.isFinite(test.stats.volatility));assert.ok(test.costs>=0);
}
// Future mutations cannot affect previously computed values or executions.
const before=E.run({...config,rebalance:'monthly'},[a,b],bench);
const changed=structuredClone(a);changed.points.at(-1).c=400;
const after=E.run({...config,rebalance:'monthly'},[changed,b],bench);
assert.deepEqual(before.curve.slice(0,-1),after.curve.slice(0,-1));assert.deepEqual(before.trades,after.trades);
// Input validation, no silent rescaling/dropping/zero filling.
for(const patch of [{holdings:[{symbol:'AAA',weight:90}]},{holdings:[{symbol:'AAA',weight:50},{symbol:'AAA',weight:50}]},{holdings:[{symbol:'AAA',weight:0},{symbol:'BBB',weight:100}]},{start:'2024-02-30'},{end:'2099-01-01'},{costBps:-1},{capital:0},{start:'1900-01-01'}])assert.throws(()=>E.run({...config,...patch},[a,b],bench));
for(const patch of [{currency:'EUR'},{currency:''},{type:'Cryptocurrency'},{adjustment:'none'},{interval:'1week'}])assert.throws(()=>E.run(config,[{...a,...patch},b],bench));
for(const bad of [null,0,-1,NaN]) {const data=structuredClone(a);data.points[3].c=bad;assert.throws(()=>E.run(config,[data,b],bench));}
let missing=structuredClone(a);missing.points.splice(5,1);assert.throws(()=>E.run(config,[missing,b],bench),/missing prices/);
let duplicate=structuredClone(a);duplicate.points.push(duplicate.points[0]);assert.throws(()=>E.run(config,[duplicate,b],bench),/duplicate/);
let shorter=structuredClone(a);shorter.points.shift();shorter.points.shift();r=E.run(config,[shorter,b],bench);assert.equal(r.start,dates[2]);assert.equal(r.curve[0].value,1000);
r=E.run({...config,holdings:[{symbol:'BBB',weight:100}],benchmark:''},[b]);near(r.stats.totalReturn,0,'Flat single holding');near(r.stats.volatility,0,'Flat volatility');assert.equal(r.benchmarkStats,null);
// Known January-to-April path: quarterly and monthly scheduling use first observed close.
const longDates=[];for(let d=new Date('2024-01-15');d<=new Date('2024-04-04');d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()%6)longDates.push(d.toISOString().slice(0,10));
const long={...b,points:longDates.map(t=>({t,c:100}))};
r=E.run({...config,end:'2024-04-04',holdings:[{symbol:'BBB',weight:100}],benchmark:'',rebalance:'quarterly'},[long]);assert.deepEqual(r.trades.map(t=>t.date),['2024-04-01']);
console.log('PASS: hand-calculated buy/hold/rebalance, cost funding, benchmark parity, weight drift, calendar CAGR, monthly compounding, P&L conservation, future isolation and data rejection');
