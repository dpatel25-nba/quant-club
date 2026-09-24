# Portfolio forecasting: research review and implementation decision

Research date: **2026-09-23**. Scope: public primary papers, model authors'
technical documentation and repositories. This is a research synthesis, not a
reproduction of the cited experiments or an exhaustive claim about all methods.
Recent arXiv results below are preliminary evidence, not established consensus.

## Recommendation

Build a **modular probabilistic factor system**. Keep expected returns,
macroeconomic dynamics, conditional risk, portfolio accounting and calibration
as separately testable components. The meaningful goal is a useful joint
distribution of portfolio outcomes, including adverse paths. Adding every
architecture to one model is not a defensible optimization objective.

The implemented first version combines regularized linear and nonlinear
forecasts, sequential expert weighting, joint filtered block simulation,
time-varying volatility and explicit scenario conditioning. It is a transparent
baseline for evaluating more expensive candidates. It does **not** claim to
contain transformers, diffusion, DCC-GARCH or a trained regime-switching model.

## What changed in the current literature

**Foundation models now have more useful multivariate interfaces.** Google's
TimesFM-3 announcement is dated August 31, 2026. The author documentation
describes a 330M-parameter model with multiple targets, past covariates,
past/future covariates and horizon quantiles. Those capabilities justify a
benchmark candidate; the advertised results concern general time-series
benchmarks, not our portfolio-return objective. Marginal quantiles still need
a coherent cross-asset, cross-time dependence model for portfolio simulation.
[Google Research](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/),
[official repository](https://github.com/google-research/timesfm).

Amazon's Chronos-2, introduced October 2025, supports multivariate and
covariate-informed forecasting with group attention. It is a plausible
candidate for macro/factor forecasting using a shared context. Forecasting
future covariates must remain part of the simulation: realized future economic
releases are not inputs to an honest historical baseline forecast.
[Amazon Science](https://www.amazon.science/blog/introducing-chronos-2-from-univariate-to-universal-forecasting),
[official repository](https://github.com/amazon-science/chronos-forecasting).

Moirai-MoE explores sparse expert routing; Moirai 2.0 instead emphasizes a
simpler decoder, quantile prediction and multi-token output. These are distinct
architectural hypotheses, not ingredients that should automatically be stacked.
[Moirai-MoE paper](https://arxiv.org/abs/2410.10469),
[Moirai 2.0 paper](https://arxiv.org/abs/2511.11698).

**Financial evidence remains much narrower than general benchmark claims.**
A June 2026 preprint compares pretrained models and supervised neural models
on five liquid US equities. It reports strong relative neural-model rankings
but only sparse improvements over its naive benchmark. Five surviving,
widely followed equities cannot establish robustness across portfolios,
delistings, changing universes or transaction costs. Its results are motivation
to test, not permission to market reliable alpha.
[Paper and methods](https://arxiv.org/html/2606.27100v1).

The August 2026 FinVerse preprint also explicitly separates generic forecasting
accuracy from finance-relevant performance across a larger model benchmark.
This supports evaluating our actual downstream portfolio distributions rather
than adopting a public leaderboard winner.
[FinVerse](https://arxiv.org/abs/2608.03259).

A July 2026 volatility preprint compares nine foundation models with eight
econometric specifications across 50 assets. It finds heterogeneous results:
one small model has a modest advantage under its normalized comparisons, and
a combination with Log-HAR is competitive. Volatility forecasting therefore
deserves its own benchmark rather than being bundled into return-mean model
selection. This is a single recent study with its own dataset and protocol.
[Volatility study](https://arxiv.org/html/2607.05291v1).

## Technique map

| Technique | Role in this product | Evidence/benefit | Main obstacle | v0.1 status |
|---|---|---|---|---|
| Shrinkage factor regression | Asset exposures, return means | Small-data stability, interpretable loadings | Misspecified/static exposures | Implemented |
| Nonlinear kernel approximation | Nonlinear macro/return interactions | Low-cost nonlinear candidate | Extrapolation, weak signal | Implemented, fixed random features |
| Tree boosting / quantile forests | Nonlinear conditional forecasts | Handles interactions in tabular panels | Needs careful panel chronology and residual dependence | Research candidate |
| Bayesian VAR / dynamic factor model | Macro path generation | Joint economic dynamics and parameter uncertainty | Release vintages, restrictions, sample size | Ridge transition implemented; full Bayesian model pending |
| Markov-switching / HMM | Persistent risk states | Explicit state persistence | State identification, hindsight-smoothed regimes | Research candidate |
| EWMA / GARCH / GJR / HAR | Conditional volatility | Separate tractable risk forecast | Frequency and realized-volatility data | EWMA implemented; others pending |
| Shrunk covariance / DCC / copulas | Cross-asset dependence | Diversification and co-crash risk | Tail estimation and unstable correlations | Fixed diagonal shrinkage implemented; DCC/copulas pending |
| Filtered block bootstrap | Joint trajectory sampling | Preserves some historical tails/dependence | Unseen crises, finite support | Implemented |
| Online expert combination | Model disagreement/adaptation | Avoid permanent all-or-nothing selection | No guaranteed local superiority | Implemented using past factor MSE |
| TFT / PatchTST / NHITS | Supervised sequence prediction | Flexible temporal structures | Monthly sample too small for broad tuning | Research candidates |
| Chronos-2 / TimesFM-3 / Moirai | Pretrained forecasting challenger | Transfer without local training from scratch | Pretraining contamination, domain mismatch, joint samples | Reviewed, not installed/run |
| Diffusion / normalizing flows | Conditional joint path generation | Rich non-Gaussian distributions | Compute, training data, tail evaluation | Research candidates |
| Adaptive conformal inference | Sequential interval calibration | Coverage monitoring under drift | Delayed/overlapping labels and conditional coverage | Rolling empirical correction only; full ACI pending |
| Causal structural scenarios | Policy/economic interventions | Explicit economic interpretation | Identification assumptions | Not implemented |

## Expected returns: use shrinkage and challenge it

Gu, Kelly and Xiu's asset-pricing study is substantive evidence that nonlinear
interactions can help in a rich cross-sectional research setting. It does not
say a neural network fitted to a few hundred monthly observations will
forecast a club portfolio reliably. Its setting motivates tree/neural
challengers only once point-in-time characteristics and a sufficiently broad
panel are available. [NBER paper](https://www.nber.org/papers/w25398).

The current kernel challenger uses random Fourier features, a computational
approximation to a shift-invariant kernel. It is deliberately small enough to
fit repeatedly inside chronological evaluation. It is **not** a foundation
model or a substitute for evaluating one.
[Rahimi and Recht](https://proceedings.neurips.cc/paper/2007/hash/013a006f03dbc5392effeb8f18fda755-Abstract.html).

Recommended next comparison: shrunken mean, ridge, nonlinear ridge and boosted
trees using the same released information, horizon and exposure structure.
Freeze input definitions and hyperparameter search before the final test.
Keep a zero/constant-mean challenger; an expensive model must improve something
measurable beyond producing a more interesting narrative.

## Macro dynamics: forecast the information actually available

Economic revisions make chronological testing different from splitting today's
downloaded CSV into train and test. ALFRED archives values available at past
dates. A release ledger must also preserve transformations calculated inside
the then-available vintage; a historical publication timestamp attached to
today's revised growth rate does not solve leakage.
[ALFRED documentation](https://alfred.stlouisfed.org/help).

v0.1 models the evolution of available macro states jointly with factor returns.
Next candidates are a shrinkage/Bayesian VAR and a dynamic factor/state-space
nowcaster with ragged releases. These would distinguish latent current
conditions from delayed observations. A recession HMM is another candidate,
but historical forecasts must use filtered state probabilities available at
the origin, not states smoothed using later returns.
[Hamilton's original regime-switching work and software](https://econweb.ucsd.edu/~jhamilto/software.htm).

Scenario analysis is separately labeled. The Federal Reserve likewise describes
stress scenarios as hypothetical, not forecasts. Our model's conditional
responses are statistical associations; causal changes from a rate decision
require structural assumptions beyond the estimated regression.
[Federal Reserve scenario methodology](https://www.federalreserve.gov/publications/2026-stress-test-scenarios.htm).

## Volatility, covariance and tails need separate validation

Covariance shrinkage is supported by the substantial Ledoit–Wolf literature.
However, this prototype uses a **fixed** shrinkage strength and a sampling
construction, not their estimated optimal intensity. Compare estimated linear
shrinkage and nonlinear alternatives when the asset universe grows.
[Ledoit and Wolf](https://ledoit.net/Honey_2004.pdf).

DCC models explicitly update conditional correlations after fitting individual
volatility processes. They are a sensible risk challenger to fixed standardized
correlations, especially for concentrated or multi-sector portfolios. They add
parameters and do not automatically solve co-crash behavior.
[Engle and Sheppard](https://www.nber.org/papers/w8554).

Filtered historical simulation scales historical standardized innovations by
forecast volatility. The `arch` documentation describes that bootstrap
approach. Our implementation adapts it to joint vectors and circular blocks;
it should not be called a fitted GARCH model. Large historical shocks survive,
but unknown shock mechanisms need explicit stress scenarios.
[arch forecasting documentation](https://arch.readthedocs.io/en/latest/univariate/forecasting.html).

With daily/realized-volatility data, compare EWMA, GJR-GARCH and Log-HAR first,
then a small foundation-model risk forecast. Evaluate variance forecasts with
appropriate losses such as QLIKE and assess whether the proxy assumptions
hold. Monthly squared returns alone are a noisy proxy.
[Patton](https://scholars.duke.edu/publication/792433).

For tails, test multivariate Student-t or skewed innovations in a representation
with sound wealth accounting. Do not exponentiate an unbounded Student-t log
return and report a stable population expected portfolio value: the positive
exponential moment does not exist. Empirical bootstrap paths avoid that
particular assumption but do not establish accurate 1-in-1,000 crisis losses.

## Deep sequence and generative models

TFT combines recurrent processing, attention, covariates and multi-horizon
quantile forecasts. It offers a framework for known future inputs and mixed
metadata, but its attention weights are not causal explanations.
[Original TFT paper](https://arxiv.org/abs/1912.09363).

TimeGrad uses diffusion to generate multivariate probabilistic forecasts.
That is more closely aligned with joint paths than a collection of separately
predicted marginal quantiles. Before adopting it, establish sufficient training
data, validate cross-asset and temporal dependence, and audit crash-frequency
behavior. Visual realism of generated paths is insufficient.
[Original TimeGrad paper](https://proceedings.mlr.press/v139/rasul21a/rasul21a.pdf).

Foundation-model experiment requirements:

1. Pin package version, model revision and weight hash; inspect the actual
   license and compute requirements for that revision.
2. Record pretraining cutoff and overlap uncertainty. Retrospective public
   series may have been in pretraining; a frozen genuinely later holdout is
   needed when contamination cannot be excluded.
3. Forecast returns/risk or economic states with defined units; a smooth price
   forecast can look good while failing to improve return forecasts.
4. Treat future macro covariates as simulated or conditional scenario inputs,
   never as observed future truth in baseline evaluation.
5. Require joint samples or an explicitly validated dependence reconstruction.
   Preserve sample identity across assets and horizon steps.
6. Compare costs, latency, reproducibility and forecast scores against the
   existing simple candidates. No candidate receives automatic ensemble weight.

## Combining and calibrating predictions

Dynamic model averaging motivates adaptation when model relevance changes.
The original method uses a specific state-space/Bayesian construction. Our
online squared-error expert update is a different, simpler algorithm; its
weights must not be presented as Bayesian posterior probabilities.
[Raftery, Kárný and Ettler](https://pubmed.ncbi.nlm.nih.gov/20607102/).

Prefer combining predictive distributions or entire trajectories, because
averaging only the means can erase model disagreement. Candidate errors can
still be highly correlated; having ten models does not create ten independent
sources of evidence. Fixed equal-weight and single-model benchmarks belong in
the future ensemble ablation.

Adaptive conformal inference studies sequential coverage under distribution
shift. Its long-run coverage properties do not imply exact coverage for this
specific portfolio, crisis or horizon. Overlapping twelve-month targets create
delayed feedback that must be respected in the update rule.
[Gibbs and Candès 2021](https://arxiv.org/abs/2106.00170),
[adaptive update extension](https://arxiv.org/abs/2208.08401).

v0.1 provides only a clearly labeled rolling interval correction based on
matured errors. It does not claim the published ACI guarantee and does not
convert loss frequencies into calibrated probabilities.

## Decide with portfolio-level evidence

Proper scoring rules reward useful predictive distributions, not just narrow
intervals or attractive means. We implemented empirical CRPS, interval score
and the Brier score for loss events; PIT and coverage reveal distribution
misspecification. A joint extension should add energy and variogram scores,
as well as dependence and drawdown calibration.
[Gneiting and Raftery](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf).

Evaluation must include:

- Fixed portfolios with different concentration, sector and beta exposures,
  plus a point-in-time universe where making strategy claims.
- Identical origins, information sets, simulation budgets and cost assumptions.
- Separately scored 1/6/12-month outcomes; no random row cross-validation.
- Release-aware fitting, then an inner chronological validation layer for any
  tuning, then an untouched outer evaluation period.
- Paired block uncertainty and multiple-comparison accounting when deciding
  promotions. Overlapping targets must not count as independent observations.
- Crisis and calm-period diagnostics without selecting the winner after seeing
  each period; archive every forecast before its outcome.
- Explicit distinction between statistical forecast quality and a trading
  strategy's net performance. This product currently simulates a specified
  portfolio; it does not optimize or automatically trade it.

## What this research establishes today

There is enough methodological support to build the modular prototype and
define credible challenger experiments. There is **no** evidence yet that this
implementation predicts real portfolio returns better than its baselines.
The synthetic run validates execution and exposes weaknesses rather than
proving skill. Integrating foundation models and advanced risk models is a
next research phase after historical data provenance and evaluation are sound.
