import { NextResponse } from "next/server";
import { clearCredentials } from "@/lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await clearCredentials();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "disconnect failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
