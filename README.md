# Systematic Portfolio Management — Ticker Lookup

Goizueta Portfolio Management Club

A static page plus one serverless function. Type a ticker, pick a range, get a
chart and summary statistics.

```
index.html      the whole front end (no build step, no libraries)
api/quote.js    serverless proxy that holds the API key
```

## Why there is a server at all

The page could call the data provider directly, but then the API key would be
in the JavaScript that every visitor downloads — one View Source and anyone can
spend the club's daily quota. The key lives in a Vercel environment variable
instead; the browser only ever calls `/api/quote` on our own domain.

That also removes the CORS problem (same origin) and lets us cache: repeated
lookups of the same ticker and range inside the cache window cost zero API
calls, which is what keeps a club inside a free tier.

## Setup

**1. Get a free API key.** Sign up at <https://twelvedata.com/pricing> and take
the free plan — 800 requests/day, 8/minute. Copy the key.

Twelve Data was chosen because the free tier covers both things this page needs:
**intraday** bars (for 1H and 1D) and **long history** (for 5Y and ALL). Most
free tiers give one or the other. Alpha Vantage is down to 25 requests/day, and
Finnhub has moved historical candles behind its paid plan.

**2. Deploy.** Same flow as the NBA site:

- Push this folder to a GitHub repo.
- In Vercel: **Add New → Project → import the repo**.
- **Root Directory:** leave as the repo root (so `api/` is picked up).
- **Framework Preset:** Other. Leave build and output empty.
- Before clicking Deploy, open **Environment Variables** and add:

  | Name | Value |
  |---|---|
  | `TWELVE_DATA_KEY` | *(paste your key)* |

- Deploy. You get a URL in about thirty seconds.

If you add the key *after* deploying, go to **Settings → Environment Variables**,
add it, then **Deployments → ⋯ → Redeploy** — environment variables are read at
deploy time, so an existing deployment will not pick it up on its own.

**3. Local preview.** Opening `index.html` directly will show *"Could not reach
the server"*, because there is no `/api/quote` when you open a file from disk.
To run it properly you need the Vercel CLI:

```
npm i -g vercel
vercel dev            # then open the URL it prints
```

Set the key locally first, either with `vercel env pull` or a `.env` file
containing `TWELVE_DATA_KEY=...`. **Do not commit that file.**

## Free-tier budget — and the limit that actually bites

There are TWO limits, and the one you will hit is not the daily one:

| limit | size | clears |
|---|---|---|
| per minute | **8 credits** | ~60 seconds |
| per day | 800 credits | midnight UTC |

Eight a minute is easy to trip by clicking through the range buttons, so the
page is built to spend as few credits as possible:

- **Changing the range costs 1 credit**, not 2 — the quote block does not depend
  on the range, so it is fetched once per symbol and reused.
- **Revisiting a range costs 0** — results are cached per symbol+range for the
  life of the page. 1Y, then 5Y, then back to 1Y is two credits, not three.
- **Vercel caches at the edge too**, so a second person looking up the same
  ticker shortly after the first may cost nothing at all.

If you do see a limit message, the page now tells you which one: a per-minute
trip says wait about 60 seconds, a daily exhaustion says it resets at midnight
UTC. They need completely different responses, which is why they are separate
messages.

Roughly 400+ fresh lookups a day. If the club outgrows that, the paid tier is
about $12/month, or add a second provider as a fallback.

## What the numbers mean

- **Return** and **max drawdown** are **price-only** — they exclude dividends,
  so a dividend payer's true total return is higher than shown. Worth knowing
  before anyone quotes one of these in a pitch.
- **Volatility** is the standard deviation of returns *within the selected
  range*, annualised by the observation frequency. The 1H and 1D figures are
  annualised from intraday bars and will look large; that is arithmetic, not a
  data error.
- Everything is computed from the series actually on screen, so the statistics
  always describe the chart you are looking at.
- Prices from a free tier are typically delayed by 15 minutes.

## Adding things later

`api/quote.js` returns the raw series, so new statistics are a front-end change
only — no API work. Beta against an index, correlation between two tickers, and
a comparison overlay are the natural next ones, and none of them need a
different data plan.
