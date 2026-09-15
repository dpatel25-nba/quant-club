(function () {
  "use strict";
  var el = function (id) { return document.getElementById("fd-" + id); };
  var config, current, controller, generation = 0, requested = "", section = "overview", statement = "income", filingLimit = 20;
  var cache = new Map();
  var analysis = window.FundamentalAnalysis, basis="annual", peers=[], peerController, peerGeneration=0;
  var marketCaps=new Map();
  function periods() { return analysis.periods(current,basis); }
  function basisName() { return {annual:"Annual",quarterly:"Quarterly",ttm:"Trailing 12-month"}[basis]; }
  function today() { var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function node(tag, text, cls) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function link(text, url) {
    var a = node("a", text);
    // Only SEC sources are links. Never render provider text as HTML.
    if (/^https:\/\/www\.sec\.gov\//.test(url || "")) a.href = url;
    a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
  }
  function field(id) { return current.fields.find(function (f) { return f.id === id; }); }
  function format(value, unit, scale) {
    if (value == null || !Number.isFinite(value)) return "—";
    if (unit === "ratio") return (value * 100).toFixed(1) + "%";
    if (unit === "multiple") return value.toFixed(2) + "×";
    if (unit === "USD/shares") return value.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    return (value / (scale || 1)).toLocaleString(undefined, {maximumFractionDigits:scale>1 ? 1 : 2});
  }
  function compact(value, unit) {
    if (value == null) return "—";
    if (unit === "ratio" || unit === "multiple") return format(value, unit);
    var scale = Math.abs(value)>=1e9 ? 1e9 : Math.abs(value)>=1e6 ? 1e6 : 1;
    return (unit === "USD" ? "$" : "") + format(value, unit, scale) + (scale===1e9 ? "B" : scale===1e6 ? "M" : "");
  }
  function status(message, error) { el("status").textContent = message; el("status").className = "fd-status" + (error ? " err" : ""); }
  function source(id, p) {
    var f = field(id), fact = p.values[id], box = el("source");
    box.replaceChildren();
    box.appendChild(node("h3", f.label + " · period ended " + p.end));
    box.appendChild(node("p", format(fact.value, fact.unit, 1) + " " + (fact.unit === "ratio" ? "" : fact.unit === "multiple" ? "" : fact.unit)));
    if (!fact.derived) {
      box.appendChild(node("p", fact.tag + " · " + (fact.start ? fact.start + " to " : "As of ") + fact.end));
      box.appendChild(node("p", fact.form + " filed " + fact.filed + " · accession " + fact.accession));
      box.appendChild(link("Open source filing ↗", fact.url));
    } else {
      box.appendChild(node("p", "Calculated: " + fact.formula));
      var ul = node("ul");
      function inputs(rows) {
        rows.forEach(function (r) {
          var label = field(r.id);
          var li = node("li", (label ? label.label : r.id) + " · " + r.period + ": " + format(r.value, r.unit || (label ? label.unit : "USD"), 1) + (r.filed ? " · filed " + r.filed : "") + " ");
          if (r.url) li.appendChild(link("Source filing ↗", r.url));
          ul.appendChild(li);
          if (r.sources) inputs(r.sources);
        });
      }
      inputs(fact.inputs || []); box.appendChild(ul);
    }
    box.hidden = false; box.focus(); box.scrollIntoView({block:"nearest", behavior:"smooth"});
  }
  function table(group, target) {
    var t = node("table", null, "fd-table"), head = node("thead"), row = node("tr");
    var title = node("th", group === "ratios" ? basisName()+" ratio" : "Period ended"); title.scope = "col"; row.appendChild(title);
    periods().forEach(function (p) {
      var th = node("th", p.end); th.scope = "col";
      if (group !== "balance") th.appendChild(node("small", "From " + p.start));
      row.appendChild(th);
    });
    head.appendChild(row); t.appendChild(head);
    var body = node("tbody");
    current.fields.filter(function (f) { return f.section === group; }).forEach(function (f) {
      var tr = node("tr"), label = node("th"); label.scope = "row";
      var chartButton=node("button",f.label,"fd-row-chart"); chartButton.type="button"; chartButton.title="Chart "+f.label;
      chartButton.addEventListener("click",function () { el("trend-metric").value=f.id; chart(); view("overview"); el("trend-box").scrollIntoView({block:"center"}); });
      label.appendChild(chartButton);
      if (f.formula) label.appendChild(node("small", f.formula));
      tr.appendChild(label);
      periods().forEach(function (p) {
        var td = node("td"), v = p.values[f.id];
        if (v) {
          var button = node("button", format(v.value, f.unit, Number(el("units").value)), "fd-value");
          button.type = "button"; button.setAttribute("aria-label", f.label + ", " + p.end + ": " + button.textContent + ". View " + (v.derived ? "calculation" : "source"));
          button.addEventListener("click", function () { source(f.id,p); }); td.appendChild(button);
        } else { td.textContent = "—"; td.title = "Unavailable or not meaningful"; }
        tr.appendChild(td);
      }); body.appendChild(tr);
    });
    t.appendChild(body); el(target).replaceChildren(t);
  }
  function svgNode(tag, attrs, text) {
    var n = document.createElementNS("http://www.w3.org/2000/svg",tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k,attrs[k]); });
    if (text != null) n.textContent = text; return n;
  }
  function chart() {
    var svg = el("chart"), id = el("trend-metric").value, f = field(id);
    var plotted = periods().slice().reverse();
    var nums = plotted.map(function (p) { return p.values[id] ? p.values[id].value : null; });
    var max = Math.max.apply(null, [0].concat(nums.filter(function (v) { return v != null; }))), min = Math.min.apply(null,[0].concat(nums.filter(function (v) { return v != null; })));
    var span = max-min || 1, y = function (v) { return 42+(max-v)/span*132; }, zero = y(0);
    svg.replaceChildren(); svg.setAttribute("viewBox","0 0 680 222");
    var description = basisName()+" "+f.label + ": " + plotted.map(function (p,i) { return p.end+" "+compact(nums[i],f.unit); }).join("; ");
    svg.setAttribute("aria-label",description); svg.appendChild(svgNode("title",{},description));
    svg.appendChild(svgNode("line",{x1:15,x2:665,y1:zero,y2:zero,stroke:"var(--border)"}));
    plotted.forEach(function (p,i) {
      var width = 640/plotted.length, x = 20+i*width, v = nums[i];
      var textY = v == null ? 100 : v>=0 ? y(v)-12 : y(v)+18;
      if (v != null) {
        var rect = svgNode("rect",{x:x+width*.22,y:Math.min(y(v),zero),width:width*.56,height:Math.max(1,Math.abs(y(v)-zero)),rx:3,fill:v<0?"var(--bad)":"var(--accent)",opacity:.85});
        rect.appendChild(svgNode("title",{},p.end+": "+compact(v,f.unit))); svg.appendChild(rect);
      }
      svg.appendChild(svgNode("text",{x:x+width/2,y:textY,"text-anchor":"middle",fill:"var(--text)","font-size":12},compact(v,f.unit)));
      svg.appendChild(svgNode("text",{x:x+width/2,y:211,"text-anchor":"middle",fill:"var(--muted)","font-size":11},p.end));
    });
  }
  function overview() {
    var latest = periods()[0];
    el("period-label").textContent = latest ? basisName()+" financials · " + latest.start + " to " + latest.end + " · USD. Growth compares the matching prior-year period." : "No supported "+basisName().toLowerCase()+" periods are available for this company.";
    el("chart-title").textContent=basisName()+" performance";
    el("metrics").replaceChildren(); el("trend-box").hidden = !latest;
    if (latest) {
      ["revenue","revenueGrowth","netIncome","netMargin","fcf","cash"].forEach(function (id) {
        var f = field(id), v = latest.values[id], card = node("div",null,"fd-metric");
        card.appendChild(node("div",f.label,"fd-label"));
        card.appendChild(node("div",compact(v ? v.value : null,f.unit),"fd-number mono"));
        card.appendChild(node("div",v ? v.derived ? "Calculated · inspect source in statements" : "Reported · filed " + v.filed : "Not available in standard tags","fd-caption"));
        el("metrics").appendChild(card);
      }); chart();
    }
    changes(latest);
    var links = el("research-links"); links.replaceChildren();
    [[/^10-K(?:\/A)?$/, "Latest annual report"], [/^10-Q(?:\/A)?$/, "Latest quarterly report"], [/^DEF 14A$/, "Latest proxy statement"]].forEach(function (pair) {
      var filing = current.filings.find(function (r) { return pair[0].test(r.form); });
      if (filing) links.appendChild(link(pair[1] + " ↗",filing.url));
    });
    links.appendChild(link("Full SEC filing history ↗",current.secURL));
  }
  function changes(latest) {
    var list=el("change-list"); list.replaceChildren();
    if (latest) {
      ["revenueGrowth","earningsGrowth"].forEach(function (id) {
        var v=latest.values[id]; if (!v) return;
        var text=(id==="revenueGrowth" ? "Revenue" : "Net income")+" "+(v.value<0?"decreased ":"increased ")+format(Math.abs(v.value),"ratio")+" from the matching prior-year period.";
        var item=node("li",text+" "), button=node("button","View calculation","fd-value"); button.type="button";
        button.addEventListener("click",function () { source(id,latest); }); item.appendChild(button); list.appendChild(item);
      });
      var income=latest.values.netIncome, cash=latest.values.ocf;
      if (income && cash) list.appendChild(node("li","Operating cash flow was "+compact(cash.value,"USD")+", compared with "+compact(income.value,"USD")+" in net income for this period."));
      var allocation=["capex","dividends","buybacks"].filter(function (id) { return latest.values[id]; });
      if (allocation.length) list.appendChild(node("li","Reported cash outflows: "+allocation.map(function (id) { return {capex:"capital expenditures",dividends:"common dividends",buybacks:"common share repurchases"}[id]+" "+compact(latest.values[id].value,"USD"); }).join("; ")+"."));
    }
    el("changes").hidden=!list.children.length;
  }
  function fetchCompany(symbol,signal) {
    var saved=cache.get(symbol);
    if (saved && Date.now()-saved.at<900000) return Promise.resolve(saved.data);
    return fetch("/api/fundamentals?symbol="+encodeURIComponent(symbol),{signal:signal,headers:{"x-tools-password":config.getPassword()}})
      .then(function (r) { return r.json().then(function (data) { if (!r.ok) throw new Error(data.error || "Could not load financials."); return data; }); })
      .then(function (data) {
        if (!Array.isArray(data.periods) || !Array.isArray(data.fields) || !Array.isArray(data.filings)) throw new Error("The financial data response was incomplete. Please try again.");
        if (cache.size>=12) cache.delete(cache.keys().next().value);
        cache.set(symbol,{data:data,at:Date.now()}); return data;
      });
  }
  function valuationPeriod(data) { return (data.ttm || [])[0] || data.periods[0]; }
  function valuationFor(data) {
    var input=marketCaps.get(data.cik);
    return input ? analysis.valuation(valuationPeriod(data),input.value,input.date,today()) : {error:"Enter a market capitalization and date."};
  }
  function valuation() {
    var saved=marketCaps.get(current.cik), result=valuationFor(current), p=valuationPeriod(current);
    el("valuation-metrics").replaceChildren();
    el("valuation-status").textContent=result.error || "Member-entered market cap: "+compact(saved.value,"USD")+" as of "+saved.date+". Financial period: "+p.start+" to "+p.end+".";
    if (result.error) return;
    result.metrics.forEach(function (m) {
      var card=node("div",null,"fd-metric"); card.appendChild(node("div",m.label,"fd-label"));
      card.appendChild(node("div",format(m.value,m.unit),"fd-number mono")); card.appendChild(node("div",m.formula,"fd-caption"));
      if (p.values[m.input]) {
        var button=node("button","Financial input & source","fd-value"); button.type="button";
        button.addEventListener("click",function () { source(m.input,p); }); card.appendChild(button);
      }
      el("valuation-metrics").appendChild(card);
    });
  }
  function renderPeers() {
    if (!peers.length) { el("peer-table").replaceChildren(); return; }
    var t=node("table",null,"fd-table"), head=node("thead"), row=node("tr"), th=node("th","Metric"); th.scope="col"; row.appendChild(th);
    peers.forEach(function (entry) {
      var cell=node("th",entry.data ? entry.data.symbol : entry.symbol); cell.scope="col";
      if (entry.data) {
        var period=analysis.periods(entry.data,basis)[0];
        cell.appendChild(node("small",entry.data.name));
        cell.appendChild(node("small",period ? period.start+" to "+period.end : "No "+basisName().toLowerCase()+" period"));
        cell.appendChild(node("small",entry.data.industry || "Industry unavailable"));
      } else cell.appendChild(node("small",entry.error));
      row.appendChild(cell);
    }); head.appendChild(row); t.appendChild(head);
    var body=node("tbody");
    ["revenue","revenueGrowth","netMargin","operatingMargin","fcf","fcfMargin","currentRatio","liabilitiesEquity","cashConversion","sbcRevenue"].forEach(function (id) {
      var f=field(id), tr=node("tr"), label=node("th",f.label); label.scope="row"; tr.appendChild(label);
      peers.forEach(function (entry) {
        var p=entry.data && analysis.periods(entry.data,basis)[0], v=p && p.values[id], td=node("td",compact(v ? v.value : null,f.unit));
        if (v) { var date=analysis.filedDate(v); td.title=f.formula || f.label; if (date) td.appendChild(node("small","Financial input filed "+date)); }
        tr.appendChild(td);
      }); body.appendChild(tr);
    });
    ["cap","date"].forEach(function (kind) {
      var tr=node("tr"), label=node("th",kind==="cap" ? "Market cap (USD bn, entered)" : "Market-cap date"); label.scope="row"; tr.appendChild(label);
      peers.forEach(function (entry) {
        var td=node("td");
        if (entry.data) {
          var saved=marketCaps.get(entry.data.cik), input=node("input",null,"fd-peer-input");
          input.type=kind==="cap"?"number":"date"; input.setAttribute("aria-label",entry.data.symbol+" "+(kind==="cap"?"market capitalization in USD billions":"market-cap date"));
          if (kind==="cap") { input.min="0.000001"; input.step="any"; input.placeholder="Enter value"; input.value=saved?saved.value/1e9:""; }
          else { input.max=today(); input.value=saved?saved.date:today(); }
          input.addEventListener("change",function () {
            var old=marketCaps.get(entry.data.cik) || {value:NaN,date:today()};
            marketCaps.set(entry.data.cik,{value:kind==="cap"?Number(input.value)*1e9:old.value,date:kind==="date"?input.value:old.date});
            renderPeers();
          }); td.appendChild(input);
        } else td.textContent="—";
        tr.appendChild(td);
      }); body.appendChild(tr);
    });
    ["earningsMultiple","salesMultiple","fcfYield","bookMultiple"].forEach(function (id,index) {
      var tr=node("tr"), label=node("th",["Market cap / net income","Price / sales","Free cash flow yield","Price / book"][index]); label.scope="row";
      if (!index) label.appendChild(node("small","Valuation always uses each company’s latest TTM or annual financials, independently of the reporting selector."));
      tr.appendChild(label);
      peers.forEach(function (entry) {
        var result=entry.data ? valuationFor(entry.data) : {}, m=result.metrics && result.metrics.find(function (m) { return m.id===id; });
        var td=node("td",m?format(m.value,m.unit):"—");
        if (!index && entry.data) td.appendChild(node("small",result.error || "Financials ended "+result.end+"; market cap "+result.date));
        tr.appendChild(td);
      }); body.appendChild(tr);
    });
    t.appendChild(body); el("peer-table").replaceChildren(t);
    if (section==="report") workspace.view("report");
  }
  async function comparePeers() {
    if (window.TickerSuggestions) window.TickerSuggestions.close();
    var requestedSymbols=el("peer-symbols").value.toUpperCase().split(/[\s,;]+/).filter(Boolean);
    if (!requestedSymbols.length || requestedSymbols.length>4 || requestedSymbols.some(function (s) { return !/^[A-Z0-9.\-]{1,16}$/.test(s); })) {
      el("peer-status").textContent="Enter one to four company tickers, separated by commas."; return;
    }
    if (peerController) peerController.abort(); peerController=new AbortController(); var signal=peerController.signal, token=++peerGeneration;
    var symbols=Array.from(new Set([current.symbol].concat(requestedSymbols)));
    peers=[{data:current}]; renderPeers(); el("peer-go").disabled=true;
    var seen=new Set([current.cik]), duplicates=0;
    for (var i=1;i<symbols.length;i++) {
      if (token!==peerGeneration) return;
      el("peer-status").textContent="Loading "+symbols[i]+"…";
      try {
        var data=await fetchCompany(symbols[i],signal);
        if (token!==peerGeneration) return;
        if (seen.has(data.cik)) duplicates++;
        else { seen.add(data.cik); peers.push({data:data}); }
      } catch (e) {
        if (token!==peerGeneration || e.name==="AbortError") return;
        peers.push({symbol:symbols[i],error:e.message});
      }
      renderPeers();
    }
    if (token!==peerGeneration) return;
    el("peer-go").disabled=false;
    if (section==="report") workspace.view("report");
    el("peer-status").textContent="Comparison loaded. Check fiscal dates and industry differences before comparing ratios."+(duplicates ? " Duplicate SEC issuers were removed." : "");
  }
  function filings() {
    var kind = el("filing-type").value;
    var filters = {reports:/^(10-K|10-Q|20-F|40-F)(\/A)?$/,events:/^(8-K|6-K)(\/A)?$/,governance:/^(DEF 14A|DEFA14A)$/,ownership:/^(3|4|5|SC 13D|SC 13G)(\/A)?$/,all:/.*/};
    var rows = current.filings.filter(function (r) { return filters[kind].test(r.form); });
    el("filing-list").replaceChildren();
    var names = {"10-K":"Annual report","10-Q":"Quarterly report","8-K":"Current report","DEF 14A":"Proxy statement","DEFA14A":"Additional proxy materials","4":"Insider transaction disclosure","3":"Initial insider ownership","5":"Annual insider ownership","SC 13D":"Beneficial ownership disclosure","SC 13G":"Beneficial ownership disclosure","20-F":"Foreign issuer annual report","40-F":"Canadian issuer annual report","6-K":"Foreign issuer report"};
    rows.slice(0,filingLimit).forEach(function (f) {
      var row = node("article",null,"fd-filing"), form = node("div");
      form.appendChild(node("span",f.form,"fd-form")); row.appendChild(form);
      var description = node("div"); description.appendChild(node("h3",(names[f.form.replace(/\/A$/,"")] || f.description || f.form) + (/\/A$/.test(f.form) ? " · amendment" : "")));
      description.appendChild(node("p","Filed " + f.filed + (f.reportDate ? " · report date " + f.reportDate : "")));
      row.appendChild(description); row.appendChild(link("Open filing ↗",f.url)); el("filing-list").appendChild(row);
    });
    el("filing-count").textContent = rows.length ? "Showing " + Math.min(filingLimit,rows.length) + " of " + rows.length + " matching recent filings. Older filings are available in the full SEC history." : "No filings of this type in the recent history. Check the full SEC history for older documents.";
    el("more-filings").hidden = rows.length<=filingLimit;
  }
  function view(name) {
    section = name;
    ["overview","statements","ratios","peers","valuation","filings","allocation","notes","report","forecast"].forEach(function (x) { el(x).hidden = x!==name; });
    el("basis-controls").hidden=name==="filings" || name==="valuation" || name==="notes" || name==="forecast";
    document.querySelectorAll("[data-fd-view]").forEach(function (b) { b.setAttribute("aria-pressed",String(b.dataset.fdView===name)); });
    el("source").hidden = true;
    if (!current) return;
    workspace.view(name);
    if (name==="forecast") forecast.view();
    if (name === "statements") table(statement,"statements-table");
    if (name === "ratios") table("ratios","ratios-table");
    if (name === "filings") filings();
    if (name === "peers") renderPeers();
    if (name === "valuation") {
      var saved=marketCaps.get(current.cik); el("market-cap").value=saved?saved.value/1e9:""; el("market-date").value=saved?saved.date:today();
      valuation();
    }
  }
  function render(data) {
    current = data;
    el("symbol").textContent = data.symbol + " · CIK " + data.cik;
    el("name").textContent = data.name;
    el("meta").textContent = [data.industry,data.sic ? "SIC " + data.sic : "",data.exchanges.join(" / "),
      "Retrieved " + new Date(data.retrievedAt).toLocaleString()].filter(Boolean).join(" · ");
    el("methodology").textContent = data.methodology;
    el("download").disabled = !periods().length;
    el("sec-all").href = data.secURL;
    el("result").hidden = false; el("welcome").hidden = true;
    document.querySelectorAll('[data-fd-view="statements"], [data-fd-view="ratios"]').forEach(function (b) { b.disabled = !periods().length; });
    var selectedMetric=el("trend-metric").value;
    el("trend-metric").replaceChildren();
    data.fields.forEach(function (f) { var option=node("option",f.label); option.value=f.id; el("trend-metric").appendChild(option); });
    el("trend-metric").value=selectedMetric || "revenue";
    status(data.message || "Loaded " + data.periods.length + " annual, "+(data.quarterly || []).length+" quarterly and "+(data.ttm || []).length+" trailing 12-month periods.");
    overview(); view(data.coverage==="filings-only" ? "filings" : section);
  }
  function load(symbol) {
    if (!config || !config.getPassword()) return;
    symbol = (symbol || el("ticker").value).trim().toUpperCase();
    if (!symbol) { status("Enter a company ticker or select a company suggestion.",true); return; }
    if (window.TickerSuggestions) window.TickerSuggestions.close();
    el("ticker").value = symbol;
    generation++; var token = generation;
    if (controller) controller.abort();
    peerGeneration++; if (peerController) peerController.abort(); peers=[]; el("peer-go").disabled=false;
    el("peer-status").textContent="Choose companies you consider comparable."; el("peer-table").replaceChildren();
    requested = symbol; el("result").hidden = true; el("welcome").hidden = true; el("source").hidden = true;
    if (cache.has(symbol) && Date.now()-cache.get(symbol).at < 900000) { requested=""; el("result").setAttribute("aria-busy","false"); render(cache.get(symbol).data); return; }
    controller = new AbortController();
    status("Loading SEC filings and financials for " + symbol + "…"); el("result").setAttribute("aria-busy","true");
    fetchCompany(symbol,controller.signal)
      .then(function (data) {
        if (generation!==token) return;
        render(data);
      }).catch(function (e) {
        if (generation!==token || e.name==="AbortError") return;
        status(e.message === "Failed to fetch" ? "Could not reach the server. Please try again." : e.message,true); el("welcome").hidden = false;
      }).finally(function () { if (generation===token) { requested=""; el("result").setAttribute("aria-busy","false"); } });
  }
  function download() {
    if (!current) return;
    function cell(x) { var s = x == null ? "" : String(x); if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; }
    var rows = [["Symbol","CIK","Company","Section","Metric","Reporting basis","Period start","Period end","Value","Unit","Calculated","Tag / formula","Filed","Accession","Source / input sources"]];
    periods().forEach(function (p) {
      current.fields.forEach(function (f) {
        var v = p.values[f.id];
        rows.push([current.symbol,current.cik,current.name,f.section,f.label,basis,f.section==="balance"?"":p.start,p.end,v?v.value:null,f.unit,v?String(v.derived):"",v?(v.tag||v.formula):"",v?v.filed:"",v?v.accession:"",v?(v.url||JSON.stringify(v.inputs)):""]);
      });
    });
    var url = URL.createObjectURL(new Blob(["\uFEFF"+rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n")],{type:"text/csv;charset=utf-8"}));
    var a = node("a"); a.href=url; a.download=current.symbol+"-"+basis+"-fundamentals.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); },1000);
  }
  var workspace=window.FundamentalWorkspace.create({
    el:el,node:node,link:link,format:format,compact:compact,source:source,chart:chart,
    current:function () { return current; }, periods:periods,basisName:basisName,
    peers:function () { return peers; }, valuationFor:valuationFor, valuationPeriod:valuationPeriod
  });
  var forecast=window.ForecastWorkspace.create({current:function () { return current; },node:node,source:source,link:link});
  window.Fundamentals = {
    attach: function (c) {
      config=c; workspace.attach(); forecast.attach();
      el("form").addEventListener("submit",function (e) { e.preventDefault(); load(); });
      document.querySelectorAll("[data-fd-view]").forEach(function (b) { b.addEventListener("click",function () { view(b.dataset.fdView); }); });
      document.querySelectorAll("[data-fd-statement]").forEach(function (b) { b.addEventListener("click",function () {
        statement=b.dataset.fdStatement;
        document.querySelectorAll("[data-fd-statement]").forEach(function (x) { x.setAttribute("aria-pressed",String(x===b)); });
        el("source").hidden=true; if (current) table(statement,"statements-table");
      }); });
      el("units").addEventListener("change",function () { if (current) table(statement,"statements-table"); });
      el("trend-metric").addEventListener("change",function () { if (current) chart(); });
      el("filing-type").addEventListener("change",function () { filingLimit=20; if (current) filings(); });
      el("more-filings").addEventListener("click",function () { filingLimit+=20; filings(); });
      el("download").addEventListener("click",download);
      el("basis").addEventListener("change",function () {
        basis=el("basis").value;
        if (!current) return;
        el("download").disabled=!periods().length;
        document.querySelectorAll('[data-fd-view="statements"], [data-fd-view="ratios"]').forEach(function (b) { b.disabled=!periods().length; });
        overview(); view(section); renderPeers();
      });
      el("peer-form").addEventListener("submit",function (e) { e.preventDefault(); if (current) comparePeers(); });
      el("market-date").max=today();
      el("valuation-form").addEventListener("submit",function (e) {
        e.preventDefault(); if (!current) return;
        marketCaps.set(current.cik,{value:Number(el("market-cap").value)*1e9,date:el("market-date").value});
        valuation(); renderPeers();
      });
      if (window.TickerSuggestions) window.TickerSuggestions.attach({prefix:"fd-peer-symbols",multiple:true,companiesOnly:true,endpoint:"/api/fundamentals",
        getPassword:c.getPassword,selectionHint:"add the company to your peer list."});
      if (window.TickerSuggestions) window.TickerSuggestions.attach({prefix:"fd-ticker",companiesOnly:true,endpoint:"/api/fundamentals",
        getPassword:c.getPassword,onEdit:function () {},onSelect:function (item) { section="overview"; load(item.symbol); }});
    },
    open: function (symbol) {
      if (!config || !config.getPassword()) return;
      if (symbol) { section="overview"; load(symbol); }
      else if (!current && !requested) load();
    }
  };
})();
