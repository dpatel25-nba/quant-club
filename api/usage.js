import { requireToolsAuth } from "../lib/tools-auth.js";
// Diagnostic endpoint: what plan does the provider think this key is on?
//
// After upgrading a plan it is easy to be looking at the wrong thing — a
// browser serving a cached error, a key that was never updated, a plan that has
// not propagated. Rather than guess, this asks the provider directly and
// reports the credit limit it applies to OUR key.
//
// Visit /api/usage on the deployed site. It never returns the key itself.

const PROVIDER = "https://api.twelvedata.com";

export default async function handler(req, res) {
  if (!(await requireToolsAuth(req, res))) return;
  const key = process.env.TWELVE_DATA_KEY;
  if (!key) {
    return res.status(500).json({ error: "No TWELVE_DATA_KEY is set on the server." });
  }
  try {
    const r = await fetch(`${PROVIDER}/api_usage?apikey=${key}`);
    const j = await r.json();
    // Strip the key from anything echoed back before it leaves the server.
    const clean = JSON.parse(JSON.stringify(j).split(key).join("***"));

    // Never cache a diagnostic: the whole point is to see the state right now.
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      reading: "what the data provider reports for the key this server is using",
      key_tail: "..." + String(key).slice(-4),   // enough to tell two keys apart
      provider: clean,
      // plan_category is the definitive field: it names the tier outright.
      // plan_limit is credits per MINUTE, so a small number there means a
      // small plan regardless of what the billing page says.
      hint: "Read plan_category first — it names the tier. plan_limit is credits "
          + "per MINUTE. If plan_category is not the tier you paid for, the "
          + "upgrade has not reached THIS key.",
    });
  } catch (e) {
    return res.status(502).json({ error: "Could not reach the data provider." });
  }
}
