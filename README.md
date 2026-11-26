# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rommya85/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rommya85/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ranks the pre-token protocols in the sealed DefiLlama snapshot by an implied value model, and shows, for each one, the model walk-through and a concrete farm plan.

## Run it

```sh
node main.ts            # reads /input/snapshot.json, writes /output/*
```

Two runs write byte-identical output. The program uses no clock and no randomness.

---

<sub>Entered on [make.fun](https://make.fun/?ref=q2ms6026&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## The model

```
implied = clamp( round( 10 ^ ( a + b × log10(tvl_usd) ) ),
  $1,000,000, $100,000,000,000,000 )

a, b = least squares on (log10 TVL, log10 mcap) over the 128 tokened
       protocols that carry a market cap and a TVL, fitted from the
       snapshot at run time (a ≈ 3.02, b ≈ 0.52 on this snapshot)
```

Leave-one-out on those 128, the curve predicts a median |log error| of 1.223
(about ×3.4) with 32% of predictions within 2x — against 1.533 / 23% for the
comparables model it replaces. Growth and age were tested as multipliers on the
same protocol and changed nothing, so they do not enter the value; they still
decide the farm verdict and the token-odds column. Each row also carries an
interval from the leave-one-out residuals (P25–P75 on the board, P10–P90 in the
detail view), and the dashboard's ledger accounts for all 758 protocols in ten
groups.

No protocol name is special-cased and no price is hard-coded. Tokened protocols are used
only as the fit set; the board itself is strictly pre-token.

## The farm plan

Every row carries an 8-step plan: a verdict line (Farm now / Watch / Skip with the decisive
reason), then concrete actions that vary by the protocol's category, its chains and its TVL
band. Each step states the action, the principal, an estimated cost (gas, bridge fees) and
an estimated time, and a risk note. The principal is about 0.002% of TVL, floored at $250
and capped at $2,000, so it scales with the protocol's size.

## The dashboard

`dashboard/` is a single-page app with no network use. It recomputes every row's implied
value from the snapshot figures and regenerates every farm plan from the same derivation
`main.ts` writes to `board.json`, so the screenshots and the code are one arithmetic.
It is sortable (rank, implied value, TVL, 7-day change, age, token odds, verdict), searchable, and
filterable by category, chain, watchlist-only, TVL band and implied-value band; each
protocol opens a detail view at `#/protocol/<slug>` with the model walk-through and the
farm plan; the Methodology section at the bottom states the full formula, the fit, the
interval and its walk-forward coverage, the ledger and the token-odds bands.

## Files

- `main.ts` — entry point: reads the snapshot, writes `board.json`, `dashboard/`
  (with `zz-data.js`), `screenshots/` and `dossier.json`.
- `lib/model.ts` — the value model, the farm-plan generator and the board builder.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `vendor/makefun-board.ts` — the kit's dossier builder, used as-is.
- `screenshots/` — three views of the dashboard at 1440×900.
