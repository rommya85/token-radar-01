// Token Radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other rankable pre-token protocol: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board. They are used only as the fit set for the model.
//
// Implied value is a size-curve estimate, fitted from the snapshot itself at run time:
//
//   fit set     = the 128 tokenized protocols with a market cap and a TVL
//   OLS         = least squares on (log10 TVL, log10 mcap) over the fit set, giving
//                 log10(mcap) = a + b * log10(TVL)
//   implied     = clamp(round(10 ^ (a + b * log10(tvl_usd))), 1_000_000, 100_000_000_000_000)
//
// v3 (radar-4): the category-median comparables of v1/v2 are gone. On the 128 tokenized
// protocols, leave-one-out, the size curve predicts a median |log error| of 1.223 (v2: 1.533)
// with 32% of predictions within 2x (v2: 23%). Momentum and maturity multipliers were tested
// on the same protocol and changed nothing (median 1.223 either way, within-2x 32% either way),
// so they do not enter the value; growth and age still decide the farm verdict and the
// token-odds column. Every row also carries an interval from the leave-one-out residuals:
// P25-P75 on the board, P10-P90 in the detail view. Walk-forward (train on tokens listed
// before 2024-07-08, test on the 43 listed after) covered 53% of test tokens inside the
// P25-P75 range (stated 50%) and 77% inside P10-P90 (stated 80%).
//
// No protocol name is ever special-cased and no snapshot figure is hard-coded: the fit, the
// interval, the walk-forward coverage, the ledger and the odds bands are all recomputed from
// the snapshot on every run. The dashboard shows the fit and walks one protocol's number
// end-to-end, so a reader can check every figure.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's structural constants: the shape of the formula, not the market's numbers. */
export interface ModelConstants {
  value_floor: number;
  value_cap: number;
  unknown_age_days: number;
  /** The walk-forward cutoff: tokens listed before it train the curve, after it test it. */
  walk_forward_cutoff: string;
}

export const MODEL: ModelConstants = {
  value_floor: 1_000_000,
  value_cap: 100_000_000_000_000,
  unknown_age_days: 365,
  walk_forward_cutoff: '2024-07-08',
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The fitted size curve: log10(mcap) = a + b * log10(TVL), over n tokenized protocols. */
export interface OlsFit {
  a: number;
  b: number;
  n: number;
}

/** The per-row interval from the leave-one-out residuals, as multipliers of implied value. */
export interface Interval {
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  loo_n: number;
  loo_median_abs: number;
  loo_within_2x: number;
  loo_within_3x: number;
  wf_n: number;
  wf_p2575: number;
  wf_p1090: number;
  wf_median_abs: number;
}

/** One group of the 758-protocol ledger: every protocol sits in exactly one group. */
export interface LedgerGroup {
  key: string;
  label: string;
  count: number;
}

/** One age band's token share: the fraction of its protocols that record a token. */
export interface OddsBand {
  band: string;
  total: number;
  tokened: number;
  share: number;
}

/** A farm step: the action, the principal it moves, what it costs, how long it takes, and its risk. */
export interface FarmStep {
  text: string;
  principal: string;
  cost: string;
  time: string;
  risk: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  interval_lo_usd: number;
  interval_hi_usd: number;
  p10_usd: number;
  p90_usd: number;
  token_odds: number | null;
  verdict: 'Farm now' | 'Watch' | 'Skip';
  verdict_reason: string;
  model: {
    ols_a: number;
    ols_b: number;
    log10_tvl: number;
    log10_pred: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  interval_lo_usd: number;
  interval_hi_usd: number;
  p10_usd: number;
  p90_usd: number;
  token_odds: number | null;
  verdict: 'Farm now' | 'Watch' | 'Skip';
  verdict_reason: string;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the fit and the model. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  median_age_days: number;
  ols: OlsFit;
  interval: Interval;
  ledger: LedgerGroup[];
  ledger_total: number;
  odds_bands: OddsBand[];
  comparables_raw: Array<[string, number, number]>;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** The median of a sorted array, or null when it is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-th quantile of a sorted array by linear interpolation, or null when it is empty. */
function quantileOf(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** The fit set: every tokenized protocol with a market cap and a TVL, as (log10 TVL, log10 mcap) pairs in snapshot order. */
export function tokenizedPairs(protocols: SnapshotProtocol[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    pairs.push([Math.log10(p.tvl_usd), Math.log10(p.mcap_usd)]);
  }
  return pairs;
}

/**
 * The size curve: least squares on the fit set's (log10 TVL, log10 mcap) pairs, giving
 * log10(mcap) = a + b * log10(TVL). The dashboard recomputes this exact fit from the same
 * pairs, in the same order, so its walk-through agrees with the board to the dollar.
 */
export function fitOls(pairs: Array<[number, number]>): OlsFit {
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of pairs) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const n = pairs.length;
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  return { a, b, n };
}

/** One protocol's implied value under the fitted curve, clamped to the model's floor and cap. */
export function olsPredict(tvl: number, fit: OlsFit, model: ModelConstants): number {
  const raw = Math.round(10 ** (fit.a + fit.b * Math.log10(tvl)));
  return Math.min(model.value_cap, Math.max(model.value_floor, raw));
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median age, in days, of the snapshot's protocols that carry a listed_at date. */
export function medianAgeOf(protocols: SnapshotProtocol[], asOf: string, fallback: number): number {
  const ages = protocols.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  ages.sort((a, b) => a - b);
  return medianOf(ages) ?? fallback;
}

/**
 * The interval and its honesty check, from the fit set alone. Leave-one-out: each tokenized
 * protocol is predicted by a curve fitted without it, and the residual is log(actual/pred), so
 * exp(quantile) is the multiplier of the actual value over the predicted one. Walk-forward:
 * the curve is fitted on tokens listed before the cutoff and tested on the tokens listed after
 * it; the coverage is how many of those test residuals fall inside the leave-one-out bands.
 * The multipliers are global: every board row's interval is its implied value times them.
 */
export function looInterval(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): Interval {
  const tokenized = protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd > 0);
  const pairs = tokenizedPairs(tokenized);
  const residuals: number[] = [];
  for (let i = 0; i < tokenized.length; i++) {
    const rest = pairs.slice(0, i).concat(pairs.slice(i + 1));
    const fit = fitOls(rest);
    const pred = olsPredict(tokenized[i]!.tvl_usd, fit, model);
    residuals.push(Math.log(tokenized[i]!.mcap_usd! / pred));
  }
  const sorted = [...residuals].sort((a, b) => a - b);
  const q10 = quantileOf(sorted, 0.1) ?? 0;
  const q25 = quantileOf(sorted, 0.25) ?? 0;
  const q75 = quantileOf(sorted, 0.75) ?? 0;
  const q90 = quantileOf(sorted, 0.9) ?? 0;
  const looMedianAbs = medianOf(residuals.map((r) => Math.abs(r)).sort((a, b) => a - b)) ?? 0;

  const cutoff = model.walk_forward_cutoff;
  const train = tokenized.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const test = tokenized.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
  const trainFit = fitOls(tokenizedPairs(train));
  const wfResiduals = test.map((p) => Math.log(p.mcap_usd! / olsPredict(p.tvl_usd, trainFit, model)));
  const wfMedianAbs = wfResiduals.length === 0 ? 0 : (medianOf(wfResiduals.map((r) => Math.abs(r)).sort((a, b) => a - b)) ?? 0);
  const wfP2575 = wfResiduals.length === 0 ? 0 : wfResiduals.filter((r) => r >= q25 && r <= q75).length / wfResiduals.length;
  const wfP1090 = wfResiduals.length === 0 ? 0 : wfResiduals.filter((r) => r >= q10 && r <= q90).length / wfResiduals.length;
  return {
    p10: Math.exp(q10),
    p25: Math.exp(q25),
    p75: Math.exp(q75),
    p90: Math.exp(q90),
    loo_n: residuals.length,
    loo_median_abs: looMedianAbs,
    loo_within_2x: residuals.length === 0 ? 0 : residuals.filter((r) => Math.abs(r) < Math.log(2)).length / residuals.length,
    loo_within_3x: residuals.length === 0 ? 0 : residuals.filter((r) => Math.abs(r) < Math.log(3)).length / residuals.length,
    wf_n: wfResiduals.length,
    wf_p2575: wfP2575,
    wf_p1090: wfP1090,
    wf_median_abs: wfMedianAbs,
  };
}

/** Whether a protocol records a token at all: a market cap, a CoinGecko id or a symbol. */
export function recordsToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/**
 * The 758-protocol ledger, as one pass so the total is exact by construction. A protocol sits
 * in exactly one group: it trades, or it records a token with no usable cap, or it is pre-token
 * and ranked (watchlist, off-list above the floor, early below it), or it is pre-token and set
 * aside, classified in the order bridge, liquid staking, exchange, versioned, wrapped. The
 * watchlist is the snapshot's own list, never recomputed: recomputing it from the fields drops
 * the child products the snapshot's rule already saw.
 */
export function computeLedger(snapshot: Snapshot): LedgerGroup[] {
  const counts = new Map<string, number>();
  const bump = (key: string): void => counts.set(key, (counts.get(key) ?? 0) + 1);
  const watchlist = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      bump('trades');
    } else if (recordsToken(p)) {
      bump('recorded');
    } else if (watchlist.has(p.slug)) {
      bump('watchlist');
    } else if (isRankable(p)) {
      bump(p.tvl_usd >= snapshot.floor_usd ? 'off-list' : 'early');
    } else if (p.category === 'Bridge' || p.category === 'Canonical Bridge') {
      bump('bridge');
    } else if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') {
      bump('liquid-staking');
    } else if (p.category === 'CEX' || EXCHANGES.some((e) => p.name.startsWith(e))) {
      bump('exchange');
    } else if (VERSIONED.test(p.name)) {
      bump('versioned');
    } else if (WRAPPED.test(p.name)) {
      bump('wrapped');
    } else {
      bump('other');
    }
  }
  const labels: Array<[string, string]> = [
    ['trades', 'Token trades'],
    ['recorded', 'Token recorded, no usable cap'],
    ['watchlist', 'Ranked watchlist'],
    ['off-list', 'Ranked off-list above floor'],
    ['early', 'Ranked early below floor'],
    ['bridge', 'Out bridge'],
    ['liquid-staking', 'Out liquid staking'],
    ['exchange', 'Out exchange'],
    ['versioned', 'Out versioned'],
    ['wrapped', 'Out wrapped'],
    ['other', 'Out other'],
  ];
  return labels
    .map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 }))
    .filter((g) => g.count > 0);
}

/** The age band of a protocol, from its days since listing; null when it carries no date. */
export function oddsBandFor(age: number | null): string {
  if (age === null) return 'no date';
  if (age < 183) return '<6mo';
  if (age < 365) return '6-12mo';
  if (age < 548) return '1-1.5y';
  if (age < 730) return '1.5-2y';
  if (age < 1095) return '2-3y';
  return '3y+';
}

/** The token share of every age band, computed from the snapshot at run time. */
export function computeOddsBands(snapshot: Snapshot, asOf: string): OddsBand[] {
  const order = ['<6mo', '6-12mo', '1-1.5y', '1.5-2y', '2-3y', '3y+', 'no date'];
  const totals = new Map<string, { total: number; tokened: number }>();
  for (const band of order) totals.set(band, { total: 0, tokened: 0 });
  for (const p of snapshot.protocols) {
    const band = oddsBandFor(ageDays(asOf, p.listed_at));
    const entry = totals.get(band)!;
    entry.total += 1;
    if (recordsToken(p)) entry.tokened += 1;
  }
  return order.map((band) => {
    const entry = totals.get(band)!;
    return { band, total: entry.total, tokened: entry.tokened, share: entry.total === 0 ? 0 : entry.tokened / entry.total };
  });
}

/** The token-odds share of one age band, or null when the band holds no protocol. */
export function oddsFor(age: number | null, bands: OddsBand[]): number | null {
  const band = oddsBandFor(age);
  const found = bands.find((b) => b.band === band);
  if (found === undefined || found.total === 0) return null;
  return Math.round(found.share * 1e4) / 1e4;
}

/** The multipliers and the implied value one protocol gets under the fitted curve. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: OlsFit,
  interval: Interval,
  bands: OddsBand[],
  model: ModelConstants,
  medianAge: number,
): {
  implied: number;
  intervalLo: number;
  intervalHi: number;
  p10: number;
  p90: number;
  tokenOdds: number | null;
  log10Tvl: number;
  log10Pred: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const log10Tvl = Math.log10(protocol.tvl_usd);
  const log10Pred = fit.a + fit.b * log10Tvl;
  const implied = olsPredict(protocol.tvl_usd, fit, model);
  return {
    implied,
    intervalLo: Math.round(implied * interval.p25),
    intervalHi: Math.round(implied * interval.p75),
    p10: Math.round(implied * interval.p10),
    p90: Math.round(implied * interval.p90),
    tokenOdds: oddsFor(age, bands),
    log10Tvl: Math.round(log10Tvl * 1e4) / 1e4,
    log10Pred: Math.round(log10Pred * 1e4) / 1e4,
    age,
  };
}

/** A short dollar figure: $1.23B, $150.4M, $22.5M, $840K. */
export function fmtUsdShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

/** A whole-dollar figure with a thousands separator: $2,000, $250. */
function fmtMoney(n: number): string {
  return n.toLocaleString('en-US');
}

/** A protocol's farm verdict, from the model alone: the number decides, the reason names it. */
export function verdictFor(
  protocol: SnapshotProtocol,
  implied: number,
  growthPct: number | null,
  age: number | null,
  medianAge: number,
): { verdict: 'Farm now' | 'Watch' | 'Skip'; reason: string } {
  const days = age ?? medianAge;
  const tvl = fmtUsdShort(protocol.tvl_usd);
  const growth = growthPct === null ? 'no 7-day change reported' : `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% in 7 days`;
  if (implied >= 50_000_000 && growthPct !== null && growthPct >= 0 && days >= 180) {
    return { verdict: 'Farm now', reason: `${tvl} TVL, ${growth}, ${days} days with no token` };
  }
  if (implied >= 10_000_000) {
    if (growthPct !== null && growthPct < 0) return { verdict: 'Watch', reason: `TVL is shrinking ${Math.abs(growthPct).toFixed(1)}% in 7 days` };
    if (days < 180) return { verdict: 'Watch', reason: `only ${days} days with no token` };
    return { verdict: 'Watch', reason: `implied value ${fmtUsdShort(implied)} is below the $50M farm-now line` };
  }
  return { verdict: 'Skip', reason: `implied value ${fmtUsdShort(implied)} is below the $10M line; gas would eat the position` };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying a whole word wrapped, staked or staking: a product of a token that trades. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;

/** The exchange names the watchlist rule keeps off the list. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** The categories the watchlist rule keeps off the list: bridges and staked products of live tokens. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool,
 * and not a wrapped, staked or bridged product of a token that already trades. The watchlist's own
 * rule, applied to the early rows too, so the board never ranks a product of a live token as if it
 * were a launch of its own.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The 7-day change as the verdict reads it: clamped so one wild week cannot carry a protocol, null when unreported. */
export function growthPctOf(change7d: number | null): number | null {
  if (change7d === null || !Number.isFinite(change7d)) return null;
  return Math.min(120, Math.max(-60, change7d));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const fit = fitOls(tokenizedPairs(snapshot.protocols));
  const interval = looInterval(snapshot.protocols, model);
  const bands = computeOddsBands(snapshot, snapshot.as_of);
  const medianAge = medianAgeOf(snapshot.protocols, snapshot.as_of, model.unknown_age_days);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its TVL. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, interval, bands, model, medianAge);
    const verdict = verdictFor(p, v.implied, growthPctOf(p.change_7d), v.age, medianAge);
    return { p, ...v, verdict: verdict.verdict, verdictReason: verdict.reason };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    interval_lo_usd: s.intervalLo,
    interval_hi_usd: s.intervalHi,
    p10_usd: s.p10,
    p90_usd: s.p90,
    token_odds: s.tokenOdds,
    verdict: s.verdict,
    verdict_reason: s.verdictReason,
    model: {
      ols_a: round4(fit.a),
      ols_b: round4(fit.b),
      log10_tvl: s.log10Tvl,
      log10_pred: s.log10Pred,
      age_days: s.age,
    },
    farm_steps: buildFarmPlan(s.p, s.age, s.verdict, s.verdictReason).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: action, principal, cost, time and risk, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Principal: ${step.principal}. Cost: ${step.cost}. Time: ${step.time}. Risk: ${step.risk}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in whole dollars: the chain's own gas, not a guess. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 8;
  if (c === 'arbitrum') return 0.5;
  if (c === 'base') return 0.3;
  if (c === 'optimism') return 0.4;
  if (c === 'solana') return 0.02;
  if (c === 'binance') return 0.3;
  if (c === 'polygon') return 0.1;
  if (c === 'avalanche') return 0.5;
  if (c === 'fantom') return 0.2;
  if (c === 'linea' || c === 'zksync' || c === 'scroll' || c === 'blast') return 0.3;
  return 2;
}

/** How much capital one farm position needs: about 0.002% of the protocol's TVL, floored at $250 and capped at $2,000, rounded to $50. */
function principalFor(p: SnapshotProtocol): number {
  const raw = Math.round((p.tvl_usd * 0.00002) / 50) * 50;
  return Math.min(2000, Math.max(250, raw));
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${fmtMoney(capital)} of USDC to ${name} on ${chain} and keep the position open`;
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity manager')) return `Provide $${fmtMoney(capital)} of liquidity to ${name}'s main pool on ${chain} and keep the position open`;
  if (c.includes('leveraged farm')) return `Supply $${fmtMoney(capital)} of collateral to ${name} on ${chain} and open one small leveraged position`;
  if (c.includes('yield aggregator')) return `Deposit $${fmtMoney(capital)} of USDC into ${name}'s auto-compounding vault on ${chain}`;
  if (c.includes('yield')) return `Deposit $${fmtMoney(capital)} of USDC into ${name}'s yield vault on ${chain} and keep the shares`;
  if (c.includes('bridge')) return `Bridge $${fmtMoney(capital)} of USDC to ${chain} through ${name} and use the bridged funds in its app`;
  if (c.includes('restak')) return `Restake $${fmtMoney(capital)} of the chain's staking asset through ${name} and keep the receipt`;
  if (c.includes('staking')) return `Stake $${fmtMoney(capital)} of the chain's staking asset through ${name} and keep the receipt`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${fmtMoney(capital)} of USDC as margin on ${name} and open one small hedge`;
  if (c.includes('prediction')) return `Fund $${fmtMoney(capital)} and place one market position on ${name}`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${fmtMoney(capital)} into a ${name} vault on ${chain} and keep the shares`;
  if (c.includes('stable')) return `Mint or deposit $${fmtMoney(capital)} of the stable asset through ${name} on ${chain}`;
  if (c.includes('rwa')) return `Mint $${fmtMoney(capital)} of the protocol's yield-bearing asset on ${chain} and hold it`;
  if (c.includes('insurance')) return `Buy $${fmtMoney(capital)} of cover from ${name} on ${chain} and keep the policy`;
  if (c.includes('basis')) return `Deposit $${fmtMoney(capital)} of USDC into ${name}'s basis-trading vault on ${chain}`;
  if (c.includes('payment')) return `Fund $${fmtMoney(capital)} into your ${name} account on ${chain} and make one payment`;
  if (c.includes('cedefi')) return `Deposit $${fmtMoney(capital)} of USDC into ${name}'s CeDeFi vault on ${chain}`;
  if (c.includes('governance')) return `Deposit $${fmtMoney(capital)} and vote once on a ${name} governance proposal`;
  if (c.includes('chain')) return `Bridge $${fmtMoney(capital)} of USDC to ${name} and use its app once a week`;
  return `Deposit $${fmtMoney(capital)} of USDC into ${name} on ${chain} and keep the position open`;
}

/** The category's second action: the move that turns one deposit into a pattern of use. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${fmtMoney(Math.round(capital / 4))} against the supply on ${name} and repay it within a week`;
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity manager')) return `Swap $${fmtMoney(Math.round(capital / 5))} through ${name}'s main pool on ${chain} once a week`;
  if (c.includes('leveraged farm')) return `Check the position's health factor on ${name} every week and top up collateral if it falls under 2`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Harvest the vault's yield on ${name} once a week and restake it into the same vault`;
  if (c.includes('bridge')) return `Swap half the bridged funds once on ${chain} so the address shows activity beyond the bridge`;
  if (c.includes('restak') || c.includes('staking')) return `Pick one operator or validator on ${name} and delegate the stake to it`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name} after a week and open a fresh one half the size`;
  if (c.includes('prediction')) return `Settle the first position on ${name} and place a second one with the winnings`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Delegate $${fmtMoney(Math.round(capital / 2))} of the vault shares to a second ${name} vault`;
  if (c.includes('stable')) return `Lend the minted stable asset once on ${chain} so the position earns beyond the mint`;
  if (c.includes('rwa')) return `Check the yield accrual on ${name} every week and record the balance in the farm log`;
  if (c.includes('insurance')) return `Extend the cover on ${name} by one month before the first policy ends`;
  if (c.includes('basis')) return `Check the funding rate on ${name} every week and record whether the vault is long or short`;
  if (c.includes('payment')) return `Set one recurring payment on ${name} for the next month`;
  if (c.includes('cedefi')) return `Stake the vault receipt from ${name} in its rewards contract`;
  if (c.includes('governance')) return `Delegate your ${name} voting power to an active delegate for one proposal`;
  if (c.includes('chain')) return `Delegate $${fmtMoney(Math.round(capital / 2))} of stake to a ${name} validator`;
  return `Use the position once a week, such as a swap, a vote or a small extra deposit`;
}

/** The main action's risk, by category: what can actually go wrong with the deposit. */
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Smart-contract risk: a bug in the lending market can lose the supplied principal`;
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity manager')) return `Impermanent loss: the LP can end worth less than holding the two assets`;
  if (c.includes('leveraged farm')) return `Liquidation risk: a sharp move can close the leveraged position at a loss`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Vault risk: the vault's strategy contract holds the deposit`;
  if (c.includes('bridge')) return `Bridge risk: the bridge contract holds the funds in transit; a bug can strand them`;
  if (c.includes('restak') || c.includes('staking')) return `Slashing risk: a misbehaving validator can cut the staked amount`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Liquidation risk: a sharp move can close the hedge at a loss`;
  if (c.includes('prediction')) return `Market risk: a wrong position loses the stake`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Curator risk: the vault manager's choices decide the return`;
  if (c.includes('stable')) return `Depeg risk: the stable asset can trade below its peg while held`;
  if (c.includes('rwa')) return `Issuer risk: the yield asset is only as good as its issuer and custodian`;
  if (c.includes('insurance')) return `Claim risk: a claim can be denied if the event falls outside the cover's terms`;
  if (c.includes('basis')) return `Funding risk: the basis trade can turn against the vault when funding flips`;
  if (c.includes('payment')) return `Counterparty risk: the account's funds sit with the payment provider`;
  if (c.includes('cedefi')) return `Custody risk: the CeDeFi vault's custodian holds the deposit`;
  if (c.includes('governance')) return `No on-chain risk beyond the gas; a vote cannot lose the deposit`;
  if (c.includes('chain')) return `Bridge risk: the funds cross a bridge before they reach the app`;
  return `Smart-contract risk: the protocol's code holds the deposit`;
}

/**
 * A protocol's farm plan: a one-line verdict first, then seven steps, each an action with a
 * principal, a cost, a time and a risk. The plan is derived from the protocol's own record
 * (category, chains, TVL, age), never from a hand-written list of names. Gas follows the
 * protocol's main chain; a position on a chain other than Ethereum starts with a bridge, and
 * Solana starts with a buy on Solana.
 */
export function buildFarmPlan(p: SnapshotProtocol, age: number | null, verdict: 'Farm now' | 'Watch' | 'Skip', verdictReason: string): FarmStep[] {
  const chain = chainOf(p);
  const capital = principalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const gasText = `$${gas}`;
  const mainAction = actionFor(p, capital, chain);
  const entry =
    chain === 'Ethereum'
      ? mainAction
      : chain === 'Solana'
        ? `Buy $${fmtMoney(capital)} of USDC on Solana, then ${mainAction.charAt(0).toLowerCase()}${mainAction.slice(1)}`
        : `Bridge $${fmtMoney(capital)} of USDC from Ethereum to ${chain} through the chain's official bridge, then ${mainAction.charAt(0).toLowerCase()}${mainAction.slice(1)}`;
  const entryCost =
    chain === 'Ethereum'
      ? `$${fmtMoney(capital)} of capital and about ${gasText} of gas`
      : `$${fmtMoney(capital)} of capital, about $3 of bridge fees and about ${gasText} of gas`;
  const totalGas = Math.round((gas * 6 + (chain === 'Ethereum' ? 0 : 3)) * 100) / 100;
  return [
    {
      text: `Verdict: ${verdict} — ${verdictReason}`,
      principal: `$${fmtMoney(capital)} of capital for the position`,
      cost: `about $${totalGas} of gas across the whole plan`,
      time: `${hold} days from first deposit to withdrawal`,
      risk: `A verdict is a model read, not a promise; the protocol may never issue a token`,
    },
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline`,
      principal: 'none beyond gas',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
      risk: `A leaked seed phrase loses the whole farm; never paste it anywhere`,
    },
    {
      text: entry,
      principal: `$${fmtMoney(capital)} of capital`,
      cost: entryCost,
      time: '15 minutes to set up',
      risk: riskFor(p),
    },
    {
      text: secondActionFor(p, capital, chain),
      principal: `up to $${fmtMoney(capital)} already in the position`,
      cost: `about ${gasText} of gas`,
      time: '10 minutes',
      risk: `Same contract risk as the main position, on a smaller amount`,
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote`,
      principal: 'none beyond gas',
      cost: `about ${gasText} of gas a week`,
      time: '10 minutes a week',
      risk: `Each extra transaction is another chance to sign a malicious approval; check every address`,
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot`,
      principal: `$${fmtMoney(capital)} stays in the position`,
      cost: 'no new fee while holding',
      time: `${hold} days`,
      risk: `Price risk: the deposited asset can fall while it sits in the position`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes`,
      principal: 'none to check',
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
      risk: `Phishing risk: fake points pages are the commonest farm scam; use only the protocol's own link`,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it`,
      principal: 'none',
      cost: 'nothing but the log',
      time: '5 minutes',
      risk: `No on-chain risk; a lost log only costs the record of the farm`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for zz-data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    interval_lo_usd: row.interval_lo_usd,
    interval_hi_usd: row.interval_hi_usd,
    p10_usd: row.p10_usd,
    p90_usd: row.p90_usd,
    token_odds: row.token_odds,
    verdict: row.verdict,
    verdict_reason: row.verdict_reason,
    watchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const fit = fitOls(tokenizedPairs(snapshot.protocols));
  const interval = looInterval(snapshot.protocols, model);
  const ledger = computeLedger(snapshot);
  const oddsBands = computeOddsBands(snapshot, snapshot.as_of);
  const medianAge = medianAgeOf(snapshot.protocols, snapshot.as_of, model.unknown_age_days);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    median_age_days: medianAge,
    ols: fit,
    interval,
    ledger,
    ledger_total: ledger.reduce((a, g) => a + g.count, 0),
    odds_bands: oddsBands,
    comparables_raw: snapshot.protocols
      .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
      .map((p): [string, number, number] => [p.category ?? 'Other', p.mcap_usd as number, p.tvl_usd]),
    rows: board.map((r) => radarRow(r, watchlist.has(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
