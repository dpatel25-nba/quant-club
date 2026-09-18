(function () {
  "use strict";
  function accountStorageKey(key) { return window.ResearchAuth ? window.ResearchAuth.storageKey(key) : key; }
  var E=window.ForwardModel, labels={base:"Base",upside:"Upside",downside:"Downside"};
  var rows=[
    ["revenue","Revenue"],["cogs","Cost of revenue"],["grossProfit","Gross profit"],["rd","Research & development"],["sga","Selling, general & administrative"],["otherOpex","Other operating costs"],
    ["ebitda","EBITDA"],["da","Depreciation"],["ebit","Operating income (EBIT)"],["interest","Interest expense"],["pretax","Income before tax"],["tax","Cash tax"],["netIncome","Net income (consolidated model)"],
    ["sbc","Share-based compensation"],["deltaNwc","Change in operating working capital"],["cfo","Operating cash flow"],["capex","Capital expenditures"],["cfi","Investing cash flow"],
    ["borrow","New borrowing"],["repay","Debt repayment"],["issuance","Cash equity issuance"],["dividends","Dividends"],["buybacks","Buybacks"],["cff","Financing cash flow"],
    ["cash","Ending cash"],["ar","Accounts receivable"],["inventory","Inventory"],["ppe","Net modeled depreciable assets"],["otherAssets","Other assets (held constant)"],["assets","Total assets"],
    ["ap","Accounts payable"],["debt","Interest-bearing debt"],["otherLiabilities","Other liabilities (held constant)"],["liabilities","Total liabilities"],["equity","Consolidated equity"],
    ["balanceCheck","Assets − liabilities − equity"],["nopat","Operating income after tax (NOPAT)"],["fcff","FCFF used for DCF (SBC kept as expense)"],["fundingGap","Cash shortfall to minimum balance"]
  ];
  var method=[
    "Revenue grows by the annual growth input. Gross profit = revenue × gross margin. EBIT = gross profit − R&D − SG&A − other operating costs. Gross margin and expense ratios must already include modeled depreciation and SBC. EBITDA adds back depreciation once; SBC is not added to EBITDA.",
    "Receivables = revenue × receivable days / 365. Inventory and payables use cost of revenue × days / 365. Operating working capital = receivables + inventory − payables. This is narrower than total accounting working capital; other assets and liabilities stay constant.",
    "Depreciation = opening modeled depreciable assets × depreciation rate. Capital spending enters the depreciation base in the next year. Opening net PP&E is a seed; adjust modeled depreciable assets and expense assumptions for amortization or other assets when appropriate. Acquisitions, disposals, impairments, leases and OCI have no separate schedules.",
    "Interest = opening book debt × interest rate; borrowing and repayments change the next year’s interest base. Cash taxes apply only to positive pretax income. There are no deferred taxes, loss carryforwards or tax refunds. Dividends apply to positive net income. Financing is entered explicitly, with no automatic cash or debt plug.",
    "Operating cash flow = net income + depreciation + SBC − change in operating working capital. Investing cash flow = −capex. Financing cash flow = borrowing − repayment + cash equity issuance − dividends − buybacks. Ending equity = opening consolidated equity + net income + SBC + equity issuance − dividends − buybacks. Opening consolidated equity is assets minus liabilities, including any noncontrolling equity.",
    "NOPAT = EBIT − taxes on positive EBIT. FCFF for valuation = NOPAT + depreciation − capex − change in operating working capital. SBC remains an operating expense in this cash flow, even though accounting cash flow adds it back. Future SBC dilution is not also deducted; current fully diluted shares must include existing dilutive claims. No forecast EPS or share-count schedule is implied.",
    "Each forecast year is a full year after the model date. Starting run rates and balances come from the selected historical period and require analyst review for the intervening time. No stub-period estimate or market-data update is inferred. Cash flows are discounted at year end using a constant scenario WACC.",
    "Terminal NOPAT = final forecast NOPAT × (1 + terminal growth). Terminal reinvestment = terminal NOPAT × growth / terminal ROIC. Terminal FCFF = terminal NOPAT − reinvestment. Terminal value = terminal FCFF / (WACC − growth). Stable margins and taxes are assumed; the terminal reinvestment rule replaces the explicit capex and working-capital schedules.",
    "Enterprise value is the present value of explicit FCFF plus terminal value. Equity residual = enterprise value + valuation-date excess cash/nonoperating assets − debt claims − other senior claims. Future ending cash is not added again. Per-share estimates are shown only for a positive equity residual. Scenario weights are analyst choices, not calibrated probabilities.",
    "Reverse DCF replaces all forecast revenue growth inputs with a single constant rate, while retaining the selected scenario’s other annual assumptions. It searches −50% to 100% growth using a grid and bisection and rejects multiple detected solutions. It is conditional on the chosen margins, reinvestment, discount rate and valuation bridge. Funding shortfalls are not automatically financed; financing terms, issuance dilution and distress costs could change the valuation.",
    "New drafts prefill debt from reported long-term debt including its current portion plus short-term borrowings, falling back to commercial paper only when short-term borrowings are unavailable. Both long- and short-term components are required; review overlapping or omitted debt and leases. Debt claims initially use the same book amounts. Excess cash initially reserves 2% of annual revenue and excludes investments. Other claims use consolidated equity less parent equity when available, but still require review for preferred stock and valuation adjustments. These are editable starting estimates, not verified valuation-date totals.",
    "Missing valuation inputs leave only the affected outputs unavailable: the bridge is needed for equity value, a reviewed share count for per-share value, and market capitalization for comparison/reverse DCF. Missing or invalid valuation settings do not prevent operating forecasts. Market cap can be reused from this issuer’s Valuation tab only when its entered date matches the model date.",
    "Where a single SEC listing has an unambiguous common-share snapshot no older than 180 days, new drafts prefill reported common shares and label per-share values as before dilution. This is not fully diluted shares or a weighted-average count. The market-estimate button can multiply that snapshot by a matching daily USD price on the issuer’s exchange, no older than seven days and after the share disclosure. Both source dates are shown. Repurchases, issuance, splits, unlisted share classes and potential dilution can make these estimates unsuitable; review them before using the valuation. The button preserves existing entries. No price × diluted-shares market cap is inferred."
  ];
  window.ForecastWorkspace={create:function (ui) {
    var node=ui.node, el=function (id) { return document.getElementById("fm-"+id); }, drafts=new Map(), entry, marketGeneration=0, marketController;
    function today() { var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
    function candidates() { var d=ui.current(); return (d.ttm || []).slice(0,1).concat(d.periods || []); }
    function number(n,digits) { if (!Number.isFinite(n)) return "—"; var d=digits==null?1:digits; return (Math.abs(n)<Math.pow(10,-d)/2 ? 0 : n).toLocaleString(undefined,{maximumFractionDigits:d}); }
    function money(n) { if (!Number.isFinite(n)) return "—";var scale=Math.abs(n)>=1e6?1e6:Math.abs(n)>=1e3?1e3:1;return "$"+number(n/scale,2)+(scale===1e6?"T":scale===1e3?"B":"M"); }
    function panel(name) {
      if (!entry) return;
      if (name==="results" && !entry.result) name="setup";
      entry.panel=name;
      el("setup-panel").hidden=name!=="setup";el("assumptions-panel").hidden=name!=="assumptions";el("results").hidden=name!=="results";
      document.querySelectorAll("[data-fm-panel]").forEach(function (b) {b.setAttribute("aria-pressed",String(b.dataset.fmPanel===name));if(b.dataset.fmPanel==="results")b.disabled=!entry.result;});
      if (name==="results") chart();
    }
    function cancelMarket() { marketGeneration++; if (marketController) {marketController.abort();el("market-status").textContent="Price request canceled because the draft changed. Existing inputs were kept.";} marketController=null; el("market-fill").disabled=false; }
    function changed() { cancelMarket(); entry.result=null; panel(entry.panel || "setup"); el("csv").disabled=true; el("status").textContent="Assumptions changed. Run the model to update results."; el("storage").textContent="Draft changed in this tab. Save to keep it on this device."; readiness(); }
    function readiness() {
      var m=entry.model, missing=E.opening.filter(function (f) {var n=m.opening[f.id];return !f.optional && (!Number.isFinite(n) || n<f.min || n>f.max);});
      el("readiness").textContent=missing.length ? (9-missing.length)+" of 9 operating inputs filled. Still needed: "+missing.map(function (f) {return f.label;}).join(", ")+"." : "9 of 9 operating inputs filled. Review the values and assumptions before running.";
    }
    function reuseMarketCap(m) {
      var cap=ui.marketCap && ui.marketCap();
      if (m.opening.marketCap!=null || !cap || cap.date!==m.asOf || !Number.isFinite(cap.value) || cap.value<=0) return 0;
      m.opening.marketCap=cap.value/1e6;
      m.marketCapBasis="entered";
      m.references.marketCap={value:cap.value,unit:"USD",formula:"Member-entered market capitalization reused from Valuation, dated "+cap.date+". Not a live quote."};
      return 1;
    }
    function numeric(value,f,fn,label) {
      var input=node("input"),actual=value; input.type="number"; input.step="any"; input.min=f.min; input.max=f.max;
      function display() {input.value=actual==null ? "" : el("precision").checked ? actual : Math.abs(actual)>0 && Math.abs(actual)<.01 ? actual.toPrecision(3) : Number(actual.toFixed(2));input.title=actual==null?"":String(actual);}
      display();input.addEventListener("blur",display);
      input.placeholder=f.optional ? "Optional" : "Enter value";
      input.setAttribute("aria-label",label || f.label); input.addEventListener("input",function () {actual=input.value===""?null:Number(input.value);fn(actual);changed();});return input;
    }
    function currentCase() { return entry.model.cases[entry.scenario]; }
    function renderInputs() {
      var m=entry.model, data=ui.current();
      el("date").value=m.asOf; el("date").max=today(); el("horizon").value=m.horizon; el("case").value=entry.scenario; el("reviewed").checked=m.reviewed; el("notes").value=m.notes;
      el("share-basis").value=m.shareBasis || "fully-diluted";
      el("baseline").textContent="Draft baseline: "+m.period.kind.toUpperCase()+" · "+m.period.start+" to "+m.period.end+". Choosing a different period takes effect when you start a new model.";
      el("opening").replaceChildren();
      var p=candidates().find(function (p) { return p.start===m.period.start && p.end===m.period.end && p.kind===m.period.kind; }), suggestions=p ? E.suggestions(p) : {};
      var operating=node("div",null,"fm-input-grid"), optional=node("div",null,"fm-input-grid");
      el("opening").append(operating,node("h4","Valuation inputs","fm-subheading"),node("p","Optional for the operating forecast. These inputs unlock equity value, per-share value and market comparisons.","fm-explanation"),optional);
      E.opening.forEach(function (f) {
        var provenance=node("small"),box=node("div"), label=node("label",f.label), input=numeric(m.opening[f.id],f,function (n) { m.opening[f.id]=n; delete m.references[f.id]; if (f.id==="marketCap") m.marketCapBasis="entered"; provenance.replaceChildren(); }); label.appendChild(input); box.appendChild(label);
        var fact=p && f.field && p.values[f.field], details=node("details",null,"fm-input-source"), sourceSummary=node("summary",fact ? "SEC source" : suggestions[f.id] ? "Estimate · source & assumptions" : "Input guidance");details.appendChild(sourceSummary);box.appendChild(details);
        if (fact) {
          var b=node("button","SEC: "+number(fact.value/1e6)+" · "+p.end,"fd-value"); b.type="button";
          b.addEventListener("click",function () { ui.source(f.field,p); }); details.appendChild(b);
        } else {
          var s=suggestions[f.id];
          details.appendChild(node("small",s ? "Suggested starting point: "+number(s.value)+"m. "+s.note : f.optional ? f.id==="shares" ? "Optional · choose the share basis below. Reported common shares exclude potential dilution." : f.id==="marketCap" ? "Optional · needed for market comparison and reverse DCF. Use the market-estimate button or enter a reviewed amount." : "Optional · enter a reviewed amount for equity valuation, including an explicit zero where appropriate." : "Not available in the selected SEC fields. Enter a reviewed amount."));
          if (s) s.inputs.forEach(function (id) {var field=(data.fields || []).find(function (f) {return f.id===id;}),b=node("button","SEC: "+(field ? field.label : id)+" · "+p.end,"fd-value");b.type="button";b.addEventListener("click",function () {ui.source(id,p);});details.appendChild(b);});
          if (f.id==="marketCap") provenance.textContent=m.references.marketCap ? m.references.marketCap.formula : m.marketCapBasis==="price-times-shares" ? "Imported market-cap estimate. Source metadata is unverified; review against current data." : "";
          if (f.id==="shares" && m.references.shares) {var ref=m.references.shares;provenance.appendChild(ui.link("SEC common shares · "+ref.end+" · filed "+ref.filed,ref.url));}
          details.appendChild(provenance);
          if(f.id==="shares" && m.shareBasis==="reported-common") sourceSummary.textContent="Reported shares · before dilution";
          if(f.id==="marketCap" && m.marketCapBasis==="price-times-shares") sourceSummary.textContent="Estimated market cap · sources";
        }
        (f.optional ? optional : operating).appendChild(box);
      });
      readiness(); renderDrivers();
    }
    function renderDrivers() {
      var c=currentCase(); el("settings").replaceChildren();
      E.settings.forEach(function (f) { var label=node("label",labels[entry.scenario]+" · "+f.label+" (%)"); label.appendChild(numeric(c[f.id],f,function (n) { c[f.id]=n; })); el("settings").appendChild(label); });
      var t=node("table",null,"fd-table fm-driver-table"), head=node("thead"), tr=node("tr"); tr.appendChild(node("th","Driver"));
      for (var i=0;i<entry.model.horizon;i++) tr.appendChild(node("th","Year "+(i+1)));
      head.appendChild(tr); t.appendChild(head); var body=node("tbody");
      E.drivers.forEach(function (f) {
        var groups={growth:"Revenue & operating costs",tax:"Taxes & investment",dso:"Working capital",sbc:"Compensation & financing"};
        if(groups[f.id]){var group=node("tr",null,"fm-statement-heading"),heading=node("th",groups[f.id]);heading.colSpan=entry.model.horizon+1;group.appendChild(heading);body.appendChild(group);}
        var row=node("tr"), th=node("th",f.label+" ("+f.unit+")"); th.scope="row"; row.appendChild(th);
        c.years.slice(0,entry.model.horizon).forEach(function (y,i) { var td=node("td"); td.appendChild(numeric(y[f.id],f,function (n) { y[f.id]=n; },labels[entry.scenario]+" Year "+(i+1)+" "+f.label)); row.appendChild(td); }); body.appendChild(row);
      }); t.appendChild(body); el("drivers").replaceChildren(t);
    }
    function table(headers,data) {
      var t=node("table",null,"fd-table"), head=node("thead"), r=node("tr"); headers.forEach(function (h) { var th=node("th",h); th.scope="col"; r.appendChild(th); }); head.appendChild(r); t.appendChild(head);
      var body=node("tbody"); data.forEach(function (row) { var tr=node("tr"); row.forEach(function (v,i) { var cell=node(i?"td":"th",v); if (!i) cell.scope="row"; tr.appendChild(cell); }); body.appendChild(tr); }); t.appendChild(body); return t;
    }
    function scenarioRows(result) {
      return E.scenarios.map(function (s) { var r=result.cases[s],v=r.valuation; return [labels[s],number(entry.model.cases[s].weight)+"%",v.error || number(v.ev),number(v.equity),number(v.perShare,2),v.upside==null?"—":number(v.upside*100)+"%",number(r.fundingGap)]; });
    }
    function svg(tag,attrs,text) { var n=document.createElementNS("http://www.w3.org/2000/svg",tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k,attrs[k]); }); if (text!=null) n.textContent=text; return n; }
    function chart() {
      if (!entry || !entry.result || el("results").hidden || !el("chart").parentElement.clientWidth) return;
      var s=el("chart"), metric=el("chart-metric").value, result=entry.result;
      var width=Math.max(220,Math.min(900,s.parentElement.clientWidth)),compact=width<500, height=compact?310:265;
      var values=E.scenarios.flatMap(function (c) { return result.cases[c].rows.map(function (r) { return r[metric]; }); });
      var lo=Math.min.apply(null,[0].concat(values)),hi=Math.max.apply(null,[0].concat(values)),span=hi-lo || 1;
      var y=function (v) { return 30+(hi-v)/span*160; }, x=function (i) { return 60+i/(entry.model.horizon-1)*(width-80); };
      var title=el("chart-metric").selectedOptions[0].textContent;
      s.replaceChildren(); s.setAttribute("viewBox","0 0 "+width+" "+height); s.setAttribute("aria-label",title+" by scenario, USD abbreviated in millions, billions or trillions");s.appendChild(svg("title",{},title+" by scenario"));
      [lo,(lo+hi)/2,hi].forEach(function (v) { s.appendChild(svg("line",{x1:60,x2:width-20,y1:y(v),y2:y(v),stroke:"var(--border)"})); s.appendChild(svg("text",{x:52,y:y(v)+4,"text-anchor":"end",fill:"var(--muted)","font-size":11},money(v))); });
      E.scenarios.forEach(function (name,j) {
        var color=["var(--accent)","var(--good)","var(--bad)"][j], path=result.cases[name].rows.map(function (r,i) { return (i?"L":"M")+x(i)+" "+y(r[metric]); }).join(" ");
        s.appendChild(svg("path",{d:path,fill:"none",stroke:color,"stroke-width":2.5,"stroke-dasharray":["none","7 3","2 3"][j]}));
        s.appendChild(svg("text",{x:compact?60:60+j*(width-70)/3,y:compact?248+j*22:248,fill:color,"font-size":12},labels[name]+": "+money(result.cases[name].rows.at(-1)[metric])));
      });
      for (var i=0;i<entry.model.horizon;i++) if(!compact || i===0 || i===Math.floor((entry.model.horizon-1)/2) || i===entry.model.horizon-1) s.appendChild(svg("text",{x:x(i),y:215,"text-anchor":"middle",fill:"var(--muted)","font-size":11},"Y"+(i+1)));
    }
    function renderResults() {
      var result=entry.result; if (!result) return;
      var m=entry.model,c=currentCase(), selected=result.cases[entry.scenario],v=selected.valuation;
      el("result-case").value=entry.scenario;
      el("results").hidden=entry.panel!=="results"; el("csv").disabled=false; el("metrics").replaceChildren();
      el("result-context").textContent=m.symbol+" · "+m.horizon+" forecast years · model date "+m.asOf+". Analyst assumptions, not company guidance.";
      [result.weightedEquity==null ? [labels[entry.scenario]+" enterprise value",money(v.ev),"Operating business value before cash and senior-claim adjustments."] : ["Weighted equity value",money(result.weightedEquity),"The three scenarios combined using your assigned weights."],[labels[entry.scenario]+" value per share",v.perShare==null?"—":"$"+number(v.perShare,2),m.shareBasis==="reported-common"?"Reported common shares · before dilution.":"Based on your reviewed fully diluted share count."],["Value beyond the forecast",v.terminalShare==null?"—":number(v.terminalShare*100)+"%","Terminal value as a share of enterprise value. Higher means more reliance on long-term assumptions."]].forEach(function (r) { var card=node("div",null,"fd-metric"); card.appendChild(node("div",r[0],"fd-label")); card.appendChild(node("div",r[1],"fd-number mono"));card.appendChild(node("div",r[2],"fm-metric-caption"));el("metrics").appendChild(card); });
      el("scenarios").replaceChildren(table(["Scenario","Weight","Enterprise value (m)","Equity value (m)","Value / share","Vs market cap","Peak funding gap (m)"],scenarioRows(result)));
      el("scenarios").querySelectorAll("tbody tr").forEach(function (row,i) {row.setAttribute("aria-current",String(E.scenarios[i]===entry.scenario));});
      var dotKey=v.perShare!=null ? "perShare" : v.equity!=null ? "equity" : "ev";
      var dotFormat=dotKey==="perShare" ? function (n) {return "$"+number(n,2);} : money;
      var reference=dotKey==="perShare" ? v.price : dotKey==="equity" && Number.isFinite(v.upside) ? m.opening.marketCap : null;
      window.ResearchVisuals.dots(el("scenario-dots"),["downside","base","upside"].map(function (name) {var val=result.cases[name].valuation;return {label:labels[name],value:val.error ? null : val[dotKey],selected:name===entry.scenario,detail:number(m.cases[name].weight)+"% assigned weight"};}),{format:dotFormat,reference:reference,referenceLabel:dotKey==="perShare" ? "Market-cap input / modeled shares" : "Market-cap input"});
      el("scenario-dots-label").textContent=(dotKey==="perShare" ? m.shareBasis==="reported-common" ? "Value per reported common share, before dilution." : "Value per reviewed fully diluted share." : dotKey==="equity" ? "Equity value · USD, abbreviated as M / B / T." : "Enterprise value · USD, abbreviated as M / B / T.")+" Scenario assumptions, not probabilities or a confidence interval.";
      el("value-context").textContent=labels[entry.scenario]+" scenario · present values in USD, abbreviated as M / B / T."+(!v.error && v.equity==null ? " Equity-bridge inputs are incomplete; showing enterprise value only." : "");
      var bridge=v.error ? [] : [{label:"Forecast cash flows",value:v.pvExplicit},{label:"Terminal value",value:v.pvTerminal},{label:"Enterprise value",value:v.ev,total:true}];
      if (!v.error && v.equity!=null) bridge=bridge.concat([{label:"Excess cash / assets",value:m.opening.excessCash},{label:"Debt claims",value:-m.opening.debtClaims},{label:"Other claims",value:-m.opening.otherClaims},{label:"Equity residual",value:v.equity,total:true}]);
      window.ResearchVisuals.waterfall(el("value-waterfall"),bridge,{title:labels[entry.scenario]+" valuation bridge",format:money,empty:v.error || "Complete the valuation inputs to see this breakdown."});
      var diagnostics=(result.messages || []).slice(), availability=new Set();
      E.scenarios.forEach(function (name) {
        var r=result.cases[name],val=r.valuation;
        if (val.error) diagnostics.push(labels[name]+": "+val.error);
        (val.messages || []).forEach(function (message) {availability.add(message);});
        if (r.fundingGap>.000001) diagnostics.push(labels[name]+": up to $"+number(r.fundingGap)+"m of additional cash is needed to meet the minimum balance. Funding and its dilution/costs are not modeled automatically.");
        if (r.rows.some(function (x) { return x.equity<0; })) diagnostics.push(labels[name]+": projected book equity turns negative.");
        if (!val.error && val.equity!=null && val.equity<=0) diagnostics.push(labels[name]+": modeled enterprise value and nonoperating assets do not cover senior claims; no positive per-share estimate is shown.");
        if (!val.error && val.terminalShare>.8) diagnostics.push(labels[name]+": more than 80% of enterprise value comes from the terminal value.");
      });
      var notes=node("ul");availability.forEach(function (message) {notes.appendChild(node("li",message));});el("availability").replaceChildren(notes);el("availability").hidden=!availability.size;
      var maxResidual=Math.max.apply(null,E.scenarios.flatMap(function (s) { return result.cases[s].rows.map(function (r) { return Math.abs(r.balanceCheck); }); }));
      diagnostics.push("Maximum balance-sheet residual: $"+number(maxResidual,6)+"m. Other assets and liabilities stay constant; balance checks verify arithmetic, not the realism of assumptions.");
      var checks=node("ul");diagnostics.forEach(function (message) {checks.appendChild(node("li",message));});el("diagnostics").replaceChildren(checks);
      el("projection-label").textContent=labels[entry.scenario]+" · USD millions · Year 1 is the full year after "+m.asOf+". Figures are modeled, not reported or analyst consensus.";
      el("projections").replaceChildren(table(["Metric"].concat(selected.rows.map(function (r) { return "Year "+r.year; })),rows.map(function (f) { return [f[1]].concat(selected.rows.map(function (r) { return number(r[f[0]],f[0]==="balanceCheck"?6:1); })); })));
      var projectionBody=el("projections").querySelector("tbody"), projectedRows=Array.from(projectionBody.children);
      [["revenue","Income statement"],["sbc","Cash flow statement"],["cash","Balance sheet"],["nopat","Valuation cash flow"]].forEach(function (group) {
        var tr=node("tr",null,"fm-statement-heading"),th=node("th",group[1]);th.colSpan=m.horizon+1;tr.appendChild(th);projectionBody.insertBefore(tr,projectedRows[rows.findIndex(function (r) {return r[0]===group[0];})]);
      });
      var growths=[-1,-.5,0,.5,1].map(function (d) { return c.terminalGrowth+d; });
      var sensitivityKey=v.perShare!=null ? "perShare" : v.equity>0 ? "equity" : "ev";
      el("sensitivity-label").textContent=(sensitivityKey==="perShare" ? m.shareBasis==="reported-common" ? "Value per reported common share · before dilution" : "Equity value per current fully diluted share" : sensitivityKey==="equity" ? "Equity value · USD millions" : "Enterprise value · USD millions")+" for the selected scenario. Operating assumptions and terminal ROIC stay fixed. — marks unavailable combinations.";
      var sensitivityValues=[];
      el("sensitivity").replaceChildren(table(["WACC / growth"].concat(growths.map(function (g) { return number(g)+"%"; })),[-2,-1,0,1,2].map(function (d) {
        var w=c.wacc+d, values=[];sensitivityValues.push(values); return [number(w)+"%"].concat(growths.map(function (g) { var val=selected.errors.length ? {} : E.value(m,entry.scenario,selected.rows,{wacc:w,terminalGrowth:g}); var n=val.error || val[sensitivityKey]==null ? null : val[sensitivityKey];values.push(n);return n==null ? "—" : "$"+number(n,2); }));
      })));
      window.ResearchVisuals.heatmap(el("sensitivity"),sensitivityValues);
      el("sensitivity").querySelector("tbody tr:nth-child(3) td:nth-child(4)").classList.add("fm-current-cell");
      var reverse=selected.errors.length ? {error:"Resolve this scenario’s model errors before running reverse DCF."} : E.reverse(m,entry.scenario);
      el("reverse").textContent=reverse.error || "A constant annual revenue growth rate of "+number(reverse.growth,2)+"% for "+m.horizon+" years matches your entered $"+number(m.opening.marketCap)+"m market capitalization, holding this scenario’s other assumptions fixed. This is an implied assumption, not a growth forecast."+(reverse.fundingGap>.000001 ? " That solution also requires up to $"+number(reverse.fundingGap)+"m of additional cash funding." : "");
      chart();
    }
    function run() {
      var m=entry.model, p=candidates().find(function (p) { return p.start===m.period.start && p.end===m.period.end; });
      var latest=p ? Object.values(p.values).map(window.FundamentalAnalysis.filedDate).sort().pop() : "";
      var result=E.run(m,today());
      if (latest && m.asOf<latest) result={errors:["Use a model date on or after "+latest+", when the selected SEC inputs were available."]};
      el("status").replaceChildren();
      if (result.errors.length) {
        entry.result=null; panel(entry.panel || "setup"); el("csv").disabled=true;
        el("status").appendChild(node("p","Complete or correct these inputs:")); var list=node("ul"); result.errors.slice(0,30).forEach(function (x) { list.appendChild(node("li",x)); });
        if (result.errors.length>30) list.appendChild(node("li",(result.errors.length-30)+" more input errors. Review the remaining scenario drivers.")); el("status").appendChild(list); return;
      }
      entry.result=result;panel("results");el("status").textContent="Model updated. Review the scenario comparison and checks before using these estimates.";renderResults();el("results-title").focus({preventScroll:true});el("results-title").scrollIntoView({block:"start"});
    }
    function download(text,type,filename) { var url=URL.createObjectURL(new Blob([text],{type:type})),a=node("a"); a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function () {URL.revokeObjectURL(url);},1000); }
    function csv() {
      if (!entry.result) return;
      var m=entry.model, out=[["Company",m.symbol,"CIK",m.cik],["Model version",1],["Historical period",m.period.start,m.period.end,m.period.kind],["Model date",m.asOf],["Historical retrieved",m.retrievedAt],["Units","USD millions; shares in millions; drivers as labeled"],["Assumption rationale",m.notes]];
      out.push(["Share count basis",m.shareBasis || "fully-diluted"],["Market-cap basis",m.marketCapBasis || "entered"]);
      E.opening.forEach(function (f) { out.push(["Opening input",f.label,m.opening[f.id]]); });
      E.scenarios.forEach(function (name) {
        var c=m.cases[name],r=entry.result.cases[name],v=r.valuation;
        out.push([],["Scenario",name]); E.settings.forEach(function (f) {out.push([f.label,c[f.id],"%"]);});
        out.push(["Driver"].concat(r.rows.map(function (r) {return "Year "+r.year;})));
        E.drivers.forEach(function (f) {out.push([f.label+" ("+f.unit+")"].concat(c.years.slice(0,m.horizon).map(function (r) {return r[f.id];})));});
        rows.forEach(function (f) {out.push([f[1]].concat(r.rows.map(function (r) {return r[f[0]];})));});
        Object.keys(v).forEach(function (key) {out.push(["Valuation",key,v[key]]);});
      });
      out.push([],["Historical source references",JSON.stringify(m.references)],["Source note","Imported models have unverified inputs; inspect the selected SEC period for current filings."]);
      method.forEach(function (p) {out.push(["Method",p]);});
      function cell(x) { var s=x==null?"":String(x); if (typeof x!=="number" && /^[=+@\t\r-]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; }
      download("\uFEFF"+out.map(function (r) {return r.map(cell).join(",");}).join("\r\n"),"text/csv;charset=utf-8",m.symbol+"-financial-model.csv");
    }
    function view() {
      cancelMarket(); el("market-status").textContent="";
      var data=ui.current(), options=candidates();
      var unavailable=!E.supported(data) || !options.length;
      el("unavailable").hidden=!unavailable; el("editor").hidden=unavailable;
      if (unavailable) { el("unavailable").textContent=!E.supported(data)?"Financial-sector issuers need a sector-specific valuation and balance-sheet model. This operating-company model is unavailable for this issuer.":"An annual or trailing 12-month SEC period is needed to initialize a model."; return; }
      el("period").replaceChildren(); options.forEach(function (p,i) {var o=node("option",p.kind.toUpperCase()+" · "+p.start+" to "+p.end);o.value=i;el("period").appendChild(o);});
      var id=String(data.cik); entry=drafts.get(id);
      if (!entry) {
        entry={model:E.make(data,options[0],today()),scenario:"base",result:null};
        try {var raw=localStorage.getItem(accountStorageKey("gpmc-forward-model-v1:"+id)); if(raw){entry.model=E.importModel(JSON.parse(raw),id);el("storage").textContent="Loaded this device’s saved model. Review the inputs before running.";}else {reuseMarketCap(entry.model);el("storage").textContent="New draft in this tab. Save or download it to keep a copy.";}}
        catch (_) {el("storage").textContent="Saved model could not be read. A new draft is shown; download a copy before closing if browser storage is unavailable.";}
        drafts.set(id,entry);
      } else el("storage").textContent="Current draft for "+data.symbol+". Save explicitly to update this device’s copy.";
      var idx=options.findIndex(function (p) {return p.start===entry.model.period.start && p.end===entry.model.period.end && p.kind===entry.model.period.kind;});el("period").value=idx>=0?idx:0;
      renderInputs(); el("results").hidden=!entry.result; el("csv").disabled=!entry.result;
      panel(entry.panel || "setup");if(entry.result) renderResults();else el("status").textContent="Review the opening inputs and all scenario assumptions, then run the model.";
    }
    window.ForecastReport=function (data) {
      var e=drafts.get(String(data.cik)), section=node("section"); section.appendChild(node("h2","Forward financial model"));
      if (!e || !e.result) {section.appendChild(node("p","No current financial model results. Run the model after completing or changing assumptions."));return section;}
      var m=e.model;section.appendChild(node("p","Model date "+m.asOf+" · "+m.horizon+" forecast years · historical baseline "+m.period.start+" to "+m.period.end+". Analyst scenarios, not consensus forecasts. USD millions except per-share values."));
      section.appendChild(node("p","Share basis: "+(m.shareBasis==="reported-common" ? "reported common shares, before potential dilution" : "reviewed fully diluted shares")+". Market-cap basis: "+(m.marketCapBasis==="price-times-shares" ? "estimate from a dated price × reported common shares" : "member-entered market capitalization")+"."));
      section.appendChild(table(["Scenario","Enterprise value (m)","Equity residual (m)","Value / share","Funding gap (m)"],E.scenarios.map(function (s) {var r=e.result.cases[s],v=r.valuation;return [labels[s],v.error || number(v.ev),number(v.equity),number(v.perShare,2),number(r.fundingGap)];})));
      var availability=new Set(e.result.messages || []); E.scenarios.forEach(function (s) {(e.result.cases[s].valuation.messages || []).forEach(function (message) {availability.add(message);});});
      if (availability.size) section.appendChild(node("p",Array.from(availability).join(" ")));
      section.appendChild(node("p",m.notes || "No assumption rationale entered."));
      section.appendChild(table(["Opening / bridge assumption","Value"],E.opening.map(function (f) {return [f.label,number(m.opening[f.id])];})));
      E.scenarios.forEach(function (s) {var c=m.cases[s];section.appendChild(node("h3",labels[s]+" assumptions"));section.appendChild(node("p",E.settings.map(function (f) {return f.label+" "+number(c[f.id])+"%";}).join(" · ")));section.appendChild(table(["Driver","Year-by-year inputs (Y1 onward)"],E.drivers.map(function (f) {return [f.label+" ("+f.unit+")",c.years.slice(0,m.horizon).map(function (r) {return number(r[f.id]);}).join(" / ")];})));});
      section.appendChild(node("p","Cash funding gaps are not automatically financed. Book equity and cash may become negative. Valuation omits financing issuance/dilution costs and assumes the operating plan can be funded. Download the model CSV for all linked projections and source references."));
      method.forEach(function (p) {section.appendChild(node("p",p));});
      var urls=new Set();
      function collect(v) { if (!v) return; if (/^https:\/\/www\.sec\.gov\//.test(v.url || "")) urls.add(v.url); (v.inputs || v.sources || []).forEach(collect); }
      Object.values(m.references).forEach(collect);
      if (urls.size) { section.appendChild(node("h3","Model baseline sources"));var links=node("ul");urls.forEach(function (url) {var li=node("li");li.appendChild(ui.link(url,url));links.appendChild(li);});section.appendChild(links); }
      section.querySelectorAll("table").forEach(function (t) {t.removeAttribute("class");});
      return section;
    };
    return {view:view,attach:function () {
      document.querySelectorAll("[data-fm-panel], [data-fm-go]").forEach(function (b) {b.addEventListener("click",function () {panel(b.dataset.fmPanel || b.dataset.fmGo);if(b.dataset.fmGo)el("assumptions-panel").scrollIntoView({block:"start"});});});
      window.addEventListener("resize",chart);
      el("precision").addEventListener("change",function () {if(entry)renderInputs();});
      el("method").replaceChildren();method.forEach(function (p) {el("method").appendChild(node("p",p));});
      el("run").addEventListener("click",run);
      el("case").addEventListener("change",function () {entry.scenario=el("case").value;renderDrivers();renderResults();});
      el("result-case").addEventListener("change",function () {entry.scenario=el("result-case").value;el("case").value=entry.scenario;renderDrivers();renderResults();});
      el("horizon").addEventListener("change",function () {entry.model.horizon=Number(el("horizon").value);changed();renderDrivers();});
      el("date").addEventListener("change",function () {entry.model.asOf=el("date").value;changed();});
      el("share-basis").addEventListener("change",function () {entry.model.shareBasis=el("share-basis").value;entry.model.reviewed=false;changed();renderInputs();});
      el("reviewed").addEventListener("change",function () {entry.model.reviewed=el("reviewed").checked;changed();});
      el("notes").addEventListener("input",function () {entry.model.notes=el("notes").value;changed();});
      el("fill").addEventListener("click",function () {var c=currentCase();c.years=c.years.map(function () {return Object.assign({},c.years[0]);});changed();renderDrivers();});
      el("reset").addEventListener("click",function () {entry.model=E.make(ui.current(),candidates()[Number(el("period").value)],today());reuseMarketCap(entry.model);changed();renderInputs();});
      el("prefill").addEventListener("click",function () {
        var m=entry.model, p=candidates().find(function (p) {return p.start===m.period.start && p.end===m.period.end && p.kind===m.period.kind;});
        var count=(p ? E.fillMissing(m,p) : 0)+E.fillShares(m,ui.current())+reuseMarketCap(m);
        if (count) {m.reviewed=false;changed();renderInputs();}
        el("status").textContent=count ? "Filled "+count+" missing inputs. Existing entries were kept. Review the suggested amounts before running." : "No additional supported values are available for blank inputs. Market-cap reuse requires an entry dated the same day as the model.";
      });
      el("market-fill").addEventListener("click",async function () {
        cancelMarket(); var target=entry,m=entry.model,data=ui.current(),filled=E.fillShares(m,data)+reuseMarketCap(m);
        if (filled) {m.reviewed=false;changed();renderInputs();}
        if (m.opening.marketCap!=null) {el("market-status").textContent="Share inputs checked. Existing market capitalization kept.";return;}
        if (!E.shareSnapshot(data,m.asOf)) {el("market-status").textContent="No recent, unambiguous SEC share snapshot is available for this model date. Enter reviewed shares and market cap if needed.";return;}
        var request=++marketGeneration, controller=new AbortController();marketController=controller;
        var timer=setTimeout(function () {controller.abort();},12000);
        el("market-fill").disabled=true;el("market-status").textContent="Loading a dated market price for "+data.symbol+"…";
        try {
          var quote=await ui.marketPrice(data,controller.signal);
          if (request!==marketGeneration || entry!==target || entry.model!==m || String(ui.current().cik)!==m.cik) return;
          var estimate=E.marketEstimate(data,m.asOf,quote);
          if (estimate.error) {el("market-status").textContent=estimate.error;return;}
          m.opening.marketCap=estimate.value;m.marketCapBasis="price-times-shares";
          m.references.marketCap={derived:true,formula:estimate.formula,priceDate:estimate.priceDate,inputs:[estimate.shares]};
          m.reviewed=false;changed();renderInputs();el("market-status").textContent="Filled the missing market-cap estimate. "+estimate.formula+" Review the inputs before running.";
        } catch (e) {
          if (request===marketGeneration && entry===target && String(ui.current().cik)===m.cik) el("market-status").textContent=e.name==="AbortError" ? "The price request timed out. Retry or enter a reviewed market cap." : e.message;
        } finally {clearTimeout(timer);if (request===marketGeneration) {marketController=null;el("market-fill").disabled=false;}}
      });
      el("chart-metric").addEventListener("change",chart);
      el("csv").addEventListener("click",csv);
      el("json").addEventListener("click",function () {download(JSON.stringify(entry.model,null,2),"application/json",entry.model.symbol+"-financial-model.json");});
      el("save").addEventListener("click",function () {try {localStorage.setItem(accountStorageKey("gpmc-forward-model-v1:"+entry.model.cik),JSON.stringify(entry.model));el("storage").textContent="Saved on this device · "+new Date().toLocaleString();}catch(_){el("storage").textContent="Not saved to this device. The draft remains in this tab; download JSON before closing.";}});
      el("import").addEventListener("change",async function () {
        var input=el("import"),file=input.files[0], target=entry;if(!file)return;
        try {if(file.size>256000)throw new Error("Model files must be smaller than 256 KB.");var parsed=E.importModel(JSON.parse(await file.text()),target.model.cik);if(entry!==target || String(ui.current().cik)!==target.model.cik)throw new Error("Company changed during import. Return to the original issuer and try again.");entry.model=parsed;changed();renderInputs();el("storage").textContent="Imported into this tab. Source metadata is unverified; review against the current SEC filings and save explicitly to keep it.";}
        catch(e){el("storage").textContent="Import failed: "+e.message;}finally{input.value="";}
      });
    }};
  }};
})();
