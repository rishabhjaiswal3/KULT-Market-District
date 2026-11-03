import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateFrozenDaily, publicCase, caseResult} from '../lib/market-cases.ts';
import {conveneCouncil, riskGate, SPECIALISTS, specialistReport} from '../lib/agency-engine.ts';
const id='daily-2026-11-02', start=Date.parse('2026-11-02T12:00:00Z');
test('v6 commitment freezes new hidden outcomes without exposing a future before UTC lock',async()=>{
 const frozen=await generateFrozenDaily(id);
 assert.equal(frozen.version,'training-sim-v6-balanced');
 assert.equal(frozen.bars.length,60);
 assert.match(frozen.commitment,/^[a-f0-9]{64}$/);
 const publicData=await publicCase(id,start,frozen);
 assert.equal(publicData.visibleBars.length,48);
 assert.equal('regime' in publicData,false);
 assert.equal('futureBars' in publicData,false);
 assert.equal(await caseResult(id,start,frozen),null);
 assert.equal((await caseResult(id,start+86400000,frozen)).commitment,frozen.commitment);
});
test('volume reader may reverse a high-momentum move if volume fades',async()=>{
 const frozen=await generateFrozenDaily(id),b=frozen.bars.slice(0,48);
 const first=specialistReport('flow',b,'fictional case');
 assert.equal(first.sourceCutoff,48);
 assert.match(first.caveat,/No live order-flow/);
 const copy=b.map(x=>({...x}));
 for(let i=32;i<40;i++)copy[i].volume=1000;
 for(let i=40;i<48;i++)copy[i].volume=100;
 for(let i=41;i<48;i++)copy[i].close=copy[i-1].close*1.005;
 const trend=specialistReport('trend',copy,'fake');
 const flow=specialistReport('flow',copy,'fake');
 assert.equal(trend.recommendation,'BUY');
 assert.equal(flow.recommendation,'SELL');
});
test('risk veto remains final even if the council votes to buy',()=>{
 const bars=Array.from({length:48},(_,i)=>({step:i+1,open:100,close:i===47?105:100,high:115,low:85,volume:300}));
 const jobs=SPECIALISTS.slice(0,2).map(s=>({specialist:s.id,cost:s.cost,createdAt:'test',report:{...specialistReport(s.id,bars,'stress'),recommendation:'BUY'}}));
 const council=conveneCouncil(jobs,bars);
 assert.equal(council.recommendation,'BUY');
 assert.equal(council.risk.maxAllocationBps,0);
 assert.equal(riskGate(bars).maxAllocationBps,0);
});
