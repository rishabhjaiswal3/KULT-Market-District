import { NextResponse } from "next/server";
export function GET() { return NextResponse.json({ ok: true, service: "kult-alpha-desk", execution: "paper_only" }); }
