# Token Radar — radar-7 (v6)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rommya85/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rommya85/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The largest pre-token protocols, priced. A size curve fitted on the tokened protocols,
pulled 5% toward each protocol's category peer median, times a growth factor times an
age factor, and a farm plan for every row.

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

`implied = clamp(round(exp(0.95·ln(curve) + 0.05·ln(peer)) × momentum × maturity), $1M, $100T)`
where `curve = 10^(a + b·log10(TVL))` and `peer = TVL × category peer median`.

- The size curve is least squares on `(log10 TVL, log10 mcap)` over the 128 tokened
  protocols that carry a market cap and a TVL: `log10(mcap) = 3.0247 + 0.5223 × log10(TVL)`.
- The peer pull takes the curve 5% of the way toward the protocol's category peer
  median in log space: its TVL times the median mcap/TVL of its own category among
  the tokened protocols, or the global median when the category holds fewer than three.
- `momentum = clamp(1 + 0.5 × clamp(change_7d, −60, 120)/100, 0.8, 1.5)`, 1.0 when the
  week is unreported. `maturity = 0.85 + 0.15 × min(age, 730)/730`, a missing listing
  date using the snapshot median age of 677 days.
- Intervals are cross-conformal: 5 time-ordered folds, each fold's residuals from a
  curve trained on the other four — P25 ×0.33, P75 ×4.23, P10 ×0.07, P90 ×9.49.
  Walk-forward coverage: 53% inside P25–P75 (stated 50%), 77% inside P10–P90 (stated 80%).

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
| Peer-median blend (weight 0.05) | 1.224 → 1.204 | 1.136 → 1.046 | Kept |

Shipped model: LOO 1.204, walk-forward 1.046; 31%/45% of leave-one-out predictions
within 2x/3x. The category dummies are the overfit signature: they improve walk-forward
while leave-one-out falls, so they are dropped. The comparables model loses both tests
outright — a flat peer multiple cannot price a board whose multiples fall with size:
on the largest rows the peer value runs to 6.5x the curve. Steakhouse Financial shows
why the pull is only 5%: the curve says $90.1M, the global median ×0.21 says $588.8M,
its one Risk Curators peer at ×2.97 would say $8.2B — and the 5% pull lands at $99.0M,
barely moved. The detail view walks the pull end-to-end for every row: the curve, the
peer value, the blended number, then the two factors. The concentration cap binds on no
board row, so it earns no place.

## The board

198 pre-token rows: the 40-protocol watchlist ($50M+ TVL, no token) plus 158 early
candidates below the floor. 2 Farm now, 59 Watch, 137 Skip — the same verdicts as v5:
the blend moves ranks gently (median move 1, max 6, the top five in the same order) and
changes no verdict. Verdicts carry their farm cost (principal from the TVL curve, gas
across the whole plan). 179 of 198 rows move rank against the bare size curve, so growth
and age set the order, not just the verdicts.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the board, the dashboard and the dossier.
- `lib/model.ts` — the model: snapshot parsing, OLS fit, peer-median blend, held-out
  selection, conformal intervals, farm plans, board build, dossier data.
- `dashboard/` — the static page: ranked board, filters, detail walk-throughs with farm
  plans, Methodology with the full held-out table.
- `screenshots/` — board, detail, filtered Risk Curators watchlist-only, methodology.
- `vendor/makefun-board.ts` — the make.fun dossier library.
