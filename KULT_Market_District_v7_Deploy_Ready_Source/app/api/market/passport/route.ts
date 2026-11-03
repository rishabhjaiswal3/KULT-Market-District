import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { marketPassport } from "../../../../lib/market-store";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to export the agency Passport." }, { status: 401 });
  try { return NextResponse.json(await marketPassport(user.userId), { headers: { "Cache-Control": "private, no-store", "Content-Disposition": "attachment; filename=KULT-Agent-Passport.json" } }); }
  catch { return NextResponse.json({ error: "Passport unavailable." }, { status: 503 }); }
}
