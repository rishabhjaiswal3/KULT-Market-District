import { NextRequest, NextResponse } from "next/server";
import { agencyCaseResult } from "../../../../lib/agency-store";
import { getCaseConfig } from "../../../../lib/market-cases";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  const id=request.nextUrl.searchParams.get("caseId")??"";
  const now=Date.now(), config=getCaseConfig(id,now);
  if(!config||config.mode!=="daily")return NextResponse.json({error:"Daily mission not found."},{status:404});
  if(Date.parse(config.lockAt!)>now)return NextResponse.json({error:"Outcome hidden until the UTC deadline."},{status:423,headers:{"Cache-Control":"no-store"}});
  try{const result=await agencyCaseResult(id,now);return result?NextResponse.json({caseId:id,source:"fictional_training_simulation",...result},{headers:{"Cache-Control":"public,max-age=60"}}):NextResponse.json({error:"No frozen case record exists."},{status:404});}
  catch{return NextResponse.json({error:"Case integrity check unavailable."},{status:503});}
}
