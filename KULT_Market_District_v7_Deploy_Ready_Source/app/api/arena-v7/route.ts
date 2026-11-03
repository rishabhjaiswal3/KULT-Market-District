import { NextRequest,NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { ArenaError,arenaState,startArena,dispatchArena,conveneArena,settleArena,passportArena } from '../../../lib/arena-v7-store';
import { isEpisode } from '../../../lib/arena-v7-engine';
export const dynamic='force-dynamic';
const COOKIE='kult_arena_v7_guest';
function token(req:NextRequest){const t=req.cookies.get(COOKIE)?.value;return t&&/^[0-9a-f-]{36}$/.test(t)?{t,fresh:false}:{t:crypto.randomUUID(),fresh:true};}
function response(data:unknown,status:number,req:NextRequest,guest:{t:string;fresh:boolean},signedIn:boolean){
 const r=NextResponse.json(data,{status});r.headers.set('Cache-Control','no-store, private');
 if(!signedIn&&guest.fresh)r.cookies.set(COOKIE,guest.t,{httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',maxAge:7*86400,path:'/'});
 return r;
}
export async function GET(req:NextRequest){
 const guest=token(req),user=await getChatGPTUser(),owner=user?.userId??`guest:${guest.t}`;
 try{
  const data=req.nextUrl.searchParams.get('export')==='1'?await passportArena(owner,!!user):await arenaState(owner,!!user);
  return response(data,200,req,guest,!!user);
 }catch(err){return response({error:err instanceof ArenaError?err.message:'Arena service unavailable. Check D1 migration 0004.'},err instanceof ArenaError?err.status:503,req,guest,!!user);}
}
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');
 if(origin&&origin!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'Cross-origin mutation denied.'},{status:403});
 if(Number(req.headers.get('content-length')||0)>4096)return NextResponse.json({error:'Payload too large.'},{status:413});
 const guest=token(req),user=await getChatGPTUser(),owner=user?.userId??`guest:${guest.t}`;
 try{
  const input=await req.json() as Record<string,unknown>;
  if(!input||typeof input!=='object'||Array.isArray(input)||!isEpisode(input.episodeId))throw new ArenaError('Unknown episode.');
  let mission;
  if(input.action==='start')mission=await startArena(owner,input.episodeId);
  else if(input.action==='research')mission=await dispatchArena(owner,input.episodeId,input.specialist);
  else if(input.action==='council')mission=await conveneArena(owner,input.episodeId);
  else if(input.action==='settle')mission=await settleArena(owner,input.episodeId,input.choice,input.sizeBps,input.confidence,input.councilHash);
  else throw new ArenaError('Unknown Arena action.');
  return response({mission},200,req,guest,!!user);
 }catch(err){return response({error:err instanceof ArenaError?err.message:'Action failed. Refresh and retry.'},err instanceof ArenaError?err.status:500,req,guest,!!user);}
}
