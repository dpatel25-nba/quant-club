(function () {
  "use strict";
  function periods(data,basis) { return data ? (basis==="annual" ? data.periods : data[basis]) || [] : []; }
  function filedDate(value) {
    if (!value) return "";
    return [value.filed || ""].concat((value.inputs || value.sources || []).map(filedDate)).sort().pop();
  }
  function valuation(period, marketCap, date, today) {
    if (!period) return {error:"A complete annual or trailing 12-month period is needed for valuation."};
    if (period.kind==="quarterly") return {error:"Valuation requires annual or trailing 12-month financials, not a single quarter."};
    if (!Number.isFinite(marketCap) || marketCap<=0) return {error:"Enter a positive company-wide market capitalization."};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || (today && date>today)) return {error:"Enter a valid market-cap date no later than today."};
    var v=period.values, inputs=["netIncome","revenue","fcf","equity"];
    var latest=inputs.map(function (id) { return filedDate(v[id]); }).concat(period.end).sort().pop();
    if (date<latest) return {error:"Use a market-cap date on or after " + latest + ", when these financial inputs were available."};
    var metrics=[
      ["earningsMultiple","Market cap / net income","netIncome","multiple","Company-wide market capitalization / net income attributable to the parent. Not adjusted for preferred dividends; this may differ from quoted P/E."],
      ["salesMultiple","Price / sales","revenue","multiple","Company-wide market capitalization / revenue."],
      ["fcfYield","Free cash flow yield","fcf","ratio","Free cash flow / company-wide market capitalization. Negative values indicate negative free cash flow."],
      ["bookMultiple","Price / book","equity","multiple","Company-wide market capitalization / parent shareholders’ equity."
    ]].map(function (row) {
      var f=v[row[2]], x=f ? f.value : null;
      return {id:row[0],label:row[1],input:row[2],unit:row[3],formula:row[4],
        value:x==null ? null : row[0]==="fcfYield" ? x/marketCap : x>0 ? marketCap/x : null};
    });
    return {marketCap:marketCap,date:date,start:period.start,end:period.end,metrics:metrics};
  }
  function allocation(period) {
    var v=period ? period.values : {};
    function value(id) { return v[id] && Number.isFinite(v[id].value) ? v[id].value : null; }
    var dividendInput=value("distributions")!=null ? "distributions" : "dividends";
    var dividends=value(dividendInput), buybacks=value("buybacks"), fcf=value("fcf");
    var returned=dividends!=null && buybacks!=null && dividends>=0 && buybacks>=0 ? dividends+buybacks : null;
    var payoutFormula=dividendInput==="distributions" ? "Reported dividends and distributions, which can include common, preferred and noncontrolling holders, plus common share repurchases." : "Common dividends paid + common share repurchases. Broader dividends/distributions are unavailable; this covers common holders only.";
    // LongTermDebt already includes its current portion. Never add it again.
    var debt=value("longDebt"), debtInputs=["longDebt"];
    if (debt==null) {
      var current=value("currentLongDebt"), noncurrent=value("noncurrentDebt");
      debt=current!=null && noncurrent!=null ? current+noncurrent : null;
      debtInputs=["currentLongDebt","noncurrentDebt"];
    }
    return [
      {label:"Dividends, distributions + buybacks",value:returned,unit:"USD",inputs:[dividendInput,"buybacks"],formula:payoutFormula+" Both inputs must be available and nonnegative."},
      {label:"Payouts / free cash flow",value:returned!=null && fcf>0 ? returned/fcf : null,unit:"ratio",inputs:[dividendInput,"buybacks","fcf"],formula:payoutFormula+" Divided by positive free cash flow. Above 100% means these outflows exceed this period’s FCF; it does not identify their funding source."},
      {label:"Long-term debt, including current portion",value:debt,unit:"USD",inputs:debtInputs,formula:"Reported long-term debt including current portion, or current plus noncurrent long-term debt when both are available. An ending balance, not net borrowing or total debt."}
    ];
  }
  window.FundamentalAnalysis={periods:periods,valuation:valuation,filedDate:filedDate,allocation:allocation};
})();
