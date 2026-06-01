import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// GEMINI API KEY TESTER
//
// Quick health-check endpoint for the Gemini API key. Hits the /models
// listing endpoint (the cheapest possible call) and returns:
//   • whether the key is set on the server
//   • whether Google accepts it
//   • which image-capable models the account has access to
//
// Open https://<host>/api/gemini-test in a browser to debug "mockup gelmedi"
// type issues without burning a real mockup credit.
// ────────────────────────────────────────────────────────────────────────────

interface GeminiModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

interface ListModelsResponse {
  models?: GeminiModel[];
  error?: { message?: string; status?: string };
}

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        keySet: false,
        error:
          "GEMINI_API_KEY tanımlı değil. .env.local'a (lokalde) ve Vercel env'e (production'da) eklemelisin.",
      },
      { status: 500 }
    );
  }

  const keyPreview = `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    apiKey
  )}`;

  try {
    const res = await fetch(url);
    const json = (await res.json().catch(() => null)) as ListModelsResponse | null;

    if (!res.ok || !json) {
      return NextResponse.json(
        {
          ok: false,
          keySet: true,
          keyPreview,
          httpStatus: res.status,
          error: json?.error?.message || `HTTP ${res.status}`,
          errorStatus: json?.error?.status,
          hint:
            res.status === 400 || res.status === 401 || res.status === 403
              ? "Key formatı veya yetki sorunu. https://aistudio.google.com/apikey adresinden yeni bir key oluşturup tekrar dene."
              : "Geçici bir hata olabilir, birkaç saniye sonra tekrar dene.",
        },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    // Filter to image-capable models — these are the ones we can use for
    // mockup generation. If none are returned, the key probably doesn't
    // have access to the image generation API yet.
    const allModels = json.models || [];
    const imageModels = allModels
      .filter(
        (m) =>
          m.name &&
          (m.name.includes("image") ||
            m.displayName?.toLowerCase().includes("image"))
      )
      .map((m) => ({
        name: m.name?.replace("models/", ""),
        displayName: m.displayName,
        supportsGenerateContent:
          m.supportedGenerationMethods?.includes("generateContent") || false,
      }));

    return NextResponse.json({
      ok: true,
      keySet: true,
      keyPreview,
      totalModels: allModels.length,
      imageModels,
      imageModelsCount: imageModels.length,
      hint:
        imageModels.length === 0
          ? "Key çalışıyor ama image generation modeline erişimin yok. https://aistudio.google.com'da bir kez 'Gemini Image' modeli kullanılması gerekebilir."
          : `${imageModels.length} adet image modeli erişimin var. Mockup için ilkini kullanacağız: ${imageModels[0]?.name}`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        keySet: true,
        keyPreview,
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}
