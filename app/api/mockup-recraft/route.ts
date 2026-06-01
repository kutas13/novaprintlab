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
// RECRAFT V3 — image-to-image mockup engine (direct Recraft AI API)
//
// Recraft's own API exposes /v1/images/imageToImage which is the perfect fit
// for our mockup use-case: it takes the design PNG as a reference and the
// model rebuilds the scene around it. NOT routed through Replicate because
// the recraft-ai/recraft-v3 model on Replicate is text-to-image only.
//
// Pricing: Recraft pro tier = $0.04 per render. Free tier ships ~50 credits
// per day (image-to-image = 2 credits, so ~25 free mockups/day).
// Token: https://www.recraft.ai/ → Settings → API → "Generate new token"
//        (env: RECRAFT_API_TOKEN)
// ────────────────────────────────────────────────────────────────────────────

const RECRAFT_BASE = "https://external.api.recraft.ai/v1";
const RECRAFT_IMG2IMG = `${RECRAFT_BASE}/images/imageToImage`;

interface RequestBody {
  variantId?: VariantId;
  productType?: ProductType;
  color?: ProductColor;
  designDataUrl?: string;
  designUrl?: string;
  quality?: "low" | "medium" | "high";
}

interface RecraftResponse {
  created?: number;
  data?: Array<{ url?: string; b64_json?: string }>;
  // error path
  code?: string;
  message?: string;
  detail?: unknown;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.RECRAFT_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "RECRAFT_API_TOKEN tanımlı değil. https://www.recraft.ai/ → Settings → API → token oluştur ve .env.local (+ Vercel env) içine ekle.",
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
    const ctx = buildPromptCtx(productType, color);
    const prompt = buildMockupPrompt(variantId, ctx, true);
    const spec = VARIANTS[variantId];

    // Recraft accepts multipart/form-data with the design as `image` and a
    // text prompt that describes the scene we want it to build AROUND that
    // design. `strength` controls how much the model is allowed to deviate
    // from the input — high strength means the model can transform the
    // image into a garment shot while still using the design as the print
    // reference.
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(designBuf)], { type: "image/png" }),
      "design.png"
    );
    form.append("prompt", prompt);
    form.append("strength", "0.85");
    form.append("style", "realistic_image");
    form.append("n", "1");
    form.append("model", "recraftv3");
    form.append("response_format", "url");

    const res = await fetch(RECRAFT_IMG2IMG, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Don't set Content-Type — FormData adds the multipart boundary.
      },
      body: form,
    });

    const json = (await res.json().catch(() => null)) as RecraftResponse | null;

    if (!res.ok || !json) {
      const errMsg =
        json?.message ||
        (json?.detail ? JSON.stringify(json.detail).slice(0, 250) : null) ||
        `HTTP ${res.status}`;
      return NextResponse.json(
        { ok: false, error: `Recraft hata: ${errMsg}` },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    const item = json.data?.[0];
    const imageUrl = item?.url;
    const b64 = item?.b64_json;
    if (!imageUrl && !b64) {
      return NextResponse.json(
        { ok: false, error: "Recraft görsel URL'i dönmedi.", debug: json },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      variantId,
      label: spec.label,
      prompt,
      imageDataUrl: imageUrl || `data:image/png;base64,${b64}`,
      cost: 0.04,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup-recraft] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
