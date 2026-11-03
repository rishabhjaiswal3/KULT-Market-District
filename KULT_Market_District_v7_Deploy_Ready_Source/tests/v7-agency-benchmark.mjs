import {EPISODES,generateSnapshot,outcome,safeCap,researchFor,councilFor} from '../lib/arena-v7-engine.ts';
import {SPECIALISTS} from '../lib/agency-engine.ts';
const seeded=(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const N=1800;const sums={BUY:0,SELL:0,HOLD:0,flow:0,trend:0,full:0},calls={BUY:0,SELL:0,HOLD:0},perEpisode={};
for(let i=0;i<N;i++){
 const ep=EPISODES[i%EPISODES.length],s=generateSnapshot('case'+i,ep.id,seeded(323377+i*19));
 const cap=safeCap(s).maxAllocationBps;
 const realized=(call)=>call==='HOLD'?0:outcome(s,call,cap).pnlCents/100;
 const flow=researchFor(s,'flow'),trend=researchFor(s,'trend');
 const all=SPECIALISTS.map(x=>({specialist:x.id,cost:x.cost,createdAt:'test',report:researchFor(s,x.id)}));
 const c=councilFor(s,all).recommendation;calls[c]++;
 const values={BUY:realized('BUY'),SELL:realized('SELL'),HOLD:0,
  flow:realized(flow.recommendation)-12*.2,trend:realized(trend.recommendation)-5*.2,full:realized(c)-all.reduce((n,x)=>n+x.cost,0)*.2};
 for(const [k,v] of Object.entries(values))sums[k]+=v;
 perEpisode[ep.id]??={cases:0,buy:0,sell:0,flow:0,full:0};
 const row=perEpisode[ep.id];row.cases++;row.buy+=values.BUY;row.sell+=values.SELL;row.flow+=values.flow;row.full+=values.full;
}
const summary={cases:N,meanPnlDollars:Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,Math.round(v/N*100)/100])),councilDecisions:calls,byEpisode:Object.fromEntries(Object.entries(perEpisode).map(([k,v])=>[k,{cases:v.cases,alwaysBuy:+(v.buy/v.cases).toFixed(2),alwaysSell:+(v.sell/v.cases).toFixed(2),flowNet:+(v.flow/v.cases).toFixed(2),fullCouncilNet:+(v.full/v.cases).toFixed(2)}]))};
console.log(JSON.stringify(summary,null,2));
