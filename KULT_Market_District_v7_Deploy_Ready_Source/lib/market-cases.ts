// Server-only case definitions. Never import this module into a client component.
export type Choice = "BUY" | "SELL" | "HOLD";
export type Bar = { step: number; open: number; high: number; low: number; close: number; volume: number };
export type FrozenDaily = { bars: Bar[]; regime: string; commitment: string; version: string };
export const FROZEN_START_ID = "daily-2026-11-02";
type CaseConfig = { id: string; title: string; asset: string; brief: string; seed: number; before: number; after: number; turn: number; mode: "replay" | "daily"; lockAt?: string };
export const CASE_VERSION = "training-sim-v1";
const REPLAY: CaseConfig[] = [
  { id: "breakout-bait", title: "The Breakout Bait", asset: "BTC / USD", brief: "Price pushes through a recent ceiling. Is this a breakout or a crowded chase?", seed: 11, before: .0023, after: -.0037, turn: 1, mode: "replay" },
  { id: "red-candle", title: "The Red Candle", asset: "ETH / USD", brief: "A fast selloff hits the desk. Is the risk still falling or is the panic exhausted?", seed: 27, before: -.0028, after: .0038, turn: -1, mode: "replay" },
  { id: "quiet-tape", title: "The Quiet Tape", asset: "MON / USD", brief: "The market has gone quiet. Your analysts see little edge after trading costs.", seed: 41, before: .0002, after: .00015, turn: 0, mode: "replay" },
];

function hashSeed(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function noise(seed: number, i: number) { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x) - .5; }
function round(n: number) { return Math.round(n * 10000) / 10000; }
function utcDay(date: Date) { return date.toISOString().slice(0, 10); }
export function dailyId(date = new Date()) { return `daily-${utcDay(date)}`; }

export function getCaseConfig(id: string, now = Date.now()): CaseConfig | null {
  const replay = REPLAY.find(c => c.id === id);
  if (replay) return replay;
  if (!/^daily-\d{4}-\d{2}-\d{2}$/.test(id)) return null;
  const date = id.slice(6);
  const start = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start) || utcDay(new Date(start)) !== date || start > now) return null;
  const seed = hashSeed(date);
  const type = seed % 3;
  return { id, title: "Today's Agency Case", asset: ["BTC / USD", "ETH / USD", "MON / USD"][type], brief: ["A rising tape meets a resistance band. Decide before the day closes.", "A weak tape challenges your risk rules. Decide before the day closes.", "A range-bound tape tests whether doing nothing is a decision."][type], seed, before: type === 0 ? .0018 : type === 1 ? -.0019 : .0001, after: type === 0 ? -.0025 : type === 1 ? .003 : .0002, turn: type === 0 ? 1 : type === 1 ? -1 : 0, mode: "daily", lockAt: new Date(start + 86400000).toISOString() };
}

function barsFor(c: CaseConfig): Bar[] {
  const out: Bar[] = [];
  let previous = 100 + c.seed % 17;
  for (let i = 0; i < 60; i++) {
    const before = i < 48;
    const drift = before ? c.before : c.after;
    const jitter = noise(c.seed, i) * (before ? .0035 : .005);
    const turn = c.turn * Math.sin(i / 4.6) * .0014;
    const close = Math.max(10, previous * (1 + drift + jitter + turn));
    const range = .002 + Math.abs(noise(c.seed + 3, i)) * .004;
    out.push({ step: i + 1, open: round(previous), high: round(Math.max(previous, close) * (1 + range)), low: round(Math.min(previous, close) * (1 - range)), close: round(close), volume: Math.round(140 + Math.abs(noise(c.seed + 7, i)) * 430) });
    previous = close;
  }
  return out;
}

function analystNotes(bars: Bar[]) {
  const last = bars.at(-1)!.close;
  const six = bars.at(-7)!.close;
  const change = (last / six - 1) * 100;
  const changes = bars.slice(-24).map((b, i, a) => i ? Math.abs(b.close / a[i-1].close - 1) : 0).slice(1);
  const avgMove = changes.reduce((a, b) => a + b, 0) / changes.length * 100;
  const lead: Choice = change > .2 ? "BUY" : change < -.2 ? "SELL" : "HOLD";
  return [
    { role: "Research Analyst", action: lead, evidence: `Six-hour move ${change >= 0 ? "+" : ""}${change.toFixed(2)}%. ${lead === "HOLD" ? "Directional threshold is not met." : "Momentum favors this direction, but the next path is unknown."}` },
    { role: "Risk Analyst", action: "HOLD" as Choice, evidence: `Average absolute hourly move ${avgMove.toFixed(2)}%. Holding preserves virtual capital when the evidence is uncertain.` },
    { role: "Execution Analyst", action: "HOLD" as Choice, evidence: "A round trip models 10 bps fees plus 5 bps execution cost per side. Directional choices must overcome 30 bps total." },
  ];
}

async function sha256(value: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
}

export async function publicCase(id: string, now = Date.now(), frozen?: FrozenDaily | null) {
  const config = getCaseConfig(id, now);
  if (!config) return null;
  if (config.mode === "daily" && id >= FROZEN_START_ID && !frozen) return null;
  const bars = frozen?.bars ?? barsFor(config);
  const version = frozen?.version ?? CASE_VERSION;
  const commitment = frozen?.commitment ?? await sha256(JSON.stringify({ id: config.id, version, bars }));
  const resolved = config.mode === "replay" || Date.parse(config.lockAt!) <= now;
  const observedMove = bars[47].close / bars[35].close - 1;
  const brief = frozen ? observedMove > .005 ? "A rising fictional tape meets a resistance band. Your team must test whether participation supports the move." : observedMove < -.005 ? "A weak fictional tape challenges your risk rules. Is pressure persisting or fading?" : "A range-bound fictional tape tests whether patient cash is the stronger decision." : config.brief;
  return { id: config.id, title: config.title, asset: config.asset, brief, mode: config.mode, source: "fictional_training_simulation" as const, version, lockAt: config.lockAt ?? null, resolved, commitment, cutoffStep: 48, visibleBars: bars.slice(0, 48), analysts: analystNotes(bars.slice(0, 48)) };
}

export async function caseResult(id: string, now = Date.now(), frozen?: FrozenDaily | null) {
  const config = getCaseConfig(id, now);
  if (!config || config.mode === "daily" && Date.parse(config.lockAt!) > now) return null;
  if (config.mode === "daily" && id >= FROZEN_START_ID && !frozen) return null;
  const bars = frozen?.bars ?? barsFor(config);
  const reference = bars[47].close;
  const final = bars.at(-1)!.close;
  const move = final / reference - 1;
  const sizeCents = 200_000;
  const costCents = Math.round(sizeCents * .003);
  const outcomes: Record<Choice, number> = { BUY: Math.round(sizeCents * move) - costCents, SELL: Math.round(-sizeCents * move) - costCents, HOLD: 0 };
  const best = (["BUY", "SELL", "HOLD"] as Choice[]).sort((a, b) => outcomes[b] - outcomes[a])[0];
  const version = frozen?.version ?? CASE_VERSION;
  const commitment = frozen?.commitment ?? await sha256(JSON.stringify({ id: config.id, version, bars }));
  return { id, reference, final, movePct: Math.round(move * 10000) / 100, sizeCents, costCents, outcomes, best, futureBars: bars.slice(48), allBars: bars, commitment, version, regime: frozen?.regime ?? "legacy scripted case" };
}

export function grade(choice: Choice, confidence: number, result: NonNullable<Awaited<ReturnType<typeof caseResult>>>, allocationBps = 2000) {
  const sizeCents = Math.round(1_000_000 * allocationBps / 10000);
  const costCents = Math.round(sizeCents * .003);
  const move = result.final / result.reference - 1;
  const outcomes: Record<Choice, number> = { BUY: Math.round(sizeCents * move) - costCents, SELL: Math.round(-sizeCents * move) - costCents, HOLD: 0 };
  const best = (["BUY", "SELL", "HOLD"] as Choice[]).sort((a,b) => outcomes[b] - outcomes[a])[0];
  const pnlCents = outcomes[choice];
  const above = result.final > result.reference ? 1 : 0;
  const brier = Math.round(((confidence / 100 - above) ** 2) * 10000) / 10000;
  const lesson = choice === best ? choice === "HOLD" ? "Holding preserved more virtual capital than either costed trade in this case." : "Your direction worked after modeled costs. One case does not establish an edge." : choice === "HOLD" ? `Holding avoided a trade, but ${best} would have done better in this fictional path.` : `The path favored ${best}. Your ${choice} paid costs and finished behind that alternative.`;
  return { choice, confidence, pnlCents, equityCents: 1_000_000 + pnlCents, brier, correctDirection: choice === best, lesson, outcomes, best, costCents, allocationBps };
}

/**
 * v6 scenario generation. New cases use symmetric up/down archetypes to eliminate
 * the v5 always-SELL drift. A regime is fixed before the case opens; independent
 * crypto randomness builds the future, and only a SHA-256 commitment is public.
 * Existing v5 D1 snapshots are NEVER regenerated or changed.
 */
export async function generateFrozenDaily(id: string): Promise<FrozenDaily> {
  const random = new Uint32Array(240);
  crypto.getRandomValues(random);
  const unit = (i: number) => random[i] / 4294967296;
  const regimeIndex = random[0] % 8;
  const regimes = [
    "bull trend", "bear trend", "bull trap", "bear trap",
    "range up", "range down", "shock up", "shock down",
  ];
  // Mirrored regimes: even indices are positive future, odd indices negative.
  const family = Math.floor(regimeIndex / 2);
  const direction = regimeIndex % 2 === 0 ? 1 : -1;
  const beforeDrift = [0.0011, -0.0013, 0.00014, -0.001][family] * direction;
  const afterMagnitude = [0.0035, 0.0038, 0.00035, 0.0047][family];
  const afterDrift = afterMagnitude * direction;
  const bars: Bar[] = [];
  let previous = 100 + unit(1) * 16;
  for (let i = 0; i < 60; i++) {
    const pre = i < 48;
    const shock = family === 3;
    const base = pre ? beforeDrift : afterDrift;
    const jitter = (unit(2 + i * 3) - .5) * (shock ? (pre ? .031 : .016) : (pre ? .006 : .007));
    const close = Math.max(10, previous * (1 + base + jitter));
    const range = .001 + unit(3 + i * 3) * (shock ? .030 : .007);
    bars.push({step:i+1,open:round(previous),high:round(Math.max(previous,close)*(1+range)),low:round(Math.min(previous,close)*(1-range)),close:round(close),volume:Math.round((120+unit(4+i*3)*650) * (pre && i>=40 ? (family===0 ? (unit(185)<.7 ? 1.65 : .68) : family===1 ? (unit(185)<.7 ? .42 : 1.48) : family===2 ? (unit(185)<.45 ? 1.42 : .95) : (unit(185)<.5 ? .7 : 1.3)) : 1))});
    previous = close;
  }
  const version = "training-sim-v6-balanced";
  return {bars,regime:regimes[regimeIndex],version,commitment:await sha256(JSON.stringify({id,version,bars}))};
}

export function replayIds() { return REPLAY.map(c => c.id); }
