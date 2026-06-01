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
// REPLICATE FLUX DEV — image-to-image mockup engine
//
// Uses `black-forest-labs/flux-dev` which accepts an `image` input plus a
// text prompt. We pass the design PNG as a base64 data URI and our standard
// mockup prompt. The "Prefer: wait" header makes the request synchronous so
// we don't have to poll.
//
// Pricing: ~$0.012 per run.
// Token: https://replicate.com/account/api-tokens (env: REPLICATE_API_TOKEN)
// ────────────────────────────────────────────────────────────────────────────

interface RequestBody {
  variantId?: VariantId;
  productType?: ProductType;
  color?: ProductColor;
  designDataUrl?: string;
  designUrl?: string;
  quality?: "low" | "medium" | "high";
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
}

async function pollPrediction(
  id: string,
  token: string
): Promise<ReplicatePrediction> {
  const start = Date.now();
  const TIMEOUT = 55_000;
  // First wait short, then back off
  let wait = 1500;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json()) as ReplicatePrediction;
    if (json.status === "succeeded" || json.status === "failed" || json.status === "canceled") {
      return json;
    }
    if (Date.now() - start > TIMEOUT) {
      throw new Error("Replicate poll timeout — model çok uzun sürdü.");
    }
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(wait + 750, 4000);
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "REPLICATE_API_TOKEN tanımlı değil. https://replicate.com/account/api-tokens üzerinden token al ve .env.local (ve Vercel env) içine ekle.",
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

    // FLUX Dev img2img — prompt_strength controls how much the model
    // "rewrites" the reference image. 0.7-0.8 lets it transform the input
    // into a garment mockup while still reading the design as the chest print.
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // "Prefer: wait" gives us a synchronous response when the model is
        // fast enough (Replicate caps the wait at ~60s server-side). If the
        // model is still running we'll fall through to manual polling below.
        Prefer: "wait=55",
      },
      body: JSON.stringify({
        // pinning to a specific FLUX Dev version keeps behavior stable
        version: "black-forest-labs/flux-dev",
        input: {
          image: designDataUri,
          prompt,
          prompt_strength: 0.8,
          num_outputs: 1,
          aspect_ratio: "1:1",
          output_format: "jpg",
          output_quality: 90,
          num_inference_steps: 28,
          guidance: 3.5,
          megapixels: "1",
          disable_safety_checker: false,
        },
      }),
    });

    let prediction = (await createRes.json()) as ReplicatePrediction;

    if (!createRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Replicate hata: ${
            prediction.error || `HTTP ${createRes.status}`
          }`,
          status: createRes.status,
        },
        { status: createRes.status >= 400 ? createRes.status : 502 }
      );
    }

    // If still in progress poll until it lands.
    if (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled"
    ) {
      prediction = await pollPrediction(prediction.id, apiKey);
    }

    if (prediction.status !== "succeeded" || !prediction.output) {
      return NextResponse.json(
        {
          ok: false,
          error: `Replicate üretimi başarısız: ${
            prediction.error || prediction.status
          }`,
        },
        { status: 502 }
      );
    }

    const outputUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    if (!outputUrl) {
      return NextResponse.json(
        { ok: false, error: "Replicate output URL dönmedi." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      variantId,
      label: spec.label,
      prompt,
      imageDataUrl: outputUrl, // HTTPS URL (Replicate CDN)
      cost: 0.012,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup-replicate] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
