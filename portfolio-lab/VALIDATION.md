# Verification record

Run date: 2026-09-23. These results concern the standalone prototype only.
Python 3.9.6, NumPy 2.0.2, pandas 2.3.3. No real-market model validation was
performed and no financial forecasting edge is claimed.

## Software verification

Command: `../venv/bin/python -m unittest discover -s tests -v`

**13 tests passed**, including:

- Future-data poisoning leaves historical forecasts unchanged.
- Earlier expert-weight updates do not consume later labels.
- Macro revisions respect publication dates and newest reference periods.
- Training normalization does not change when future inputs are predicted.
- Known buy-and-hold/rebalancing outcomes, transaction costs and drawdowns.
- Exact duplicate assets retain joint shocks with shrinkage disabled.
- Reproducible simulations and imposed macro paths.
- CRPS agrees with its pairwise mathematical definition.
- Interval correction excludes unmatured outcomes.
- Missing months, invalid weights and unsupported total-loss events fail.
- Historical evaluation scores all candidates on matching horizons/origins.
- Report data escapes script-breaking asset names.
- Actual report JavaScript runs in macOS JavaScriptCore and matches Python
  accounting for changed weights, horizons, rebalance modes and costs. Invalid
  weights display an error and valid inputs restore normal operation.

The unit-level JavaScript check uses a minimal DOM. A separate website
integration test subsequently ran successfully in Playwright Chromium at
1440px and 390px widths. It verified sign-in gating, lazy iframe loading,
deep links, allocations, scenarios, horizons, rebalancing, starting values,
standalone public access and absence of horizontal overflow. Desktop and mobile
screenshots were inspected. The report contains no remotely loaded scripts or
styles. The website test is `website/test/check_portfolio_outlook_browser.py`.

## End-to-end demonstration

```sh
../venv/bin/python -m portfolio_forecast.cli demo \
  --output outputs/demo --paths 1500 --cost-bps 10
```

Generated the interactive report, a baseline forecast, a conditional macro
scenario, full-precision path files, summaries and a reproducibility manifest.
Inputs are 300 fabricated monthly observations of four fabricated assets,
two factors and three macro states. Portfolio weights are 25% each, starting
value is $10,000, with monthly rebalancing and 10 bps per one-way turnover unit.

## Synthetic chronological evaluation

```sh
../venv/bin/python -m portfolio_forecast.cli backtest \
  --data outputs/demo/inputs --as-of 2026-08-31 \
  --output outputs/evaluation --paths 800 \
  --max-origins 30 --step 6 --cost-bps 10
```

Completed **450 forecast evaluations**: five configurations × three horizons ×
30 origins. CRPS is in decimal-return units; lower is better. Coverage is the
fraction of realized synthetic returns inside the nominal 80% interval.

| Model | 1m CRPS | 6m CRPS | 12m CRPS | 1m coverage | 6m coverage | 12m coverage |
|---|---:|---:|---:|---:|---:|---:|
| Raw joint block bootstrap | .02100 | .05126 | .07651 | .800 | .767 | .700 |
| Historical factor model | .02059 | .04913 | .07515 | .800 | .767 | .767 |
| Ridge | .02147 | .05472 | .09221 | .800 | .767 | .700 |
| Nonlinear ridge | .02148 | .05481 | .09256 | .800 | .767 | .700 |
| Adaptive ensemble | .02110 | .05210 | .08507 | .767 | .767 | .767 |

The ensemble **did not outperform the raw bootstrap on mean CRPS** in this
synthetic run. We did not tune the model after seeing this result. There are
only 30 evaluation origins per horizon, and twelve-month outcomes overlap.
These point estimates cannot select a real-market winner.

The interval correction had 10, 10 and 9 eligible later evaluations for 1/6/12m
respectively, with empirical coverage .900, .900 and .889. Those tiny samples
do not establish calibration; live loss probabilities remain uncalibrated.

Full origin-level records, scores and manifests are under
`outputs/evaluation/`. Generated outputs are ignored by git; they can be
recreated using the commands above. Source and input hashes are in manifests.

## Outstanding validation

- Vetted historical stock/ETF data with point-in-time macro transformations.
- Corporate-action, delisting and short-history handling before broader use.
- Financial holdout evaluation and joint tail/dependence calibration.
- Paired block uncertainty and multiplicity-aware model promotion.
- Broader browser compatibility and an accessibility audit beyond the checked
  Chromium desktop/mobile layouts.
- Separate validation for any neural, GARCH/DCC, regime or causal extension.
