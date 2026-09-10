// Serverless proxy for market data (runs on Vercel, same account as the NBA site).
//
// The whole reason this file exists is the API key. A static page calling the
// data provider directly would have to ship the key in its JavaScript, where
// anyone can read it with View Source and spend the club's daily quota. Here the
// key lives in a Vercel environment variable, the browser only ever talks to
// this endpoint, and the key never leaves the server.
//
// It also solves two smaller problems for free: CORS (the browser is calling
// our own origin, so there is nothing to negotiate) and caching (identical
// lookups inside the cache window cost no API calls at all, which matters on a
// free tier of 800 requests a day).

const PROVIDER = "https://api.twelvedata.com";

// Each range maps to an interval and a number of points. Intraday intervals are
// deliberately coarse enough to stay inside the free tier's output limits while
// still drawing a readable line.
const RANGES = {
  "1h":  { interval: "1min",   outputsize: 60,   label: "past hour"    },
  "1d":  { interval: "5min",   outputsize: 78,   label: "past day"     },
  "1m":  { interval: "1day",   outputsize: 23,   label: "past month"   },
  "1y":  { interval: "1day",   outputsize: 252,  label: "past year"    },
  "5y":  { interval: "1week",  outputsize: 261,  label: "past 5 years" },
  "all": { interval: "1month", outputsize: 5000, label: "all time"     },
};

// A symbol is the only thing a visitor controls, so it is validated rather than
// interpolated. Letters, digits, dot and dash cover US tickers (BRK.B) and most
// international suffixes; anything else is rejected before a request is made.
const SYMBOL_OK = /^[A-Za-z0-9.\-]{1,12}$/;

export default async function handler(req, res) {
  const key = process.env.TWELVE_DATA_KEY;
  if (!key) {
    // Never echo configuration detail beyond the fact that it is missing.
    return res.status(500).json({ error: "Server is missing its data-provider key." });
  }

  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const range = String(req.query.range || "1y").toLowerCase();

  if (!SYMBOL_OK.test(symbol)) {
    return res.status(400).json({ error: "That does not look like a ticker symbol." });
  }
  const spec = RANGES[range];
  if (!spec) {
    return res.status(400).json({ error: `Unknown range "${range}".` });
  }

  // The quote endpoint costs a second credit. The client only asks for it when
  // the SYMBOL changes, because none of its fields depend on the chart range.
  const wantQuote = String(req.query.quote || "1") !== "0";

  const series = `${PROVIDER}/time_series?symbol=${encodeURIComponent(symbol)}`
    + `&interval=${spec.interval}&outputsize=${spec.outputsize}`
    + `&apikey=${key}`;
  const quote = `${PROVIDER}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`;

  try {
    const calls = wantQuote ? [fetch(series), fetch(quote)] : [fetch(series)];
    const done = await Promise.all(calls);
    const parsed = await Promise.all(done.map(r => r.json()));
    const sJson = parsed[0];
    const qJson = wantQuote ? parsed[1] : null;

    // The provider answers 200 with a body describing the problem, so status
    // alone is not enough to tell success from failure.
    if (sJson.status === "error" || !Array.isArray(sJson.values)) {
      // Never let the key reach the client, even inside a provider message.
      const raw = String(sJson.message || "").split(key).join("***");
      const perMinute = /minute/i.test(raw);
      const perDay = /day|daily/i.test(raw);
      const isLimit = perMinute || perDay || /credit|quota|limit/i.test(raw);
      let error;
      if (perMinute) {
        // The free plan allows 8 credits a minute. This clears on its own in
        // under a minute, which is a completely different situation from
        // exhausting the daily allowance — so say so.
        error = "Too many requests in the last minute. Wait about 60 seconds "
              + "and try again.";
      } else if (perDay) {
        error = "The daily data allowance is used up. It resets at midnight UTC.";
      } else if (isLimit) {
        error = "The data provider is rate limiting us. Wait a moment, then retry.";
      } else if (/api ?key|apikey|unauthor|invalid/i.test(raw)) {
        error = "The server's API key was rejected. Check TWELVE_DATA_KEY in "
              + "the Vercel settings, then redeploy.";
      } else {
        error = `No data for ${symbol} over the ${spec.label}.`;
      }
      return res.status(isLimit ? 429 : 404).json({ error, detail: raw || null });
    }

    // Provider returns newest-first; charts read left to right.
    const points = sJson.values
      .map(v => ({ t: v.datetime, c: Number(v.close), v: Number(v.volume || 0) }))
      .filter(p => Number.isFinite(p.c))
      .reverse();

    if (points.length < 2) {
      return res.status(404).json({ error: `Not enough history for ${symbol}.` });
    }

    // Cached at the edge. Intraday moves, so it is held briefly; daily and
    // longer series change once a day and can be held far longer. This is what
    // keeps a club's worth of lookups inside a free tier.
    const ttl = spec.interval.includes("min") ? 60 : 900;
    res.setHeader("Cache-Control",
      `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`);

    return res.status(200).json({
      symbol,
      range,
      label: spec.label,
      currency: sJson.meta?.currency || "USD",
      exchange: sJson.meta?.exchange || "",
      name: qJson?.name || symbol,
      points,
      // A failed quote is not fatal: the chart and every computed statistic
      // come from the series, so the page degrades rather than erroring.
      quote: qJson && qJson.status !== "error" ? {
        close: Number(qJson.close),
        previous_close: Number(qJson.previous_close),
        open: Number(qJson.open),
        high: Number(qJson.high),
        low: Number(qJson.low),
        volume: Number(qJson.volume),
        average_volume: Number(qJson.average_volume),
        fifty_two_week: qJson.fifty_two_week || null,
        is_open: !!qJson.is_market_open,
      } : null,
    });
  } catch (e) {
    // Do not surface the upstream error text; it can contain the request URL,
    // and the request URL contains the key.
    return res.status(502).json({ error: "Could not reach the data provider." });
  }
}
