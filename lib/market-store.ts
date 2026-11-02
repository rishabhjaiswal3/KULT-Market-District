import { env } from "cloudflare:workers";
import { ensureSchema } from "./ensure-schema";
import { init, passport } from "./store";
import { agencyCaseResult, agencyExport, agencyOverview, authorizeMission, claimPractice, publicAgencyCase } from "./agency-store";
import { dailyId, getCaseConfig, grade, replayIds, type Choice } from "./market-cases";
import { seasonKey } from "./agency-engine";

const db=()=>{if(!env.DB)throw new Error("Market database unavailable");return env.DB;};
type Decision={id:string;owner:string;case_id:string;mode:string;choice:Choice;confidence:number;overrode:number;snapshot_hash:string;receipt_hash:string;allocation_bps:number;credits_spent:number;mission_hash:string;created_at:string};
export class MarketError extends Error{constructor(message:string,public status=400){super(message);}}
async function digest(value:string){const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,"0")).join("");}
function receiptInput(d:Decision){return d.mission_hash ? `v5|${d.case_id}|${d.choice}|${d.confidence}|${d.snapshot_hash}|${d.allocation_bps}|${d.credits_spent}|${d.mission_hash}|${d.created_at}`:`${d.case_id}|${d.choice}|${d.confidence}|${d.snapshot_hash}|${d.created_at}`;}

export async function claimGuest(owner:string,guestOwner:string|null){
  await ensureSchema();
  if(!guestOwner||guestOwner===owner)return;
  await claimPractice(owner,guestOwner);
  const rows=await db().prepare("SELECT id FROM market_decisions WHERE owner=? AND mode='replay' LIMIT 100").bind(guestOwner).all<{id:string}>();
  for(const row of rows.results)await db().batch([
    db().prepare("UPDATE OR IGNORE market_decisions SET owner=? WHERE id=? AND owner=?").bind(owner,row.id,guestOwner),
    db().prepare("DELETE FROM market_decisions WHERE id=? AND owner=?").bind(row.id,guestOwner),
  ]);
}
async function resolvedDecision(d:Decision,now:number){
  const result=await agencyCaseResult(d.case_id,now);
  const score=result?grade(d.choice,d.confidence,result,d.allocation_bps):null;
  return {id:d.id,caseId:d.case_id,mode:d.mode,choice:d.choice,confidence:d.confidence,overrode:Boolean(d.overrode),allocationBps:d.allocation_bps,creditsSpent:d.credits_spent,missionHash:d.mission_hash,lockedAt:d.created_at,snapshotHash:d.snapshot_hash,receiptHash:d.receipt_hash,status:result?"resolved" as const:"locked" as const,grade:score,reveal:result&&score?{reference:result.reference,final:result.final,movePct:result.movePct,outcomes:score.outcomes,best:score.best,futureBars:result.futureBars,allBars:result.allBars,commitment:result.commitment,version:result.version,regime:result.regime,costCents:score.costCents}:null};
}
const stages=["Junior Desk","Research Director","Risk Director","Agency Principal","Managing Partner"];
const stageFor=(completed:number)=>stages[completed>=14?4:completed>=7?3:completed>=3?2:completed>=1?1:0];

async function league(now:number,owner:string|null){
  const today=dailyId(new Date(now));const start=Date.parse(`${seasonKey(now)}T00:00:00Z`);
  const ids=Array.from({length:7},(_,i)=>dailyId(new Date(start+i*86400000))).filter(id=>id<=today);
  const rows=await db().prepare(`SELECT owner,case_id,choice,confidence,allocation_bps,credits_spent FROM market_decisions WHERE mode='daily' AND case_id IN (${ids.map(()=>"?").join(",")}) AND owner NOT LIKE 'guest:%' LIMIT 2000`).bind(...ids).all<{owner:string;case_id:string;choice:Choice;confidence:number;allocation_bps:number;credits_spent:number}>();
  type Player={owner:string;pnlCents:number;equityCents:number;peakCents:number;maxDrawdownCents:number;totalBrier:number;played:number;creditsSpent:number};
  const participants=new Map<string,Player>();
  const results=new Map<string,NonNullable<Awaited<ReturnType<typeof agencyCaseResult>>>>();
  for(const id of ids){const r=await agencyCaseResult(id,now);if(r)results.set(id,r);}
  for(const row of rows.results.sort((a,b)=>a.case_id.localeCompare(b.case_id))){
    const result=results.get(row.case_id);if(!result)continue;
    const value=grade(row.choice,row.confidence,result,row.allocation_bps);
    const p=participants.get(row.owner)??{owner:row.owner,pnlCents:0,equityCents:1_000_000,peakCents:1_000_000,maxDrawdownCents:0,totalBrier:0,played:0,creditsSpent:0};
    p.pnlCents+=value.pnlCents;p.equityCents+=value.pnlCents;p.peakCents=Math.max(p.peakCents,p.equityCents);
    p.maxDrawdownCents=Math.max(p.maxDrawdownCents,p.peakCents-p.equityCents);p.totalBrier+=value.brier;p.creditsSpent+=row.credits_spent;p.played++;participants.set(row.owner,p);
  }
  const score=(p:Player)=>p.equityCents-Math.round(p.maxDrawdownCents*.25)-p.creditsSpent*20;
  const sorted=[...participants.values()].sort((a,b)=>score(b)-score(a)||a.totalBrier/a.played-b.totalBrier/b.played||a.owner.localeCompare(b.owner));
  const top=sorted.slice(0,10);
  const names=top.length?await db().prepare(`SELECT owner,alias,agent_name FROM profiles WHERE owner IN (${top.map(()=>"?").join(",")})`).bind(...top.map(p=>p.owner)).all<{owner:string;alias:string;agent_name:string}>():{results:[] as {owner:string;alias:string;agent_name:string}[]};
  const nameMap=new Map(names.results.map(p=>[p.owner,{alias:p.alias,agentName:p.agent_name}]));
  return {season:`UTC WEEK OF ${seasonKey(now)}`,rows:top.map((p,i)=>({rank:i+1,alias:nameMap.get(p.owner)?.alias??"Director",agentName:nameMap.get(p.owner)?.agentName??"Agent",equityCents:p.equityCents,scoreCents:score(p),maxDrawdownCents:p.maxDrawdownCents,creditsSpent:p.creditsSpent,brier:Math.round(p.totalBrier/p.played*10000)/10000,cases:p.played,me:p.owner===owner})),myRank:owner?sorted.findIndex(p=>p.owner===owner)+1||null:null,participantCount:sorted.length,todayEntries:rows.results.filter(r=>r.case_id===today).length,note:"UTC week; $10,000 virtual start; 100 equal research credits. Score = equity − 25% max drawdown − $0.20 per credit. Only resolved signed-in daily cases rank. Private beta query cap: 2,000 decisions."};
}
export async function marketState(owner:string,signedIn:boolean,now=Date.now(),requestedCase?:string|null){
  await ensureSchema();
  if(signedIn)await init(owner);
  const [profile,decisions]=await Promise.all([
    signedIn?db().prepare("SELECT alias,agent_name FROM profiles WHERE owner=?").bind(owner).first<{alias:string;agent_name:string}>():Promise.resolve(null),
    db().prepare("SELECT * FROM market_decisions WHERE owner=? ORDER BY created_at DESC LIMIT 100").bind(owner).all<Decision>(),
  ]);
  const ids=[...new Set([...replayIds(),dailyId(new Date(now)),...decisions.results.map(d=>d.case_id),...(requestedCase&&getCaseConfig(requestedCase,now)?[requestedCase]:[])])];
  const [cases,resolved,standings]=await Promise.all([Promise.all(ids.map(id=>publicAgencyCase(id,now))),Promise.all(decisions.results.map(d=>resolvedDecision(d,now))),league(now,signedIn?owner:null)]);
  const completed=resolved.filter(d=>d.status==="resolved").length;
  const agency=await agencyOverview(owner,ids,now,resolved);
  return {profile:{alias:profile?.alias??"Guest Director",agentName:profile?.agent_name??"Scout",stage:stageFor(completed),completed,signedIn},cases:cases.filter(Boolean),decisions:resolved,league:standings,agency,execution:"virtual_only",dataSource:"fictional_training_simulation",identityScope:signedIn?"site_user_only":"guest_cookie"};
}
export async function submitDecision(owner:string,caseId:string,choice:unknown,confidence:unknown,allocationBps:unknown,councilHash:unknown,now=Date.now()){
  await ensureSchema();
  const config=getCaseConfig(caseId,now);if(!config)throw new MarketError("Mission unavailable.",404);
  if(config.lockAt&&Date.parse(config.lockAt)<=now)throw new MarketError("Daily mission closed.",409);
  if(!["BUY","SELL","HOLD"].includes(String(choice)))throw new MarketError("Choose BUY, SELL or HOLD.");
  if(!Number.isInteger(confidence)||Number(confidence)<0||Number(confidence)>100)throw new MarketError("Chance of up close must be 0–100.");
  const existing=await db().prepare("SELECT * FROM market_decisions WHERE owner=? AND case_id=?").bind(owner,caseId).first<Decision>();
  if(existing){if(existing.choice!==choice||existing.confidence!==confidence||existing.allocation_bps!==allocationBps)throw new MarketError("This mission is locked.",409);return resolvedDecision(existing,now);}
  const mandate=await authorizeMission(owner,caseId,choice,allocationBps,councilHash,now);
  const data=await publicAgencyCase(caseId,now);if(!data)throw new MarketError("Mission source unavailable.",503);
  const time=new Date(now).toISOString(),id=crypto.randomUUID();
  const row:Decision={id,owner,case_id:caseId,mode:config.mode,choice:choice as Choice,confidence:Number(confidence),overrode:mandate.overrode,snapshot_hash:data.commitment,receipt_hash:"",allocation_bps:mandate.allocationBps,credits_spent:mandate.spent,mission_hash:mandate.missionHash,created_at:time};
  row.receipt_hash=await digest(receiptInput(row));
  try{
    const applied=await db().prepare("INSERT INTO market_decisions(id,owner,case_id,mode,choice,confidence,overrode,snapshot_hash,receipt_hash,allocation_bps,credits_spent,mission_hash,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? FROM agency_missions WHERE owner=? AND case_id=? AND council_hash=? AND (? IS NULL OR CAST(strftime('%s','now') AS INTEGER)*1000 < ?)").bind(row.id,row.owner,row.case_id,row.mode,row.choice,row.confidence,row.overrode,row.snapshot_hash,row.receipt_hash,row.allocation_bps,row.credits_spent,row.mission_hash,row.created_at,owner,caseId,row.mission_hash,config.lockAt?Date.parse(config.lockAt):null,config.lockAt?Date.parse(config.lockAt):null).run();
    if(applied.meta.changes!==1)throw new MarketError("Council changed or the daily deadline passed. Refresh.",409);
  }
  catch(error){if(error instanceof MarketError)throw error;const raced=await db().prepare("SELECT * FROM market_decisions WHERE owner=? AND case_id=?").bind(owner,caseId).first<Decision>();if(!raced||raced.choice!==choice||raced.confidence!==confidence||raced.allocation_bps!==allocationBps)throw new MarketError("Mission already locked. Refresh.",409);return resolvedDecision(raced,now);}
  return resolvedDecision(row,now);
}
export async function marketPassport(owner:string,now=Date.now()){
  const state=await marketState(owner,true,now),desk=await passport(owner),agency=await agencyExport(owner,now,state.decisions);
  const rows=await db().prepare("SELECT * FROM market_decisions WHERE owner=? ORDER BY created_at DESC LIMIT 100").bind(owner).all<Decision>();
  const receipts=await Promise.all(rows.results.map(async row=>({caseId:row.case_id,choice:row.choice,confidence:row.confidence,allocationBps:row.allocation_bps,creditsSpent:row.credits_spent,missionHash:row.mission_hash,snapshotHash:row.snapshot_hash,receiptHash:row.receipt_hash,receiptVerified:(await digest(receiptInput(row)))===row.receipt_hash,caseCommitmentMatches:state.decisions.find(d=>d.id===row.id)?.reveal?.commitment ? state.decisions.find(d=>d.id===row.id)?.reveal?.commitment===row.snapshot_hash : null,lockedAt:row.created_at})));
  return {schema:"kult.agent.passport.market.v5",identityScope:"site_user_only",agent:state.profile,execution:"virtual_only",caseResults:state.decisions,receiptChecks:receipts,agency,researchDesk:desk,note:"Server-held hashes and deterministic reports are internal evidence, not externally anchored fairness proof. No LLM or live execution in this beta."};
}
