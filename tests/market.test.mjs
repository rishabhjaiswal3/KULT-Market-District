import { test } from "node:test";
import assert from "node:assert/strict";
import { caseResult, dailyId, getCaseConfig, grade, publicCase, replayIds } from "../lib/market-cases.ts";

test("a replay reveals no future bar or outcome before submission", async () => {
  const before = await publicCase(replayIds()[0]);
  const after = await caseResult(replayIds()[0]);
  assert.equal(before.visibleBars.length, 48);
  assert.equal(after.futureBars.length, 12);
  assert.equal(before.commitment, after.commitment);
  assert.equal("futureBars" in before, false);
  assert.equal("outcomes" in before, false);
  assert.deepEqual(before.visibleBars, after.allBars.slice(0, 48));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ id: before.id, version: before.version, bars: after.allBars })));
  assert.equal(Buffer.from(hash).toString("hex"), before.commitment);
});

test("all actions use the same virtual size and published round-trip cost", async () => {
  for (const id of replayIds()) {
    const result = await caseResult(id);
    assert.equal(result.sizeCents, 200_000);
    assert.equal(result.costCents, 600);
    assert.equal(result.outcomes.HOLD, 0);
    assert.equal(result.outcomes.BUY + result.outcomes.SELL, -1_200);
    const scored = grade("HOLD", 50, result);
    assert.equal(scored.equityCents, 1_000_000);
    assert.equal(scored.brier, .25);
  }
});

test("daily case remains hidden until its server deadline and is stable afterward", async () => {
  const midday = Date.parse("2026-11-01T12:00:00.000Z");
  const id = dailyId(new Date(midday));
  const before = await publicCase(id, midday);
  assert.equal(before.lockAt, "2026-11-02T00:00:00.000Z");
  assert.equal(before.resolved, false);
  assert.equal(await caseResult(id, midday), null);
  const after = await caseResult(id, midday + 86400000);
  assert.ok(after);
  assert.equal(after.commitment, before.commitment);
  assert.equal(getCaseConfig("daily-2026-11-02", midday), null);
});
