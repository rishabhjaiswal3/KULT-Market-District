import { env } from 'cloudflare:workers';
import { SPECIALISTS, type Job, type Specialist, type Council } from './agency-engine';
import { ARENA_VERSION, EPISODES, type EpisodeId, generateSnapshot, sha256, snapshotMaterial, publicSnapshot, researchFor, councilFor, safeCap, outcome, utcWeek, type Snapshot, type Choice } from './arena-v7-engine';

const db=()=>{if(!env.DB)throw new ArenaError('Cloudflare D1 binding DB is missing. Apply migration 0004.',503);return env.DB;};
export class ArenaError extends Error{constructor(message:string,public status=400){super(message);}}
type SessionRow={id:string;owner:string;season_key:string;episode_id:EpisodeId;snapshot_json:string;commitment:string;status:string;council_json:string|null;council_hash:string|null;decision_json:string|null;created_at:string;settled_at:string|null};
type JobRow={id:string;owner:string;session_id:string;specialist:Specialist;cost:number;report_json:string;created_at:string};
const parse=(r:SessionRow):Snapshot=>JSON.parse(r.snapshot_json) as Snapshot;
async function verify(r:SessionRow){
 const snap=parse(r);
 if(snap.version!==ARENA_VERSION||snap.id!==r.id||snap.episodeId!==r.episode_id||snap.bars?.length!==60||await sha256(snapshotMaterial(snap))!==r.commitment)throw new ArenaError('Stored mission failed snapshot verification.',503);
 return snap;
}
async function jobsFor(owner:string,sessionId:string){
 const result=await db().prepare('SELECT * FROM arena_v7_jobs WHERE owner=? AND session_id=? ORDER BY created_at,specialist').bind(owner,sessionId).all<JobRow>();
 return result.results.map(r=>({specialist:r.specialist,cost:r.cost,report:JSON.parse(r.report_json),createdAt:r.created_at} as Job));
}
async function rowFor(owner:string,episodeId:EpisodeId,season:string){
 return db().prepare('SELECT * FROM arena_v7_sessions WHERE owner=? AND season_key=? AND episode_id=?').bind(owner,season,episodeId).first<SessionRow>();
}
async function walletFor(owner:string,season:string){
 const stamp=new Date().toISOString();
 await db().prepare('INSERT OR IGNORE INTO arena_v7_wallets(owner,season_key,credits_remaining,created_at) VALUES(?,?,100,?)').bind(owner,season,stamp).run();
 const result=await db().prepare('SELECT credits_remaining FROM arena_v7_wallets WHERE owner=? AND season_key=?').bind(owner,season).first<{credits_remaining:number}>();
 if(!result)throw new ArenaError('Research budget unavailable.',503);
 return result.credits_remaining;
}
async function assemble(owner:string,row:SessionRow){
 const s=await verify(row),jobs=await jobsFor(owner,row.id),resolved=row.status==='resolved',risk=safeCap(s),result=resolved?JSON.parse(row.decision_json||'null'):null;
 return {id:row.id,episodeId:row.episode_id,status:row.status,commitment:row.commitment,createdAt:row.created_at,settledAt:row.settled_at,
  ...publicSnapshot(s,resolved),risk,jobs,council:row.council_json?JSON.parse(row.council_json):null,councilHash:row.council_hash,decision:result};
}
export async function arenaState(owner:string,signedIn:boolean,now=Date.now()){
 const season=utcWeek(now),creditsRemaining=await walletFor(owner,season);
 const rows=await db().prepare('SELECT * FROM arena_v7_sessions WHERE owner=? AND season_key=? ORDER BY created_at').bind(owner,season).all<SessionRow>();
 const sessions=await Promise.all(rows.results.map(r=>assemble(owner,r)));
 const settled=sessions.filter(s=>s.status==='resolved');
 const pnlCents=settled.reduce((sum,s)=>sum+(s.decision?.result?.pnlCents||0),0);
 const spent=settled.reduce((sum,s)=>sum+(s.decision?.creditsSpent||0),0);
 const scoreCents=pnlCents-spent*20;
 return {version:ARENA_VERSION,mode:'server_owned_practice',season,identityScope:signedIn?'site_user_only':'http_only_guest_cookie',
  creditsRemaining,episodes:EPISODES,specialists:SPECIALISTS,sessions,
  summary:{played:settled.length,available:EPISODES.length,pnlCents,spent,scoreCents},
  disclosure:'Fictional virtual markets. Server-private future paths until settlement. Rule-based research, not LLM agents. Private practice, not public ranked or real trading.'};
}
export async function startArena(owner:string,episodeId:EpisodeId,now=Date.now()){
 const season=utcWeek(now);
 await walletFor(owner,season);
 let row=await rowFor(owner,episodeId,season);
 if(!row){
  const id=crypto.randomUUID(),s=generateSnapshot(id,episodeId),commit=await sha256(snapshotMaterial(s));
  await db().prepare('INSERT OR IGNORE INTO arena_v7_sessions(id,owner,season_key,episode_id,snapshot_json,commitment,status,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .bind(id,owner,season,episodeId,JSON.stringify(s),commit,'open',new Date(now).toISOString()).run();
  row=await rowFor(owner,episodeId,season);
 }
 if(!row)throw new ArenaError('Could not create the mission.',503);
 return assemble(owner,row);
}
export async function dispatchArena(owner:string,episodeId:EpisodeId,specialist:unknown,now=Date.now()){
 const agent=SPECIALISTS.find(s=>s.id===specialist);if(!agent)throw new ArenaError('Unknown specialist.');
 const season=utcWeek(now),row=await rowFor(owner,episodeId,season);if(!row)throw new ArenaError('Start the mission first.',409);
 if(row.status!=='open')throw new ArenaError('Mission is already resolved.',409);
 const snap=await verify(row);
 const existing=(await jobsFor(owner,row.id)).some(j=>j.specialist===agent.id);
 if(existing)return assemble(owner,row);
 const report=researchFor(snap,agent.id),jobId=crypto.randomUUID(),stamp=new Date(now).toISOString();
 try{
  // Cloudflare D1 batch is a single transaction: only insert when budget is enough,
  // then debit exactly once for this unique job and invalidate a stale council.
  await db().batch([
   db().prepare(`INSERT INTO arena_v7_jobs(id,owner,session_id,specialist,cost,report_json,created_at)
     SELECT ?,?,?,?,?,?,? FROM arena_v7_wallets w WHERE w.owner=? AND w.season_key=? AND w.credits_remaining>=?
     AND EXISTS(SELECT 1 FROM arena_v7_sessions s WHERE s.id=? AND s.owner=? AND s.status='open')
     AND NOT EXISTS(SELECT 1 FROM arena_v7_jobs j WHERE j.session_id=? AND j.specialist=?)`)
    .bind(jobId,owner,row.id,agent.id,agent.cost,JSON.stringify(report),stamp,owner,season,agent.cost,row.id,owner,row.id,agent.id),
   db().prepare('UPDATE arena_v7_wallets SET credits_remaining=credits_remaining-? WHERE owner=? AND season_key=? AND EXISTS(SELECT 1 FROM arena_v7_jobs WHERE id=?)')
    .bind(agent.cost,owner,season,jobId),
   db().prepare('UPDATE arena_v7_sessions SET council_json=NULL,council_hash=NULL WHERE id=? AND owner=? AND status=\'open\' AND EXISTS(SELECT 1 FROM arena_v7_jobs WHERE id=?)')
    .bind(row.id,owner,jobId),
  ]);
 }catch{const concurrent=(await jobsFor(owner,row.id)).some(j=>j.specialist===agent.id);if(!concurrent)throw new ArenaError('Insufficient research credits, or concurrent mission change.',409);}
 const refreshed=await rowFor(owner,episodeId,season);if(!refreshed)throw new ArenaError('Mission unavailable.',503);
 if(!(await jobsFor(owner,row.id)).some(j=>j.specialist===agent.id))throw new ArenaError('Insufficient research credits.',409);
 return assemble(owner,refreshed);
}
export async function conveneArena(owner:string,episodeId:EpisodeId,now=Date.now()){
 const row=await rowFor(owner,episodeId,utcWeek(now));if(!row||row.status!=='open')throw new ArenaError('Mission not open.',409);
 const s=await verify(row),jobs=await jobsFor(owner,row.id);
 if(!jobs.length)throw new ArenaError('Council requires at least one research specialist. You can choose HOLD for free.',409);
 const council=councilFor(s,jobs),hash=await sha256(JSON.stringify({sessionId:row.id,commitment:row.commitment,jobs,council}));
 const applied=await db().prepare("UPDATE arena_v7_sessions SET council_json=?,council_hash=? WHERE id=? AND owner=? AND status='open'")
  .bind(JSON.stringify(council),hash,row.id,owner).run();
 if(applied.meta.changes!==1)throw new ArenaError('Mission changed; refresh.',409);
 return assemble(owner,{...row,council_json:JSON.stringify(council),council_hash:hash});
}
export async function settleArena(owner:string,episodeId:EpisodeId,choice:unknown,size:unknown,confidence:unknown,councilHash:unknown,now=Date.now()){
 if(!['BUY','SELL','HOLD'].includes(String(choice)))throw new ArenaError('Choose BUY, SELL or HOLD.');
 if(!Number.isInteger(confidence)||Number(confidence)<0||Number(confidence)>100)throw new ArenaError('Confidence must be 0–100.');
 if(!Number.isInteger(size)||(choice==='HOLD'?size!==0:![1000,2000].includes(Number(size))))throw new ArenaError('Allocation must be 0% for HOLD, otherwise 10% or 20%.');
 const row=await rowFor(owner,episodeId,utcWeek(now));if(!row)throw new ArenaError('Start the mission first.',409);
 if(row.status==='resolved')return assemble(owner,row); // Idempotent duplicate settlement.
 const s=await verify(row),risk=safeCap(s),jobs=await jobsFor(owner,row.id);
 if(Number(size)>risk.maxAllocationBps)throw new ArenaError('Risk Steward refused this allocation.',403);
 if(choice!=='HOLD' && !jobs.length)throw new ArenaError('Dispatch research and convene the council before trading. HOLD is free.',409);
 if(choice!=='HOLD'){
  const expected=councilFor(s,jobs),hash=await sha256(JSON.stringify({sessionId:row.id,commitment:row.commitment,jobs,council:expected}));
  if(row.council_hash!==hash||row.council_hash!==councilHash)throw new ArenaError('Council evidence is stale. Convene again.',409);
 }
 const result=outcome(s,choice as Choice,Number(size));
 const spent=jobs.reduce((sum,j)=>sum+j.cost,0);
 const council=row.council_json?JSON.parse(row.council_json) as Council:null;
 const details={choice,sizeBps:Number(size),confidence,overrode:!!council&&council.recommendation!==choice,creditsSpent:spent,result,
  researcherRecords:jobs.map(j=>({specialist:j.specialist,recommendation:j.report.recommendation,alignedWithBest:j.report.recommendation===result.best,sourceCutoff:j.report.sourceCutoff,cost:j.cost})),
  lesson:choice===result.best?'Your final action was the hindsight-best option in this fictional run; this does not establish a predictive edge.':`The best hindsight option was ${result.best}. Review the evidence and costs before the next mission.`};
 const changed=await db().prepare("UPDATE arena_v7_sessions SET status='resolved',decision_json=?,settled_at=? WHERE id=? AND owner=? AND status='open'")
  .bind(JSON.stringify(details),new Date(now).toISOString(),row.id,owner).run();
 if(changed.meta.changes!==1){const raced=await rowFor(owner,episodeId,utcWeek(now));if(raced?.status==='resolved')return assemble(owner,raced);throw new ArenaError('Mission changed during settlement.',409);}
 return assemble(owner,{...row,status:'resolved',decision_json:JSON.stringify(details),settled_at:new Date(now).toISOString()});
}
export async function passportArena(owner:string,signedIn:boolean){
 const state=await arenaState(owner,signedIn);
 return {schema:'kult.market.arena.passport.v7',exportedAt:new Date().toISOString(),identityScope:state.identityScope,season:state.season,
  summary:state.summary,records:state.sessions.map(s=>({id:s.id,episodeId:s.episodeId,commitment:s.commitment,createdAt:s.createdAt,settledAt:s.settledAt,
   status:s.status,jobs:s.jobs,council:s.council,decision:s.decision,allBars:s.status==='resolved'?s.allBars:undefined})),
  disclosure:'Site-local identity (not unified KULT Agent Passport). Self-contained D1 receipts; not external proof, financial advice, live trading or prize ranking.'};
}
