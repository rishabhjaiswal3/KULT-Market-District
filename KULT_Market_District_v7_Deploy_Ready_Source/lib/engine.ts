export type Candle = { t: number; open: number; high: number; low: number; close: number; volume: number };
export type Quote = { bid: number; ask: number; price: number; asOf: string; source: "live" | "scenario" };
export type Market = { candles: Candle[]; quote: Quote; notice?: string };
export type Strategy = "trend" | "reversion";
export type Portfolio = { cash_cents: number; units_micro: number; cost_cents: number; realized_cents: number; peak_cents: number; version: number };
export type Mandate = { max_trade_bps: number; max_position_bps: number; max_drawdown_bps: number; expires_at: string; killed: number; version: number };

export const START_CENTS = 1_000_000;
export const FEE_BPS = 10;
export const SLIPPAGE_BPS = 5;

function mean(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function round(n: number) { return Math.round(n * 100) / 100; }
function seeded(n: number) { const v = Math.sin(n * 127.1 + 78.23) * 43758.5453; return v - Math.floor(v); }
function scenarioClose(hour: number) { return 66_000 * (1 + Math.sin(hour / 17) * .036 + Math.sin(hour / 43) * .021 + (seeded(hour) - .5) * .006); }

export function scenarioMarket(now = Date.now()): Market {
  const hour = Math.floor(now / 3_600_000);
  const candles: Candle[] = [];
  for (let h = hour - 240; h < hour; h++) {
    const open = scenarioClose(h - 1);
    const close = scenarioClose(h);
    candles.push({ t: h * 3_600_000, open, high: Math.max(open, close) * 1.0016, low: Math.min(open, close) * 0.9984, close, volume: 140 + seeded(h + 13) * 220 });
  }
  const close = candles.at(-1)!.close;
  return { candles, quote: { price: close, bid: close * 0.9996, ask: close * 1.0004, asOf: new Date(now).toISOString(), source: "scenario" }, notice: "Generated scenario. Prices and results are fictional." };
}

export async function getMarket(): Promise<Market> {
  try {
    const base = "https://api.exchange.coinbase.com/products/BTC-USD";
    const [candlesResponse, quoteResponse] = await Promise.all([
      fetch(`${base}/candles?granularity=3600`, { signal: AbortSignal.timeout(4500), headers: { Accept: "application/json" }, cache: "no-store" }),
      fetch(`${base}/ticker`, { signal: AbortSignal.timeout(4500), headers: { Accept: "application/json" }, cache: "no-store" }),
    ]);
    if (!candlesResponse.ok || !quoteResponse.ok) throw new Error("market source unavailable");
    const rows: unknown = await candlesResponse.json();
    const ticker: Record<string, unknown> = await quoteResponse.json();
    if (!Array.isArray(rows)) throw new Error("invalid candles");
    const currentHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    const candles = rows.map((r: unknown) => {
      if (!Array.isArray(r) || r.length < 6) throw new Error("invalid candle");
      const [time, low, high, open, close, volume] = r.map(Number);
      if (![time, low, high, open, close, volume].every(Number.isFinite) || low <= 0 || open <= 0) throw new Error("invalid candle values");
      return { t: time * 1000, low, high, open, close, volume };
    }).filter(c => c.t < currentHour).sort((a, b) => a.t - b.t);
    const bid = Number(ticker.bid), ask = Number(ticker.ask), price = Number(ticker.price);
    const asOf = String(ticker.time || "");
    if (candles.length < 60 || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask < bid || !Number.isFinite(Date.parse(asOf))) throw new Error("incomplete market data");
    return { candles, quote: { bid, ask, price, asOf, source: "live" } };
  } catch {
    return scenarioMarket();
  }
}

export function equityCents(p: Portfolio, quote: Quote) { return p.cash_cents + Math.round(p.units_micro * quote.bid * 100 / 1_000_000); }

export function decide(candles: Candle[], strategy: Strategy, hasPosition: boolean) {
  if (candles.length < 30) return { action: "hold" as const, rationale: "Insufficient completed candles.", factors: { short: 0, long: 0, momentum: 0, volatility: 0 } };
  const closes = candles.map(c => c.close);
  const last = closes.at(-1)!;
  const short = mean(closes.slice(-6));
  const long = mean(closes.slice(-24));
  const momentum = last / closes.at(-7)! - 1;
  const returns = closes.slice(-25).map((x, i, a) => i ? x / a[i - 1] - 1 : 0).slice(1);
  const volatility = Math.sqrt(mean(returns.map(x => x * x))) * Math.sqrt(24);
  const factors = { short: round(short), long: round(long), momentum: round(momentum * 100), volatility: round(volatility * 100) };
  if (volatility > 0.11 && !hasPosition) return { action: "hold" as const, rationale: "Volatility guard: recent moves are too wide for a new entry.", factors };
  if (strategy === "trend") {
    if (hasPosition && (short < long * 0.998 || momentum < -0.02)) return { action: "sell" as const, rationale: "Short trend weakened. Propose reducing the full paper position.", factors };
    if (!hasPosition && short > long * 1.002 && momentum > 0 && momentum < 0.06) return { action: "buy" as const, rationale: "Short trend leads the 24-hour average with positive six-hour momentum.", factors };
    return { action: "hold" as const, rationale: "Trend threshold has not been met. Preserve capital.", factors };
  }
  if (hasPosition && last >= long) return { action: "sell" as const, rationale: "Price returned to its 24-hour average. Propose a paper exit.", factors };
  if (!hasPosition && last < long * 0.987 && momentum > -0.06) return { action: "buy" as const, rationale: "Price is below its average without an extreme six-hour drop.", factors };
  return { action: "hold" as const, rationale: "Reversion threshold has not been met. No order proposed.", factors };
}

export function gate(action: "buy" | "sell", p: Portfolio, m: Mandate, q: Quote, sizeCents: number, now = Date.now()): string | null {
  if (q.source === "live" && now - Date.parse(q.asOf) > 90_000) return "Market quote is stale. Refresh before any paper fill.";
  if ((q.ask - q.bid) / q.price > 0.003) return "Spread is wider than 0.30%.";
  if (action === "sell") return p.units_micro > 0 ? null : "There is no position to close.";
  if (m.killed) return "Mandate killed. New entries are blocked; exits remain available.";
  if (Date.parse(m.expires_at) <= now) return "Mandate expired. Set a new expiry before entry.";
  const equity = equityCents(p, q);
  if (equity <= 0) return "No paper equity remains.";
  if ((p.peak_cents - equity) / p.peak_cents * 10_000 >= m.max_drawdown_bps) return "Drawdown limit reached. New entries blocked.";
  if (sizeCents <= 0 || sizeCents > Math.floor(equity * m.max_trade_bps / 10_000)) return "Trade exceeds the mandate's per-trade cap.";
  const currentValue = Math.round(p.units_micro * q.ask * 100 / 1_000_000);
  if (currentValue + sizeCents > Math.floor(equity * m.max_position_bps / 10_000)) return "Position would exceed the mandate's exposure cap.";
  if (sizeCents + Math.ceil(sizeCents * FEE_BPS / 10_000) > p.cash_cents) return "Insufficient paper cash after fees.";
  return null;
}

export function fill(action: "buy" | "sell", p: Portfolio, q: Quote, sizeCents: number, costs = { feeBps: FEE_BPS, slippageBps: SLIPPAGE_BPS }) {
  const priceCents = Math.round((action === "buy" ? q.ask * (1 + costs.slippageBps / 10_000) : q.bid * (1 - costs.slippageBps / 10_000)) * 100);
  const unitsMicro = action === "sell" ? p.units_micro : Math.floor(sizeCents * 1_000_000 / priceCents);
  if (unitsMicro <= 0) throw new Error("Order is below paper precision.");
  const grossCents = Math.round(unitsMicro * priceCents / 1_000_000);
  const feeCents = Math.ceil(grossCents * costs.feeBps / 10_000);
  const cashCents = p.cash_cents + (action === "sell" ? grossCents - feeCents : -grossCents - feeCents);
  const costCents = action === "sell" ? 0 : p.cost_cents + grossCents + feeCents;
  const realizedCents = p.realized_cents + (action === "sell" ? grossCents - feeCents - p.cost_cents : 0);
  const next: Portfolio = { cash_cents: cashCents, units_micro: action === "sell" ? 0 : p.units_micro + unitsMicro, cost_cents: costCents, realized_cents: realizedCents, peak_cents: p.peak_cents, version: p.version + 1 };
  next.peak_cents = Math.max(next.peak_cents, equityCents(next, q));
  return { next, priceCents, unitsMicro, grossCents, feeCents };
}

export function backtest(candles: Candle[], strategy: Strategy, costMultiplier = 1) {
  if (candles.length < 80) throw new Error("At least 80 completed candles are required.");
  if (![1, 2].includes(costMultiplier)) throw new Error("Unsupported research cost model.");
  const costs = { feeBps: FEE_BPS * costMultiplier, slippageBps: SLIPPAGE_BPS * costMultiplier };
  let p: Portfolio = { cash_cents: START_CENTS, units_micro: 0, cost_cents: 0, realized_cents: 0, peak_cents: START_CENTS, version: 0 };
  const curve: { t: number; equity: number; benchmark: number }[] = [];
  let entries = 0, exits = 0, worst = 0;
  const benchmarkEntry: Quote = { bid: candles[31].open * .9996, ask: candles[31].open * 1.0004, price: candles[31].open, asOf: new Date(candles[31].t).toISOString(), source: "scenario" };
  const benchmarkPortfolio = fill("buy", { cash_cents: START_CENTS, units_micro: 0, cost_cents: 0, realized_cents: 0, peak_cents: START_CENTS, version: 0 }, benchmarkEntry, Math.floor(START_CENTS * .995), costs).next;
  for (let i = 30; i < candles.length - 1; i++) {
    const known = candles.slice(0, i + 1);
    const decision = decide(known, strategy, p.units_micro > 0);
    const nextBar = candles[i + 1];
    const quote: Quote = { bid: nextBar.open * 0.9996, ask: nextBar.open * 1.0004, price: nextBar.open, asOf: new Date(nextBar.t).toISOString(), source: "scenario" };
    if (decision.action === "buy" && p.units_micro === 0) {
      const size = Math.min(Math.floor(equityCents(p, quote) * .1), p.cash_cents - 10);
      if (size > 100 && !gate("buy", p, { max_trade_bps: 1000, max_position_bps: 2500, max_drawdown_bps: 1200, expires_at: "2999-01-01T00:00:00.000Z", killed: 0, version: 0 }, quote, size, nextBar.t)) { p = fill("buy", p, quote, size, costs).next; entries++; }
    } else if (decision.action === "sell" && p.units_micro > 0) { p = fill("sell", p, quote, 0, costs).next; exits++; }
    const mark: Quote = { ...quote, bid: nextBar.close, price: nextBar.close };
    const equity = equityCents(p, mark);
    p.peak_cents = Math.max(p.peak_cents, equity);
    worst = Math.max(worst, (p.peak_cents - equity) / p.peak_cents);
    if ((i - 30) % 3 === 0 || i === candles.length - 2) {
      const benchmarkMark: Quote = { ...quote, bid: nextBar.close * .9996, ask: nextBar.close * 1.0004, price: nextBar.close };
      const finalBar = i === candles.length - 2;
      const benchmark = finalBar ? fill("sell", benchmarkPortfolio, benchmarkMark, 0, costs).next.cash_cents : equityCents(benchmarkPortfolio, benchmarkMark);
      const markedEquity = finalBar && p.units_micro > 0 ? fill("sell", p, benchmarkMark, 0, costs).next.cash_cents : equity;
      curve.push({ t: nextBar.t, equity: round(markedEquity / 100), benchmark: round(benchmark / 100) });
    }
  }
  const final = curve.at(-1)!.equity;
  return { strategy, returnPct: round((final / 10000 - 1) * 100), benchmarkPct: round((curve.at(-1)!.benchmark / 10000 - 1) * 100), maxDrawdownPct: round(worst * 100), entries, exits, finalEquity: final, curve, costMultiplier, method: `Signal at completed bar close; next bar open fill; ${costs.feeBps} bps fee + ${costs.slippageBps} bps slippage each fill, including the buy-and-hold baseline. Paper simulation; no trade executes.` };
}

export function walkForward(candles: Candle[]) {
  if (candles.length < 180) throw new Error("At least 180 completed candles are required for a chronological holdout.");
  const split = Math.floor(candles.length * .7);
  const development = candles.slice(0, split);
  // Each holdout trial gets 31 prior candles solely for indicator warmup. Trades start after that warmup.
  const holdout = candles.slice(split - 31);
  const assess = (strategy: Strategy) => {
    const train = backtest(development, strategy);
    const test = backtest(holdout, strategy);
    const stress = backtest(holdout, strategy, 2);
    const qualified = test.entries > 0 && test.returnPct > 0 && stress.returnPct > 0 && test.maxDrawdownPct <= 3;
    return { train, test, stress, qualified, reason: !test.entries ? "No holdout entry to evaluate." : test.returnPct <= 0 ? "Holdout lost money after costs." : stress.returnPct <= 0 ? "Holdout did not survive doubled costs." : test.maxDrawdownPct > 3 ? "Holdout drawdown exceeded 3%." : "Passed this narrow historical screen; future results remain unknown." };
  };
  return { trend: assess("trend"), reversion: assess("reversion"), splitAt: new Date(candles[split].t).toISOString(), trainBars: development.length, testBars: candles.length - split, warmupBars: 31, method: "Chronological 70/30 split. Holdout signals use 31 prior bars for indicator warmup. Holdout is not a forward result. A second pass doubles modeled fee and slippage." };
}

export function council(candles: Candle[], primary: Strategy, hasPosition: boolean, evidenceQualified: boolean, riskReason: string | null) {
  const trend = decide(candles, "trend", hasPosition);
  const reversion = decide(candles, "reversion", hasPosition);
  const lead = primary === "trend" ? trend : reversion;
  const peer = primary === "trend" ? reversion : trend;
  const noOpposition = lead.action !== "hold" && peer.action !== (lead.action === "buy" ? "sell" : "buy");
  const autoEligible = !riskReason && (lead.action === "sell" || (lead.action === "buy" && noOpposition && evidenceQualified));
  const challenge = lead.action === "hold" ? "Lead agent abstains." : lead.action === peer.action ? `Both rules favor ${lead.action}.` : peer.action === "hold" ? "Other rule abstains; no active opposing signal." : `Other rule says ${peer.action}; human review required.`;
  const steward = riskReason || (lead.action === "buy" && !evidenceQualified ? "No fresh, qualified holdout. Paper exploration needs human approval." : "Within the paper mandate at this quote.");
  return { lead: { role: primary === "trend" ? "Trend Scout" : "Reversion Scout", ...lead }, challenger: { role: primary === "trend" ? "Reversion Scout" : "Trend Scout", ...peer }, steward: { role: "Risk Steward", verdict: steward }, noOpposition, autoEligible, summary: riskReason || challenge };
}

export type Direction = "up" | "down" | "flat";
export function forecastDirection(action: "buy" | "sell" | "hold"): Direction { return action === "buy" ? "up" : action === "sell" ? "down" : "flat"; }
export function observedDirection(referenceCents: number, finalCents: number): Direction {
  const moveBps = (finalCents - referenceCents) * 10_000 / referenceCents;
  return moveBps >= 25 ? "up" : moveBps <= -25 ? "down" : "flat";
}

export function forwardScore(rows: { source: string; status: string; direction: string; observed_direction: string | null }[]) {
  const score = (source: string) => {
    const observations = rows.filter(r => r.source === source && r.status === "reviewed");
    const correct = observations.filter(r => r.direction === r.observed_direction).length;
    const baselineCorrect = observations.filter(r => r.observed_direction === "flat").length;
    const actionable = observations.filter(r => r.direction !== "flat");
    const actionableCorrect = actionable.filter(r => r.direction === r.observed_direction).length;
    return { reviewed: observations.length, correct, baselineCorrect, actionable: actionable.length, actionableCorrect, pending: rows.filter(r => r.source === source && r.status === "pending").length, ratePct: observations.length ? round(correct / observations.length * 100) : null, baselinePct: observations.length ? round(baselineCorrect / observations.length * 100) : null, enoughSample: observations.length >= 20 };
  };
  return { live: score("live"), scenario: score("scenario") };
}
