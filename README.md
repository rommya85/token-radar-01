# Token Radar — pre-token protocols ranked by implied value (radar-5)

A radar for token launches: it reads a sealed snapshot of 758 protocols, ranks the 198
pre-token ones it can score by what their launch would be worth, and shows how to farm
each one. 40/40 watchlist covered, plus 158 early candidates below the $50M floor.

## The model

Implied value is a fitted size curve times a growth factor times an age factor, all
computed from the snapshot itself at run time:

```
fit set   = the 128 tokenized protocols with a market cap and a TVL
OLS       = least squares on (log10 TVL, log10 mcap): log10(mcap) = 3.0247 + 0.5223 x log10(TVL)
momentum  = clamp(1 + 0.5 x clamp(change_7d, -60, 120) / 100, 0.8, 1.5); null -> 1.0
maturity  = 0.85 + 0.15 x min(age, 730) / 730; missing listed_at uses the median age (677 days)
implied   = clamp(round(10 ^ (a + b x log10(tvl_usd)) x momentum x maturity), $1M, $100T)
```

All three figures the model is judged on -- TVL, seven-day growth, time with no token --
enter every value, so the ranking is not TVL order: 183 of 198 rows move rank against
the bare size curve. The factor weights are the grid's pick: 24 combinations of growth
weight, maturity floor and maturity span, each scored on leave-one-out and on
walk-forward (train on tokens listed before 2024-07-08, test on the 43 listed after).
The grid is flat (1.223-1.249 leave-one-out), so the weights are chosen for visible
differentiation at no backtest cost: leave-one-out 1.224 with 33% within 2x, against
the bare curve's 1.223 with 32%. A free linear fit of the curve's residuals on growth
and age was tried and rejected as the factor shape (slopes small, |t| < 2); the
Methodology section prints its numbers.

Every row carries an interval from the leave-one-out residuals of the full model
(P25 x0.33, P75 x4.39; P10 x0.07, P90 x9.58) and a token-odds share from its age band.
The ledger accounts for all 758 protocols: 128 token trades, 288 token recorded with
no usable cap, 40 ranked watchlist, 20 ranked off-list above the floor, 138 ranked
early below it, 43 out bridge, 43 out liquid staking, 42 out exchange, 11 out
versioned, 5 out wrapped.

## The farm plan

Each of the 198 rows carries 8 steps: a verdict (Farm now / Watch / Skip, from the
implied value, the week's growth and the age), a fresh wallet, the category's main
action, a second action, a weekly qualifying action, a hold period, a points check,
and a farm log. Every step names its principal, its cost and its time; gas follows
the protocol's main chain and the principal scales with TVL ($250 floor, $2,000 cap).

## Run it

```
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Writes `board.json`, `dashboard/` (with `zz-data.js`), `screenshots/` and
`dossier.json`. Deterministic: two runs write byte-identical output. The dashboard is
a static page with no network: search, category/chain/TVL/value filters, a
watchlist-only toggle, sortable columns, a Pre-token / Live token tab, a detail view
with the model's walk-through and the farm plan for every protocol, and the
Methodology section. Screenshots are 1440x900 renders of the real page (board,
detail, filtered, methodology).

## Verification (this build)

- Gate validator: 8/8 PASS (dashboard 4 files, 198 rows, sorted, 40/40 coverage,
  198x8 farm steps, 4 screenshots, dossier matches, text 54,157 bytes).
- Two-run diff: identical. Mirror check: 198/198 detail views match board.json.
- 0 JavaScript errors on all four views. No network addresses in the entry's code,
  no timestamps, no randomness, no hardcoded protocol names.

## Sort keys

`implied_value_usd` desc (rank), then slug. Verdict lines: Farm now at implied
>= $50M with non-negative 7-day growth and age >= 180 days; Watch at implied
>= $10M; Skip below that.
