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
  ["buybacks", "Common share repurchases (cash outflow)", "cashflow", "PaymentsForRepurchaseOfCommonStock"],
  ["acquisitions", "Acquisitions, net of cash acquired (outflow)", "cashflow", "PaymentsToAcquireBusinessesNetOfCashAcquired"],
  ["da", "Depreciation, depletion & amortization", "cashflow", "DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment"]
].map(([id, label, section, ...tags]) => ({id, label, section, tags,
  unit: id === "eps" ? "USD/shares" : id === "shares" ? "shares" : "USD"}));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCN = /^\d{10}-\d{2}-\d{6}$/;
const annual = f => f && /^10-K(?:\/A)?$/.test(f.form) && DATE.test(f.end || "")
  && DATE.test(f.filed || "") && ACCN.test(f.accn || "") && Number.isFinite(f.val);
const days = (start, end) => (Date.parse(end) - Date.parse(start)) / 86400000;
const fullYear = f => annual(f) && DATE.test(f.start || "") && days(f.start, f.end) >= 320 && days(f.start, f.end) <= 400;
const newer = (a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn) || a.priority - b.priority;

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
      (gaap[tag]?.units?.[field.unit] || []).filter(annual).map(f => ({...f, tag, priority}))).sort(newer);
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
      const match = candidates[field.id].find(f => f.end === p.end &&
        (field.section === "balance" ? !f.start : f.start === p.start && fullYear(f)));
      values[field.id] = match ? {value: match.val, unit: field.unit, tag: "us-gaap:" + match.tag,
        start: match.start || null, end: match.end, filed: match.filed, form: match.form,
        accession: match.accn, url: filingURL(cik, match.accn), derived: false} : null;
    }
    return {start: p.start, end: p.end, values};
  });
  const ratioFields = [
    ["revenueGrowth", "Revenue growth", "ratio", "(Revenue / prior-year revenue) − 1; positive prior revenue required."],
    ["earningsGrowth", "Net income growth", "ratio", "(Net income / prior-year net income) − 1; positive prior net income required."],
    ["grossMargin", "Gross margin", "ratio", "Gross profit / revenue."],
    ["operatingMargin", "Operating margin", "ratio", "Operating income / revenue."],
    ["netMargin", "Net profit margin", "ratio", "Net income attributable to parent / revenue."],
    ["fcfMargin", "Free cash flow margin", "ratio", "(Operating cash flow − capital expenditures) / revenue."],
    ["roe", "Return on average equity", "ratio", "Net income / average beginning and ending parent equity; both equity balances must be positive."],
    ["roa", "Return on average assets", "ratio", "Net income / average beginning and ending assets; both asset balances must be positive."],
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
  history.forEach((p,i) => {
    const v = p.values;
    const prior = history[i+1];
    const previous = prior && days(prior.end, p.start) >= 1 && days(prior.end, p.start) <= 8 ? prior.values : {};
    function calc(id, inputs, fn) {
      const sources = inputs.map(([key, old]) => (old ? previous : v)[key]);
      const numbers = sources.map(x => x?.value);
      const value = sources.every(Boolean) ? fn(...numbers) : null;
      const field = [...derivedFields, ...ratioFields].find(x=>x.id===id);
      v[id] = Number.isFinite(value) ? {value, unit:field.unit, derived:true, formula:field.formula,
        inputs: inputs.map(([key, old],n)=>({id:key, period:old ? prior.end : p.end, value:sources[n].value,
          url:sources[n].url || null, sources:sources[n].inputs || null}))} : null;
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
    calc("roe", [["netIncome"],["equity"],["equity",true]], (a,b,c)=>b>0&&c>0 ? a/((b+c)/2) : null);
    calc("roa", [["netIncome"],["assets"],["assets",true]], (a,b,c)=>b>0&&c>0 ? a/((b+c)/2) : null);
  });
  const recent = submissions.filings?.recent || {};
  const filings = (recent.accessionNumber || []).map((accession,i)=>({accession, form:recent.form?.[i] || "",
    filed:recent.filingDate?.[i] || "", reportDate:recent.reportDate?.[i] || null,
    description:recent.primaryDocDescription?.[i] || "", url:filingURL(cik, accession)}))
    .filter(f=>f.url && /^(10-K|10-Q|8-K|20-F|40-F|6-K|DEF 14A|DEFA14A|SC 13D|SC 13G|3|4|5)(\/A)?$/.test(f.form))
    .sort((a,b)=>b.filed.localeCompare(a.filed));
  const hasAnnual = history.length > 0;
  const hasUSD = history.some(p=>p.values.revenue || p.values.netIncome || p.values.ocf);
  return {symbol, cik, name:submissions.name || facts.entityName || symbol,
    industry:submissions.sicDescription || "", sic:submissions.sic || "", exchanges:submissions.exchanges || [],
    fiscalYearEnd:submissions.fiscalYearEnd || "", retrievedAt,
    coverage: hasAnnual && hasUSD ? "annual-us-gaap-usd" : "filings-only",
    message:hasAnnual && hasUSD ? "" : "Standardized USD annual financials are unavailable for this issuer. Use its original filings below.",
    periods:history.slice(0,5), fields:[...FIELDS.map(({tags,...field})=>field),...derivedFields,...ratioFields], filings,
    secURL:"https://www.sec.gov/edgar/browse/?CIK="+Number(cik)+"&owner=exclude",
    methodology:"Latest reported annual values, including later comparative disclosures and amendments. Historical values may reflect restatements; this is not a point-in-time backtest dataset. Only standard US GAAP tags in USD are normalized. Missing values are not zero. Fiscal dates, not calendar years, define each column. Balance-sheet values are at period end; income and cash-flow values span the stated period. Company-specific line items, segment data and footnotes remain in the original filings."};
}
