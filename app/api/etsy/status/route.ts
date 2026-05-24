import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getConnectionStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "status failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
