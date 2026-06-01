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

// Google rotates the "image-capable" Gemini model name frequently. We try
// each candidate in order and use the first one that doesn't return a
// 404/NOT_FOUND. The list is ordered newest → oldest. If Google promotes a
// new image model, add it to the top of this list.
const GEMINI_MODEL_CANDIDATES = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-preview-image-generation",
  "imagen-3.0-generate-002",
];
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

    const requestBody = {
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
    };

    // Try each candidate model in order. NOT_FOUND / 404 means the model
    // name was renamed by Google; any other failure (auth, quota, safety)
    // we surface immediately because it won't get better by switching model.
    let res: Response | null = null;
    let json: GeminiResponse | null = null;
    let triedModel = "";
    const triedErrors: string[] = [];
    for (const model of GEMINI_MODEL_CANDIDATES) {
      triedModel = model;
      const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      json = (await res.json().catch(() => null)) as GeminiResponse | null;

      if (res.ok) break;

      const errStatus = json?.error?.status || "";
      const errMsg = json?.error?.message || `HTTP ${res.status}`;
      triedErrors.push(`${model}: ${errMsg}`);

      // 404 / NOT_FOUND → try next candidate. Anything else (401, 403, 429,
      // INVALID_ARGUMENT) is final.
      const isModelNotFound =
        res.status === 404 ||
        errStatus === "NOT_FOUND" ||
        /not found|not supported|unsupported model/i.test(errMsg);
      if (!isModelNotFound) break;
    }

    if (!res || !res.ok || !json) {
      const errMsg =
        json?.error?.message ||
        `Gemini denenen modellerin hepsi başarısız: ${triedErrors.join(
          " | "
        )}`;
      return NextResponse.json(
        {
          ok: false,
          error: errMsg,
          triedModels: triedErrors,
          lastModelTried: triedModel,
        },
        { status: res && res.status >= 400 ? res.status : 502 }
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
