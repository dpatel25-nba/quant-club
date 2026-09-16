import { requireToolsAuth } from "../lib/tools-auth.js";
import { normalizeFinancials } from "../lib/sec-financials.js";

const cache = new Map();
const pending = new Map();
let nextRequest = 0;
const ROOT = "https://data.sec.gov/";

async function secJSON(url, ttl) {
  const cached = cache.get(url);
  if (cached && cached.until > Date.now()) return cached.data;
  if (pending.has(url)) return pending.get(url);
  const request = (async () => {
    // Four requests/second per warm instance; deduplicate simultaneous reads.
    const wait = Math.max(0, nextRequest - Date.now());
    nextRequest = Date.now() + wait + 250;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {signal:controller.signal, headers:{
        "User-Agent":process.env.SEC_USER_AGENT || "GPMC Research https://quant-club.vercel.app/",
        "Accept":"application/json"}});
      if (!response.ok) {
        const e = new Error("SEC unavailable"); e.status = response.status; throw e;
      }
      const data = await response.json();
      if (cache.size >= 25) cache.delete(cache.keys().next().value);
      cache.set(url,{data,until:Date.now()+ttl});
      return data;
    } finally { clearTimeout(timer); }
  })();
  pending.set(url,request);
  try { return await request; } finally { pending.delete(url); }
}

export default async function handler(req,res) {
  res.setHeader("Cache-Control","private, no-store");
  if (req.method !== "GET") { res.setHeader("Allow","GET"); return res.status(405).json({error:"Method not allowed."}); }
  if (!(await requireToolsAuth(req, res))) return;
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";
  if (query ? query.length<2 || query.length>48 || /[\x00-\x1f\x7f]/.test(query) : !/^[A-Z0-9.\-]{1,16}$/.test(symbol)) {
    return res.status(400).json({error:"Enter a company ticker, or search by company name. Commodity prices and currency pairs have no corporate financial statements."});
  }
  try {
    const tickers = await secJSON("https://www.sec.gov/files/company_tickers.json",86400000);
    const companies = Object.values(tickers).filter(c=>c && typeof c.ticker==="string" && typeof c.title==="string" && /^\d{1,10}$/.test(String(c.cik_str)));
    if (query) {
      const q = query.toUpperCase();
      const rank = c=>c.ticker===q ? 0 : c.ticker.startsWith(q) ? 1 : c.title.toUpperCase().startsWith(q) ? 2 : 3;
      const results = companies.filter(c=>(c.ticker+" "+c.title).toUpperCase().includes(q))
        .sort((a,b)=>rank(a)-rank(b) || a.ticker.localeCompare(b.ticker)).slice(0,10)
        .map(c=>({symbol:c.ticker,name:c.title,cik:String(c.cik_str).padStart(10,"0"),type:"SEC issuer",exchange:"",country:""}));
      return res.status(200).json({results});
    }
    const company = companies.find(c=>c.ticker===symbol) || companies.find(c=>c.ticker===symbol.replace(/\./g,"-"));
    if (!company) return res.status(404).json({error:"No SEC company matches this ticker. Search by company name or use its U.S. listing. Spot commodities, currencies and most funds do not have comparable corporate statements."});
    const cik = String(company.cik_str).padStart(10,"0");
    const submissions = await secJSON(ROOT+"submissions/CIK"+cik+".json",900000);
    let facts;
    try { facts = await secJSON(ROOT+"api/xbrl/companyfacts/CIK"+cik+".json",900000); }
    catch(e) { if (e.status!==404) throw e; facts={}; }
    if (String(submissions.cik).replace(/^0+/,"") !== String(company.cik_str).replace(/^0+/,"")
      || (facts.cik && String(facts.cik).replace(/^0+/,"") !== String(company.cik_str).replace(/^0+/,""))) throw new Error("Issuer mismatch");
    const data = normalizeFinancials(facts, submissions, company.ticker, new Date().toISOString());
    return res.status(200).json(data);
  } catch(e) {
    const limited = e.status===429 || e.status===403;
    if (limited) res.setHeader("Retry-After","60");
    return res.status(limited ? 503 : 502).json({error:limited
      ? "SEC data access is temporarily unavailable. Please try again in a minute."
      : "Could not retrieve SEC financial data. Please try again shortly."});
  }
}
