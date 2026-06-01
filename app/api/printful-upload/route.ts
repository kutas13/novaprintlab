import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// PRINTFUL UPLOAD HELPER
// Body: { dataUrl: "data:image/png;base64,..." , filename?: string }
// Output: { ok: true, publicUrl: "https://..." }
//
// Why this exists:
// Printful's mockup generator needs a public HTTPS URL for the design layer.
// "store" designs already live in Supabase Storage (public bucket) → no work
// needed. AI / locally-uploaded designs are base64 in the browser. This
// endpoint persists them to Supabase Storage's "originals" bucket under a
// `printful-temp/` prefix so Printful can fetch them.
// ────────────────────────────────────────────────────────────────────────────

const BUCKET = "design-images";
const PREFIX = "printful-temp";

interface RequestBody {
  dataUrl?: string;
  filename?: string;
}

function dataUrlToBuffer(
  dataUrl: string
): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

export async function POST(req: Request) {
  try {
    if (!supabaseServer) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Supabase env yok — Printful upload Supabase Storage'a yazıyor, env değişkenlerini ekle.",
        },
        { status: 500 }
      );
    }

    const body: RequestBody = await req.json().catch(() => ({}));
    const dataUrl = (body.dataUrl || "").trim();
    if (!dataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { ok: false, error: "dataUrl base64 image olmalı." },
        { status: 400 }
      );
    }
    const parsed = dataUrlToBuffer(dataUrl);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "data URL parse edilemedi." },
        { status: 400 }
      );
    }
    if (parsed.buffer.length > 16 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Tasarım 16MB üzerinde, daha küçük PNG yükle." },
        { status: 413 }
      );
    }

    const ext = parsed.mime.split("/")[1] || "png";
    const safe =
      (body.filename || "")
        .replace(/[^a-z0-9-_.]/gi, "-")
        .replace(/-+/g, "-")
        .slice(0, 60) || "design";
    const path = `${PREFIX}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safe}.${ext}`;

    const { error: uploadErr } = await supabaseServer.storage
      .from(BUCKET)
      .upload(path, parsed.buffer, {
        contentType: parsed.mime,
        upsert: false,
      });
    if (uploadErr) {
      return NextResponse.json(
        { ok: false, error: `Supabase upload: ${uploadErr.message}` },
        { status: 502 }
      );
    }

    // We prefer a SIGNED URL over the public URL because some buckets are
    // private by default and Printful's worker silently fails to fetch
    // private files. A 24h signed URL works regardless of bucket visibility,
    // and Printful only needs the URL for ~30 seconds while it renders.
    const { data: signed, error: signedErr } = await supabaseServer.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24); // 24h

    let url = signed?.signedUrl;
    if (!url || signedErr) {
      // Fallback to the plain public URL (works only if the bucket is public)
      const { data: pub } = supabaseServer.storage
        .from(BUCKET)
        .getPublicUrl(path);
      url = pub?.publicUrl;
    }
    if (!url) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "URL oluşturulamadı (signed + public ikisi de başarısız). Bucket varlığını kontrol et.",
          uploadedPath: path,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      publicUrl: url, // historical field name; may be signed or public
      signed: !!signed?.signedUrl,
      path,
      size: parsed.buffer.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[printful-upload] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
