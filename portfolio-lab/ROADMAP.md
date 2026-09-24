# Development and research gates

The project is standalone; no style-rotation artifact is required or modified.
The first deliverable is runnable code, an interactive report, input contracts,
primary-source research and a chronological evaluation harness.

## Next: establish a credible historical experiment

1. Choose a licensed market-data source with adjusted total returns and explicit
   delisting/corporate-action treatment. Select a small fixed ETF/stock universe
   and benchmark before examining results. Obtain releases/vintages for the
   chosen macro states; validate transformations and data availability.
2. Add missing-history and absorbing-default policies before extending to
   short-history stocks or a historical stock universe. Do not silently remove
   difficult observations. Audit cash distributions and portfolio arithmetic
   against externally computed examples.
3. Freeze train/validation/evaluation dates, candidate settings, portfolio set,
   horizons and all primary metrics. Archive runs and forecast origins.
4. Compare raw block bootstrap, historical factor model, ridge, nonlinear ridge
   and ensemble on the same forecasts. Add equal-weight ensemble, zero-mean
   return and no-macro ablations. Quantify paired block uncertainty without
   selecting the best full-history configuration.
5. Display actual calibration evidence and model status in the product.
   Do not relabel synthetic coverage or code-test success as market validation.

## Advanced candidates, in useful order

| Priority | Addition | Independent test |
|---|---|---|
| 1 | GJR-GARCH / Log-HAR volatility and estimated covariance shrinkage | Risk losses, portfolio CRPS and tail coverage against current EWMA |
| 2 | Chronos-2 and TimesFM-3 forecast adapters | Frozen factor/macro forecasts with matched context, verified model revisions and pretraining audit |
| 3 | Boosted-tree distributional models | Incremental nonlinear information under chronological tuning |
| 4 | Bayesian VAR / dynamic factor nowcasting | Macro release handling, parameter uncertainty and portfolio score improvement |
| 5 | DCC / regime-switching / tail copula | Joint crash frequency and correlation stability; filtered states only |
| 6 | Adaptive conformal updates with delayed labels | Empirical rolling and regime coverage plus interval width; no blanket conditional guarantee |
| 7 | Diffusion / flow joint path generator | Energy/variogram scores, marginal calibration, drawdown and joint-tail checks |

Do not replace a published algorithm with a heuristic while keeping the name.
Each candidate must document its own approximations and fit prerequisites.
Monthly data alone gives only a few hundred independent time observations;
neural training generally requires a broader well-defined panel or appropriate
pretraining. Daily risk and monthly macro can use different model frequencies,
but their aggregation and availability must be explicitly reconciled.

## Extension contract

Mean candidates currently implement `fit(x, y)` and `predict(x)` in `models.py`.
Adding to `CANDIDATES` and `fit_candidate` brings a compatible one-step candidate
into the weighting loop; update evaluation and tests for any new assumptions.

A foundation or generative forecaster should use a separate adapter returning
**joint** factor/macro samples, not pretend marginal quantiles satisfy that
contract. Archive origin, target dates, model/source revision, pretraining
cutoff or uncertainty, units, asset ordering and RNG state. Define how its
asset residual process and portfolio accounting match the benchmark.

The optional risk interface should expose standardized joint innovations and
the origin risk state; keep scenario conditioning and dependence consistent.
Parameter bootstrap or posterior draws must preserve a parameter draw for a
whole path rather than redraw coefficients independently each month.

## Product work after model validation

- Portfolio CSV upload and saved named allocations, clear source timestamps.
- User-configurable benchmark and forecast-vs-scenario comparison.
- Display coverage sample sizes, model drift and range extrapolation.
- Short-history proxies, cash/fees/dividends and contribution accounting.
- Provider integration, scheduled refresh, model registry and failure alerts.
- Portfolio optimization only as a separately specified future product.

No external account, paid API, brokerage or cloud service is configured in v0.1.
