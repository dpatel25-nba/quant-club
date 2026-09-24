# Model specification, v0.1

Fixed research defaults, written before real-market validation. They are
engineering choices, not statistically established optimal settings.

## Targets and chronology

Let `f[t]` be log total returns of benchmark/sector/style factor portfolios,
`a[t]` asset log total returns, and `m[t]` the macro state actually available at
month end t. The joint regression uses:

```
x[t] = [f[t], m[t]]
y[t] = [f[t+1], m[t+1] - m[t]]
```

At cutoff T, training labels end at T and predictors end at T−1. Current
prediction uses `x[T]`. Full multi-month paths are generated recursively.
This first version has no direct horizon-specific mean model. A twelve-month
simulation is not twelve independent one-month predictions.

## Mean candidates and asset exposures

1. **Historical**: factor log mean is half the trailing sample mean; macro
   increments are 10% of the gap between the historical macro mean and the
   current state.
2. **Ridge**: jointly regress all target columns on standardized current state,
   with an unpenalized intercept and penalty 1 under mean-squared-error scaling.
3. **Nonlinear ridge**: augment the standardized input with 32 fixed-seed random
   Fourier features approximating a radial-basis kernel; use the same penalty.

Both input and target normalization use only the fit's training history.
The final model uses up to 120 monthly transitions. No hyperparameters were
selected on the demonstrated results.

Estimate each asset's contemporaneous factor exposures with a standardized
ridge penalty of .05 over the corresponding return window. Restore units
before simulation. Asset log returns satisfy `a = f B + e` with **zero expected
stock-specific alpha**. Center each stock's residual history before sampling.
Log-factor exposures are an approximation; they are not exact simple-return
portfolio replication weights, causal sensitivities or option deltas.

## Sequential ensemble weights

Score at most the previous 48 one-month predictions. Each candidate is refitted
on at most 120 earlier transitions, with at least 60 transitions before the
first score. Its loss is mean factor squared error divided by factor training
variance. For each newly observed outcome:

```
log_weight = .98 * previous_log_weight - .1 * standardized_MSE
weight = .97 * softmax(log_weight) + .03 / number_of_models
```

Start uniformly. The weights are adaptive expert weights, not posterior model
probabilities. They score one-month factor means, not portfolio CRPS or 6/12m
accuracy. Longer-horizon weighting is future research, not a claimed capability.
Sample one expert for each complete simulated trajectory using weights frozen
at the real forecast origin. Do not update weights using invented future data.
Candidate variation represents some model disagreement; parameters and factor
loadings remain fixed and full parameter uncertainty is not integrated.

## Innovations, risk and dependence

For each candidate, concatenate same-month residuals of factor predictions,
macro increments and asset exposures. Center the residuals. Filter each column
with an EWMA variance (`lambda=.94`); initialize with at most the first twelve
residuals and floor at max(1% of sample variance, 1e−12). Normalize the filtered
residual history to zero mean and unit variance where nonconstant.

Sample joint vectors using a circular stationary bootstrap with expected block
length three months. At each step restart at a uniformly chosen historical
row with probability 1/3; otherwise advance one row, wrapping at the end.

Implement diagonal correlation shrinkage with:

```
z = sqrt(.9) * joint_vector + sqrt(.1) * independently_sampled_components
```

This construction shrinks off-diagonal covariance toward zero without a matrix
inversion for sampling. It modifies the empirical joint tail law and can
understate dependence in crises. It is not a fitted Ledoit–Wolf shrinkage
intensity, a t-copula, DCC-GARCH or a regime-switching model.

Multiply innovations by each trajectory's current EWMA standard deviations and
update variances with its simulated shocks. Thus conditional covariance changes
with volatility, while the standardized correlation target is fixed at origin.
Conditional means and volatility vary along paths; loadings do not.

In-sample fitted residuals can underestimate predictive uncertainty. There is
no degrees-of-freedom correction or coefficient posterior in this version.
The chronological distribution backtest must expose this limitation. Historical
resampling retains empirical asymmetry and large observations, but cannot
invent unseen tail events. Avoid claiming guaranteed extreme-tail coverage.

No unbounded Student-t distribution is exponentiated into asset prices: its
moment-generating function would not provide a finite expected gross return.
The finite empirical innovation distribution has bounded one-step support;
multi-step feedback can still produce unstable trajectories. Asset log moves
above absolute 20 or nonfinite values stop the run rather than being silently
clipped. This is a numerical guard, not a realistic economic bound.

## Macro paths

In baseline mode macro states and factor returns evolve jointly. In scenario
mode impose the supplied next macro state. Convert its departure from the
candidate's predicted increment to a standardized macro innovation `u`.
For sampled nonmacro innovation `v` and macro innovation `z_m`, replace:

```
v_cond = v + (u - z_m) C_mm^(-1) C_m,other
```

Use the shrunk empirical standardized covariance and a 1e−8 solve ridge.
Then set the macro innovation to u exactly. Scale back by path variances.
This is a linear residual conditional-location approximation; the remaining
non-Gaussian residual is not proven independent of macro innovations.
Scenario weights and causal effects are outside this model.

## Portfolio accounting

Holdings begin at `initial_value * weights`. Multiply each holding by `exp(log
return)` each step. For monthly rebalancing, after every nonterminal step:

```
one_way_turnover = .5 * sum(abs(drifted_weights - target_weights))
net_value = gross_value * (1 - cost_bps / 10000 * one_way_turnover)
holdings = target_weights * net_value
```

`cost_bps` is a portfolio-level cost per unit of one-way turnover, not a
per-side brokerage commission. This proportional haircut convention resets
weights after deducting costs; it does not solve exact per-security execution
costs. No opening or terminal liquidation trades are charged. Buy-and-hold
allows weights to drift. No cash flows, leverage, taxes or FX are modeled.

Drawdown is measured against the path's running peak including initial value.
Monthly observations miss intramonth peaks and troughs. Terminal 5% tail mean
is the empirical mean return among paths below the sample fifth percentile.
Probability estimates are simulation frequencies, not calibrated guarantees.

## Evaluation and empirical interval adjustment

Rolling origins train strictly through origin month, then compare simulated
portfolio returns with the next H realized returns. Evaluate all candidates,
the ensemble and a joint raw-return stationary-bootstrap baseline on identical
dates/weights/cost assumptions. The baseline has no macro conditioning or
volatility filtering. Scores are CRPS, 80% interval score, empirical interval
coverage, probability-of-loss Brier score and empirical PIT.

For the ensemble only, the diagnostic interval adjustment requires 20 already
matured same-horizon intervals. Use the most recent 60 nonnegative errors
outside each interval divided by its width. Their corrected 80% empirical
quantile expands the new interval; cap the lower return bound at −100%.
This is a conformal-inspired rolling adjustment, **not an implementation of
Adaptive Conformal Inference and not an exchangeability/conditional guarantee**.
It is not applied to live paths, probabilities or mean forecasts.

Six/twelve-month targets can overlap even at six-month evaluation spacing.
Outputs report origin counts but no independent-sample p-values. Before any
promotion, add paired block uncertainty across appropriate origin blocks,
multiplicity controls, frozen candidate definitions and untouched forward data.
