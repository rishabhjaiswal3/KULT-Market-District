import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { action, DeskError } from "../../../lib/store";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to use your saved desk." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Cross-site request denied" }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new DeskError("Invalid request.");
    const result = await action(user.userId, input as Record<string, unknown>);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DeskError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Action failed. Refresh before retrying." }, { status: 500 });
  }
}
