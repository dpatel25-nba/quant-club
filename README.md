# Goizueta Portfolio Management Club

Emory University. Club site with the research tools built by the Systematic Portfolio Management unit.

Four top-level sections: **Overview**, **Membership**, **Apply**, and **Research Tools** — the last containing Ticker Lookup, **Fundamental Data**, Portfolio Builder, Compare, Factors and **Style Rotation**.

A static page with serverless data endpoints. Type a ticker, pick a range, get a
chart and summary statistics, or research its SEC financials.

```
index.html      the whole front end (no build step, no libraries)
api/quote.js    serverless proxy that holds the API key
api/fundamentals.js  authenticated SEC issuer search and financial data
lib/sec-financials.js  fiscal-period normalization and ratio calculations
fundamentals.js / fundamentals.css  company research interface
```

The Research Tools workspace uses `research-tools.css`: warm neutral surfaces,
slate-blue accents, compact navigation and restrained panel shadows. Its
sans-serif data layout remains distinct from the serif public pages. Theme
variables are scoped to the active research section, with light/dark variants,
visible keyboard focus and reduced-motion support.

## Fundamental Data

Open `/#fundamentals` after unlocking Research Tools, or use **View company
fundamentals** beneath a supported U.S. stock lookup. This is a dedicated company
research tab. It contains five annual periods and up to eight quarterly and
trailing 12-month periods, 40 reported financial fields,
two calculated cash/balance measures, 15 ratios, a selectable historical chart,
per-value sources and calculations, CSV export, and a filtered filing library.
The statement views are income statement, balance sheet and cash flow. Ratios
include growth, margins, returns on average equity/assets, liquidity and cash
conversion. The reporting selector updates statements, charts, ratios and CSV
exports together. Clicking a row name charts that metric. The Overview includes
factual changes and links to the latest annual and quarterly reports.

**Peer comparison** accepts up to four tickers alongside the current company.
Companies are loaded sequentially, reuse the 15-minute client cache, and are
deduplicated by SEC issuer (CIK), including different classes of the same issuer.
Failures remain visible in their own columns. Each company keeps its actual
fiscal dates; a common reporting basis does not imply matching calendar periods.
Changing the main company cancels pending peer comparisons.

**Valuation** is an explicit calculator using a member-entered, company-wide
market capitalization in USD billions and its date. It computes market cap /
parent net income, price / sales, free cash flow yield and price / book from
the latest available TTM period, falling back to annual if no TTM history exists.
Market-cap inputs can also be entered in the peer table and are retained only
for the browser page, by issuer. This does not fetch or infer a live market cap
from stale shares, and consumes no additional market-provider credits.
The date must be at least the financial period end and the latest filing date
among valuation inputs, and cannot be in the future. Negative earnings/equity
multiples are unavailable; negative free cash flow yields remain visible.
Parent net income is not adjusted for preferred dividends, so the earnings
multiple is labeled explicitly and may differ from a quoted P/E. These are
calculations from entered assumptions, not verified historical valuations.

**Capital allocation** shows operating/free cash flow, capital expenditures,
net acquisition outflows, dividends/distributions and common repurchases on a common bar scale,
plus historical stock compensation and weighted average diluted shares. Bars
are separate flows, not shares of a cash-flow reconciliation. Share counts do
not isolate buyback effects and may reflect issuance, dilution and stock splits.
Payout totals prefer the broader dividends/distributions tag (which can include
preferred holders and noncontrolling interests), falling back to common dividends
with explicit coverage. The two dividend tags are never added. Payout totals require both inputs; their FCF ratio requires positive
FCF and may exceed 100%. Long-term debt uses the reported total including the
current portion, or current plus noncurrent components only when both exist.
It is an ending balance, not total debt or net borrowing. Inputs remain inspectable.

**Research notes** stores thesis, catalysts, risks, open questions and valuation
assumptions in localStorage, keyed by SEC CIK (`gpmc-research-notes-v1:<cik>`).
Notes save on each edit, with a 12,000-character limit per field. Storage/read
failures remain visible; unsaved edits stay in memory and can still be exported.
These are device/browser-profile notes, not club-shared or account-synced data.
Anyone using the profile can access them; clearing site data removes them.
Markdown export provides a portable backup. No credentials are stored with notes.

**Research report** previews a configurable report with four recent financial
periods, the selected history chart, latest allocation, loaded peers, entered
market-cap assumptions and research notes. It includes fiscal/retrieval dates,
SEC source references and calculation notes. Pending/failed peers are disclosed.
Print / save PDF uses the browser print dialog; Download report HTML produces a
standalone, script-free document with embedded styles and chart. Notes can be
excluded before sharing. Neither export sends the report to a server or another
member. `fundamental-workspace.js` implements allocation, notes and reports
without additional providers or dependencies.

**Financial model** adds a five-/ten-year operating-company forecast with
independent base, upside and downside drivers. `forward-model.js` is the pure
calculation engine; `forecast-workspace.js` and its CSS implement the editor,
results, device storage and exports. Opening the model uses existing SEC data;
the optional market-estimate button requests a daily price series through the
existing quote endpoint (with `quote=0`), subject to its cache and plan limits.

The workspace separates **Setup**, **Assumptions** and **Results**. Setup groups
opening balances and optional valuation inputs, with expandable sources and
estimate explanations. Assumptions group annual drivers in a scrolling table
with fixed headers, followed by valuation settings. Running a valid model opens
Results, which explains headline values, highlights the selected scenario and
current sensitivity cell, and lists model checks. Full annual statements expand
on demand. Edits invalidate stale results without clearing the draft.
Inputs display shorter numbers by default; **Full precision in inputs** reveals
the stored values. Display rounding never changes the model. Charts adapt to
mobile widths, while wide financial tables remain horizontally scrollable.

- Historical starting point: latest TTM or an available annual period. SEC
  references are separate from editable inputs. New drafts prefill operating
  balances and supported debt estimates. Debt uses long-term debt including its
  current portion (or both reported components) plus short-term borrowings,
  falling back to commercial paper. Never add both short-term tags or the current
  long-term portion twice. Missing components remain missing; estimates require
  review for debt overlap, omissions and leases.
- Editable bridge suggestions use book debt as a valuation proxy, cash less a
  2%-of-revenue operating reserve (floored at zero, excluding investments), and
  consolidated less parent equity for other claims when available. The latter
  is only a book NCI proxy; review preferred stock and other valuation claims.
  Source buttons and assumption explanations accompany each estimate. The cash
  reserve estimate stays fixed when forecast minimum-cash assumptions change.
  **Fill missing inputs** preserves existing entries and requires renewed review.
  It can reuse an issuer's valid member-entered market cap from Valuation when
  that entry's date matches the model date. New drafts also reuse matching caps;
  saved/imported drafts are not automatically overwritten.
- Remaining share inputs can use `dei:EntityCommonStockSharesOutstanding`,
  returned separately from weighted-average financial-statement shares. Only
  issuers with one disclosed ticker and nonconflicting instantaneous counts are
  eligible. New drafts use the latest snapshot filed by the model date, no more
  than 180 days old, and explicitly select **reported common shares, before
  dilution**. Users can replace the number and choose reviewed fully diluted
  shares. No option/convertible dilution is automatically inferred.
- **Fill share & market estimates** fills only blanks. Market cap is an estimate
  from the SEC common-share snapshot times a matching common-stock daily USD
  price on the issuer's exchange. The price must be within seven days of the
  model date and after the share disclosure. Dates, source filing and calculation
  are visible. Subsequent splits, buybacks, issuance and unlisted share classes
  require review. It never multiplies price by the user's diluted-share count.
  Failed or mismatched prices leave the cap blank. Edits cancel pending requests;
  late responses cannot overwrite edits or another issuer's draft. Share and
  market-cap basis labels survive save/import and appear in results/exports.
- Opening operating inputs and annual drivers are required for projections.
  The equity bridge, current fully diluted shares and comparison market cap are
  optional: missing/invalid values suppress only dependent outputs. No historical
  weighted-average shares are substituted. Missing bridge values never become
  zeros. Invalid DCF settings suppress valuation while preserving forecasts;
  invalid weights suppress only the weighted value. Reports/CSV explain partial
  results, and sensitivity shows enterprise or equity value when per-share
  valuation is unavailable.
- Annual drivers cover growth, gross margin, R&D, SG&A, other operating costs,
  taxes, capex, depreciation, receivable/inventory/payable days, SBC, interest,
  dividends, borrowing/repayment, cash issuance, buybacks and minimum cash.
  Starting assumptions are labeled and must be reviewed before calculation.
- Linked projections include income, cash flow and a **simplified consolidated
  balance sheet**. Opening equity is assets minus liabilities. Other assets and
  liabilities stay constant. Depreciation applies to opening modeled assets;
  new capex depreciates from the next year. Debt interest uses opening book debt.
  Taxes apply to positive income, without deferred taxes or loss carryforwards.
  No separate segment, acquisition, lease, impairment, OCI or EPS schedules.
- Cash funding gaps are exposed, without automatic debt/cash plugs. Negative
  cash/book equity and excess debt repayment are diagnosed. Every year reports
  assets minus liabilities minus equity. A balanced model can still be unfunded.
- DCF discounts FCFF at year end. SBC remains an operating expense for valuation,
  although accounting CFO adds it back with a matching equity increase. Existing
  diluted shares are an analyst input; future SBC dilution is not deducted again.
  Terminal reinvestment is terminal NOPAT × growth / ROIC. WACC and terminal ROIC
  must exceed terminal growth; terminal NOPAT must be positive. Equity residual
  adds valuation-date excess cash/nonoperating assets and subtracts senior
  claims once. Future ending cash is not added to enterprise value again.
- Sensitivity tables vary WACC and terminal growth. Reverse DCF solves a constant
  revenue growth rate over the explicit forecast, retaining other assumptions.
  It searches −50% through 100% on a grid with bisection, rejecting multiple
  detected crossings and reporting a funding shortfall at the solution.
  Scenario weights total 100%; they are user choices, not probabilities estimated
  by the system. Invalid positive-weight cases disable the weighted value.
- The model date is the projection origin; every projection is a full year after
  that date. Historical balances/run rates need review for the intervening time;
  there is no inferred stub or live market update. When the historical baseline
  matches the current SEC response, its latest filing date constrains the model
  date. Financial-sector issuers (SIC 6000–6999 or identified banks/insurers) are
  blocked pending a separate sector template.
- Save explicitly to localStorage (`gpmc-forward-model-v1:<CIK>`), export/import
  versioned JSON, or export complete assumptions/projections/formulas as CSV.
  Files are capped at 256 KB on import, issuer-matched and schema-checked. Imported
  source metadata is discarded and inputs require fresh review. Saved reloads
  use the same validation. Storage failures leave the draft available in memory.
  Editing assumptions immediately invalidates results, CSV and report snapshots.
  Financial model summaries and assumption schedules can be included in the
  existing HTML/print-to-PDF research report.

Method references: [NYU Stern FCFF](https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/fcff.pdf)
and [terminal reinvestment](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/termvalueexreturns.htm).
Run `python3 test/check_forward_model.py` for hand-calculated statements, DCF,
reverse DCF and randomized accounting reconciliation; the Fundamental Data
browser check also covers the model lifecycle, exports and mobile layout.

Company name suggestions use the SEC ticker directory through
`/api/fundamentals?q=...`, independently of Twelve Data credits. Submitting a
ticker uses `/api/fundamentals?symbol=...`. Both require the tools password in the
`x-tools-password` header and return `private, no-store`. Tickers resolve to SEC
CIKs; class-share aliases such as `BRK.B` resolve to the SEC's `BRK-B`. This does
not map arbitrary foreign listings or currency pairs to U.S. companies.

The server requests the public [SEC Company Facts and Submissions APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
No additional paid data key is needed. Optional Vercel environment variable
`SEC_USER_AGENT` can identify the club and an administrator contact for SEC
requests. The default identifies GPMC Research and the public website URL.
Cached SEC responses last 15 minutes (24 hours for the ticker directory),
with at most 25 cached documents per warm server instance. In-flight duplicate
reads are shared, request starts are spaced 250 ms apart per instance, and each
fetch has an eight-second timeout. Client results are cached for 15 minutes,
up to 12 companies. SEC blocks/rate limits display a retry message.
The SEC's [fair-access limit](https://www.sec.gov/about/developer-resources) applies
across machines: this per-instance pacing is not a distributed limiter. Before
scaling traffic beyond club usage, move SEC ingestion/cache behind a shared
queue with a global rate limit.

Normalization rules:

- USD values from standard US GAAP tags in 10-K/10-K/A and 10-Q/10-Q/A filings. Other
  currencies and custom or segment tags are not combined. An issuer without
  supported financials still gets its available original filings.
- Annual income/cash-flow periods must span 320–400 days. Columns use actual
  start/end dates, not the `fy` label of a later comparative filing. Balance
  sheet facts must be instantaneous at the exact selected period end date.
- Single-quarter periods span 70–110 days. Prefer directly reported quarter
  values; otherwise monetary flows are derived by subtracting cumulative
  disclosures with matching start date, currency and tag. This includes Q4 as
  the full year less nine months. Components can come from different filings;
  later restatements can affect comparability. All component sources are kept.
- TTM uses an exact reported year or four consecutive, non-overlapping quarters
  spanning 350–380 days. Missing monetary components make the total unavailable.
  Ending balance-sheet values are carried forward as snapshots, never summed.
  EPS and weighted average shares are never subtracted or summed; absent an
  exact reported period, their derived-quarter/TTM values remain unavailable.
- The latest filed value for an exact period wins across supported aliases;
  same-filing ties use the documented alias order in `FIELDS`. Later comparative
  disclosures and amendments can restate old figures. Each number retains its
  tag, filing date, accession, unit and source link. This is not a point-in-time
  backtest dataset, and separate rows can cite different filings.
- Missing is null, never zero. Ratios require positive denominators. Growth
  compares matching prior-year periods, including for quarters and TTM. Returns
  on average assets/equity require a balance immediately before the period start;
  quarterly returns are not annualized. Additional historical periods are
  loaded internally to calculate the oldest displayed year's growth/returns.
  Free cash flow is operating cash flow minus reported cash capital expenditures.
  Its formula and all input sources are exposed and exported.
- General ratios can be unsuitable for banks and insurers. Debt components
  overlap and should not all be added together. No implicit debt summation,
  non-GAAP EBITDA, forecasts or enterprise-value multiples are supplied.

The filing library includes annual/quarterly reports, current-event reports,
proxy disclosures and insider/beneficial ownership filings from the SEC's
recent submissions block. Its time coverage can differ from the annual tables;
**Full history on SEC EDGAR** reaches older reports. Segment details,
risk factors, management commentary, footnotes and company
guidance remain accessible in the originals; they are not automatically extracted.
Links open the SEC filing index so users can choose the original document or
its exhibits. CSV includes unscaled values, units, missing cells and provenance.

Validation:

```sh
python3 test/check_fundamentals.py
python3 test/check_interim.py
PLAYWRIGHT_BROWSERS_PATH=/tmp/gpmc-browsers ../venv/bin/python test/check_fundamentals_browser.py
```

The model/API tests use synthetic filings and fake credentials to cover fiscal
dates, amendments, currency separation, missing data, calculations, authorization,
caching and failures. Interim tests check YTD subtraction, Q4, TTM continuity,
missing components, EPS safeguards, YoY growth, balance timing and valuation
availability dates. Browser tests cover deep links, source inspection, search,
exports, filters, reporting bases, valuation, peer partial failures, issuer
deduplication, stale requests and phone/desktop widths. Public SEC snapshots
for AAPL, MSFT and JPM were also normalized during implementation to check period
selection and coverage. These checks do not establish SEC access from every
Vercel deployment; an upstream block produces a visible error, never sample data.

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

Roughly 400+ fresh lookups a day, and far more once the edge cache is warm.

**Before paying for a tier, check whether you actually need one.** The minute
cap is only reached by many COLD lookups at once — twenty people each typing a
different ticker during a meeting. Ordinary browsing does not approach it. A
free trick for the demo case: open the site an hour beforehand and click through
the tickers you plan to show, which fills the shared edge cache so the room
reads from it for nothing.

Paying is genuinely right when live intraday becomes routine (1-minute bars
cannot be cached for long by definition), or when a feature fans out — comparing
several tickers on one page multiplies credits per view. Check current pricing
at <https://twelvedata.com/pricing>; do not trust a figure written here, since
plans change.

## Access

Research Tools sit behind a password. **Two layers, and only one is real.**

The page asks for a password and stores it as a SHA-256 hash, so the plaintext
is not sitting in View Source. That layer is CONVENIENCE — it keeps the tools
out of sight and stops passers-by spending API credits. Anyone determined can
edit the JavaScript in a browser and walk past it, because a client-side check
is never security.

The layer that counts is in `api/quote.js` and `api/factors.js`: both refuse to
return anything without the password, so bypassing the screen gets an empty tool
rather than free data.

**Change the password** by setting `TOOLS_PASSWORD` in Vercel (Settings →
Environment Variables → then redeploy) and updating `PW_HASH` in `index.html` to
the SHA-256 of the new one:

```
python3 -c "import hashlib; print(hashlib.sha256(b'NEWPASSWORD').hexdigest())"
```

**If this repository is public, change it now.** The server falls back to a
default written in `api/quote.js`, which is readable on GitHub. Setting
`TOOLS_PASSWORD` overrides it.

This is a shared club password, not per-member accounts: anyone who has it can
pass it on, and there is no way to revoke it for one person. That is usually the
right trade for a club, but it is worth knowing what it is.

## Asset coverage

Ticker Lookup, both Compare inputs, every Portfolio Builder holding (including
newly added rows), and the Factors lookup suggest instruments as the user types
a symbol or name. Fundamental Data and its peer list use SEC company suggestions.
Peer suggestions replace the comma-separated entry at the cursor, preserving
other peers and allowing company names containing spaces. Selecting a peer or
an instrument in the multi-input tools fills the field; analysis starts with
the tool’s existing button. Removed holdings cancel their pending search.
Selected exchanges are retained in market requests and cache keys; editing the
ticker clears the exchange selection.
Common stocks, funds, currencies and the existing commodity picker entries
match locally. After a 400 ms pause, authenticated users also receive matches
from Twelve Data's [symbol search](https://twelvedata.com/docs#symbol-search).
Each suggestion shows its name, instrument type and exchange where supplied.
Arrow keys highlight an option; Enter selects it. In Ticker Lookup, selection
also loads the chart. Escape,
Tab and losing focus dismiss the list. Enter without a highlighted suggestion
preserves normal direct ticker entry, including stock symbols such as `GOLD`.

`ticker-suggestions.js` and `ticker-suggestions.css` implement the combobox.
`/api/search` accepts the existing tools password in a header, keeps the
provider key on the server and returns private, non-cached responses. The
browser caches up to 50 search queries per field per page session, cancels outdated
requests and pauses remote search for 60 seconds after a rate-limit response.
Local matches remain available when remote search fails. Typing does not fetch
price history; selecting a Ticker Lookup result does. A selected exchange is passed to both
quote and time-series requests and included in client cache keys.

Run `python3 test/check_search.py` for proxy checks and
`python test/check_suggestions_browser.py` for browser integration checks
(Playwright/Chromium required). Both use fake credentials and mocked APIs.

Ticker Lookup has Line and Candlestick views. The proxy preserves the
[provider's OHLC bars](https://twelvedata.com/docs#time-series), including
zero and negative prices, and returns their interval. Switching chart types
redraws cached data without another market request. Candles use a hollow green
body when close is at least open, a filled red body otherwise, and a wick for
the bar's high and low. Hover, touch or arrow keys show the bar's date/time and
OHLC values. Long histories scroll horizontally and open at their latest bars.

The range controls determine bar size: 1H uses one-minute bars, 1D five-minute,
1M/1Y and calendar-month views daily, 5Y weekly, and ALL monthly. Missing or
inconsistent OHLC produces an explicit line-chart fallback, never invented
candles. Range highs/lows use full bar extremes when available; return,
volatility and drawdown remain based on closes. The benchmark remains a rebased
line, and its values are included in the chart scale without clipping.
Lookup requests carry `ohlc=1` to avoid previously cached close-only responses.

`python test/check_candlesticks_browser.py` exercises synthetic OHLC geometry,
doji and direction, missing and negative prices, all ranges, keyboard readouts,
scrolling, responsive redraws and benchmark behavior with no live credentials.
It requires Python Playwright and Chromium. `python3 test/check_quote.py` checks
the proxy's OHLC and interval fields as well as authentication and errors.

| class | works | how |
|---|---|---|
| Stocks, ETFs, indices | yes | plain symbol — `AAPL`, `SPY` |
| Crypto | yes | pair — `BTC/USD` |
| Currencies | yes | pair — `EUR/USD` |
| Commodity prices | subject to account access | `XAU/USD`, `XAG/USD`, `WTI/USD`, `XBR/USD`, `HG1`, `XPT/USD`, `XPD/USD` |
| Commodity funds | via fund share prices | `GLD`, `SLV`, `USO`, `BNO`, `CPER`, `UNG`, `CORN`, `WEAT`, `DBC` |
| Fixed income | **via funds only** | `TLT`, `AGG`, `LQD`, `HYG`, `TIP` |
| Individual bonds | no | the provider lists ~179 thin corporate names; there is no CUSIP-level pricing or treasury curve |

Ticker Lookup includes a Commodities picker. Selecting a commodity fills the
symbol field and uses the existing chart, range, month and benchmark controls.
Spot prices and fund share prices have separate groups and explanatory labels;
an unavailable spot series is never silently replaced with a fund. Provider
plan restrictions return an explicit 403 message, separately from rate limits.
Commodity intraday annualised volatility is omitted because the equity-session
assumption does not apply. Daily commodity volatility uses 252 observations per
year; weekly and monthly series use 52 and 12 respectively. Spot volume is not
displayed. Existing stock tickers such as `GOLD` are not treated as aliases.

The spot symbols were checked against Twelve Data's public
[commodity catalog](https://api.twelvedata.com/commodities) on September 12, 2026.
[Commodity access](https://twelvedata.com/exchanges/commodity?group=core) depends
on the account plan. Fund mappings were checked with
[State Street](https://www.ssga.com/us/en/individual/etfs/spdr-gold-shares-gld),
[iShares](https://www.ishares.com/us/products/239855/ishares-silver-trust-fund),
[USCF](https://www.uscfinvestments.com/index.php),
[Teucrium](https://teucrium.com/weat) and
[Invesco](https://www.invesco.com/us/en/solutions/invesco-etfs/commodity-investing.html).
These checks establish symbol identity, not live access on this site's account.

Commodity checks use fake credentials and simulated market responses:

```sh
python3 test/check_quote.py
python test/check_commodities_browser.py  # requires Playwright and Chromium
```

**Fixed income needs care, and the site now says so on screen.** Every return
here is PRICE ONLY. For a stock, excluding dividends costs a point or two a
year. For a bond fund the coupon is essentially the whole return, so a fund can
show a badly negative price return over a period when its total return was
positive. That is a wrong answer rather than an imprecise one, so bond funds are
detected by name and carry a warning in red. Price and volatility are still
sound; the RETURN is not a total return. Quote performance from the factsheet.

## Factors

The Factors tab regresses a security's excess return on the four Fama-French
factors — market, size, value, momentum — and reports loadings, t-statistics,
alpha and R squared, alongside how each factor itself performed over the window.

**Why the academic factors and not factor ETFs.** Proxying momentum with MTUM
and value with VLUE would be easier, but those are long-only funds: each carries
the market inside it, so a regression against them measures market beta several
times over and the loadings become unstable. The Fama-French factors are
long-short and market-neutral by construction, which is what makes a loading
mean anything. They also publish the risk-free rate, so excess returns stop
needing a hand-waved zero.

`api/factors.js` fetches the library and unpacks the ZIP by hand — a local file
header is a fixed 30 bytes, then name, then extra, then a raw deflate stream
Node's zlib inflates directly — so there are no npm dependencies. Cached for a
day; the response carries its own last date.

**Two limits worth knowing.** The library is rebuilt monthly from CRSP, so it
lags by several weeks and the most recent days are missing. And it is DAILY, so
weekly or monthly price series will not line up — the tab says so rather than
quietly regressing mismatched frequencies.

## The portfolio statistics

**Diversification** is `1 − σₚ / Σ wᵢσᵢ`, displayed as "x% lower vol".

The denominator is the weighted average of the holdings' own volatilities —
what the portfolio's risk would have been if everything moved in perfect
lockstep. The numerator is what it actually was. The gap is what NOT moving
together bought you. Read 8% as: this combination produced 8% less volatility
than owning the same things in isolation.

It is the complement of the diversification ratio, `DR = Σwᵢσᵢ / σₚ`, expressed
as a reduction rather than a multiple. For long-only weights it can never be
negative — portfolio volatility cannot exceed the weighted average of its parts
— which is why short positions are refused rather than shown: with a negative
weight that guarantee fails, and risk contributions can go negative too, so
several figures would stop meaning what their labels say.

**Risk share** is `RCᵢ = wᵢ(Σw)ᵢ / σₚ`, which sums to 100% by Euler's theorem.
It is what each holding contributes to portfolio volatility, which is not the
same as its weight.

**Return share** is each holding's weighted contribution to the portfolio's
gain. The final column is return share minus risk share: positive means the
position returned more than the risk it consumed.

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

## Style Rotation research

The Style Rotation tab opens with a composite ranking of CSM, DMA, TRM and ECM
rankings for the next 1, 6 or 12 months, plus a 12/36/60-month factor correlation
heatmap. Forecast formation, source, target and training dates remain visible.
Scores are relative ranks, not forecast returns; candidate rank ranges show
model disagreement. DMA uses discounted, horizon-tempered predictive densities
from archived forecasts, with rolling ridge candidate models. The research
specification and retrospective validation disclose its limitations. TRM uses
style-specific tactical regressions; ECM provisionally means economic-cycle
regressions on the project's macro-condition proxies. This is not an
error-correction ECM. The ranking table can be ordered by any of the four
models or the composite, while DMA retains its original candidate blend.
Composite scores average four 0–100 model rank scores at fixed 25% weights.
They are relative consensus, not return estimates or confidence probabilities.
The composite is the default ordering, with constituent ranks visible alongside
it. Its monthly change compares independently constructed composite rankings.

The expandable Methodology & Findings section presents the public-data research project: corrected
technical baselines, weighting audit, publication delays, nested selection,
macro comparison, era robustness, and portfolio interpretation. Panel, delay,
period and cost controls drive period-specific metrics and interactive charts.
Study-specific dates and units stay visible. A report library provides fifteen
Markdown reports/specifications, twenty-seven CSV result tables, and Python source
and research bundles. Link directly using `/#style-rotation`.

`style-rotation.js` and `style-rotation.css` extend the existing no-build front
end. `/api/style-rotation` serves an embedded snapshot after validating the
existing `TOOLS_PASSWORD`, supplied in a request header. Responses use
`private, no-store`; research data is not copied into public static files.
The fallback accepts the same password digest as the existing client gate.
No new environment variable, data-provider credit or external library is needed.

The generated API file is updated from the separate research project:

```
venv/bin/python scripts/16_export_website.py --website /path/to/quant-club
```

Run that command from the style-rotation project after regenerating its research
artifacts. It includes source-file hashes and sample metadata and refuses a
payload exceeding 4 MB. The API template lives in
`scripts/style-rotation-api.template.js` in this website repository.

Checks (Python and macOS JavaScriptCore, no npm dependencies):

```
python3 test/check_css.py
python3 test/run_page.py
python3 test/check_style_rotation.py
```

The Style Rotation check exercises all 216 historical panel/delay/period/cost combinations
against the shipped snapshot, reconstructs chart endpoints, checks server access
and error/retry behavior, and verifies export coverage. It also checks all 54
outlook/correlation scenarios. Deployment continues
through the existing GitHub/Vercel integration; this change adds no new site.

## Extending the market tools

`api/quote.js` returns the raw series, so new statistics are a front-end change
only — no API work. Beta against an index, correlation between two tickers, and
a comparison overlay are the natural next ones, and none of them need a
different data plan.
