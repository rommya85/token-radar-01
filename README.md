# Token Radar — radar-6 (v5)

The largest pre-token protocols, priced. A size curve fitted on the tokened protocols,
times a growth factor times an age factor, and a farm plan for every row.

## Run

```sh
node main.ts --input /input/snapshot.json
```

Reads the sealed snapshot (`/input/snapshot.json`, or `--input <snapshot.json|directory>`),
writes `board.json`, `dashboard/` (the static page + `zz-data.js`, one minified line),
`screenshots/` and `dossier.json` to `/output` (or `MAKEFUN_OUTPUT_DIR`).
Node 22, standard library only, no network, deterministic: the same snapshot always
writes the same bytes.

## The model

`implied = clamp(round(10^(a + b·log10(TVL)) × momentum × maturity), $1M, $100T)`

- The size curve is least squares on `(log10 TVL, log10 mcap)` over the 128 tokened
  protocols that carry a market cap and a TVL: `log10(mcap) = 3.0247 + 0.5223 × log10(TVL)`.
- `momentum = clamp(1 + 0.5 × clamp(change_7d, −60, 120)/100, 0.8, 1.5)`, 1.0 when the
  week is unreported. `maturity = 0.85 + 0.15 × min(age, 730)/730`, a missing listing
  date using the snapshot median age of 677 days.
- Intervals are cross-conformal: 5 time-ordered folds, each fold's residuals from a
  curve trained on the other four — P25 ×0.33, P75 ×4.31, P10 ×0.07, P90 ×9.88.
  Walk-forward coverage: 51% inside P25–P75 (stated 50%), 77% inside P10–P90 (stated 80%).

## Held-out selection — every value term tested twice

A term is kept only when it worsens neither blind test (leave-one-out and walk-forward,
median |ln error| over the 128 tokened protocols) by more than 0.005 and improves the
sum of the two. Forward selection, tested in order:

| Candidate term | Leave-one-out | Walk-forward | Verdict |
| --- | --- | --- | --- |
| Momentum (growth, weight 0.5) | 1.223 → 1.224 | 1.151 → 1.154 | Dropped |
| Maturity (age, 0.85 floor, 730 days) | 1.223 → 1.223 | 1.151 → 1.151 | Kept |
| Momentum on top of maturity | 1.223 → 1.224 | 1.151 → 1.136 | Kept |
| Linear growth slope | 1.223 → 1.325 | 1.151 → 1.058 | Dropped |
| Linear maturity slope | 1.223 → 1.272 | 1.151 → 1.422 | Dropped |
| Both linear slopes | 1.223 → 1.331 | 1.151 → 1.321 | Dropped |
| Category dummies (13 levels) | 1.223 → 1.426 | 1.151 → 0.938 | Dropped |
| Category-median comparables instead of the curve | 1.223 → 1.613 | 1.151 → 1.615 | Dropped |
| Concentration cap (implied ≤ TVL × P95 mcap/TVL) | 1.224 → 1.224 | 1.136 → 1.136 | Dropped |

Shipped model: LOO 1.224, walk-forward 1.136; 33%/44% of leave-one-out predictions
within 2x/3x. The category dummies are the overfit signature: they improve walk-forward
while leave-one-out falls, so they are dropped. The comparables model loses both tests
outright — a flat peer multiple cannot price a board whose multiples fall with size,
and for the largest rows it would pay six to ninety-six times the curve. The detail
view shows the category peer median as a clearly-labeled cross-check, not the value.
The concentration cap binds on no board row, so it earns no place.

## The board

198 pre-token rows: the 40-protocol watchlist ($50M+ TVL, no token) plus 158 early
candidates below the floor. 2 Farm now, 59 Watch, 137 Skip. Verdicts carry their farm
cost (principal from the TVL curve, gas across the whole plan). 183 of 198 rows move
rank against the bare size curve, so growth and age set the order, not just the verdicts.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the board, the dashboard and the dossier.
- `lib/model.ts` — the model: snapshot parsing, OLS fit, held-out selection, conformal
  intervals, farm plans, board build, dossier data.
- `dashboard/` — the static page: ranked board, filters, detail walk-throughs with farm
  plans, Methodology with the full held-out table.
- `screenshots/` — board, detail, filtered Risk Curators watchlist-only, methodology.
- `vendor/makefun-board.ts` — the make.fun dossier library.
