import { requireToolsAuth } from "../lib/tools-auth.js";

const SYMBOL_OK = /^[A-Za-z0-9.:/\-]{1,16}$/;
const EXCHANGE_OK = /^[A-Za-z0-9 ._&()\-]{1,48}$/;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!(await requireToolsAuth(req, res))) return;
  const query = String(req.query.q || "").trim();
  if (query.length < 2 || query.length > 48 || /[\x00-\x1f\x7f]/.test(query)) {
    return res.status(400).json({ error: "Enter between 2 and 48 characters." });
  }
  if (!process.env.TWELVE_DATA_KEY) return res.status(503).json({ error: "Symbol search is unavailable." });
  try {
    const response = await fetch("https://api.twelvedata.com/symbol_search?symbol=" + encodeURIComponent(query)
      + "&outputsize=30&apikey=" + encodeURIComponent(process.env.TWELVE_DATA_KEY));
    const data = await response.json();
    if (!response.ok || data.status === "error" || !Array.isArray(data.data)) {
      const limited = response.status === 429 || Number(data.code) === 429 || /credit|quota|minute|rate limit/i.test(data.message || "");
      if (limited) res.setHeader("Retry-After", "60");
      return res.status(limited ? 429 : 502).json({ error: "More symbol suggestions are temporarily unavailable." });
    }
    const seen = new Set();
    const results = [];
    for (const row of data.data) {
      if (!row || typeof row !== "object") continue;
      const symbol = String(row.symbol || "").toUpperCase();
      if (!SYMBOL_OK.test(symbol)) continue;
      const type = String(row.instrument_type || "Instrument").slice(0, 60);
      const exchange = /commodity|physical currency/i.test(type) ? "" : String(row.exchange || "");
      if (exchange && !EXCHANGE_OK.test(exchange)) continue;
      const id = symbol + "|" + exchange;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({symbol, exchange, name: String(row.instrument_name || symbol).slice(0, 160),
        type, country: String(row.country || "").slice(0, 60)});
      if (results.length === 12) break;
    }
    return res.status(200).json({results});
  } catch (_) {
    return res.status(502).json({ error: "More symbol suggestions are temporarily unavailable." });
  }
}
