import { generateFrozenDaily, publicCase, caseResult } from '../lib/market-cases.ts';
import { SPECIALISTS, conveneCouncil, specialistReport, outcomeAtAllocation, riskGate } from '../lib/agency-engine.ts';
const total=1600, cnt={BUY:0,SELL:0,HOLD:0}, best={BUY:0,SELL:0,HOLD:0}, regimes={}, limits={0:0,1000:0,2000:0};
let sum=0;const pnl={BUY:0,SELL:0,HOLD:0,COUNCIL:0};
for(let i=0;i<total;i++) {
 const id='daily-2026-11-02'; const frozen=await generateFrozenDaily(id);
 const c=await publicCase(id,Date.parse('2026-11-02T08:00:00Z'),frozen);
 const result=await caseResult(id,Date.parse('2026-11-03T08:00:00Z'),frozen);
 const jobs=SPECIALISTS.map(s=>({specialist:s.id,cost:s.cost,createdAt:'test',report:specialistReport(s.id,c.visibleBars,c.brief)}));
 const council=conveneCouncil(jobs,c.visibleBars);
 const cap=riskGate(c.visibleBars).maxAllocationBps;
 cnt[council.recommendation]++; best[result.best]++; regimes[frozen.regime]=(regimes[frozen.regime]||0)+1; limits[cap]++;
 sum+=result.movePct;
 const outcomes=outcomeAtAllocation(result.movePct/100,cap);
 for (const k of ['BUY','SELL','HOLD']) pnl[k]+=outcomes[k]/100;
 pnl.COUNCIL+=outcomes[council.recommendation]/100;
}
console.log(JSON.stringify({total,council:cnt,best,limits,regimes,meanMovePct:sum/total,meanNetVirtualPnL:Object.fromEntries(Object.entries(pnl).map(([k,v])=>[k,Math.round(v/total*100)/100]))},null,2));
