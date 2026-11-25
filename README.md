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
implied = clamp( round( tvl_usd
  × multiple(category)          median mcap/TVL of tokened protocols in the same
                                category, computed from the snapshot at run time;
                                falls back to the global median when a category has
                                fewer than 3 tokened comparables
  × momentum(change_7d)         1.0 when change_7d is not reported, else
                                1 + 0.5 × clamp(change_7d, −60, +120) / 100,
                                bounded to [0.8, 1.5]
  × maturity(age)               0.7 + 0.3 × min(age, 1095) / 1095, where age is the
                                days since listed_at; a missing listed_at uses the
                                snapshot median age
  × concentration               dampens a multiple above the global 75th percentile
                                back toward it ),
  $1,000,000, $100,000,000,000,000 )
```

No protocol name is special-cased and no price is hard-coded. Tokened protocols are used
only as comparables; the board itself is strictly pre-token.

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
It is sortable (rank, implied value, TVL, 7-day change, age, verdict), searchable, and
filterable by category, chain, watchlist-only, TVL band and implied-value band; each
protocol opens a detail view at `#/protocol/<slug>` with the model walk-through and the
farm plan; the Methodology section at the bottom states the full formula, the factor
bounds, the coverage and the determinism note.

## Files

- `main.ts` — entry point: reads the snapshot, writes `board.json`, `dashboard/`
  (with `zz-data.js`), `screenshots/` and `dossier.json`.
- `lib/model.ts` — the value model, the farm-plan generator and the board builder.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `vendor/makefun-board.ts` — the kit's dossier builder, used as-is.
- `screenshots/` — three views of the dashboard at 1440×900.
