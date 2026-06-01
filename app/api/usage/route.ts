import { NextResponse } from "next/server";
import { getTodayUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getTodayUsage();
  return NextResponse.json({ ok: true, ...snapshot });
}
