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
  window.FundamentalAnalysis={periods:periods,valuation:valuation,filedDate:filedDate};
})();
