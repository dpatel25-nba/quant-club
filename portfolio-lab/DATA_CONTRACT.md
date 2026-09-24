# Input and output contract

## Monthly market inputs

`assets.csv`:

```csv
date,AAPL,MSFT,SPY
2020-01-31,0.02,0.03,-0.001
2020-02-29,-0.10,-0.08,-0.08
```

`factors.csv` uses the same schema with named factor portfolios. Put the desired
benchmark first. These are **simple total returns as decimal fractions**:
0.02 means +2%. Use investable benchmark/sector/style portfolio returns, not
price levels or raw Fama–French long-short spreads masquerading as investable
total returns. Factors may overlap economically; regularization helps but does
not establish unique attribution.

Rows must be unique, consecutive calendar month ends and have identical dates
across the two files. Supply at least 61 observations; substantially more is
needed for useful validation. All assets/factors must have complete histories.
Data must reach the requested as-of date. Future rows are excluded before
training. Prices must already incorporate distributions and corporate actions
correctly. This loader does not compute or certify total returns.

Exact −100% returns cannot pass through a log-return model. They are rejected.
Do not delete bankrupt firms to bypass the error. An absorbing default state,
delisting-return policy and event-aware position accounting are required before
testing universes that include these observations. Short histories and IPOs
also need an explicit proxy/exposure policy before inclusion.

## Macro releases and revisions

`macro_releases.csv`:

```csv
series,observation_date,available_date,value
inflation,2019-12-31,2020-01-14,2.3
inflation,2019-12-31,2020-02-14,2.4
growth,2019-12-31,2020-01-30,2.1
policy_rate,2020-01-31,2020-01-31,1.6
```

For each formation month, only releases with `available_date <= formation`
are eligible. Within each series use the newest eligible observation date,
then its latest eligible revision. Revising an older reference period does not
displace a newer available observation. `observation_date <= available_date`
is required. Duplicate release keys are ambiguous and rejected.

The newest reference observation may be at most 120 days old. Missing or stale
states fail explicitly. Files must cover every requested formation month.
Add a conservative release buffer upstream if dates do not capture availability
at the chosen trading cutoff. A date-only ledger does not resolve intraday
announcement/execution ordering. Monthly market returns have no release ledger
in v0.1; immediate month-end availability is an explicit assumption.

Values must be already-defined modeling states: e.g. inflation rate, growth
rate, yield level, credit spread. Do not mix percentage points with decimals.
The engine standardizes using training data but does not infer transformations.
Compute growth/change features using values within the **same then-available
vintage**; using today's revised historical levels defeats the ledger.

Historical feature snapshots are frozen at their own formation dates. The
dynamic system forecasts changes in these **available information states**,
which can contain release jumps and revisions. It is not a structural model of
the unobserved contemporaneous economy. The same interpretation applies to
user-specified future scenario states.

## Required provenance

`metadata.json`:

```json
{
  "data_kind": "historical",
  "source": "Name the actual provider, extraction method and dataset edition",
  "return_convention": "monthly_simple_total_return_decimal",
  "macro_units": {"growth": "percentage points", "inflation": "percentage points", "policy_rate": "percentage points"}
}
```

`data_kind`, nonempty `source`, and `return_convention` are validated.
Additional provenance fields are preserved, not independently verified.
Record market-data licensing, universe definition, corporate-action treatment,
delisting handling, currency, timezone, release buffer and extraction timestamp.
Input files are SHA-256 hashed. An appended future row changes a file's hash,
but must not change historical fitted predictions.

## Scenario file

`scenario.csv` has a `date` column and exactly the macro-state names. Provide
each of the next H month ends in order, in the same units as the input ledger.
The scenario is a path, not a single terminal target. No scenario probabilities
are inferred; no baseline and scenario outputs are averaged automatically.

The simulator conditions each period on the imposed macro innovation using a
linear residual projection. This approximation is associative and assumes
stable residual relationships; it is not an exact conditional non-Gaussian
law or a causal policy intervention. States outside five training standard
deviations are counted in the diagnostics; no plausibility is certified.

## Path array contract

NPZ arrays have shapes:

- `asset_log_returns`: paths × horizon × assets, in manifest asset order.
- `factor_log_returns`: paths × horizon × factors, in manifest factor order.
- `macro_states`: paths × horizon × macro states, when modeled.
- `wealth`: paths × (horizon + 1), including initial value at step zero.

Samples with the same path index are one joint trajectory. Preserve that index
across assets, factors and steps. Independent resampling of each asset destroys
the dependence needed for valid portfolio aggregation. Marginal quantiles from
a neural model do not satisfy this joint-path contract on their own.
