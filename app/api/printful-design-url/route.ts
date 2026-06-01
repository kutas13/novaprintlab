import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// SIGNED URL RESOLVER for Supabase-hosted designs
// Body: { designUrl: "https://.../storage/v1/object/public/<bucket>/<path>" }
// Returns: { ok, url } where `url` is a 24h signed URL (works for private
// buckets too) OR — for non-Supabase external URLs — the original URL.
//
// Why: store designs come back from the DB as `getPublicUrl(...)` strings.
// If the bucket is later changed to private OR was never public, Printful
// silently fails to fetch the file. By round-tripping through a signed URL
// we make the design fetchable regardless of bucket visibility.
// ────────────────────────────────────────────────────────────────────────────

interface RequestBody {
  designUrl?: string;
}

export async function POST(req: Request) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const designUrl = (body.designUrl || "").trim();

    if (!/^https?:\/\//i.test(designUrl)) {
      return NextResponse.json(
        { ok: false, error: "designUrl HTTPS olmalı." },
        { status: 400 }
      );
    }

    // If the URL doesn't look like a Supabase public URL, pass it through
    // unchanged (e.g. external CDN).
    // Pattern: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
    const m = designUrl.match(
      /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/
    );
    if (!m) {
      return NextResponse.json({ ok: true, url: designUrl, transformed: false });
    }
    if (!supabaseServer) {
      // No Supabase server client → can't sign. Return the original URL and
      // hope the bucket is public.
      return NextResponse.json({
        ok: true,
        url: designUrl,
        transformed: false,
        warning: "Supabase server client not configured; returning raw URL.",
      });
    }

    const bucket = decodeURIComponent(m[1]);
    const path = decodeURIComponent(m[2].split("?")[0]); // strip query

    const { data: signed, error: signedErr } = await supabaseServer.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24);

    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json({
        ok: true,
        url: designUrl,
        transformed: false,
        warning: signedErr?.message,
      });
    }
    return NextResponse.json({
      ok: true,
      url: signed.signedUrl,
      transformed: true,
      bucket,
      path,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[printful-design-url] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
