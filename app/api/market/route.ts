import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { claimGuest, marketState, MarketError, submitDecision } from "../../../lib/market-store";
import { AgencyError, convene, dispatch } from "../../../lib/agency-store";

export const dynamic = "force-dynamic";
const COOKIE = "kult_market_guest";
function guestToken(request: NextRequest) {
  const saved = request.cookies.get(COOKIE)?.value;
  return saved && /^[a-f0-9-]{36}$/.test(saved) ? { token: saved, fresh: false } : { token: crypto.randomUUID(), fresh: true };
}
function withCookie(response: NextResponse, token: string, fresh: boolean, secure: boolean) {
  if (fresh) response.cookies.set(COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 7 * 86400 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    const guest = guestToken(request);
    if (user && !guest.fresh) await claimGuest(user.userId, `guest:${guest.token}`);
    const state = await marketState(user?.userId ?? `guest:${guest.token}`, Boolean(user), Date.now(), request.nextUrl.searchParams.get("case"));
    return withCookie(NextResponse.json(state), guest.token, guest.fresh && !user, request.nextUrl.protocol === "https:");
  } catch {
    return NextResponse.json({ error: "Market District is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Origin mismatch." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 2048) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  try {
    const user = await getChatGPTUser();
    const guest = guestToken(request);
    if (user && !guest.fresh) await claimGuest(user.userId, `guest:${guest.token}`);
    const input = await request.json() as Record<string, unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.caseId !== "string" || !/^(daily-\d{4}-\d{2}-\d{2}|[a-z-]{3,40})$/.test(input.caseId)) throw new MarketError("Invalid mission request.");
    if (input.caseId.startsWith("daily-") && !user) throw new MarketError("Sign in before joining the ranked daily mission.", 401);
    const owner = user?.userId ?? `guest:${guest.token}`;
    let result: Record<string, unknown>;
    if (input.type === "job") result = { mission: await dispatch(owner, input.caseId, input.specialist) };
    else if (input.type === "council") result = { mission: await convene(owner, input.caseId) };
    else if (input.type === "decide") result = { decision: await submitDecision(owner, input.caseId, input.choice, input.confidence, input.allocationBps, input.councilHash) };
    else throw new MarketError("Unknown mission action.");
    return withCookie(NextResponse.json(result), guest.token, guest.fresh && !user, request.nextUrl.protocol === "https:");
  } catch (error) {
    if (error instanceof MarketError || error instanceof AgencyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Decision could not be locked. Refresh and retry." }, { status: 500 });
  }
}
