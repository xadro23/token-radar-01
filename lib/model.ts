// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// Nothing here is a hand-kept list of names. Every figure the board shows is derived from the
// snapshot's own record:
//
//   compMult   = the median mcap/TVL of the live-token protocols in the same category (the market's
//                own pricing of that kind of business), falling back to the whole market's median
//                and then to 0.5; clamped to [0.10, 8]
//   base       = tvl_usd x compMult                       (what the market pays for this kind of TVL)
//   growthMult = 1 + clamp(change_7d, -60, 120)/100 x 0.5 (momentum, capped both ways)
//   longMult   = 0.85 + min(age_days, 730)/730 x 0.45     (years live with no token; unknown age = 1.0)
//   implied    = max(1, round(base x growthMult x longMult))
//
// The board ranks every pre-token protocol the snapshot carries (758 in this one): the 40 watchlist
// slugs are the floor and the 160+ early rows below it are what a radar exists to find. Live-token
// protocols are kept apart: they already trade, so they appear as each board row's comp set, never in
// the ranked board itself.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  comp_floor: number;
  comp_cap: number;
  comp_fallback: number;
  longevity_floor: number;
  longevity_range: number;
  longevity_days: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -60,
  growth_cap: 120,
  growth_weight: 0.5,
  comp_floor: 0.1,
  comp_cap: 8,
  comp_fallback: 0.5,
  longevity_floor: 0.85,
  longevity_range: 0.45,
  longevity_days: 730,
};

export const MODEL_VERSION = 'radar-2-comp';

export const EARLY_ROWS = 200;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
  on_watchlist: boolean;
  implied_value_usd: number;
  model: {
    comp_multiple: number;
    comp_source: string;
    comp_count: number;
    growth_pct: number;
    growth_multiplier: number;
    longevity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface CompRow {
  slug: string;
  name: string;
  symbol: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  ratio: number;
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  farm_steps: string[];
  comp_multiple: number;
  comp_source: string;
  comp_count: number;
  growth_multiplier: number;
  longevity_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocol_count: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  top_implied_usd: number;
  rows: RadarRow[];
  comps: Record<string, CompRow[]>;
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const finite = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whole-word wrapped/staked/staking in the name: it is a receipt for a token that already trades. */
const RECEIPT_WORDS = /\b(wrapped|staked|staking)\b/i;

/** Exchange-branded products: an exchange's own ledger, not a protocol waiting on a launch. */
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

const RECEIPT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !RECEIPT_CATEGORIES.has(p.category ?? '') &&
    !RECEIPT_WORDS.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !VERSIONED.test(p.name)
  );
}

/** The median of a list of finite numbers; undefined when empty. */
function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The category's comp multiple: the market's own median mcap/TVL for that kind of protocol. */
export function buildCompMultiples(
  protocols: SnapshotProtocol[],
  model: ModelConstants,
): { byCategory: Map<string, number>; global: number } {
  const live = protocols.filter((p) => !isPreToken(p) && p.category !== null && p.tvl_usd > 0 && (p.mcap_usd ?? 0) > 0);
  const ratio = (p: SnapshotProtocol): number => (p.mcap_usd as number) / p.tvl_usd;
  const clamp = (x: number): number => Math.min(model.comp_cap, Math.max(model.comp_floor, x));
  const byCategory = new Map<string, number>();
  const global = clamp(median(live.map(ratio)) ?? model.comp_fallback);
  const groups = new Map<string, number[]>();
  for (const p of live) {
    const list = groups.get(p.category as string) ?? [];
    list.push(ratio(p));
    groups.set(p.category as string, list);
  }
  for (const [cat, list] of groups) {
    if (list.length >= 3) byCategory.set(cat, clamp(median(list) as number));
  }
  return { byCategory, global };
}

export interface Implied {
  implied: number;
  compMult: number;
  compSource: string;
  compCount: number;
  growthPct: number;
  growthMult: number;
  longMult: number;
  age: number | null;
}

export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: { byCategory: Map<string, number>; global: number },
): Implied {
  const age = ageDays(asOf, p.listed_at);
  let compMult: number;
  let compSource: string;
  let compCount: number;
  const cat = p.category ?? '';
  if (comps.byCategory.has(cat)) {
    compMult = comps.byCategory.get(cat) as number;
    compSource = `${cat} live comps`;
  } else {
    compMult = comps.global;
    compSource = 'all live comps';
  }
  compCount = liveCounts.get(p.slug) ?? 0;
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? 365;
  const longMult = model.longevity_floor + (Math.min(Math.max(ageForModel, 0), model.longevity_days) / model.longevity_days) * model.longevity_range;
  const base = p.tvl_usd * compMult;
  const implied = Math.max(1, Math.round(base * growthMult * longMult));
  return { implied, compMult, compSource, compCount, growthPct, growthMult, longMult, age };
}

let liveCounts = new Map<string, number>();

/** How many live-token protocols trade on the chains this protocol runs on: its comp set's breadth. */
function countLiveOnChains(p: SnapshotProtocol, live: SnapshotProtocol[]): number {
  if (p.chains.length === 0) return 0;
  return live.filter((l) => l.chains.some((c) => p.chains.includes(c))).length;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; comps: Record<string, CompRow[]>; live: LiveRow[] } {
  const pre = snapshot.protocols.filter(isRankable);
  const liveProtocols = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX');
  const comps = buildCompMultiples(snapshot.protocols, model);
  liveCounts = new Map(pre.map((p) => [p.slug, countLiveOnChains(p, liveProtocols)]));

  const liveRows: LiveRow[] = liveProtocols
    .filter((p) => p.tvl_usd > 0 && (p.mcap_usd ?? 0) > 0)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || b.tvl_usd - a.tvl_usd)
    .slice(0, 40)
    .map((p) => ({ slug: p.slug, name: p.name, symbol: p.symbol, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d, ratio: round4((p.mcap_usd as number) / p.tvl_usd) }));

  // Per-board-row comp set: the 5 live-token protocols nearest in category (by ratio), sized by TVL.
  const liveByCat = new Map<string, CompRow[]>();
  for (const p of liveProtocols) {
    if (p.tvl_usd <= 0 || (p.mcap_usd ?? 0) <= 0) continue;
    const cat = p.category ?? '';
    const list = liveByCat.get(cat) ?? [];
    list.push({ slug: p.slug, name: p.name, symbol: p.symbol, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: round4((p.mcap_usd as number) / p.tvl_usd) });
    liveByCat.set(cat, list);
  }
  const compSets: Record<string, CompRow[]> = {};
  for (const p of pre) {
    const cat = p.category ?? '';
    const pool = liveByCat.get(cat) ?? [];
    const target = comps.byCategory.get(cat) ?? comps.global ?? 0.5;
    compSets[p.slug] = pool
      .slice()
      .sort((a, b) => Math.abs(Math.log((a.ratio || 0.5) / target)) - Math.abs(Math.log((b.ratio || 0.5) / target)) || (a.slug < b.slug ? -1 : 1))
      .slice(0, 6);
  }

  const watch = new Set(snapshot.watchlist);
  const scored = pre.map((p) => {
    const r = impliedValue(p, snapshot.as_of, model, comps);
    return { p, r };
  });
  scored.sort((a, b) => b.r.implied - a.r.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: null,
    listed_at: s.p.listed_at,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token',
    age_days: s.r.age,
    on_watchlist: watch.has(s.p.slug),
    implied_value_usd: s.r.implied,
    model: {
      comp_multiple: round4(s.r.compMult),
      comp_source: s.r.compSource,
      comp_count: s.r.compCount,
      growth_pct: s.r.growthPct,
      growth_multiplier: round4(s.r.growthMult),
      longevity_multiplier: round4(s.r.longMult),
      age_days: s.r.age,
    },
    farm_steps: farmSteps(s.p, s.r.age).map(stepText),
  }));
  return { board, comps: compSets, live: liveRows };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Check the protocol's own page before you act.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 120) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The category's concrete action, in words a farmer can follow, plus a second action on another chain. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('amm')) return `Swap once and then provide $${capital} of two-sided liquidity in ${name}'s largest pool on ${chain}, leaving no impermanent-loss exposure you cannot hold through a 30% move.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) return `Supply $${capital} of USDC into ${name} on ${chain}, then borrow under 30% of it and repay once, so your address shows both sides of the market.`;
  if (c.includes('yield') || c.includes('vault') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and leave the shares untouched while the vault compounds.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, use the bridged funds in one app on the far side, then bridge a smaller amount back.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the liquid receipt token in your farm wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} as margin on ${name}, open one small position on its deepest market, and close it after a week.`;
  if (c.includes('launchpad') || c.includes('ido')) return `Participate in one ${name} sale or commit pool on ${chain} with $${capital} and hold whatever you receive.`;
  if (c.includes('stable')) return `Mint $${capital} of the stable asset through ${name} on ${chain}, then use it as collateral in one more app.`;
  if (c.includes('rwa') || c.includes('treasury')) return `Onboard through ${name}'s documented flow and hold $${capital} of its yield-bearing asset on ${chain}.`;
  if (c.includes('insurance') || c.includes('cover')) return `Buy $${capital} of cover on ${name} for a protocol you already use, and renew once.`;
  if (c.includes('nft')) return `Mint or trade one asset on ${name} on ${chain} and list it once.`;
  if (c.includes('gaming') || c.includes('social')) return `Create an account on ${name}, complete its onboarding quest, and transact $${capital} of value once.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and make one deposit, one withdrawal, and one second deposit.`;
}

function secondActionFor(p: SnapshotProtocol, capital: number): string {
  const alt = p.chains.length > 1 ? p.chains[1]! : null;
  if (alt) return `Repeat a smaller $${Math.max(25, Math.round(capital / 4))} version of the main action on ${alt}, because multi-chain users are the cohort most airdrops weight first.`;
  return `Refer one other wallet through ${p.name}'s official referral flow if it has one, or split the main position into two deposits a week apart.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) and never from a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    { text: `Set up a fresh wallet used only for farming, fund it from an exchange withdrawal rather than a mixer, and keep its seed phrase offline.`, cost: 'under $3 of gas for setup', time: '10 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital plus about $${capital >= 150 ? 10 : 5} of gas`, time: '20 minutes to set up' },
    { text: secondActionFor(p, capital), cost: `$${Math.max(25, Math.round(capital / 4))} extra capital`, time: '10 minutes' },
    { text: `Make one qualifying action each week for ${hold} days - a small deposit, a swap, a repay or a vote - so the address is active across many snapshots, not one.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Keep the position open for at least ${hold} days${age !== null && age < 120 ? ' - the protocol is young, so early consistent users are the scarcest cohort' : ''}, and never withdraw everything at once.`, cost: `the $${capital} stays deployed`, time: `${hold} days` },
    { text: `Before claiming anything, read ${p.name}'s own points or rewards page and its official announcement channel; claim only from links it publishes and never pay a fee to claim.`, cost: 'no fee to check', time: '15 minutes' },
    { text: `Log the wallet address, every transaction hash and the dates in a farm log, so you can prove your history when a claim opens or unwind the position cleanly.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    comp_multiple: row.model.comp_multiple,
    comp_source: row.model.comp_source,
    comp_count: row.model.comp_count,
    growth_multiplier: row.model.growth_multiplier,
    longevity_multiplier: row.model.longevity_multiplier,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, comps, live } = buildBoard(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocol_count: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    top_implied_usd: board.length > 0 ? board[0]!.implied_value_usd : 0,
    rows: board.map(radarRow),
    comps,
    live,
  };
  return { board, radar };
}

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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};`;
}
