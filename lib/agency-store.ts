import { env } from "cloudflare:workers";
import { ensureSchema } from "./ensure-schema";
import { caseResult, dailyId, FROZEN_START_ID, generateFrozenDaily, getCaseConfig, publicCase, type Bar, type FrozenDaily } from "./market-cases";
import { conveneCouncil, seasonKey, SPECIALISTS, specialistReport, type Council, type Job, type Specialist } from "./agency-engine";

const db = () => { if (!env.DB) throw new Error("Agency database unavailable"); return env.DB; };
export class AgencyError extends Error { constructor(message: string, public status = 400) { super(message); } }
const sha = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b=>b.toString(16).padStart(2,"0")).join("");
type DailyRow = { bars_json: string; regime: string; commitment: string; version: string };
async function parseDaily(id:string,row: DailyRow | null): Promise<FrozenDaily | null> {
  if(!row)return null;
  const bars=JSON.parse(row.bars_json) as Bar[];
  if(!Array.isArray(bars)||bars.length!==60||await sha(JSON.stringify({id,version:row.version,bars}))!==row.commitment)throw new AgencyError("Frozen daily snapshot integrity check failed.",503);
  return { bars, regime: row.regime, commitment: row.commitment, version: row.version };
}

export async function frozenFor(id: string, now = Date.now(), create = false): Promise<FrozenDaily | null> {
  await ensureSchema();
  if (!id.startsWith("daily-") || id < FROZEN_START_ID) return null;
  let row = await db().prepare("SELECT bars_json, regime, commitment, version FROM agency_daily_cases WHERE case_id=?").bind(id).first<DailyRow>();
  if (!row && create && id === dailyId(new Date(now)) && getCaseConfig(id, now)) {
    const generated = await generateFrozenDaily(id);
    await db().prepare("INSERT OR IGNORE INTO agency_daily_cases(case_id,bars_json,regime,commitment,version,created_at) VALUES(?,?,?,?,?,?)").bind(id,JSON.stringify(generated.bars),generated.regime,generated.commitment,generated.version,new Date(now).toISOString()).run();
    row = await db().prepare("SELECT bars_json, regime, commitment, version FROM agency_daily_cases WHERE case_id=?").bind(id).first<DailyRow>();
  }
  return parseDaily(id,row);
}
export async function publicAgencyCase(id: string, now = Date.now()) { return publicCase(id,now,await frozenFor(id,now,true)); }
export async function agencyCaseResult(id: string, now = Date.now()) { return caseResult(id,now,await frozenFor(id,now,false)); }
const keyFor = (id: string, now: number) => id.startsWith("daily-") ? seasonKey(Date.parse(`${id.slice(6)}T12:00:00Z`)) : `practice:${id}`;
async function ensureSeason(owner: string, key: string, now: number) {
  await db().prepare("INSERT OR IGNORE INTO agency_seasons(owner,season_key,credits_remaining,created_at) VALUES(?,?,100,?)").bind(owner,key,new Date(now).toISOString()).run();
}
async function ensureMission(owner: string, id: string, now: number) {
  const time=new Date(now).toISOString();
  await db().prepare("INSERT OR IGNORE INTO agency_missions(owner,case_id,created_at,updated_at) VALUES(?,?,?,?)").bind(owner,id,time,time).run();
}
type JobRow={specialist:Specialist;cost:number;report_json:string;created_at:string};
async function jobsFor(owner:string,id:string):Promise<Job[]> {
  const rows=await db().prepare("SELECT specialist,cost,report_json,created_at FROM agency_jobs WHERE owner=? AND case_id=? ORDER BY created_at,specialist").bind(owner,id).all<JobRow>();
  return rows.results.map(r=>({specialist:r.specialist,cost:r.cost,report:JSON.parse(r.report_json),createdAt:r.created_at}));
}
async function missionFor(owner:string,id:string,now:number){
  const key=keyFor(id,now);
  const [jobs,season,mission]=await Promise.all([
    jobsFor(owner,id),
    db().prepare("SELECT credits_remaining FROM agency_seasons WHERE owner=? AND season_key=?").bind(owner,key).first<{credits_remaining:number}>(),
    db().prepare("SELECT council_json,council_hash FROM agency_missions WHERE owner=? AND case_id=?").bind(owner,id).first<{council_json:string|null;council_hash:string|null}>(),
  ]);
  return { caseId:id, seasonKey:key, creditsRemaining:season?.credits_remaining??100, spentOnCase:jobs.reduce((n,j)=>n+j.cost,0), jobs, council:mission?.council_json ? JSON.parse(mission.council_json) as Council : null, councilHash:mission?.council_hash??null };
}
export async function agencyOverview(owner:string,ids:string[],now:number,decisions:{caseId:string;choice:string;status:string;grade:{correctDirection:boolean}|null}[]){
  const missions=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await missionFor(owner,id,now)] as const)));
  const all=await db().prepare("SELECT case_id,specialist,cost,report_json FROM agency_jobs WHERE owner=? ORDER BY created_at DESC LIMIT 150").bind(owner).all<{case_id:string;specialist:Specialist;cost:number;report_json:string}>();
  const outcomePairs=await Promise.all([...new Set(all.results.map(j=>j.case_id))].map(async id=>[id,await agencyCaseResult(id,now)] as const));
  const outcomes=new Map(outcomePairs);
  const careers=SPECIALISTS.map(s=>{
    const mine=all.results.filter(j=>j.specialist===s.id);
    const scored=mine.filter(j=>outcomes.has(j.case_id)&&outcomes.get(j.case_id));
    const hits=scored.filter(j=>(JSON.parse(j.report_json) as {recommendation:string}).recommendation===outcomes.get(j.case_id)?.best).length;
    const influenced=scored.filter(j=>(JSON.parse(j.report_json) as {recommendation:string}).recommendation===decisions.find(d=>d.caseId===j.case_id)?.choice).length;
    return {id:s.id,name:s.name,jobs:mine.length,scored:scored.length,alignedWins:hits,influenced,credits:mine.reduce((n,j)=>n+j.cost,0)};
  });
  return {missions,careers,specialists:SPECIALISTS,seasonKey:seasonKey(now)};
}

export async function dispatch(owner:string,id:string,specialist:unknown,now=Date.now()){
  await ensureSchema();
  const role=SPECIALISTS.find(s=>s.id===specialist);
  if(!role)throw new AgencyError("Unknown specialist.");
  const config=getCaseConfig(id,now);
  if(!config || config.lockAt && Date.parse(config.lockAt)<=now)throw new AgencyError("Mission is closed.",409);
  if(await db().prepare("SELECT id FROM market_decisions WHERE owner=? AND case_id=?").bind(owner,id).first())throw new AgencyError("Decision already locked.",409);
  const existing=(await jobsFor(owner,id)).find(j=>j.specialist===role.id);
  if(existing)return missionFor(owner,id,now);
  const publicData=await publicAgencyCase(id,now);
  if(!publicData)throw new AgencyError("Mission data unavailable.",503);
  const report=specialistReport(role.id,publicData.visibleBars,publicData.brief);
  const key=keyFor(id,now),time=new Date(now).toISOString(),jobId=crypto.randomUUID();
  await ensureSeason(owner,key,now);await ensureMission(owner,id,now);
  try{
    await db().batch([
      db().prepare("INSERT INTO agency_jobs(id,owner,case_id,season_key,specialist,cost,report_json,created_at) SELECT ?,?,?,?,?,?,?,? FROM agency_seasons WHERE owner=? AND season_key=? AND credits_remaining>=? AND NOT EXISTS(SELECT 1 FROM market_decisions WHERE owner=? AND case_id=?) AND (? IS NULL OR CAST(strftime('%s','now') AS INTEGER)*1000 < ?)").bind(jobId,owner,id,key,role.id,role.cost,JSON.stringify(report),time,owner,key,role.cost,owner,id,config.lockAt?Date.parse(config.lockAt):null,config.lockAt?Date.parse(config.lockAt):null),
      db().prepare("UPDATE agency_seasons SET credits_remaining=credits_remaining-? WHERE owner=? AND season_key=? AND EXISTS(SELECT 1 FROM agency_jobs WHERE id=?)").bind(role.cost,owner,key,jobId),
      db().prepare("UPDATE agency_missions SET council_json=NULL,council_hash=NULL,updated_at=? WHERE owner=? AND case_id=? AND EXISTS(SELECT 1 FROM agency_jobs WHERE id=?)").bind(time,owner,id,jobId),
    ]);
  }catch{ const raced=(await jobsFor(owner,id)).find(j=>j.specialist===role.id);if(!raced)throw new AgencyError("Job could not complete. Refresh the mission.",409); }
  const state=await missionFor(owner,id,now);
  if(!state.jobs.some(j=>j.specialist===role.id))throw new AgencyError("No credits remain, or this mission has already closed. Refresh.",409);
  return state;
}
export async function convene(owner:string,id:string,now=Date.now()){
  await ensureSchema();
  const config=getCaseConfig(id,now);
  if(!config || config.lockAt && Date.parse(config.lockAt)<=now)throw new AgencyError("Mission is closed.",409);
  if(await db().prepare("SELECT id FROM market_decisions WHERE owner=? AND case_id=?").bind(owner,id).first())throw new AgencyError("Decision already locked.",409);
  const data=await publicAgencyCase(id,now);if(!data)throw new AgencyError("Mission data unavailable.",503);
  const jobs=await jobsFor(owner,id);if(!jobs.length)throw new AgencyError("Dispatch at least one specialist first.",409);
  const council=conveneCouncil(jobs,data.visibleBars);
  const hash=await sha(JSON.stringify({id,commitment:data.commitment,jobs,council}));
  await ensureMission(owner,id,now);
  const saved=await db().prepare("UPDATE agency_missions SET council_json=?,council_hash=?,updated_at=? WHERE owner=? AND case_id=? AND NOT EXISTS(SELECT 1 FROM market_decisions WHERE owner=? AND case_id=?) AND (? IS NULL OR CAST(strftime('%s','now') AS INTEGER)*1000 < ?)").bind(JSON.stringify(council),hash,new Date(now).toISOString(),owner,id,owner,id,config.lockAt?Date.parse(config.lockAt):null,config.lockAt?Date.parse(config.lockAt):null).run();
  if(saved.meta.changes!==1)throw new AgencyError("Mission closed while the council was gathering.",409);
  return missionFor(owner,id,now);
}
export async function authorizeMission(owner:string,id:string,choice:unknown,allocationBps:unknown,councilHash:unknown,now:number){
  const state=await missionFor(owner,id,now);
  if(!state.council || !state.councilHash || councilHash!==state.councilHash || !state.jobs.length)throw new AgencyError("Convene the latest council before authorizing.",409);
  const size=Number(allocationBps);
  if(!Number.isInteger(size) || (choice==="HOLD"?size!==0:![1000,2000].includes(size)))throw new AgencyError("Choose a valid virtual allocation.");
  if(size>state.council.risk.maxAllocationBps)throw new AgencyError("Risk Steward blocked this allocation.",403);
  const data=await publicAgencyCase(id,now);if(!data)throw new AgencyError("Mission data unavailable.",503);
  const refreshed=conveneCouncil(state.jobs,data.visibleBars);
  const hash=await sha(JSON.stringify({id,commitment:data.commitment,jobs:state.jobs,council:refreshed}));
  if(hash!==state.councilHash)throw new AgencyError("Council evidence changed. Reopen the council.",409);
  return {allocationBps:size,spent:state.spentOnCase,missionHash:state.councilHash,overrode:Number(state.council.recommendation!==choice),council:state.council};
}
export async function claimPractice(owner:string,guest:string){
  await db().batch([
    db().prepare("UPDATE OR IGNORE agency_seasons SET owner=? WHERE owner=? AND season_key LIKE 'practice:%'").bind(owner,guest),
    db().prepare("UPDATE OR IGNORE agency_missions SET owner=? WHERE owner=? AND case_id NOT LIKE 'daily-%'").bind(owner,guest),
    db().prepare("UPDATE OR IGNORE agency_jobs SET owner=? WHERE owner=? AND case_id NOT LIKE 'daily-%'").bind(owner,guest),
    db().prepare("DELETE FROM agency_seasons WHERE owner=? AND season_key LIKE 'practice:%'").bind(guest),
    db().prepare("DELETE FROM agency_missions WHERE owner=? AND case_id NOT LIKE 'daily-%'").bind(guest),
    db().prepare("DELETE FROM agency_jobs WHERE owner=? AND case_id NOT LIKE 'daily-%'").bind(guest),
  ]);
}
export async function agencyExport(owner:string,now:number,decisions:{caseId:string;choice:string;status:string;grade:{correctDirection:boolean}|null}[]=[]){
  const state=await agencyOverview(owner,[dailyId(new Date(now))],now,decisions);
  const rows=await db().prepare("SELECT case_id,specialist,cost,report_json,created_at FROM agency_jobs WHERE owner=? ORDER BY created_at DESC LIMIT 150").bind(owner).all();
  return {missions:state.missions,careers:state.careers,jobs:rows.results,source:"pre-cutoff simulation bars",model:"deterministic specialist rules; no LLM",budget:"100 equal credits per UTC week for ranked daily cases"};
}
