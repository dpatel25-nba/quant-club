(function () {
  "use strict";
  var scenarios=["base","upside","downside"];
  // All amounts are USD millions; percentages are entered as percentage points.
  var opening=[
    ["revenue","Revenue run rate","revenue",1,1e9], ["assets","Total assets","assets",0,1e9],
    ["liabilities","Total liabilities","liabilities",0,1e9], ["cash","Cash & equivalents","cash",0,1e9],
    ["ar","Accounts receivable","receivables",0,1e9], ["inventory","Inventory","inventory",0,1e9],
    ["ap","Accounts payable","payables",0,1e9], ["ppe","Modeled depreciable assets","ppe",0,1e9],
    ["debt","Total interest-bearing debt (book value)",null,0,1e9],
    ["shares","Current fully diluted shares (millions)",null,.000001,1e9],
    ["excessCash","Excess cash & nonoperating assets",null,0,1e9],
    ["debtClaims","Debt claims for valuation",null,0,1e9],
    ["otherClaims","Preferred, NCI & other senior claims",null,0,1e9],
    ["marketCap","Market capitalization for comparison",null,.000001,1e10]
  ].map(function (r) { return {id:r[0],label:r[1],field:r[2],min:r[3],max:r[4]}; });
  var drivers=[
    ["growth","Revenue growth",-95,200,"%"], ["grossMargin","Gross margin",-100,100,"%"],
    ["rd","R&D / revenue",0,100,"%"], ["sga","SG&A / revenue",0,100,"%"],
    ["otherOpex","Other operating costs / revenue",0,100,"%"], ["tax","Cash tax rate",0,60,"%"],
    ["capex","Capex / revenue",0,100,"%"], ["depreciation","Depreciation / opening depreciable assets",0,100,"%"],
    ["dso","Receivable days",0,730,"days"], ["dio","Inventory days",0,730,"days"], ["dpo","Payable days",0,730,"days"],
    ["sbc","SBC / revenue (included in operating costs)",0,100,"%"],
    ["interest","Interest / opening debt",0,50,"%"], ["payout","Dividends / positive net income",0,100,"%"],
    ["borrow","New borrowing",0,1e9,"USD m"], ["repay","Debt repayment",0,1e9,"USD m"],
    ["issuance","Cash equity issuance",0,1e9,"USD m"], ["buybacks","Cash buybacks",0,1e9,"USD m"],
    ["minCash","Minimum cash / revenue",0,100,"%"]
  ].map(function (r) { return {id:r[0],label:r[1],min:r[2],max:r[3],unit:r[4]}; });
  var settings=[
    ["wacc","Discount rate / WACC",.1,50], ["terminalGrowth","Terminal growth",0,10],
    ["terminalROIC","Terminal return on invested capital",.1,100], ["weight","Scenario weight",0,100]
  ].map(function (r) { return {id:r[0],label:r[1],min:r[2],max:r[3],unit:"%"}; });
  function supported(data) { return !(Number(data.sic)>=6000 && Number(data.sic)<7000) && !/banking|insurance|commercial banks/i.test(data.industry || ""); }
  function make(data,period,date) {
    var v=period.values, base={}, references={};
    opening.forEach(function (f) {
      var fact=f.field && v[f.field]; base[f.id]=fact ? fact.value/1e6 : null;
      if (fact) references[f.id]=JSON.parse(JSON.stringify(fact));
    });
    ["grossProfit","operatingIncome","costRevenue","rd","sga","revenueGrowth","capex","sbc"].forEach(function (id) { if (v[id]) references["seed-"+id]=JSON.parse(JSON.stringify(v[id])); });
    function ratio(id,fallback) { return v[id] && v.revenue && v.revenue.value>0 ? v[id].value/v.revenue.value*100 : fallback; }
    var revenue=v.revenue && v.revenue.value, cogs=v.costRevenue && v.costRevenue.value;
    function days(id,den,fallback) { return v[id] && den>0 ? Math.min(730,Math.max(0,v[id].value/den*365)) : fallback; }
    var gm=ratio("grossProfit",null), op=ratio("operatingIncome",null), rd=ratio("rd",0), sga=ratio("sga",0);
    if (gm==null && cogs!=null && revenue>0) gm=(1-cogs/revenue)*100;
    var growth=v.revenueGrowth ? Math.max(-20,Math.min(30,v.revenueGrowth.value*100)) : 5;
    var seed={growth:growth,grossMargin:gm,rd:rd,sga:sga,otherOpex:gm!=null && op!=null ? Math.max(0,gm-rd-sga-op) : 0,
      tax:25,capex:Math.max(0,ratio("capex",5)),depreciation:10,dso:days("receivables",revenue,45),dio:days("inventory",cogs,45),dpo:days("payables",cogs,45),
      sbc:Math.max(0,ratio("sbc",0)),interest:5,payout:0,borrow:0,repay:0,issuance:0,buybacks:0,minCash:2};
    var cases={};
    scenarios.forEach(function (name) {
      cases[name]={wacc:10,terminalGrowth:2.5,terminalROIC:12,weight:name==="base"?50:25,years:[]};
      for (var i=0;i<10;i++) {
        var row=Object.assign({},seed), shift=name==="upside"?2:name==="downside"?-2:0;
        row.growth=Math.round((growth+(3-growth)*i/9+shift)*100)/100;
        if (row.grossMargin!=null) row.grossMargin=Math.min(100,Math.max(-100,row.grossMargin+shift));
        cases[name].years.push(row);
      }
    });
    return {version:1,cik:String(data.cik),symbol:data.symbol,period:{start:period.start,end:period.end,kind:period.kind},retrievedAt:data.retrievedAt,
      asOf:date,horizon:5,opening:base,references:references,cases:cases,notes:"",reviewed:false};
  }
  function validate(m,today) {
    var errors=[];
    if (!m || m.version!==1) return ["Unsupported model version."];
    if (m.horizon!==5 && m.horizon!==10) errors.push("Select a five- or ten-year horizon.");
    var date=m.asOf || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || (today && date>today)) errors.push("Enter a valid model date no later than today.");
    if (m.period && date<m.period.end) errors.push("The model date cannot precede the historical period end.");
    if (!m.reviewed) errors.push("Review the opening inputs and assumptions, then check the review box.");
    function check(obj,fields,label) {
      fields.forEach(function (f) { var n=obj && obj[f.id]; if (!Number.isFinite(n) || n<f.min || n>f.max) errors.push(label+f.label+": enter a number between "+f.min+" and "+f.max+"."); });
    }
    check(m.opening,opening,"Opening inputs · ");
    scenarios.forEach(function (name) {
      var c=m.cases && m.cases[name]; check(c,settings,name+" · ");
      if (!c || !Array.isArray(c.years) || c.years.length!==10) { errors.push(name+": ten driver rows are required."); return; }
      c.years.slice(0,m.horizon).forEach(function (r,i) { check(r,drivers,name+" · Year "+(i+1)+" · "); });
      if (c.wacc<=c.terminalGrowth) errors.push(name+": WACC must exceed terminal growth.");
      if (c.terminalROIC<=c.terminalGrowth) errors.push(name+": terminal ROIC must exceed growth, leaving positive terminal cash flow.");
    });
    if (errors.length) return errors;
    var b=m.opening;
    if (b.cash+b.ar+b.inventory+b.ppe>b.assets+.000001) errors.push("Opening modeled asset components exceed total assets.");
    if (b.ap+b.debt>b.liabilities+.000001) errors.push("Opening debt and accounts payable exceed total liabilities.");
    if (Math.abs(scenarios.reduce(function (n,s) { return n+m.cases[s].weight; },0)-100)>.00001) errors.push("Scenario weights must total 100%.");
    return errors;
  }
  function project(m,name,override) {
    var c=m.cases[name], b=m.opening, prev=Object.assign({equity:b.assets-b.liabilities},b), rows=[], errors=[];
    var otherAssets=b.assets-b.cash-b.ar-b.inventory-b.ppe, otherLiabilities=b.liabilities-b.ap-b.debt;
    for (var i=0;i<m.horizon;i++) {
      var a=Object.assign({},c.years[i]); if (override && override.growth!=null) a.growth=override.growth;
      var r={year:i+1};
      r.revenue=prev.revenue*(1+a.growth/100); r.cogs=r.revenue*(1-a.grossMargin/100); r.grossProfit=r.revenue-r.cogs;
      r.rd=r.revenue*a.rd/100; r.sga=r.revenue*a.sga/100; r.otherOpex=r.revenue*a.otherOpex/100;
      r.ebit=r.grossProfit-r.rd-r.sga-r.otherOpex; r.capex=r.revenue*a.capex/100;
      r.da=prev.ppe*a.depreciation/100; r.ppe=prev.ppe+r.capex-r.da; r.ebitda=r.ebit+r.da;
      r.sbc=r.revenue*a.sbc/100;
      if (r.da+r.sbc>r.cogs+r.rd+r.sga+r.otherOpex+.000001) errors.push("Year "+r.year+": depreciation plus SBC exceeds modeled operating costs; revise the expense assumptions.");
      r.interest=prev.debt*a.interest/100; r.pretax=r.ebit-r.interest; r.tax=Math.max(0,r.pretax)*a.tax/100; r.netIncome=r.pretax-r.tax;
      r.nopat=r.ebit-Math.max(0,r.ebit)*a.tax/100;
      r.ar=r.revenue/365*a.dso; r.inventory=r.cogs/365*a.dio; r.ap=r.cogs/365*a.dpo;
      r.nwc=r.ar+r.inventory-r.ap; r.deltaNwc=r.nwc-(prev.ar+prev.inventory-prev.ap);
      r.cfo=r.netIncome+r.da+r.sbc-r.deltaNwc; r.cfi=-r.capex;
      r.dividends=Math.max(0,r.netIncome)*a.payout/100;
      r.borrow=a.borrow; r.repay=a.repay; r.issuance=a.issuance; r.buybacks=a.buybacks;
      r.cff=r.borrow-r.repay+r.issuance-r.dividends-r.buybacks;
      r.cash=prev.cash+r.cfo+r.cfi+r.cff; r.debt=prev.debt+r.borrow-r.repay;
      if (r.debt<-.000001) errors.push("Year "+r.year+": repayments exceed available debt.");
      r.equity=prev.equity+r.netIncome+r.sbc+r.issuance-r.dividends-r.buybacks;
      r.otherAssets=otherAssets; r.otherLiabilities=otherLiabilities;
      r.assets=r.cash+r.ar+r.inventory+r.ppe+otherAssets; r.liabilities=r.ap+r.debt+otherLiabilities;
      r.balanceCheck=r.assets-r.liabilities-r.equity;
      r.fcff=r.nopat+r.da-r.capex-r.deltaNwc; // SBC stays an expense in valuation.
      r.fundingGap=Math.max(0,r.revenue*a.minCash/100-r.cash);
      if (!Object.keys(r).every(function (key) { return Number.isFinite(r[key]); })) errors.push("Year "+r.year+": assumptions overflow the model.");
      rows.push(r); prev=r;
    }
    return {rows:rows,errors:errors};
  }
  function value(m,name,rows,overrides) {
    var c=Object.assign({},m.cases[name],overrides || {}), b=m.opening, last=rows[rows.length-1];
    if (c.wacc<=c.terminalGrowth || c.terminalGrowth<0 || c.terminalROIC<=c.terminalGrowth || c.wacc<=0) return {error:"Invalid terminal growth, ROIC or discount rate."};
    if (last.nopat<=0) return {error:"A positive final-year operating profit after tax is required for the perpetuity valuation."};
    var discount=c.wacc/100,g=c.terminalGrowth/100,roic=c.terminalROIC/100;
    var terminalNopat=last.nopat*(1+g), reinvestment=terminalNopat*g/roic, terminalFcff=terminalNopat-reinvestment;
    var terminal=terminalFcff/(discount-g), pvTerminal=terminal/Math.pow(1+discount,rows.length);
    var pv=rows.reduce(function (sum,r,i) { return sum+r.fcff/Math.pow(1+discount,i+1); },0), ev=pv+pvTerminal;
    var equity=ev+b.excessCash-b.debtClaims-b.otherClaims;
    return {ev:ev,equity:equity,perShare:equity>0 ? equity/b.shares : null,upside:equity>0 ? equity/b.marketCap-1 : null,
      price:b.marketCap/b.shares,pvExplicit:pv,pvTerminal:pvTerminal,terminal:terminal,terminalFcff:terminalFcff,terminalNopat:terminalNopat,
      reinvestment:reinvestment,terminalShare:ev>0 ? pvTerminal/ev : null};
  }
  function reverse(m,name) {
    // Search a bounded domain, and explicitly reject ambiguous multiple crossings.
    var roots=[], previous=null;
    function residual(g) { var p=project(m,name,{growth:g}); if (p.errors.length) return null; var v=value(m,name,p.rows); return v.error ? null : v.equity-m.opening.marketCap; }
    for (var g=-50;g<=100;g+=1) {
      var y=residual(g);
      if (y==null) { previous=null; continue; }
      if (Math.abs(y)<1e-7) roots.push(g);
      else if (previous && previous.y*y<0) {
        var lo=previous.g,hi=g,low=previous.y;
        for (var i=0;i<60;i++) { var mid=(lo+hi)/2,f=residual(mid); if (f==null) break; if (low*f<=0) hi=mid; else {lo=mid;low=f;} }
        roots.push((lo+hi)/2);
      }
      previous={g:g,y:y};
    }
    roots=roots.filter(function (r,i) { return !i || Math.abs(r-roots[i-1])>1e-6; });
    return roots.length===1 ? {growth:roots[0],fundingGap:Math.max.apply(null,project(m,name,{growth:roots[0]}).rows.map(function (r) { return r.fundingGap; }))} : {error:roots.length ? "Multiple growth solutions in the search range; no single implied growth is shown." : "No growth solution found between −50% and 100% per year. Other assumptions may need to change."};
  }
  function run(m,today) {
    var errors=validate(m,today); if (errors.length) return {errors:errors};
    var cases={};
    scenarios.forEach(function (name) {
      var p=project(m,name), v=p.errors.length ? {error:p.errors.join(" ")} : value(m,name,p.rows);
      cases[name]={rows:p.rows,valuation:v,errors:p.errors,fundingGap:Math.max.apply(null,p.rows.map(function (r) { return r.fundingGap; }))};
    });
    var valid=scenarios.every(function (name) { return m.cases[name].weight===0 || (!cases[name].valuation.error && cases[name].valuation.equity>0); });
    return {errors:[],cases:cases,weightedEquity:valid ? scenarios.reduce(function (sum,name) { return m.cases[name].weight===0 ? sum : sum+cases[name].valuation.equity*m.cases[name].weight/100; },0) : null};
  }
  function importModel(raw,cik) {
    function validDate(s) { return typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s; }
    if (!raw || raw.version!==1 || String(raw.cik)!==String(cik) || ![5,10].includes(raw.horizon) || !raw.period || !validDate(raw.period.start) || !validDate(raw.period.end) || raw.period.start>=raw.period.end || !["annual","ttm"].includes(raw.period.kind)) throw new Error("Choose a version 1 model for this SEC issuer with 5 or 10 forecast years and a valid annual or TTM baseline.");
    var span=(Date.parse(raw.period.end)-Date.parse(raw.period.start))/86400000;
    if (span<320 || span>400 || (raw.period.kind==="ttm" && (span<350 || span>380))) throw new Error("The historical baseline must cover a supported full-year period.");
    var m={version:1,cik:String(cik),symbol:String(raw.symbol || "").slice(0,30),period:{start:String(raw.period.start || "").slice(0,10),end:raw.period.end,kind:raw.period.kind},
      retrievedAt:String(raw.retrievedAt || "").slice(0,40),asOf:String(raw.asOf || "").slice(0,10),horizon:raw.horizon,reviewed:false,
      notes:String(raw.notes || "").slice(0,12000),opening:{},references:{},cases:{}};
    function copy(from,fields) { var out={}; fields.forEach(function (f) { var n=from && from[f.id]; if (n!==null && !Number.isFinite(n)) throw new Error("Invalid numeric input: "+f.label); out[f.id]=n; }); return out; }
    m.opening=copy(raw.opening,opening);
    scenarios.forEach(function (name) { var c=raw.cases && raw.cases[name]; if (!c || !Array.isArray(c.years) || c.years.length!==10) throw new Error("Each scenario requires ten driver rows."); m.cases[name]=copy(c,settings); m.cases[name].years=c.years.map(function (r) { return copy(r,drivers); }); });
    // Imported provenance is not trusted. Keep the historical period label but
    // require fresh review and use current SEC links in the interface.
    return m;
  }
  window.ForwardModel={opening:opening,drivers:drivers,settings:settings,scenarios:scenarios,make:make,validate:validate,project:project,value:value,reverse:reverse,run:run,importModel:importModel,supported:supported};
})();
