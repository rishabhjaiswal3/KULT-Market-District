import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { view } from "../../../lib/store";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save your Agent Passport." }, { status: 401 });
  try { return NextResponse.json(await view(user.userId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Desk state is temporarily unavailable." }, { status: 503 }); }
}
