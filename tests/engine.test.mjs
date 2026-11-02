import { test } from "node:test";
import assert from "node:assert/strict";
import { backtest, council, fill, forecastDirection, forwardScore, gate, observedDirection, scenarioMarket, walkForward, START_CENTS } from "../lib/engine.ts";

const market = scenarioMarket(Date.parse("2026-10-31T11:00:00.000Z"));
const portfolio = { cash_cents: START_CENTS, units_micro: 0, cost_cents: 0, realized_cents: 0, peak_cents: START_CENTS, version: 0 };
const mandate = { max_trade_bps: 1000, max_position_bps: 2500, max_drawdown_bps: 1200, expires_at: "2027-01-01T00:00:00.000Z", killed: 0, version: 0 };

test("over-cap entries fail the mandate", () => {
  assert.match(gate("buy", portfolio, mandate, market.quote, 150_000, Date.parse("2026-10-31T11:00:00Z")), /per-trade cap/);
});

test("kill blocks entry while an exit remains available", () => {
  const opened = fill("buy", portfolio, market.quote, 100_000).next;
  assert.match(gate("buy", opened, { ...mandate, killed: 1 }, market.quote, 100_000), /killed/);
  assert.equal(gate("sell", opened, { ...mandate, killed: 1 }, market.quote, 0), null);
  const closed = fill("sell", opened, market.quote, 0).next;
  assert.equal(closed.units_micro, 0);
  assert.ok(closed.cash_cents < START_CENTS, "round trip should pay spread, slippage, and fees");
});

test("historical trial returns separate strategy and costed benchmark curves", () => {
  const trial = backtest(market.candles, "trend");
  assert.ok(trial.curve.length > 20);
  assert.ok(Number.isFinite(trial.returnPct));
  assert.ok(Number.isFinite(trial.benchmarkPct));
  assert.ok(trial.entries >= trial.exits);
  assert.match(trial.method, /next bar open/);
});

test("a fictional completed hour never changes as the scenario window rolls", () => {
  const hour = Date.parse("2026-10-31T11:00:00.000Z");
  const first = scenarioMarket(hour).candles.at(-1);
  const later = scenarioMarket(hour + 3_600_000).candles.find(c => c.t === first.t);
  assert.equal(later?.close, first.close);
  assert.equal(later?.open, first.open);
});

test("research uses a later holdout and explicit doubled-cost stress", () => {
  const result = walkForward(market.candles);
  assert.equal(result.trainBars + result.testBars, market.candles.length);
  assert.equal(result.warmupBars, 31);
  for (const s of [result.trend, result.reversion]) {
    assert.equal(s.train.costMultiplier, 1);
    assert.equal(s.test.costMultiplier, 1);
    assert.equal(s.stress.costMultiplier, 2);
    assert.ok(s.test.curve[0].t >= Date.parse(result.splitAt));
    assert.ok(s.stress.finalEquity <= s.test.finalEquity + 0.01, "higher costs must not improve this path");
  }
});

test("auto entry needs evidence, while the risk steward can veto", () => {
  const a = council(market.candles, "trend", false, false, null);
  assert.equal(a.autoEligible, false);
  const blocked = council(market.candles, "trend", false, true, "Mandate killed");
  assert.equal(blocked.autoEligible, false);
  assert.match(blocked.steward.verdict, /killed/);
});

test("auto paper entry has a reachable path under qualifying historical evidence", () => {
  const end = Date.parse("2026-11-01T11:00:00.000Z");
  let eligible = 0;
  for (let i = 24; i > 0; i--) {
    const candles = scenarioMarket(end - i * 3_600_000).candles;
    const qualified = walkForward(candles).trend.qualified;
    if (council(candles, "trend", false, qualified, null).autoEligible) eligible++;
  }
  assert.ok(eligible > 0, "the agent must be capable of a gated paper entry");
});

test("forward scores separate real-source records from fictional records", () => {
  assert.equal(forecastDirection("hold"), "flat");
  assert.equal(observedDirection(100_000, 100_250), "up");
  const score = forwardScore([
    { source: "live", status: "reviewed", direction: "up", observed_direction: "up" },
    { source: "scenario", status: "reviewed", direction: "down", observed_direction: "up" },
    { source: "live", status: "pending", direction: "flat", observed_direction: null },
  ]);
  assert.equal(score.live.correct, 1);
  assert.equal(score.live.baselineCorrect, 0);
  assert.equal(score.live.actionableCorrect, 1);
  assert.equal(score.live.pending, 1);
  assert.equal(score.scenario.correct, 0);
  assert.equal(score.live.enoughSample, false);
});
