(function (root) {
  'use strict';
  var DAY=86400000, SYMBOL=/^[A-Z0-9.:-]{1,16}$/;
  function dateOK(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s; }
  function fail(message) { throw new Error(message); }
  function validate(input, today) {
    if (!input || !Array.isArray(input.holdings) || input.holdings.length<1 || input.holdings.length>12) fail('Choose between 1 and 12 holdings.');
    var seen=new Set(), total=0;
    var holdings=input.holdings.map(function (h) {
      var symbol=String(h.symbol || '').trim().toUpperCase(), exchange=String(h.exchange || '').trim();
      if (!SYMBOL.test(symbol)) fail('Enter a valid stock or ETF ticker in every holding row.');
      if (exchange && !/^[A-Za-z0-9 ._&()\-]{1,48}$/.test(exchange)) fail('Choose a valid exchange.');
      if (seen.has(symbol)) fail('Combine duplicate '+symbol+' holdings into one row.');seen.add(symbol);
      if (!Number.isFinite(h.weight) || h.weight<=0 || h.weight>100) fail('Every holding needs a weight above 0% and at most 100%. Remove unused rows.');
      total+=h.weight;return {symbol:symbol,exchange:exchange,weight:h.weight};
    });
    if (Math.abs(total-100)>1e-6) fail('Backtest weights must total 100%. Current total: '+total.toFixed(2)+'%.');
    // Normalize only floating-point rounding within the accepted tolerance.
    holdings.forEach(function (h) {h.weight=h.weight/total*100;});
    if (!dateOK(input.start) || !dateOK(input.end) || input.start>=input.end) fail('Choose valid start and end dates, with the start before the end.');
    if (input.start<'1900-01-01' || input.end>=(today || new Date().toISOString().slice(0,10))) fail('Use historical dates ending before today.');
    if ((Date.parse(input.end)-Date.parse(input.start))/DAY>4383) fail('Choose a window of 12 years or less.');
    if (!Number.isFinite(input.capital) || input.capital<1 || input.capital>1e9) fail('Starting capital must be between $1 and $1 billion.');
    if (!['hold','monthly','quarterly','annual'].includes(input.rebalance)) fail('Choose a supported rebalancing schedule.');
    if (!Number.isFinite(input.costBps) || input.costBps<0 || input.costBps>100) fail('Trading costs must be between 0 and 100 basis points per dollar traded.');
    var benchmark=String(input.benchmark || '').trim().toUpperCase();
    if (benchmark && !SYMBOL.test(benchmark)) fail('Enter a valid benchmark ticker or leave it blank.');
    var benchmarkExchange=String(input.benchmarkExchange || '').trim();
    if (benchmarkExchange && !/^[A-Za-z0-9 ._&()\-]{1,48}$/.test(benchmarkExchange)) fail('Choose a valid benchmark exchange.');
    return {holdings:holdings,start:input.start,end:input.end,capital:input.capital,rebalance:input.rebalance,costBps:input.costBps,benchmark:benchmark,benchmarkExchange:benchmarkExchange};
  }
  function prices(data, config, symbol) {
    if (!data || data.symbol!==symbol || data.interval!=='1day' || data.currency!=='USD' || !['Common Stock','ETF','REIT','Depositary Receipt','Preferred Stock'].includes(data.type)) fail(symbol+': use a supported USD stock or ETF with daily history.');
    if (data.adjustment!=='splits' || data.returnBasis!=='price') fail(symbol+': the price adjustment basis could not be confirmed.');
    if (!Array.isArray(data.points) || data.points.length>=5000) fail(symbol+': incomplete or truncated history. Choose a shorter window.');
    var map=new Map();
    data.points.forEach(function (p) {
      if (!dateOK(p.t) || !Number.isFinite(p.c) || p.c<=0) fail(symbol+': history contains an invalid date or nonpositive price.');
      if (p.t<config.start || p.t>config.end) return;
      if (map.has(p.t)) fail(symbol+': duplicate historical date.');map.set(p.t,p.c);
    });
    return map;
  }
  function bucket(date, frequency) {
    return frequency==='annual' ? date.slice(0,4) : frequency==='quarterly' ? date.slice(0,4)+'-'+Math.floor((Number(date.slice(5,7))-1)/3) : date.slice(0,7);
  }
  function rebalance(values, weights, fee) {
    var before=values.reduce(function (a,b) {return a+b;},0), low=0, high=before;
    // Solve V_after + fee * sum(abs(target_i * V_after - holding_i)) = V_before.
    for (var i=0;i<60;i++) {
      var mid=(low+high)/2, traded=values.reduce(function (sum,v,k) {return sum+Math.abs(mid*weights[k]-v);},0);
      if (mid+fee*traded>before) high=mid;else low=mid;
    }
    var after=fee ? (low+high)/2 : before;
    return {values:weights.map(function (w) {return after*w;}),cost:before-after,turnover:values.reduce(function (sum,v,k) {return sum+Math.abs(after*weights[k]-v);},0)};
  }
  function stats(curve, capital, years) {
    var returns=curve.slice(1).map(function (r,i) {return r.value/(i===0 ? capital : curve[i].value)-1;});
    var avg=returns.reduce(function (a,b) {return a+b;},0)/returns.length;
    var variance=returns.reduce(function (sum,r) {return sum+Math.pow(r-avg,2);},0)/(returns.length-1);
    return {ending:curve[curve.length-1].value,totalReturn:curve[curve.length-1].value/capital-1,
      cagr:Math.pow(curve[curve.length-1].value/capital,1/years)-1,
      volatility:Math.sqrt(Math.max(0,variance)*252),maxDrawdown:Math.min.apply(null,curve.map(function (r) {return r.drawdown;}))};
  }
  function run(input, series, benchmarkData, today) {
    var config=validate(input,today);
    if (!Array.isArray(series) || series.length!==config.holdings.length) fail('Load history for every holding before running the backtest.');
    var maps=series.map(function (s,i) {return prices(s,config,config.holdings[i].symbol);});
    if (config.benchmark) maps.push(prices(benchmarkData,config,config.benchmark));
    var dates=Array.from(maps[0].keys()).filter(function (d) {return maps.every(function (m) {return m.has(d);});}).sort();
    if (dates.length<21) fail('At least 21 common daily observations are needed. Extend the window or remove a holding with limited history.');
    var start=dates[0], end=dates[dates.length-1], union=new Set();
    maps.forEach(function (m) {m.forEach(function (_,d) {if(d>=start && d<=end)union.add(d);});});
    if (union.size!==dates.length) fail('The instruments have mismatched trading dates or missing prices within the shared window. Choose instruments on a common trading calendar or narrow the dates. No missing prices were filled.');
    for (var j=1;j<dates.length;j++) if ((Date.parse(dates[j])-Date.parse(dates[j-1]))/DAY>7) fail('A gap longer than seven days appears in every series. Check the history or shorten the window.');
    var weights=config.holdings.map(function (h) {return h.weight/100;}), fee=config.costBps/10000;
    var invested=config.capital/(1+fee), entryCost=config.capital-invested, costs=entryCost;
    var units=weights.map(function (w,i) {return invested*w/maps[i].get(start);}), contributions=weights.map(function () {return 0;});
    var curve=[], benchmark=[], trades=[], peak=config.capital, benchPeak=config.capital, previousPrices;
    var benchmarkUnits=config.benchmark ? invested/maps[maps.length-1].get(start) : 0;
    dates.forEach(function (date,t) {
      var currentPrices=maps.slice(0,weights.length).map(function (m) {return m.get(date);});
      if(t) units.forEach(function (u,i) {contributions[i]+=u*(currentPrices[i]-previousPrices[i]);});
      var values=units.map(function (u,i) {return u*currentPrices[i];}), traded=0, cost=t ? 0 : entryCost;
      if(t && config.rebalance!=='hold' && bucket(date,config.rebalance)!==bucket(dates[t-1],config.rebalance)) {
        var next=rebalance(values,weights,fee);values=next.values;cost=next.cost;traded=next.turnover;costs+=cost;
        units=values.map(function (v,i) {return v/currentPrices[i];});
        trades.push({date:date,turnover:traded,cost:cost});
      }
      var value=values.reduce(function (a,b) {return a+b;},0);
      if(!Number.isFinite(value) || value<=0)fail('The supplied prices produced an invalid portfolio value. Check the historical data.');
      peak=Math.max(peak,value);
      curve.push({date:date,value:value,drawdown:value/peak-1,cost:cost,turnover:traded,weights:values.map(function (v) {return v/value;})});
      if(config.benchmark) {var bv=benchmarkUnits*maps[maps.length-1].get(date);benchPeak=Math.max(benchPeak,bv);benchmark.push({date:date,value:bv,drawdown:bv/benchPeak-1});}
      previousPrices=currentPrices;
    });
    var years=(Date.parse(end)-Date.parse(start))/DAY/365.25, months=[], monthStart=config.capital, benchStart=config.capital;
    curve.forEach(function (r,i) {
      if (i<curve.length-1 && r.date.slice(0,7)===curve[i+1].date.slice(0,7)) return;
      months.push({month:r.date.slice(0,7),portfolio:r.value/monthStart-1,benchmark:config.benchmark ? benchmark[i].value/benchStart-1 : null,partial:!months.length || i===curve.length-1});
      monthStart=r.value;if(config.benchmark)benchStart=benchmark[i].value;
    });
    var final=curve[curve.length-1];
    return {config:config,start:start,end:end,observations:dates.length,years:years,curve:curve,benchmark:benchmark,
      stats:stats(curve,config.capital,years),benchmarkStats:config.benchmark ? stats(benchmark,config.capital,years) : null,
      costs:costs,entryCost:entryCost,benchmarkCosts:config.benchmark ? entryCost : null,trades:trades,months:months,
      holdings:config.holdings.map(function (h,i) {return {symbol:h.symbol,exchange:h.exchange,initialWeight:weights[i],endingWeight:final.weights[i],pnl:contributions[i],priceReturn:maps[i].get(end)/maps[i].get(start)-1};}),
      coverage:maps.map(function (m,i) {var ds=Array.from(m.keys()).sort();return {symbol:i<config.holdings.length ? config.holdings[i].symbol : config.benchmark,first:ds[0],last:ds[ds.length-1],observations:ds.length};})};
  }
  root.PortfolioBacktest={validate:validate,run:run};
})(typeof window==='undefined' ? globalThis : window);
