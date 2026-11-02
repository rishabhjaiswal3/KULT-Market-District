import { test } from "node:test";
import assert from "node:assert/strict";
import { caseResult, generateFrozenDaily, grade, publicCase, replayIds } from "../lib/market-cases.ts";
import { conveneCouncil, outcomeAtAllocation, riskGate, seasonKey, specialistReport } from "../lib/agency-engine.ts";

test("a frozen daily mission hides future and verifies its complete snapshot", async () => {
  const id="daily-2026-11-02", now=Date.parse("2026-11-02T12:00:00Z");
  const frozen=await generateFrozenDaily(id);
  const before=await publicCase(id,now,frozen);
  assert.equal(before.visibleBars.length,48);
  assert.equal("futureBars" in before,false);
  assert.equal("regime" in before,false);
  assert.equal(await caseResult(id,now,frozen),null);
  const after=await caseResult(id,now+86400000,frozen);
  assert.equal(after.commitment,before.commitment);
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify({id,version:frozen.version,bars:after.allBars})));
  assert.equal(Buffer.from(hash).toString("hex"),before.commitment);
  assert.notDeepEqual(frozen.bars,(await generateFrozenDaily(id)).bars);
});
test("reports and council use only visible evidence and risk caps cannot be voted away",async()=>{
  const data=await publicCase(replayIds()[0]);
  const jobs=["trend","flow","quant","scenario"].map((role,i)=>({specialist:role,cost:[5,12,18,12][i],report:specialistReport(role,data.visibleBars,data.brief),createdAt:"2026-11-02T00:00:00Z"}));
  assert.ok(jobs.every(j=>j.report.sourceCutoff===48));
  assert.deepEqual(jobs.map(j=>j.report),jobs.map(j=>specialistReport(j.specialist,[...data.visibleBars],data.brief)));
  const council=conveneCouncil(jobs,data.visibleBars);
  assert.equal(council.votes.length,4);
  assert.equal(council.risk.maxAllocationBps,riskGate(data.visibleBars).maxAllocationBps);
  assert.equal(council.execution.costAt20PctCents,600);
});
test("allocation, costs and UTC season boundary are fixed",async()=>{
  const result=await caseResult(replayIds()[0]);
  const at10=grade("SELL",50,result,1000);
  const at20=grade("SELL",50,result,2000);
  assert.equal(at10.costCents,300);
  assert.equal(at20.costCents,600);
  assert.deepEqual(at10.outcomes,outcomeAtAllocation(result.final/result.reference-1,1000));
  assert.equal(grade("HOLD",50,result,0).pnlCents,0);
  assert.equal(seasonKey(Date.parse("2026-11-01T23:59:59Z")),"2026-10-26");
  assert.equal(seasonKey(Date.parse("2026-11-02T00:00:00Z")),"2026-11-02");
});
