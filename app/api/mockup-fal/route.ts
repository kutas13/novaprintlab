import { NextResponse } from "next/server";
import {
  buildMockupPrompt,
  buildPromptCtx,
  loadDesignBuffer,
  VARIANTS,
  type ProductColor,
  type ProductType,
  type VariantId,
} from "@/lib/mockup-prompts";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// FAL.AI FLUX PRO — image-to-image mockup engine (img2img / "redux")
//
// fal.ai's `fal-ai/flux-pro/v1.1-ultra` is the fastest model in the FLUX
// family (~2-3s per render). For img2img we use the `flux/dev/image-to-image`
// endpoint which accepts an image URL OR a data URI plus a text prompt.
//
// Pricing: ~$0.05 per run (FLUX Pro), ~$0.025 (FLUX Dev img2img).
// Token: https://fal.ai/dashboard/keys (env: FAL_API_KEY)
// ────────────────────────────────────────────────────────────────────────────

interface RequestBody {
  variantId?: VariantId;
  productType?: ProductType;
  color?: ProductColor;
  designDataUrl?: string;
  designUrl?: string;
  quality?: "low" | "medium" | "high";
}

interface FalQueueResponse {
  status?: string;
  request_id?: string;
  status_url?: string;
  response_url?: string;
  detail?: unknown;
}

interface FalSyncResponse {
  images?: Array<{ url: string; width?: number; height?: number }>;
  // some endpoints return `image` (singular)
  image?: { url: string };
  detail?: unknown;
  error?: string;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.FAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "FAL_API_KEY tanımlı değil. https://fal.ai/dashboard/keys üzerinden key oluştur ve .env.local (+ Vercel env) içine ekle.",
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
    const productType = body.productType;
    const color = body.color;
    if (!productType || !color) {
      return NextResponse.json(
        { ok: false, error: "productType veya color eksik." },
        { status: 400 }
      );
    }

    const designBuf = await loadDesignBuffer(body);
    const designDataUri = `data:image/png;base64,${designBuf.toString("base64")}`;

    const ctx = buildPromptCtx(productType, color);
    const prompt = buildMockupPrompt(variantId, ctx, true);
    const spec = VARIANTS[variantId];

    // FLUX Dev image-to-image. We use the sync endpoint (fal.run/...) so we
    // can stay below the 60s function budget without polling.
    // strength=0.85 means the model can transform the image fully into a
    // garment scene while still reading the design as the print reference.
    const url = "https://fal.run/fal-ai/flux/dev/image-to-image";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_url: designDataUri,
        strength: 0.85,
        num_inference_steps: 35,
        guidance_scale: 3.5,
        image_size: "square_hd",
        num_images: 1,
        enable_safety_checker: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      let parsed: FalSyncResponse | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* non-JSON */
      }
      const errMsg =
        parsed?.error ||
        (parsed?.detail
          ? JSON.stringify(parsed.detail).slice(0, 250)
          : text.slice(0, 250));
      return NextResponse.json(
        {
          ok: false,
          error: `fal.ai hata (HTTP ${res.status}): ${errMsg}`,
        },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    const json = (await res.json()) as FalSyncResponse & FalQueueResponse;
    const imageUrl =
      json.images?.[0]?.url || json.image?.url;
    if (!imageUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "fal.ai görsel URL'i dönmedi.",
          debug: json,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      variantId,
      label: spec.label,
      prompt,
      imageDataUrl: imageUrl, // HTTPS URL (fal CDN)
      cost: 0.025,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup-fal] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
