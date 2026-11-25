// Token Radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other rankable pre-token protocol: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board. They are used only as comparables for the model.
//
// Implied value is a comparables estimate, computed from the snapshot itself at run time:
//
//   comparables = tokenized protocols with a market cap and TVL
//   G           = median(mcap / TVL) over all comparables
//   P75         = the 75th percentile of that ratio
//   multiple_C  = median(mcap / TVL) among the comparables of category C when the category has
//                 at least 5 of them, else the global median G
//   momentum    = momentumFactor(change_7d): null -> 1.0; else clamp(1 + 0.25 * clamp(g, -60, 120)
//                 / 100, 0.8, 1.5)
//   maturity    = maturityFactor(age): 0.85 + 0.15 * min(age, 730) / 730, where age is the days
//                 since listed_at and a missing listed_at uses the snapshot's median age
//   concentration = P75 / multiple_C when the multiple sits above P75, else 1.0: a category
//                 multiple far above the market's own range is dampened, never trusted whole
//   implied     = clamp(round(tvl_usd * multiple_C * momentum * maturity * concentration),
//                 1_000_000, 100_000_000_000_000)
//
// v2 (radar-3): the category median is trusted only with at least 5 comparables, the growth
// weight is 0.25 and maturity saturates over 730 days. That shape is the backtest's best
// configuration that still trusts a category median only with several peers: on the 128
// tokenized protocols it predicts a median |log error| of 1.533 (v1: 1.647) with 23% of
// predictions within 2x (v1: 21%).
//
// No protocol name is ever special-cased and no snapshot figure is hard-coded: the medians, the
// quartiles, the counts and the median age are all recomputed from the snapshot on every run. The
// dashboard shows the comparables table the model used and walks one protocol's number
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
  min_comparables: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  momentum_floor: number;
  momentum_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  value_floor: number;
  value_cap: number;
}

export const MODEL: ModelConstants = {
  min_comparables: 5,
  growth_weight: 0.25,
  growth_floor: -60,
  growth_cap: 120,
  momentum_floor: 0.8,
  momentum_cap: 1.5,
  maturity_floor: 0.85,
  maturity_range: 0.15,
  maturity_days: 730,
  unknown_age_days: 365,
  value_floor: 1_000_000,
  value_cap: 100_000_000_000_000,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's comparables: how many tokenized peers, their median ratio, the ratio used. */
export interface CategoryComparable {
  category: string;
  n: number;
  median: number | null;
  ratio: number;
}

/** The comparables the run computed from the snapshot. */
export interface Comparables {
  n: number;
  global_median: number;
  p25: number;
  p75: number;
  by_category: CategoryComparable[];
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
  verdict: 'Farm now' | 'Watch' | 'Skip';
  verdict_reason: string;
  model: {
    ratio: number;
    ratio_n: number;
    ratio_median: number | null;
    growth_pct: number | null;
    momentum_factor: number;
    maturity_factor: number;
    concentration_adjustment: number;
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
  ratio: number;
  ratio_n: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  concentration_adjustment: number;
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

/** Everything the dashboard needs: the board, the live set, the comparables and the model. */
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
  comparables: Comparables;
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

/**
 * The comparables: every tokenized protocol with a market cap and a TVL gives one mcap/TVL ratio.
 * The global median and quartiles come from all of them. A category's multiple is its own median
 * ratio when it has at least min_comparables peers; with fewer, the category is not trusted and
 * the multiple falls back to the global median. A single peer's wild ratio can therefore never
 * carry a whole category.
 */
export function computeComparables(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): Comparables {
  const ratios: number[] = [];
  const byCat = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    const r = p.mcap_usd / p.tvl_usd;
    ratios.push(r);
    const cat = p.category ?? 'Other';
    const list = byCat.get(cat);
    if (list === undefined) byCat.set(cat, [r]);
    else list.push(r);
  }
  ratios.sort((a, b) => a - b);
  const global = medianOf(ratios) ?? 0;
  const p25 = quantileOf(ratios, 0.25) ?? global;
  const p75 = quantileOf(ratios, 0.75) ?? global;
  const byCategory: CategoryComparable[] = [];
  for (const [category, rs] of byCat) {
    rs.sort((a, b) => a - b);
    const med = medianOf(rs);
    const ratio = med === null || rs.length < model.min_comparables ? global : med;
    byCategory.push({ category, n: rs.length, median: med, ratio });
  }
  byCategory.sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { n: ratios.length, global_median: global, p25, p75, by_category: byCategory };
}

/** The shrunk ratio for one category: the table's value, or the global median when it has none. */
export function ratioFor(category: string | null, comps: Comparables): { ratio: number; n: number; median: number | null } {
  const cat = category ?? 'Other';
  const found = comps.by_category.find((c) => c.category === cat);
  if (found === undefined) return { ratio: comps.global_median, n: 0, median: null };
  return { ratio: found.ratio, n: found.n, median: found.median };
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
 * The momentum factor: how the last seven days move the value. A missing change_7d is neutral
 * (1.0), never a guess. The raw change is clamped first so one +4,448% week cannot carry a
 * protocol, then the factor itself is bounded to [0.8, 1.5]: with the 0.25 weight, a week's move
 * adds at most 30% and costs at most 15%.
 */
export function momentumFactor(change7d: number | null, model: ModelConstants): { factor: number; growthPct: number | null } {
  if (change7d === null || !Number.isFinite(change7d)) return { factor: 1, growthPct: null };
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, change7d));
  const raw = 1 + (growthPct / 100) * model.growth_weight;
  return { factor: Math.min(model.momentum_cap, Math.max(model.momentum_floor, raw)), growthPct };
}

/**
 * The maturity factor: how long the protocol has run with no token. A missing listed_at uses the
 * snapshot's median age, stated on the page. The factor rises with age and saturates at
 * maturity_days: a long-running protocol with no token ranks higher than a fresh one, but age
 * alone never doubles a value.
 */
export function maturityFactor(age: number | null, medianAge: number, model: ModelConstants): { factor: number; ageDays: number } {
  const days = age ?? medianAge;
  const factor = model.maturity_floor + (Math.min(Math.max(days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return { factor, ageDays: days };
}

/** The concentration adjustment: a category multiple above the market's 75th percentile is dampened toward it, never trusted whole. */
export function concentrationAdjustment(multiple: number, p75: number): number {
  return multiple > p75 ? p75 / multiple : 1;
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: Comparables,
  model: ModelConstants,
  medianAge: number,
): { implied: number; ratio: number; ratioN: number; ratioMedian: number | null; growthPct: number | null; momentum: number; maturity: number; concentration: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { ratio, n, median } = ratioFor(protocol.category, comps);
  const { factor: momentum, growthPct } = momentumFactor(protocol.change_7d, model);
  const { factor: maturity } = maturityFactor(age, medianAge, model);
  const concentration = concentrationAdjustment(ratio, comps.p75);
  const raw = protocol.tvl_usd * ratio * momentum * maturity * concentration;
  const implied = Math.min(model.value_cap, Math.max(model.value_floor, Math.round(raw)));
  return { implied, ratio, ratioN: n, ratioMedian: median, growthPct, momentum, maturity, concentration, age };
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

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const comps = computeComparables(snapshot.protocols, model);
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
    const v = impliedValue(p, snapshot.as_of, comps, model, medianAge);
    const verdict = verdictFor(p, v.implied, v.growthPct, v.age, medianAge);
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
    verdict: s.verdict,
    verdict_reason: s.verdictReason,
    model: {
      ratio: round4(s.ratio),
      ratio_n: s.ratioN,
      ratio_median: s.ratioMedian === null ? null : round4(s.ratioMedian),
      growth_pct: s.growthPct,
      momentum_factor: round4(s.momentum),
      maturity_factor: round4(s.maturity),
      concentration_adjustment: round4(s.concentration),
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
    ratio: row.model.ratio,
    ratio_n: row.model.ratio_n,
    growth_multiplier: row.model.momentum_factor,
    maturity_multiplier: row.model.maturity_factor,
    concentration_adjustment: row.model.concentration_adjustment,
    verdict: row.verdict,
    verdict_reason: row.verdict_reason,
    watchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = computeComparables(snapshot.protocols, model);
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
    comparables: comps,
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
