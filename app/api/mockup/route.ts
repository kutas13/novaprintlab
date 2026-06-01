import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { reserve, refund, costForQuality, normalizeQuality } from "@/lib/usage";
import {
  COLOR_MAP,
  PRODUCT_MAP,
  VARIANTS,
  buildMockupPrompt,
  buildPromptCtx,
  loadDesignBuffer,
  type ProductColor,
  type ProductType,
  type VariantId,
} from "@/lib/mockup-prompts";

export type { VariantId } from "@/lib/mockup-prompts";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// NOVAPRINTLAB MOCKUP ENGINE — OpenAI gpt-image-1 images.edit branch.
//
// Single endpoint, one variant per request → the frontend calls this in
// parallel batches of three. We use OpenAI gpt-image-1 image edit with the
// user's design PNG as the reference image. The prompt library and product/
// color maps live in lib/mockup-prompts.ts so all engines stay in sync.
//
// Sibling endpoints for the other engines:
//   /api/mockup-replicate  → Replicate FLUX Dev img2img ($0.012)
//   /api/mockup-fal        → fal.ai FLUX Dev img2img ($0.025-0.05)
//   /api/mockup-gemini     → Google Gemini 2.5 Flash Image (FREE)
// ────────────────────────────────────────────────────────────────────────────

interface RequestBody {
  variantId?: VariantId;
  productType?: ProductType;
  color?: ProductColor;
  designDataUrl?: string;
  designUrl?: string;
  quality?: "low" | "medium" | "high";
}

export async function POST(req: Request) {
  // Track reservation locally so the outer catch can refund without depending
  // on inner scope.
  let pendingRefund: { cost: number } | null = null;
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OPENAI_API_KEY tanımlı değil. Vercel → Settings → Environment Variables üzerinden eklemelisin.",
        },
        { status: 500 }
      );
    }

    const body: RequestBody = await req.json().catch(() => ({}));

    const variantId = body.variantId;
    if (!variantId || !VARIANTS[variantId]) {
      return NextResponse.json(
        { ok: false, error: "Geçerli bir variantId gönderilmedi." },
        { status: 400 }
      );
    }

    const productType: ProductType = (body.productType || "Tişört") as ProductType;
    if (!PRODUCT_MAP[productType]) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz ürün tipi." },
        { status: 400 }
      );
    }

    const color: ProductColor = (body.color || "Siyah") as ProductColor;
    if (!COLOR_MAP[color]) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz renk." },
        { status: 400 }
      );
    }

    // Load design bytes (either from base64 data URL or remote HTTPS URL)
    let designBuffer: Buffer;
    try {
      designBuffer = await loadDesignBuffer(body);
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: e instanceof Error ? e.message : "Tasarım yüklenemedi.",
        },
        { status: 400 }
      );
    }

    if (designBuffer.length > 24 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Tasarım dosyası 24MB üzerinde, daha küçük PNG yükle." },
        { status: 400 }
      );
    }

    const spec = VARIANTS[variantId];
    const ctx = buildPromptCtx(productType, color);
    const prompt = buildMockupPrompt(variantId, ctx, true);

    // ─── Daily $5 cap — reserve before calling OpenAI ───────────────────
    const quality = normalizeQuality(body.quality);
    const cost = costForQuality(quality);
    const reservation = await reserve("mockup", cost);
    if (!reservation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: reservation.error,
          usage: reservation.snapshot,
        },
        { status: 429 }
      );
    }
    pendingRefund = { cost };

    // Wider timeout + we handle retry manually below.
    const openai = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 });

    // ─── Manual retry wrapper for transient OpenAI network glitches ────
    // Each retry rebuilds the File because the SDK consumes the stream on
    // the first attempt. We back off 1.2s → 2.5s, keeping total time under
    // the 60s function budget.
    let b64: string | undefined;
    const MAX_ATTEMPTS = 3;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const file = await toFile(designBuffer, "design.png", {
        type: "image/png",
      });
      try {
        const res = await openai.images.edit({
          model: "gpt-image-1",
          image: file,
          prompt,
          size: "1024x1024",
          quality,
        });
        b64 = res.data?.[0]?.b64_json;
        if (!b64) throw new Error("Mockup üretilemedi (boş yanıt).");
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient =
          /connection error|connection reset|econnreset|enotfound|etimedout|eai_again|fetch failed|network|timeout|503|502|504|520|522|524/i.test(
            msg
          );
        if (!isTransient || attempt === MAX_ATTEMPTS) throw err;
        const backoff = attempt === 1 ? 1200 : 2500;
        console.warn(
          `[mockup] transient error on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${backoff}ms — ${msg}`
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    if (!b64) {
      throw lastErr instanceof Error ? lastErr : new Error("Mockup üretilemedi.");
    }

    // Reservation became a confirmed charge — clear pendingRefund so the
    // outer catch doesn't refund it.
    pendingRefund = null;

    const imageDataUrl = `data:image/png;base64,${b64}`;
    return NextResponse.json({
      ok: true,
      variantId,
      label: spec.label,
      prompt,
      imageDataUrl,
      cost,
      usage: reservation.snapshot,
    });
  } catch (err) {
    // Roll back any pending reservation so failures don't eat budget.
    if (pendingRefund) {
      try {
        await refund("mockup", pendingRefund.cost);
      } catch (rErr) {
        console.error("[mockup] refund failed:", rErr);
      }
    }
    const msg = err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup] fatal:", err);
    // Normalize common transient errors into a friendly message
    if (/connection error|fetch failed|timeout/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OpenAI bağlantı hatası — bu mockup atlandı, biraz sonra tekrar dene.",
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
