(function () {
  "use strict";
  var noteFields=[["thesis","Investment thesis"],["catalysts","Catalysts"],["risks","Risks"],["questions","Open questions"],["assumptions","Valuation assumptions"]];
  var allocationFields=["ocf","capex","fcf","acquisitions","dividends","distributions","buybacks","sbc","shares","longDebt","currentLongDebt","noncurrentDebt"];
  // The same self-contained styles are used for the preview and downloaded report.
  var reportCSS=".fd-report-document{font:14px/1.6 Georgia,serif;color:#202b36;background:#fff;padding:28px;overflow-wrap:anywhere;--text:#202b36;--muted:#53616e;--accent:#286789;--bad:#a44141;--border:#ccd4da}.fd-report-document h1{font-size:27px;line-height:1.25}.fd-report-document h2{font-size:20px;margin:28px 0 10px;border-bottom:1px solid #ccd4da;padding-bottom:7px}.fd-report-document h3{font-size:16px;margin:20px 0 8px}.fd-report-document p{white-space:pre-wrap}.fd-report-document table{border-collapse:collapse;width:100%;font:12px/1.5 Arial,sans-serif;margin:12px 0}.fd-report-document th,.fd-report-document td{padding:8px 6px;text-align:right;border-bottom:1px solid #dde3e8;vertical-align:top}.fd-report-document th:first-child,.fd-report-document td:first-child{text-align:left}.fd-report-document a{color:#245979}.fd-report-document svg{width:100%;height:auto;min-width:0}.fd-report-document li{margin-bottom:8px}.fd-report-document small{font-size:11px}.fd-report-document figure{margin:16px 0}.fd-report-document figcaption{font-size:12px}.fd-report-document .fd-report-scroll{overflow-x:auto}.fd-report-document .fd-report-history-table{min-width:600px}@media print{@page{size:auto;margin:16mm}.fd-report-document{padding:0;font-size:11px}.fd-report-document h1{font-size:23px}.fd-report-document h2{font-size:17px;break-after:avoid}.fd-report-document h3{break-after:avoid}.fd-report-document tr,.fd-report-document figure{break-inside:avoid}.fd-report-document thead{display:table-header-group}.fd-report-document table{font-size:9px}.fd-report-document .fd-report-scroll{overflow:visible}.fd-report-document .fd-report-history-table{min-width:0;table-layout:fixed}.fd-report-document a{color:#202b36;text-decoration:underline}}";
  window.FundamentalWorkspace={create:function (ui) {
    var el=ui.el,node=ui.node,analysis=window.FundamentalAnalysis, notes=new Map();
    function field(id,data) { return (data || ui.current()).fields.find(function (f) { return f.id===id; }); }
    function saveFile(text,type,name) {
      var url=URL.createObjectURL(new Blob([text],{type:type})), a=node("a");
      a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); },1000);
    }
    function key() { return "gpmc-research-notes-v1:"+ui.current().cik; }
    function readNotes() {
      var id=key(); if (notes.has(id)) return notes.get(id);
      var record={values:{},updated:"",error:""};
      try {
        var raw=localStorage.getItem(id), parsed=raw ? JSON.parse(raw) : null;
        if (parsed) {
          if (parsed.version!==1 || !parsed.values || noteFields.some(function (f) { return typeof parsed.values[f[0]]!=="string" || parsed.values[f[0]].length>12000; })) throw new Error("Invalid saved notes");
          noteFields.forEach(function (f) { record.values[f[0]]=parsed.values[f[0]]; });
          record.updated=typeof parsed.updated==="string" ? parsed.updated : "";
        }
      } catch (_) { record.error="Saved notes could not be read. Edits will stay in this tab until browser storage works. Download a backup before closing."; }
      notes.set(id,record); return record;
    }
    function noteStatus(record) {
      el("notes-status").textContent=record.error || (record.updated ? "Saved on this device · "+new Date(record.updated).toLocaleString() : "No saved notes for this company yet.");
    }
    function renderNotes() {
      var record=readNotes();
      noteFields.forEach(function (f) { el("note-"+f[0]).value=record.values[f[0]] || ""; });
      noteStatus(record);
    }
    function saveNotes() {
      if (!ui.current()) return;
      var record=readNotes();
      noteFields.forEach(function (f) { record.values[f[0]]=el("note-"+f[0]).value; });
      record.updated=new Date().toISOString();
      try {
        localStorage.setItem(key(),JSON.stringify({version:1,values:record.values,updated:record.updated})); record.error="";
      } catch (_) { record.error="Not saved to this device. Your edits are still in this tab; download a backup before closing."; }
      noteStatus(record);
    }
    function allocation() {
      var list=ui.periods(), p=list[0];
      el("allocation-period").textContent=p ? ui.basisName()+" · "+p.start+" to "+p.end+" · USD unless indicated." : "No financial periods available for this reporting basis.";
      el("allocation-metrics").replaceChildren(); el("allocation-bars").replaceChildren(); el("allocation-table").replaceChildren();
      if (!p) return;
      analysis.allocation(p).forEach(function (m) {
        var card=node("div",null,"fd-metric"); card.appendChild(node("div",m.label,"fd-label"));
        card.appendChild(node("div",ui.compact(m.value,m.unit),"fd-number mono")); card.appendChild(node("p",m.formula,"fd-caption"));
        m.inputs.forEach(function (id) {
          if (!p.values[id]) return;
          var b=node("button",field(id).label,"fd-value"); b.type="button";
          b.addEventListener("click",function () { ui.source(id,p); }); card.appendChild(b);
        }); el("allocation-metrics").appendChild(card);
      });
      var cash=["ocf","capex","fcf","acquisitions",p.values.distributions ? "distributions" : "dividends","buybacks"];
      var max=Math.max.apply(null,[1].concat(cash.map(function (id) { return p.values[id] ? Math.abs(p.values[id].value) : 0; })));
      cash.forEach(function (id) {
        var v=p.values[id], row=node("div",null,"fd-allocation-bar"), label=node("div",field(id).label);
        label.appendChild(node("strong",ui.compact(v ? v.value : null,"USD"))); row.appendChild(label);
        var track=node("div",null,"fd-bar-track"), bar=node("span"); bar.style.width="0%";
        if (v) { bar.style.width=Math.abs(v.value)/max*100+"%"; if (v.value<0) bar.style.background="var(--bad)"; }
        track.setAttribute("aria-hidden","true"); track.appendChild(bar); row.appendChild(track); el("allocation-bars").appendChild(row);
      });
      var table=node("table",null,"fd-table"), head=node("thead"), row=node("tr"), first=node("th","Metric"); first.scope="col"; row.appendChild(first);
      list.forEach(function (period) { var th=node("th",period.end); th.scope="col"; th.appendChild(node("small","From "+period.start)); row.appendChild(th); });
      head.appendChild(row); table.appendChild(head); var body=node("tbody");
      allocationFields.forEach(function (id) {
        var f=field(id), tr=node("tr"), th=node("th",f.label); th.scope="row"; tr.appendChild(th);
        list.forEach(function (period) {
          var td=node("td"), v=period.values[id];
          if (v) { var b=node("button",ui.compact(v.value,f.unit),"fd-value"); b.type="button"; b.setAttribute("aria-label",f.label+", "+period.end+". View source"); b.addEventListener("click",function () { ui.source(id,period); }); td.appendChild(b); }
          else td.textContent="—";
          tr.appendChild(td);
        }); body.appendChild(tr);
      }); table.appendChild(body); el("allocation-table").appendChild(table);
    }
    function report() {
      var data=ui.current(), doc=node("article"), list=ui.periods(), p=list[0], sources=[], sourceMap=new Map(), calculations=new Set();
      function sourceRefs(value,label) {
        var refs=[];
        function walk(v) {
          if (!v) return;
          if (v.formula) calculations.add(label+": "+v.formula);
          if (/^https:\/\/www\.sec\.gov\//.test(v.url || "")) {
            if (!sourceMap.has(v.url)) { sources.push({url:v.url,filed:v.filed || "",label:label}); sourceMap.set(v.url,sources.length); }
            var n=sourceMap.get(v.url); if (refs.indexOf(n)<0) refs.push(n);
          }
          (v.inputs || v.sources || []).forEach(walk);
        }
        walk(value); return refs.length ? " ["+refs.join(", ")+"]" : "";
      }
      function financial(value,label,unit) { return ui.compact(value ? value.value : null,unit)+sourceRefs(value,label); }
      function heading(text) { doc.appendChild(node("h2",text)); }
      function paragraph(text) { doc.appendChild(node("p",text)); }
      function table(headers,rows,history) {
        var t=node("table",null,history ? "fd-report-history-table" : ""), head=node("thead"), tr=node("tr");
        headers.forEach(function (h) { var th=node("th",h); th.scope="col"; tr.appendChild(th); }); head.appendChild(tr); t.appendChild(head);
        var body=node("tbody"); rows.forEach(function (r) { var tr=node("tr"); r.forEach(function (v,i) { var td=node(i ? "td" : "th",v); if (!i) td.scope="row"; tr.appendChild(td); }); body.appendChild(tr); }); t.appendChild(body);
        var wrap=node("div",null,"fd-report-scroll"); wrap.appendChild(t); doc.appendChild(wrap);
      }
      function valuation(company) {
        var result=ui.valuationFor(company), period=ui.valuationPeriod(company);
        if (result.error) { paragraph(company.symbol+": "+result.error); return; }
        paragraph(company.symbol+" · Member-entered company-wide market cap: "+ui.compact(result.marketCap,"USD")+" as of "+result.date+". Financials: "+result.start+" to "+result.end+". This is an input, not a live quote.");
        table(["Valuation metric","Value"],result.metrics.map(function (m) {
          calculations.add(company.symbol+" · "+m.label+": "+m.formula);
          return [m.label,ui.format(m.value,m.unit)+sourceRefs(period.values[m.input],company.symbol+" · "+field(m.input,company).label)];
        }));
      }
      doc.appendChild(node("h1",data.name));
      paragraph(data.symbol+" · SEC CIK "+data.cik+" · "+(data.industry || "Industry unavailable"));
      paragraph("Company research report · Prepared "+new Date().toLocaleString()+"\nFinancial data retrieved "+data.retrievedAt+"\n"+ui.basisName()+" reporting basis"+(p ? " · latest period "+p.start+" to "+p.end : " · no supported periods"));
      paragraph("USD financials unless indicated. — means unavailable or not meaningful. Latest filed values may include restatements. Analyst notes and market-cap assumptions are member supplied.");
      if (el("report-history").checked) {
        heading("Financial history");
        if (!p) paragraph("No financial periods available for this reporting basis.");
        else {
          // Four periods keep the exported table legible on paper; all remain available in CSV.
          var history=list.slice(0,4), ids=["revenue","revenueGrowth","netIncome","netMargin","ocf","fcf"];
          paragraph("Most recent "+history.length+" periods. Growth compares the matching prior-year period.");
          table(["Metric"].concat(history.map(function (p) { return p.start+" to "+p.end; })),ids.map(function (id) {
            var f=field(id); return [f.label].concat(history.map(function (p) { return financial(p.values[id],data.symbol+" · "+f.label,f.unit); }));
          }),true);
          ui.chart(); var metric=field(el("trend-metric").value), figure=node("figure"), svg=el("chart").cloneNode(true); svg.removeAttribute("id"); figure.appendChild(svg);
          figure.appendChild(node("figcaption",ui.basisName()+" · "+metric.label+". "+list.map(function (p) { return p.end+sourceRefs(p.values[metric.id],data.symbol+" · "+metric.label); }).join("; "))); doc.appendChild(figure);
        }
      }
      if (el("report-allocation").checked) {
        heading("Capital allocation");
        if (!p) paragraph("No financial period available.");
        else {
          paragraph(p.start+" to "+p.end+". Cash outflows are separate uses, not a complete reconciliation. Stock compensation is noncash. Weighted diluted shares do not isolate buyback effects; splits and issuance can change the series. Debt is an ending balance, not net borrowing or total debt.");
          var rows=allocationFields.map(function (id) { var f=field(id); return [f.label,financial(p.values[id],data.symbol+" · "+f.label,f.unit)]; });
          analysis.allocation(p).forEach(function (m) {
            calculations.add(m.label+": "+m.formula);
            rows.push([m.label,ui.compact(m.value,m.unit)+m.inputs.map(function (id) { return sourceRefs(p.values[id],data.symbol+" · "+field(id).label); }).join("")]);
          }); table(["Metric","Latest period"],rows);
        }
      }
      if (el("report-peers").checked) {
        heading("Peer comparison");
        paragraph("Each company uses its own fiscal dates. Industry and accounting differences can affect comparisons. Valuation uses each company’s latest TTM or annual period, independently of the selected reporting basis.");
        var peers=ui.peers();
        if (!peers.length) paragraph("No peer comparison loaded. Add companies in Peer comparison to include them here.");
        if (el("peer-go").disabled) paragraph("Peer comparison is still loading; this report includes only the responses available now.");
        peers.forEach(function (entry) {
          var c=entry.data;
          if (!c) { paragraph(entry.symbol+": "+entry.error); return; }
          doc.appendChild(node("h3",c.symbol+" · "+c.name));
          var period=analysis.periods(c,el("basis").value)[0];
          paragraph((c.industry || "Industry unavailable")+" · "+(period ? period.start+" to "+period.end : "No period available")+" · Data retrieved "+c.retrievedAt);
          if (period) table(["Metric",ui.basisName()],["revenue","revenueGrowth","netMargin","fcf","fcfMargin","currentRatio","sbcRevenue"].map(function (id) { var f=field(id,c); return [f.label,financial(period.values[id],c.symbol+" · "+f.label,f.unit)]; }));
          valuation(c);
        });
      }
      if (el("report-valuation").checked) { heading("Valuation inputs & results"); valuation(data); }
      if (el("report-notes").checked) {
        heading("Analyst research notes"); var record=readNotes();
        paragraph(record.updated ? "Last edited "+record.updated : "No saved notes yet.");
        noteFields.forEach(function (f) { doc.appendChild(node("h3",f[1])); paragraph(record.values[f[0]] || "No notes entered."); });
      }
      if (el("report-forecast").checked && window.ForecastReport) doc.appendChild(window.ForecastReport(data));
      heading("Sources & calculation notes"); paragraph(data.methodology);
      doc.appendChild(ui.link("Full SEC filing history for "+data.symbol,data.secURL));
      var ol=node("ol"); sources.forEach(function (s) { var li=node("li"); li.appendChild(ui.link(s.label+(s.filed ? " · filed "+s.filed : "")+" · "+s.url,s.url)); ol.appendChild(li); }); doc.appendChild(ol);
      var ul=node("ul"); calculations.forEach(function (text) { ul.appendChild(node("li",text)); }); doc.appendChild(ul);
      el("report-preview").replaceChildren(doc);
    }
    function reportHTML() {
      report();
      var title=node("title",ui.current().symbol+" research report");
      return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"+title.outerHTML+"<style>"+reportCSS+"</style></head><body><main class=\"fd-report-document\">"+el("report-preview").innerHTML+"</main></body></html>";
    }
    function printReport() {
      report();
      var old=document.getElementById("fd-print-document"); if (old) old.remove();
      var printable=node("main",null,"fd-report-document"); printable.id="fd-print-document";
      printable.appendChild(el("report-preview").firstChild.cloneNode(true)); document.body.appendChild(printable);
      window.addEventListener("afterprint",function cleanup() { printable.remove(); window.removeEventListener("afterprint",cleanup); });
      window.print();
    }
    return {
      view:function (name) { if (name==="allocation") allocation(); if (name==="notes") renderNotes(); if (name==="report") report(); },
      attach:function () {
        var style=node("style",reportCSS); document.head.appendChild(style);
        noteFields.forEach(function (f) { el("note-"+f[0]).addEventListener("input",saveNotes); });
        el("notes-download").addEventListener("click",function () {
          var data=ui.current(), record=readNotes();
          var text=data.name+" ("+data.symbol+") · CIK "+data.cik+"\nResearch notes · "+(record.updated || "No edits yet")+"\n\n";
          text+=noteFields.map(function (f) { return "## "+f[1]+"\n\n"+(record.values[f[0]] || "No notes entered."); }).join("\n\n");
          saveFile(text,"text/markdown;charset=utf-8",data.symbol+"-research-notes.md");
        });
        ["history","allocation","peers","valuation","notes","forecast"].forEach(function (id) { el("report-"+id).addEventListener("change",report); });
        el("report-download").addEventListener("click",function () { saveFile(reportHTML(),"text/html;charset=utf-8",ui.current().symbol+"-research-report.html"); });
        el("report-print").addEventListener("click",printReport);
      }
    };
  }};
})();
