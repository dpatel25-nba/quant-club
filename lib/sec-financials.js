// Period-aware normalization of SEC Company Facts. Monetary fields use USD;
// no currency conversion or implicit zero filling is performed.
export const FIELDS = [
  ["revenue", "Revenue", "income", "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  ["costRevenue", "Cost of revenue", "income", "CostOfRevenue", "CostOfGoodsAndServicesSold"],
  ["grossProfit", "Gross profit", "income", "GrossProfit"],
  ["rd", "Research & development", "income", "ResearchAndDevelopmentExpense"],
  ["sga", "Selling, general & administrative", "income", "SellingGeneralAndAdministrativeExpense"],
  ["operatingIncome", "Operating income", "income", "OperatingIncomeLoss"],
  ["interest", "Interest expense", "income", "InterestExpense", "InterestAndDebtExpense"],
  ["pretax", "Income before tax", "income", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
  ["tax", "Income tax expense / benefit", "income", "IncomeTaxExpenseBenefit"],
  ["netIncome", "Net income attributable to parent", "income", "NetIncomeLoss"],
  ["eps", "Diluted earnings per share", "income", "EarningsPerShareDiluted"],
  ["shares", "Weighted average diluted shares", "income", "WeightedAverageNumberOfDilutedSharesOutstanding"],
  ["cash", "Cash & cash equivalents", "balance", "CashAndCashEquivalentsAtCarryingValue"],
  ["investments", "Short-term investments", "balance", "ShortTermInvestments", "MarketableSecuritiesCurrent"],
  ["receivables", "Accounts receivable, net", "balance", "AccountsReceivableNetCurrent"],
  ["inventory", "Inventory", "balance", "InventoryNet"],
  ["currentAssets", "Current assets", "balance", "AssetsCurrent"],
  ["ppe", "Property, plant & equipment, net", "balance", "PropertyPlantAndEquipmentNet"],
  ["goodwill", "Goodwill", "balance", "Goodwill"],
  ["assets", "Total assets", "balance", "Assets"],
  ["payables", "Accounts payable", "balance", "AccountsPayableCurrent"],
  ["currentLiabilities", "Current liabilities", "balance", "LiabilitiesCurrent"],
  ["shortDebt", "Short-term borrowings", "balance", "ShortTermBorrowings"],
  ["commercialPaper", "Commercial paper", "balance", "CommercialPaper"],
  ["currentLongDebt", "Current portion of long-term debt", "balance", "LongTermDebtCurrent"],
  ["noncurrentDebt", "Noncurrent long-term debt", "balance", "LongTermDebtNoncurrent"],
  ["longDebt", "Long-term debt, including current portion", "balance", "LongTermDebt"],
  ["liabilities", "Total liabilities", "balance", "Liabilities"],
  ["equity", "Shareholders’ equity attributable to parent", "balance", "StockholdersEquity"],
  ["retained", "Retained earnings / accumulated deficit", "balance", "RetainedEarningsAccumulatedDeficit"],
  ["ocf", "Operating cash flow", "cashflow", "NetCashProvidedByUsedInOperatingActivities"],
  ["capex", "Capital expenditures (cash outflow)", "cashflow", "PaymentsToAcquirePropertyPlantAndEquipment"],
  ["investing", "Investing cash flow", "cashflow", "NetCashProvidedByUsedInInvestingActivities"],
  ["financing", "Financing cash flow", "cashflow", "NetCashProvidedByUsedInFinancingActivities"],
  ["sbc", "Share-based compensation", "cashflow", "ShareBasedCompensation"],
  ["dividends", "Common dividends paid (cash outflow)", "cashflow", "PaymentsOfDividendsCommonStock"],
  ["distributions", "Dividends & distributions paid (cash outflow)", "cashflow", "PaymentsOfDividends"],
  ["buybacks", "Common share repurchases (cash outflow)", "cashflow", "PaymentsForRepurchaseOfCommonStock"],
  ["acquisitions", "Acquisitions, net of cash acquired (outflow)", "cashflow", "PaymentsToAcquireBusinessesNetOfCashAcquired"],
  ["da", "Depreciation, depletion & amortization", "cashflow", "DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment"]
].map(([id, label, section, ...tags]) => ({id, label, section, tags,
  unit: id === "eps" ? "USD/shares" : id === "shares" ? "shares" : "USD"}));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCN = /^\d{10}-\d{2}-\d{6}$/;
const reported = f => f && /^10-[KQ](?:\/A)?$/.test(f.form) && DATE.test(f.end || "")
  && DATE.test(f.filed || "") && ACCN.test(f.accn || "") && Number.isFinite(f.val);
const annual = f => reported(f) && /^10-K(?:\/A)?$/.test(f.form);
const days = (start, end) => (Date.parse(end) - Date.parse(start)) / 86400000;
const fullYear = f => annual(f) && DATE.test(f.start || "") && days(f.start, f.end) >= 320 && days(f.start, f.end) <= 400;
const newer = (a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn) || a.priority - b.priority;
const nextDay = date => new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
const quarterLength = (start,end) => days(start,end)>=70 && days(start,end)<=110;

function reportedValue(f, field, cik) {
  return f ? {value:f.val, unit:field.unit, tag:"us-gaap:"+f.tag, start:f.start || null,
    end:f.end, filed:f.filed, form:f.form, accession:f.accn, url:filingURL(cik,f.accn), derived:false} : null;
}
function commonShareSnapshots(facts, submissions, cik) {
  const tickers = [...new Set((submissions.tickers || []).filter(t=>typeof t==="string").map(t=>t.toUpperCase()))];
  // Do not guess which share class an entity-wide fact represents.
  if (tickers.length!==1) return [];
  const rows=(facts.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares || [])
    .filter(f=>reported(f) && !f.start && f.val>0 && f.end<=f.filed)
    .sort((a,b)=>b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));
  const result=[], seen=new Set();
  for (const f of rows) {
    if (seen.has(f.end)) continue;
    seen.add(f.end);
    if (rows.some(r=>r.end===f.end && r.filed===f.filed && r.val!==f.val)) continue;
    result.push({value:f.val,unit:"shares",tag:"dei:EntityCommonStockSharesOutstanding",end:f.end,
      filed:f.filed,form:f.form,accession:f.accn,url:filingURL(cik,f.accn),derived:false,symbol:tickers[0]});
    if (result.length===12) break;
  }
  return result;
}
function inputSource(id, value, period) {
  return {id,period,value:value.value,unit:value.unit,tag:value.tag || null,filed:value.filed || null,
    url:value.url || null,sources:value.inputs || null};
}
function combined(field, values, periods, formula, fn) {
  if (!values.every(Boolean)) return null;
  const value=fn(...values.map(v=>v.value));
  return Number.isFinite(value) ? {value,unit:field.unit,derived:true,formula,
    inputs:values.map((v,i)=>inputSource(field.id,v,periods[i]))} : null;
}

function interimPeriods(candidates, cik, annualHistory) {
  const anchors=new Map();
  const add=(start,end,id)=>{
    if (!quarterLength(start,end)) return;
    const key=start+"/"+end;
    if (!anchors.has(key)) anchors.set(key,{start,end,anchors:new Set()});
    anchors.get(key).anchors.add(id);
  };
  const duration={};
  for (const field of FIELDS) {
    // Keep latest values per tag/period so a cumulative difference cannot
    // combine different concepts or accidentally select an older duplicate.
    const seen=new Set();
    duration[field.id]=candidates[field.id].filter(f=>{
      const key=f.tag+"/"+f.start+"/"+f.end;
      if (!DATE.test(f.start || "") || days(f.start,f.end)<70 || days(f.start,f.end)>400 || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  for (const id of ["revenue","netIncome","ocf"]) {
    for (const f of duration[id]) {
      add(f.start,f.end,id);
      for (const before of duration[id]) {
        if (before.start===f.start && before.tag===f.tag && before.end<f.end) add(nextDay(before.end),f.end,id);
      }
    }
  }
  const chosen=[];
  for (const p of [...anchors.values()].sort((a,b)=>b.end.localeCompare(a.end)||b.anchors.size-a.anchors.size)) {
    if (chosen.some(x=>p.end>=x.start)) continue;
    chosen.push(p); if (chosen.length===24) break;
  }
  const quarterly=chosen.map(p=>{
    const values={};
    for (const field of FIELDS) {
      const rows=candidates[field.id];
      const direct=rows.find(f=>f.end===p.end && (field.section==="balance" ? !f.start : f.start===p.start));
      values[field.id]=reportedValue(direct,field,cik);
      if (direct || field.section==="balance" || field.unit!=="USD") continue;
      for (const f of duration[field.id].filter(f=>f.end===p.end && f.start<p.start)) {
        const before=duration[field.id].find(b=>b.tag===f.tag && b.start===f.start && nextDay(b.end)===p.start);
        if (!before) continue;
        values[field.id]=combined(field,[reportedValue(f,field,cik),reportedValue(before,field,cik)],
          [f.start+" to "+f.end,before.start+" to "+before.end],
          "Single quarter = longer cumulative period minus the earlier cumulative period. Matching start date, currency and XBRL tag; components may come from different filings.",(a,b)=>a-b);
        break;
      }
    }
    return {start:p.start,end:p.end,kind:"quarterly",values};
  });
  const ttm=[];
  for (let i=0;i<quarterly.length;i++) {
    const quarters=quarterly.slice(i,i+4);
    if (quarters.length!==4 || !quarters.slice(0,3).every((q,j)=>nextDay(quarters[j+1].end)===q.start)) continue;
    const start=quarters[3].start,end=quarters[0].end;
    if (days(start,end)<350 || days(start,end)>380) continue;
    const values={};
    for (const field of FIELDS) {
      const exact=candidates[field.id].find(f=>f.start===start && f.end===end);
      values[field.id]=field.section==="balance" ? quarters[0].values[field.id]
        : exact ? reportedValue(exact,field,cik)
        : field.unit==="USD" ? combined(field,quarters.map(q=>q.values[field.id]),quarters.map(q=>q.start+" to "+q.end),
          "Trailing 12 months = sum of four consecutive, non-overlapping fiscal quarters.",(...v)=>v.reduce((a,b)=>a+b,0)) : null;
    }
    ttm.push({start,end,kind:"ttm",values});
  }
  // A reported full year is also a 12-month period, even if its quarter
  // components are missing. Do not relabel it as ending at a newer quarter.
  for (const p of annualHistory) if (days(p.start,p.end)>=350 && days(p.start,p.end)<=380 && !ttm.some(t=>t.end===p.end)) ttm.push({...p,kind:"ttm",values:{...p.values}});
  ttm.sort((a,b)=>b.end.localeCompare(a.end));
  return {quarterly,ttm};
}

export function filingURL(cik, accn) {
  return /^\d{1,10}$/.test(String(cik)) && ACCN.test(accn || "")
    ? "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/" + accn.replace(/-/g, "") + "/" + accn + "-index.html" : null;
}

export function normalizeFinancials(facts, submissions, symbol, retrievedAt) {
  const gaap = facts?.facts?.["us-gaap"] || {};
  const cik = String(submissions.cik || "").padStart(10, "0");
  const candidates = {};
  for (const field of FIELDS) {
    candidates[field.id] = field.tags.flatMap((tag, priority) =>
      (gaap[tag]?.units?.[field.unit] || []).filter(reported).map(f => ({...f, tag, priority}))).sort(newer);
  }
  // Anchor periods by their actual start/end dates, never the filing's fy/fp:
  // a 2025 filing can include 2023 and 2024 comparative values.
  const periods = new Map();
  for (const id of ["revenue", "netIncome", "ocf"]) {
    for (const f of candidates[id].filter(fullYear)) {
      const key = f.start + "/" + f.end;
      if (!periods.has(key)) periods.set(key, {start: f.start, end: f.end, anchors: new Set(), filed: f.filed});
      const p = periods.get(key); p.anchors.add(id);
      if (f.filed > p.filed) p.filed = f.filed;
    }
  }
  const chosen = [];
  for (const p of [...periods.values()].sort((a,b) => b.end.localeCompare(a.end) || b.anchors.size-a.anchors.size || b.filed.localeCompare(a.filed))) {
    if (chosen.some(x => p.end >= x.start)) continue; // exclude alternate or overlapping fiscal periods
    chosen.push(p);
    if (chosen.length === 6) break; // sixth year supplies the fifth year's growth / average balances
  }
  const history = chosen.map(p => {
    const values = {};
    for (const field of FIELDS) {
      const match = candidates[field.id].find(f => annual(f) && f.end === p.end &&
        (field.section === "balance" ? !f.start : f.start === p.start && fullYear(f)));
      values[field.id] = reportedValue(match,field,cik);
    }
    return {start: p.start, end: p.end, kind:"annual", values};
  });
  const interim=interimPeriods(candidates,cik,history);
  const ratioFields = [
    ["revenueGrowth", "Revenue growth (year over year)", "ratio", "(Revenue / matching prior-year period revenue) − 1; positive prior revenue required."],
    ["earningsGrowth", "Net income growth (year over year)", "ratio", "(Net income / matching prior-year period net income) − 1; positive prior net income required."],
    ["grossMargin", "Gross margin", "ratio", "Gross profit / revenue."],
    ["operatingMargin", "Operating margin", "ratio", "Operating income / revenue."],
    ["netMargin", "Net profit margin", "ratio", "Net income attributable to parent / revenue."],
    ["fcfMargin", "Free cash flow margin", "ratio", "(Operating cash flow − capital expenditures) / revenue."],
    ["roe", "Return on average equity", "ratio", "Period net income / average beginning and ending parent equity; both balances must be positive. Quarterly returns are not annualized."],
    ["roa", "Return on average assets", "ratio", "Period net income / average beginning and ending assets; both balances must be positive. Quarterly returns are not annualized."],
    ["currentRatio", "Current ratio", "multiple", "Current assets / current liabilities."],
    ["cashRatio", "Cash ratio", "multiple", "Cash and cash equivalents / current liabilities; excludes investments."],
    ["liabilitiesEquity", "Liabilities / equity", "multiple", "Total liabilities / parent equity. This is not debt / equity."],
    ["cashConversion", "Operating cash flow / net income", "multiple", "Operating cash flow / net income; positive net income required."],
    ["capexRevenue", "Capital expenditures / revenue", "ratio", "Cash capital expenditures / revenue."],
    ["rdRevenue", "R&D / revenue", "ratio", "Research and development expense / revenue."],
    ["sbcRevenue", "Share-based compensation / revenue", "ratio", "Share-based compensation / revenue."]
  ].map(([id,label,unit,formula]) => ({id,label,unit,formula,section:"ratios"}));
  const derivedFields = [
    {id:"fcf", label:"Free cash flow (calculated)", section:"cashflow", unit:"USD", formula:"Operating cash flow − capital expenditures. A club calculation, not a company-defined non-GAAP measure."},
    {id:"workingCapital", label:"Working capital (calculated)", section:"balance", unit:"USD", formula:"Current assets − current liabilities."}
  ];
  function enrich(series) { series.forEach((p,i) => {
    const v = p.values;
    const prior = p.kind==="annual" ? series[i+1] : series.find(q=>days(q.end,p.end)>=350 && days(q.end,p.end)<=380 && Math.abs(days(q.start,p.start)-days(q.end,p.end))<=8);
    const previous = prior && (p.kind!=="annual" || (days(prior.end,p.start)>=1 && days(prior.end,p.start)<=8)) ? prior.values : {};
    const beginning={};
    for (const id of ["assets","equity"]) {
      const f=FIELDS.find(f=>f.id===id);
      beginning[id]=reportedValue(candidates[id].find(f=>!f.start && nextDay(f.end)===p.start && (p.kind!=="annual" || annual(f))),f,cik);
    }
    function calc(id, inputs, fn) {
      const sources = inputs.map(([key, old]) => (old==="begin" ? beginning : old ? previous : v)[key]);
      const numbers = sources.map(x => x?.value);
      const value = sources.every(Boolean) ? fn(...numbers) : null;
      const field = [...derivedFields, ...ratioFields].find(x=>x.id===id);
      v[id] = Number.isFinite(value) ? {value, unit:field.unit, derived:true, formula:field.formula,
        inputs: inputs.map(([key, old],n)=>inputSource(key,sources[n],old==="begin" ? sources[n].end : old ? prior.end : p.end))} : null;
    }
    const divide = (a,b) => b>0 ? a/b : null;
    calc("fcf", [["ocf"],["capex"]], (a,b)=>b>=0 ? a-b : null);
    calc("workingCapital", [["currentAssets"],["currentLiabilities"]], (a,b)=>a-b);
    calc("revenueGrowth", [["revenue"],["revenue",true]], (a,b)=>b>0 ? a/b-1 : null);
    calc("earningsGrowth", [["netIncome"],["netIncome",true]], (a,b)=>b>0 ? a/b-1 : null);
    for (const [id,a,b] of [["grossMargin","grossProfit","revenue"],["operatingMargin","operatingIncome","revenue"],
      ["netMargin","netIncome","revenue"],["fcfMargin","fcf","revenue"],["currentRatio","currentAssets","currentLiabilities"],
      ["cashRatio","cash","currentLiabilities"],["liabilitiesEquity","liabilities","equity"],["cashConversion","ocf","netIncome"],
      ["capexRevenue","capex","revenue"],["rdRevenue","rd","revenue"],["sbcRevenue","sbc","revenue"]]) calc(id,[[a],[b]],divide);
    calc("roe", [["netIncome"],["equity"],["equity","begin"]], (a,b,c)=>b>0&&c>0 ? a/((b+c)/2) : null);
    calc("roa", [["netIncome"],["assets"],["assets","begin"]], (a,b,c)=>b>0&&c>0 ? a/((b+c)/2) : null);
  }); }
  enrich(history); enrich(interim.quarterly); enrich(interim.ttm);
  const recent = submissions.filings?.recent || {};
  const filings = (recent.accessionNumber || []).map((accession,i)=>({accession, form:recent.form?.[i] || "",
    filed:recent.filingDate?.[i] || "", reportDate:recent.reportDate?.[i] || null,
    description:recent.primaryDocDescription?.[i] || "", url:filingURL(cik, accession)}))
    .filter(f=>f.url && /^(10-K|10-Q|8-K|20-F|40-F|6-K|DEF 14A|DEFA14A|SC 13D|SC 13G|3|4|5)(\/A)?$/.test(f.form))
    .sort((a,b)=>b.filed.localeCompare(a.filed));
  const hasFinancials = history.length>0 || interim.quarterly.length>0;
  return {symbol, cik, name:submissions.name || facts.entityName || symbol,
    industry:submissions.sicDescription || "", sic:submissions.sic || "", exchanges:submissions.exchanges || [],
    fiscalYearEnd:submissions.fiscalYearEnd || "", retrievedAt,
    commonShareSnapshots:commonShareSnapshots(facts,submissions,cik),
    coverage: hasFinancials ? "us-gaap-usd" : "filings-only",
    message:hasFinancials ? "" : "Standardized USD financials are unavailable for this issuer. Use its original filings below.",
    quarterly:interim.quarterly.slice(0,8),ttm:interim.ttm.slice(0,8),
    periods:history.slice(0,5), fields:[...FIELDS.map(({tags,...field})=>field),...derivedFields,...ratioFields], filings,
    secURL:"https://www.sec.gov/edgar/browse/?CIK="+Number(cik)+"&owner=exclude",
    methodology:"Latest reported 10-K/10-Q values, including comparative disclosures and amendments; not a point-in-time backtest dataset. Only standard US GAAP tags in USD are normalized. Missing is not zero. Fiscal dates define each column. Cash-flow quarters and Q4 may be calculated by subtracting matching cumulative periods, potentially from different filings; restatements can affect comparability. TTM uses a reported full year or four consecutive quarters; balance sheets use the ending snapshot. EPS and weighted shares are never subtracted or summed; they remain unavailable without an exact reported period. Growth compares the matching prior-year period. Quarterly returns on equity/assets are not annualized. Custom line items, segments and footnotes remain in the original filings."};
}
