/**
 * KULT Market Arena v7: server-only fictional market episode generation.
 * Only import from server modules; never bundle the outcome snapshot in a browser.
 * Public clients receive the first 48 bars and a hash commitment only.
 */
import { conveneCouncil, riskGate, specialistReport, type Job, type Specialist } from './agency-engine.ts';
import type { Bar, Choice } from './market-cases.ts';
export type { Bar, Choice };
export const ARENA_VERSION = 'arena-v7-server-private-1';
export const EPISODES = [
  {id:'aftershock',title:'After the Shock',tag:'VOLATILITY',brief:'A sharp move has hit the tape. Is the pressure continuing, or are traders overreacting?',icon:'⚡'},
  {id:'breakout',title:'Breakout Watch',tag:'MOMENTUM',brief:'Price is approaching an important level. Participation may confirm—or undermine—the move.',icon:'◆'},
  {id:'accumulation',title:'Quiet Accumulation',tag:'RESEARCH',brief:'A relatively steady market hides conflicting clues. Find out whether the signal exceeds execution costs.',icon:'◈'},
  {id:'circuit',title:'Circuit Breaker',tag:'RISK',brief:'A violent session tests the agency’s hard exposure limits. Standing down is a valid strategy.',icon:'⛨'},
  {id:'weekend',title:'Weekend Positioning',tag:'STRATEGY',brief:'A late-session move is developing. Determine whether momentum or fading provides the better explanation.',icon:'◎'},
  {id:'quiet',title:'Zero-Edge Window',tag:'PATIENCE',brief:'Signals are muted and costs matter. Research only if you believe the information is valuable.',icon:'◌'},
] as const;
export type EpisodeId = typeof EPISODES[number]['id'];
export function isEpisode(x:unknown):x is EpisodeId {return typeof x==='string'&&EPISODES.some(e=>e.id===x);}
export type Snapshot={id:string;episodeId:EpisodeId;bars:Bar[];version:string;regime:string;createdAt:string};
const round=(x:number)=>Math.round(x*10000)/10000;
export function secureRandom():()=>number {
 const values=new Uint32Array(256);crypto.getRandomValues(values);let i=0;
 return ()=>{if(i>=values.length)throw new Error('Random pool exhausted');return values[i++]/4294967296;};
}
export function generateSnapshot(id:string,episodeId:EpisodeId,rnd:()=>number=secureRandom()):Snapshot {
 const baseSign=episodeId==='aftershock'?-1:episodeId==='breakout'?1:(rnd()<.5?-1:1);
 const confirms=rnd()<.5;
 const follows=(rnd() < (confirms?.71:.29));
 const outcomeSign=baseSign*(follows?1:-1);
 const bars:Bar[]=[];
 let price=100+rnd()*25;
 const shock=episodeId==='circuit';
 const quiet=episodeId==='quiet';
 const prevDrift=(episodeId==='aftershock'?.0024:quiet?.00015:episodeId==='accumulation'?.00065:.00125)*baseSign;
 const postMagnitude=quiet?(.00007+rnd()*.0004):shock?(.004+rnd()*.003):(.0015+rnd()*.0040);
 const regime=quiet?'low-edge uncertainty':shock?'volatility stress':confirms?'volume-confirmed move':'volume divergence';
 for(let i=0;i<60;i++){
   const pre=i<48;
   const drift=pre?prevDrift:postMagnitude*outcomeSign;
   const vol=shock?(pre?.023:.014):quiet?.0008:(pre?.0032:.0045);
   const jitter=(rnd()-.5)*vol;
   const close=Math.max(10,price*(1+drift+jitter));
   const range=shock?.020+rnd()*.014:quiet?.0009+rnd()*.0015:.0018+rnd()*.004;
   const volumeBoost=i>=40&&i<48?(confirms?1.9:.53):1;
   bars.push({step:i+1,open:round(price),close:round(close),high:round(Math.max(price,close)*(1+range)),low:round(Math.min(price,close)*(1-range)),volume:Math.round((240+rnd()*320)*volumeBoost)});
   price=close;
 }
 return {id,episodeId,bars,version:ARENA_VERSION,regime,createdAt:new Date().toISOString()};
}
export async function sha256(text:string):Promise<string> {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
export function snapshotMaterial(s:Snapshot){return JSON.stringify({id:s.id,version:s.version,bars:s.bars});}
export function publicSnapshot(s:Snapshot,resolved=false){return {
   id:s.id,episodeId:s.episodeId,version:s.version,visibleBars:s.bars.slice(0,48),
   ...(resolved?{futureBars:s.bars.slice(48),allBars:s.bars,regime:s.regime}:{}),
 };}
export function researchFor(s:Snapshot,specialist:Specialist){
 const ep=EPISODES.find(e=>e.id===s.episodeId)!;
 return specialistReport(specialist,s.bars.slice(0,48),ep.brief);
}
export function councilFor(s:Snapshot,jobs:Job[]){
 const base=conveneCouncil(jobs,s.bars.slice(0,48));
 // Calibrate advice around direct pre-cutoff participation evidence. The older
 // majority vote overwhelmed Flow Reader's better-calibrated signal. The
 // specialists remain advisory; Risk Steward is never overridden by the vote.
 const flow=jobs.find(j=>j.specialist==='flow')?.report;
 const trend=jobs.find(j=>j.specialist==='trend')?.report;
 const quant=jobs.find(j=>j.specialist==='quant')?.report;
 let recommendation:Choice=base.recommendation;
 if(base.risk.maxAllocationBps===0)recommendation='HOLD';
 else if(flow){
   if(flow.recommendation!=='HOLD')recommendation=flow.recommendation;
   else if(trend&&quant&&trend.recommendation===quant.recommendation&&trend.recommendation!=='HOLD'&&Math.abs(flow.metric)<10)recommendation=trend.recommendation;
   else recommendation='HOLD';
 }
 return {...base,recommendation,
  dissent:base.votes.filter(v=>v.action!==recommendation).map(v=>`${v.specialist}: ${v.action} — ${v.evidence}`).join(' | ')||'No recorded disagreement. Missing reports remain unknown.'};
}
export function safeCap(s:Snapshot){return riskGate(s.bars.slice(0,48));}
export function outcome(s:Snapshot,choice:Choice,sizeBps:number){
 const reference=s.bars[47].close,final=s.bars[59].close,move=final/reference-1;
 const notional=Math.round(1_000_000*sizeBps/10000);
 const cost=Math.round(notional*.003);
 const pnl=choice==='HOLD'?0:Math.round(notional*move*(choice==='BUY'?1:-1))-cost;
 const alternatives=Object.fromEntries((['BUY','SELL','HOLD'] as Choice[]).map(c=>[c,c==='HOLD'?0:Math.round(notional*move*(c==='BUY'?1:-1))-cost]));
 const best=(Object.keys(alternatives) as Choice[]).sort((a,b)=>alternatives[b]-alternatives[a])[0];
 return {reference,final,movePct:Math.round(move*10000)/100,pnlCents:pnl,equityCents:1_000_000+pnl,costCents:choice==='HOLD'?0:cost,alternatives,best};
}
export function utcWeek(now=Date.now()){
 const d=new Date(now);const days=(d.getUTCDay()+6)%7;
 return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-days)).toISOString().slice(0,10);
}
