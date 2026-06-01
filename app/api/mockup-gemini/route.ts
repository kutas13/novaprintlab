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
// GOOGLE GEMINI 2.5 FLASH IMAGE — free-tier mockup engine
//
// Uses Gemini's native image generation/editing endpoint. The model accepts
// a text prompt + reference image (the user's design) and returns an edited
// image (the mockup). Compared to the other engines:
//   • FREE on Google AI Studio's free tier
//   • Daily request cap (~100/day on free tier)
//   • Beta — output quality varies; sometimes refuses with safety block
//
// Token: https://aistudio.google.com/apikey (env: GEMINI_API_KEY)
// ────────────────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash-image-preview";
const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

interface RequestBody {
  variantId?: VariantId;
  productType?: ProductType;
  color?: ProductColor;
  designDataUrl?: string;
  designUrl?: string;
  quality?: "low" | "medium" | "high";
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
    finishReason?: string;
    safetyRatings?: unknown;
  }>;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: unknown;
  };
  error?: { message?: string; status?: string };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "GEMINI_API_KEY tanımlı değil. ÜCRETSİZ key: https://aistudio.google.com/apikey — al ve .env.local (+ Vercel env) içine ekle.",
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
    const designBase64 = designBuf.toString("base64");

    const ctx = buildPromptCtx(productType, color);
    const prompt = buildMockupPrompt(variantId, ctx, true);
    const spec = VARIANTS[variantId];

    const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: designBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
        },
      }),
    });

    const json = (await res.json()) as GeminiResponse;

    if (!res.ok) {
      const errMsg =
        json.error?.message ||
        `Gemini HTTP ${res.status}${
          json.error?.status ? ` (${json.error.status})` : ""
        }`;
      return NextResponse.json(
        { ok: false, error: errMsg },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    // Safety block
    if (json.promptFeedback?.blockReason) {
      return NextResponse.json(
        {
          ok: false,
          error: `Gemini güvenlik filtresi engelledi: ${json.promptFeedback.blockReason}. Tasarımı veya prompt'u değiştirip tekrar dene.`,
        },
        { status: 422 }
      );
    }

    const parts = json.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(
      (p) => p.inlineData?.data || p.inline_data?.data
    );
    const b64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
    const mime =
      imagePart?.inlineData?.mimeType ||
      imagePart?.inline_data?.mime_type ||
      "image/png";

    if (!b64) {
      const finishReason = json.candidates?.[0]?.finishReason || "unknown";
      return NextResponse.json(
        {
          ok: false,
          error: `Gemini görsel döndürmedi (finishReason=${finishReason}). Bu genelde günlük ücretsiz limitin dolduğu anlamına gelir.`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      variantId,
      label: spec.label,
      prompt,
      imageDataUrl: `data:${mime};base64,${b64}`,
      cost: 0,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup-gemini] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
