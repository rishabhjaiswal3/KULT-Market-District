import { writeFileSync } from 'node:fs';
import {publicCase, caseResult, generateFrozenDaily, grade, replayIds} from './lib/market-cases.ts';
import {SPECIALISTS, specialistReport, conveneCouncil, riskGate} from './lib/agency-engine.ts';
const results=[];
async function assess(id, frozen, started, ended){
 const preview=await publicCase(id,started,frozen);
 const hidden=await caseResult(id,started,frozen);
 const outcome=await caseResult(id,ended,frozen);
 const jobs=SPECIALISTS.map(s=>({specialist:s.id, cost:s.cost, report:specialistReport(s.id,preview.visibleBars,preview.brief), createdAt:new Date(started).toISOString()}));
 const council=conveneCouncil(jobs,preview.visibleBars);
 const score=Object.fromEntries(['BUY','SELL','HOLD'].map(c=>[c,grade(c,50,outcome,c==='HOLD'?0:Math.max(1000,council.risk.maxAllocationBps))]));
 return {id,commitment:preview.commitment, source:preview.source,locked:!hidden, actualMovePct:outcome.movePct,regime:outcome.regime,best:outcome.best, riskCap:council.risk.maxAllocationBps,council:council.recommendation,dissent:council.dissent,jobs:jobs.map(j=>({name:j.specialist, cost:j.cost, signal:j.report.recommendation,evidence:j.report.evidence})), at20:outcome.outcomes, scores:Object.fromEntries(Object.entries(score).map(([k,v])=>[k,{pnlUsd:v.pnlCents/100,brier:v.brier}])), firstBar:preview.visibleBars[0], cutoffBar:preview.visibleBars.at(-1), finalBar:outcome.allBars.at(-1)};
}
const replay=[];
for(const id of replayIds())replay.push(await assess(id,null,Date.parse('2026-11-03T10:00:00Z'),Date.parse('2026-11-03T10:00:00Z')));
const N=1000;
const daily=[];
for (let i=0;i<N;i++)daily.push(await assess('daily-2026-11-02',await generateFrozenDaily('daily-2026-11-02'),Date.parse('2026-11-02T15:00:00Z'),Date.parse('2026-11-03T03:00:00Z')));
const count=(key)=>Object.fromEntries([...new Set(daily.map(x=>x[key]))].sort().map(k=>[k,daily.filter(x=>x[key]===k).length]));
const net=(choice,r)=>r.scores[choice].pnlUsd;
const councilDecision=(r)=>r.riskCap===0?'HOLD':r.council;
const strategies={alwaysBuy:r=>'BUY',alwaysSell:r=>'SELL',hold:r=>'HOLD',trend:r=>r.jobs[0].signal,flow:r=>r.jobs[1].signal,quant:r=>r.jobs[2].signal,scenario:r=>r.jobs[3].signal,council:councilDecision};
const avg=(vals)=>vals.reduce((a,b)=>a+b,0)/vals.length;
const strategyAnalysis=Object.fromEntries(Object.entries(strategies).map(([name,choiceFn])=>{let hits=0;const pnl=[];let buys=0,sells=0,holds=0;
 for(const r of daily){const choice=choiceFn(r);hits+=Number(choice===r.best);pnl.push(net(choice,r));if(choice==='BUY')buys++;if(choice==='SELL')sells++;if(choice==='HOLD')holds++;}
 return [name,{bestOutcomeRate:Math.round(hits/N*1000)/10, averagePnlUsd:Math.round(avg(pnl)*100)/100, choiceCounts:{buys,sells,holds}}];}));
const researchCost={alwaysBuy:5,alwaysSell:5,hold:0,trend:5,flow:12,quant:18,scenario:12,council:47};
for(const [name,r] of Object.entries(strategyAnalysis)){r.researchCredits=researchCost[name];r.averagePnlAfterCreditChargeBeforeDrawdownUsd = Math.round((r.averagePnlUsd-researchCost[name]*.2)*100)/100;}
const summary={sampleSize:N,fictional:true,dailyMode:true,regimes:count('regime'),bestActions:count('best'),riskCaps:count('riskCap'),councilCalls:count('council'),meanMovePct:avg(daily.map(x=>x.actualMovePct)),meanAbsMovePct:avg(daily.map(x=>Math.abs(x.actualMovePct))),meanBuyPnlUsd:avg(daily.map(r=>net('BUY',r))),meanSellPnlUsd:avg(daily.map(r=>net('SELL',r))),strategies:strategyAnalysis};
writeFileSync('/mnt/data/KULT_Market_District_v5_Run_Results.json',JSON.stringify({summary,replay,exampleDaily:daily[0]},null,2));
console.log(JSON.stringify({summary,replay:replay.map(r=>({id:r.id,regime:r.regime,movePct:r.actualMovePct,best:r.best,cap:r.riskCap,council:r.council,staff:r.jobs.map(j=>({name:j.name,signal:j.signal})),pnl:r.scores})) ,dailyExample:{regime:daily[0].regime,move:daily[0].actualMovePct,best:daily[0].best,cap:daily[0].riskCap,council:daily[0].council,staff:daily[0].jobs.map(j=>({name:j.name,signal:j.signal})),score:daily[0].scores}},null,2));
