import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { passport } from "../../../lib/store";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try { return NextResponse.json(await passport(user.userId), { headers: { "Cache-Control": "private, no-store", "Content-Disposition": "attachment; filename=kult-agent-passport.json" } }); }
  catch { return NextResponse.json({ error: "Passport unavailable" }, { status: 503 }); }
}
