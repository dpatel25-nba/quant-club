// Fama-French factors, served to the browser as JSON.
//
// WHY THE ACADEMIC FACTORS RATHER THAN FACTOR ETFs. It would be easier to proxy
// momentum with MTUM and value with VLUE, but those are long-only funds: each
// one carries the market inside it, so regressing against them mostly measures
// market beta several times over, and their mutual correlations make the
// loadings unstable. The Fama-French factors are long-short and market-neutral
// by construction, which is what makes a loading interpretable. They also ship
// the RISK-FREE RATE, so excess returns and Sharpe ratios stop needing a
// hand-waved zero.
//
// The library publishes ZIPs, and this runs with no npm dependencies, so the
// archive is unpacked by hand: a ZIP local file header is a fixed 30 bytes,
// then the name, then extra, then a raw deflate stream that Node's zlib can
// inflate directly. Verified against the real files before this was written.
//
// The data lags by a few weeks — it is rebuilt from CRSP monthly — so recent
// days are absent. That is a property of the source, and the response says how
// fresh it is rather than letting a stale end date pass unnoticed.

import zlib from "node:zlib";

const BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/";
const FILES = {
  ff: "F-F_Research_Data_Factors_daily_CSV.zip",
  mom: "F-F_Momentum_Factor_daily_CSV.zip",
};

function unzipSingle(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip");
  const method = buf.readUInt16LE(8);
  const csize = buf.readUInt32LE(18);
  const nlen = buf.readUInt16LE(26);
  const elen = buf.readUInt16LE(28);
  const start = 30 + nlen + elen;
  const data = csize ? buf.subarray(start, start + csize) : buf.subarray(start);
  // 8 = deflate, which is what this library uses; 0 = stored, handled for safety
  return (method === 8 ? zlib.inflateRawSync(data) : data).toString("latin1");
}

// Rows are YYYYMMDD followed by numbers in PERCENT. The file also carries an
// annual table below the daily one, so parsing stops at the first row that is
// not a date — reading on would silently mix frequencies.
function parseTable(csv) {
  const lines = csv.split(/\r?\n/);
  let i = lines.findIndex(l => /^\s*\d{8},/.test(l));
  if (i < 0) throw new Error("no daily rows");
  const header = (lines[i - 1] || "").split(",").slice(1).map(s => s.trim());
  const out = {};
  for (; i < lines.length && /^\s*\d{8},/.test(lines[i]); i++) {
    const parts = lines[i].split(",");
    const d = parts[0].trim();
    const iso = d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
    const vals = parts.slice(1).map(v => parseFloat(v) / 100);   // percent -> decimal
    if (vals.some(v => !isFinite(v) || v < -0.99)) continue;     // -99.99 = missing
    out[iso] = vals;
  }
  return { header, rows: out };
}

// The UI gate is convenience; THIS is the gate. A password living in page
// JavaScript can be read by anyone with View Source, so the tools are also shut
// here, where the check cannot be edited away in a browser. Set TOOLS_PASSWORD
// in Vercel to change it — and do change it if this repository is public, since
// the fallback below is readable on GitHub.
function gated(req, res) {
  const want = process.env.TOOLS_PASSWORD || "mikeyscheese";
  const got = String(req.query.k || "");
  if (got === want) return false;
  res.status(401).json({ error: "This tool is for club members. Enter the "
                              + "password on the Research Tools tab." });
  return true;
}

export default async function handler(req, res) {
  if (gated(req, res)) return;
  try {
    const [ffBuf, momBuf] = await Promise.all(
      Object.values(FILES).map(f =>
        fetch(BASE + f, { headers: { "User-Agent": "quant-club research" } })
          .then(r => {
            if (!r.ok) throw new Error("factor library returned " + r.status);
            return r.arrayBuffer();
          })
          .then(a => Buffer.from(a))));

    const ff = parseTable(unzipSingle(ffBuf));
    const mom = parseTable(unzipSingle(momBuf));

    const dates = Object.keys(ff.rows).filter(d => mom.rows[d]).sort();
    if (!dates.length) throw new Error("no overlapping dates");

    // Mkt-RF, SMB, HML, RF  +  Mom
    const iMkt = ff.header.findIndex(h => /mkt/i.test(h));
    const iSMB = ff.header.findIndex(h => /smb/i.test(h));
    const iHML = ff.header.findIndex(h => /hml/i.test(h));
    const iRF = ff.header.findIndex(h => /^rf$/i.test(h));

    const out = dates.map(d => ({
      t: d,
      mkt: ff.rows[d][iMkt],
      smb: ff.rows[d][iSMB],
      hml: ff.rows[d][iHML],
      rf: ff.rows[d][iRF],
      mom: mom.rows[d][0],
    }));

    // Rebuilt monthly from CRSP, so this is cached for a day; the response
    // states its own last date so staleness is visible rather than implied.
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({
      source: "Kenneth R. French Data Library, daily",
      factors: ["mkt", "smb", "hml", "mom"],
      note: "Long-short and market-neutral by construction. mkt is the market "
          + "MINUS the risk-free rate. Values are decimals, not percent. rf is "
          + "the daily risk-free rate.",
      first: out[0].t,
      last: out[out.length - 1].t,
      count: out.length,
      rows: out,
    });
  } catch (e) {
    return res.status(502).json({ error: "Could not load the factor library.",
                                 detail: String(e.message || e) });
  }
}
