(function () {
  'use strict';
  var E=window.PortfolioBacktest, el=function (id) {return document.getElementById('bt-'+id);};
  var config, result=null, generation=0, controller=null, cache=new Map();
  var presets={large:[['AAPL',40],['MSFT',30],['JNJ',20],['XOM',10]],equal:[['AAPL',25],['MSFT',25],['JNJ',25],['XOM',25]],market:[['VTI',100]],global:[['VTI',70],['VXUS',30]]};
  function node(tag,text,cls) {var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  function svg(tag,attrs,text) {var n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.keys(attrs).forEach(function (k) {n.setAttribute(k,attrs[k]);});if(text!=null)n.textContent=text;return n;}
  function pct(v) {return Number.isFinite(v) ? (v*100).toFixed(2)+'%' : '—';}
  function money(v) {return Number.isFinite(v) ? v.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}) : '—';}
  function brief(v) {return '$'+(Math.abs(v)>=1e6 ? (v/1e6).toFixed(1)+'M' : Math.abs(v)>=1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(0));}
  function say(message) {el('status').textContent=message;}
  function invalidate() {
    generation++;if(controller)controller.abort();controller=null;result=null;
    el('results').hidden=true;el('csv').disabled=true;el('run').disabled=false;el('cancel').hidden=true;
    say('Portfolio or settings changed. Run the backtest to update the results.');
  }
  function input() {
    return {holdings:config.getHoldings(),start:el('start').value,end:el('end').value,capital:Number(el('capital').value),
      rebalance:el('rebalance').value,costBps:el('cost').value.trim()==='' ? NaN : Number(el('cost').value),
      benchmark:el('benchmark').value,benchmarkExchange:el('benchmark').dataset.selectedSymbol===el('benchmark').value.trim().toUpperCase() ? el('benchmark').dataset.exchange || '' : ''};
  }
  async function history(h, settings, signal) {
    var key=JSON.stringify([h.symbol,h.exchange,settings.start,settings.end]), saved=cache.get(key);
    if(saved && Date.now()-saved.at<900000)return saved.data;
    var response=await fetch('/api/quote?range=backtest&quote=0&symbol='+encodeURIComponent(h.symbol)+'&exchange='+encodeURIComponent(h.exchange || '')+'&start='+settings.start+'&end='+settings.end,
      {signal:signal,headers:{'x-tools-password':config.getPassword()}});
    var data=await response.json();
    if(!response.ok)throw new Error(h.symbol+': '+(data.error || 'History could not be loaded.'));
    if(cache.size>=36)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),data:data});return data;
  }
  async function run() {
    window.TickerSuggestions && window.TickerSuggestions.close();
    if(!config.getPassword()){say('Sign in to Research Tools first.');return;}
    var settings;
    try {settings=E.validate(input());}catch(e){invalidate();say(e.message);return;}
    invalidate();var request=++generation, active=new AbortController();controller=active;
    el('run').disabled=true;el('cancel').hidden=false;
    try {
      var series=[];
      for(var i=0;i<settings.holdings.length;i++) {
        say('Loading '+settings.holdings[i].symbol+' · holding '+(i+1)+' of '+settings.holdings.length+'…');
        series.push(await history(settings.holdings[i],settings,active.signal));
        if(request!==generation)return;
      }
      var benchmark=null;
      if(settings.benchmark) {
        // Reuse an already loaded listing when the benchmark is also a holding.
        var same=settings.holdings.findIndex(function (h) {return h.symbol===settings.benchmark && (!settings.benchmarkExchange || h.exchange===settings.benchmarkExchange);});
        say('Loading benchmark '+settings.benchmark+'…');
        benchmark=same>=0 ? series[same] : await history({symbol:settings.benchmark,exchange:settings.benchmarkExchange},settings,active.signal);
      }
      if(request!==generation)return;
      result=E.run(settings,series,benchmark);render();say('Backtest complete. Review the shared history window and price-return assumptions below.');
      el('results-title').focus({preventScroll:true});el('results').scrollIntoView({block:'start'});
    }catch(e){if(request===generation)say(e.name==='AbortError' ? 'Backtest canceled.' : e.message+' Successfully loaded history is cached for 15 minutes; retry reuses it.');}
    finally{if(request===generation){controller=null;el('run').disabled=false;el('cancel').hidden=true;}}
  }
  function table(headers,rows) {
    var t=node('table',null,'fd-table'),head=node('thead'),tr=node('tr');
    headers.forEach(function (h) {var th=node('th',h);th.scope='col';tr.appendChild(th);});head.appendChild(tr);t.appendChild(head);
    var body=node('tbody');rows.forEach(function (r) {var tr=node('tr');r.forEach(function (v,i) {var cell=node(i?'td':'th',v);if(!i)cell.scope='row';tr.appendChild(cell);});body.appendChild(tr);});t.appendChild(body);return t;
  }
  function chart(id,drawdown) {
    var target=el(id), rows=result.curve, W=900,H=255,L=72,R=875,T=25,B=209;
    var series=[{rows:rows,color:'var(--accent)',label:'Portfolio'}];
    if(result.benchmark.length)series.push({rows:result.benchmark,color:'var(--bt-benchmark)',label:result.config.benchmark});
    var values=series.flatMap(function (s) {return s.rows.map(function (r) {return drawdown ? r.drawdown : r.value;});});
    var low=Math.min.apply(null,values), high=Math.max.apply(null,values);
    if(drawdown){high=0;if(low===0)low=-.01;}
    if(!drawdown){low=Math.min(low,result.config.capital);high=Math.max(high,result.config.capital);}
    var span=high-low || 1, start=Date.parse(result.start), end=Date.parse(result.end);
    var x=function (date) {return L+(Date.parse(date)-start)/(end-start)*(R-L);}, y=function (v) {return B-(v-low)/span*(B-T);};
    target.replaceChildren();target.setAttribute('viewBox','0 0 '+W+' '+H);
    var description=(drawdown ? 'Drawdown from prior peak' : 'Portfolio value in USD')+' from '+result.start+' to '+result.end+'. Use the date slider for exact daily values.';
    target.setAttribute('aria-label',description);target.appendChild(svg('title',{},description));
    for(var i=0;i<=4;i++) {
      var v=low+span*i/4, yy=y(v);
      target.appendChild(svg('line',{x1:L,x2:R,y1:yy,y2:yy,stroke:'var(--border)','stroke-dasharray':'3 4'}));
      target.appendChild(svg('text',{x:L-12,y:yy+4,'text-anchor':'end',fill:'var(--muted)','font-size':11},drawdown ? pct(v) : brief(v)));
    }
    series.forEach(function (s,k) {
      var path=s.rows.map(function (r,i) {return (i?'L':'M')+x(r.date).toFixed(2)+' '+y(drawdown ? r.drawdown : r.value).toFixed(2);}).join(' ');
      target.appendChild(svg('path',{d:path,stroke:s.color,fill:'none','stroke-width':k?2:2.7,'stroke-dasharray':k?'6 4':'none','stroke-linejoin':'round'}));
    });
    [0,.5,1].forEach(function (fraction) {
      var index=Math.round((rows.length-1)*fraction);
      target.appendChild(svg('text',{x:x(rows[index].date),y:238,'text-anchor':fraction===0?'start':fraction===1?'end':'middle',fill:'var(--muted)','font-size':11},rows[index].date));
    });
    target.appendChild(svg('line',{id:'bt-'+id+'-cursor',x1:L,x2:L,y1:T,y2:B,stroke:'var(--muted)','stroke-dasharray':'2 3'}));
    target.onpointermove=function (event) {
      var box=target.getBoundingClientRect(), fraction=Math.max(0,Math.min(1,((event.clientX-box.left)/box.width*W-L)/(R-L)));
      var wanted=start+fraction*(end-start), lo=0,hi=rows.length-1;
      while(lo<hi){var mid=Math.floor((lo+hi)/2);if(Date.parse(rows[mid].date)<wanted)lo=mid+1;else hi=mid;}
      if(lo && wanted-Date.parse(rows[lo-1].date)<Date.parse(rows[lo].date)-wanted)lo--;
      el('date').value=String(lo);inspect();
    };
  }
  function inspect() {
    if(!result)return;var i=Number(el('date').value), r=result.curve[i],b=result.benchmark[i];
    var text=r.date+' · Portfolio '+money(r.value)+' · drawdown '+pct(r.drawdown)+(b?' · '+result.config.benchmark+' '+money(b.value)+' · drawdown '+pct(b.drawdown):'');
    el('readout').textContent=text;el('date').setAttribute('aria-valuetext',text);
    var x=72+(Date.parse(r.date)-Date.parse(result.start))/(Date.parse(result.end)-Date.parse(result.start))*803;
    ['growth','drawdown'].forEach(function (id) {var line=el(id+'-cursor');line.setAttribute('x1',x);line.setAttribute('x2',x);});
  }
  function renderMonths() {
    var years=Array.from(new Set(result.months.map(function (m) {return m.month.slice(0,4);}))), selected=el('monthly-series').value;
    if(!result.benchmark.length && selected==='benchmark'){selected='portfolio';el('monthly-series').value=selected;}
    el('monthly-series').querySelector('option[value="benchmark"]').disabled=!result.benchmark.length;
    var t=table(['Year','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],years.map(function (year) {
      return [year].concat(Array.from({length:12},function (_,m) {var found=result.months.find(function (r) {return r.month===year+'-'+String(m+1).padStart(2,'0');});return found ? pct(found[selected])+(found.partial?'*':'') : '—';}));
    }));
    t.querySelectorAll('tbody tr').forEach(function (row,i) {
      row.querySelectorAll('td').forEach(function (cell,j) {
        var m=result.months.find(function (r) {return r.month===years[i]+'-'+String(j+1).padStart(2,'0');});
        if(!m)return;var value=m[selected],intensity=Math.min(35,Math.abs(value)*350)+5;
        cell.style.background='color-mix(in srgb,var('+(value<0?'--bad':'--good')+') '+intensity+'%,var(--panel))';
        cell.title=m.month+': '+pct(value)+(m.partial?' · boundary month; may be partial':'');
      });
    });el('months').replaceChildren(t);
  }
  function render() {
    var r=result, s=r.stats, b=r.benchmarkStats;
    el('results').hidden=false;el('csv').disabled=false;
    el('context').textContent='Requested '+r.config.start+' to '+r.config.end+'. Tested '+r.start+' to '+r.end+' · '+r.observations+' shared daily closes. Entry occurs at the first shared close.';
    el('metrics').replaceChildren();
    [['Ending value',money(s.ending),'Started with '+money(r.config.capital)],['Price return',pct(s.totalReturn),b ? r.config.benchmark+': '+pct(b.totalReturn) : 'Net of modeled trading costs'],['Annualized growth',pct(s.cagr),r.years<1 ? 'Less than one year; annualized, not a realized one-year return.' : 'Calendar-time CAGR'],['Annualized volatility',pct(s.volatility),'Daily return sample · 252 sessions/year'],['Maximum drawdown',pct(s.maxDrawdown),b ? r.config.benchmark+': '+pct(b.maxDrawdown) : 'Largest decline from a prior peak'],['Trading costs',money(r.costs),r.trades.length+' scheduled rebalances · '+r.config.costBps+' bps per dollar traded']].forEach(function (m) {
      var card=node('div',null,'fd-metric');card.append(node('div',m[0],'fd-label'),node('div',m[1],'fd-number'),node('p',m[2],'fd-caption'));el('metrics').appendChild(card);
    });
    el('benchmark-legend').textContent=r.config.benchmark || 'No benchmark';el('benchmark-legend').hidden=!b;
    el('comparison').textContent=b ? 'Portfolio minus benchmark price return: '+((s.totalReturn-b.totalReturn)*100).toFixed(2)+' percentage points. '+r.config.benchmark+' is bought and held over the same dates, with the same entry-cost rate.' : 'No benchmark selected.';
    chart('growth',false);chart('drawdown',true);el('date').max=String(r.curve.length-1);el('date').value=el('date').max;inspect();renderMonths();
    el('holdings').replaceChildren(table(['Holding','Starting weight','Ending weight','Price return','Gross trading P&L'],r.holdings.map(function (h) {return [h.symbol+(h.exchange?' · '+h.exchange:''),pct(h.initialWeight),pct(h.endingWeight),pct(h.priceReturn),money(h.pnl)];})));
    el('pnl-note').textContent='Gross holding P&L '+money(r.holdings.reduce(function (a,h) {return a+h.pnl;},0))+' − trading costs '+money(r.costs)+' = net change '+money(s.ending-r.config.capital)+'. Contributions include the actual simulated rebalancing trades; costs are shown separately.';
    el('coverage').replaceChildren(table(['Instrument','First returned close','Last returned close','Observations'],r.coverage.map(function (c) {return [c.symbol,c.first,c.last,String(c.observations)];})));
    el('rebalance-log').replaceChildren(r.trades.length ? table(['Rebalance close','Dollars bought + sold','Cost'],r.trades.map(function (t) {return [t.date,money(t.turnover),money(t.cost)];})) : node('p','No scheduled rebalances in the tested window.','fd-muted'));
  }
  function download() {
    if(!result)return;var r=result;
    var rows=[['Portfolio backtest','Price returns; dividends excluded'],['Requested dates',r.config.start,r.config.end],['Actual dates',r.start,r.end],['Starting capital USD',r.config.capital],['Rebalance',r.config.rebalance],['Cost bps per dollar bought/sold',r.config.costBps],['Benchmark',r.config.benchmark],['Total portfolio costs',r.costs],['Benchmark entry cost',r.benchmarkCosts],['Assumptions','Fractional holdings; no deposits, withdrawals, taxes or final liquidation; shared daily closes; first close of each new calendar period for rebalancing.'],['Limitations','Current chosen holdings may introduce survivorship and hindsight bias; provider history may be incomplete; no dividend or coupon income.'],[],['Holding','Exchange','Starting weight percent','Ending weight percent','Gross trading P&L']];
    r.holdings.forEach(function (h) {rows.push([h.symbol,h.exchange,h.initialWeight*100,h.endingWeight*100,h.pnl]);});
    rows.push([],['Date','Portfolio USD','Benchmark USD','Portfolio drawdown','Benchmark drawdown','Trading cost USD','Rebalance turnover USD']);
    r.curve.forEach(function (p,i) {var b=r.benchmark[i];rows.push([p.date,p.value,b?b.value:'',p.drawdown,b?b.drawdown:'',p.cost,p.turnover]);});
    var text=rows.map(function (row) {return row.map(function (v) {var s=v==null?'':String(v);if(typeof v==='string' && /^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    var url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'})),a=node('a');a.href=url;a.download='portfolio-backtest-'+r.start+'-'+r.end+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function () {URL.revokeObjectURL(url);},1000);
  }
  window.PortfolioWorkspace={invalidate:invalidate,attach:function (c) {
    config=c;var yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);el('start').value=yesterday.slice(0,4)-5+'-01-01';el('end').value=yesterday;el('start').max=yesterday;el('end').max=yesterday;
    el('run').addEventListener('click',run);el('cancel').addEventListener('click',function () {invalidate();say('Backtest canceled.');});el('csv').addEventListener('click',download);
    el('date').addEventListener('input',inspect);el('monthly-series').addEventListener('change',function () {if(result)renderMonths();});
    el('settings').addEventListener('input',invalidate);el('settings').addEventListener('change',invalidate);
    document.getElementById('rows').addEventListener('input',invalidate);
    el('load-example').addEventListener('click',function () {invalidate();config.setHoldings(presets[el('example').value]);say('Example loaded. Review the holdings and weights before running.');});
    if(window.TickerSuggestions)window.TickerSuggestions.attach({prefix:'bt-benchmark',getPassword:c.getPassword,
      onEdit:function () {delete el('benchmark').dataset.selectedSymbol;delete el('benchmark').dataset.exchange;invalidate();},
      onSelect:function (item) {el('benchmark').dataset.selectedSymbol=item.symbol;el('benchmark').dataset.exchange=item.exchange || '';invalidate();}});
  }};
})();
