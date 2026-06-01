import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// NOVAPRINTLAB MOCKUP ENGINE
// Single endpoint, one variant per request → frontend calls in parallel.
// Uses OpenAI gpt-image-1 images.edit with the user's design PNG as reference.
// ────────────────────────────────────────────────────────────────────────────

type ProductType = "Tişört" | "Hoodie" | "Sweatshirt";
type ProductColor =
  | "Siyah"
  | "Beyaz"
  | "Gri"
  | "Lacivert"
  | "Kırmızı"
  | "Yeşil"
  | "Bej";

export type VariantId =
  | "folded"
  | "man-standing-1"
  | "man-standing-2"
  | "man-sitting"
  | "woman-standing-1"
  | "woman-standing-2"
  | "woman-crosslegged"
  | "flat-minimal";

interface RequestBody {
  variantId?: VariantId;
  productType?: ProductType;
  color?: ProductColor;
  designDataUrl?: string; // data:image/png;base64,...
  designUrl?: string; // remote https url (e.g. supabase public url)
}

// ─── PRODUCT MAP ────────────────────────────────────────────────────────────
const PRODUCT_MAP: Record<
  ProductType,
  { en: string; cut: string; weight: string }
> = {
  "Tişört": {
    en: "premium oversized cotton t-shirt",
    cut: "relaxed boxy fit",
    weight: "midweight 220gsm cotton jersey",
  },
  Hoodie: {
    en: "premium heavyweight pullover hoodie",
    cut: "oversized streetwear fit with drawstrings and kangaroo pocket",
    weight: "heavyweight 400gsm brushed fleece",
  },
  Sweatshirt: {
    en: "premium crewneck sweatshirt",
    cut: "oversized boxy fit with ribbed cuffs and hem",
    weight: "heavyweight 380gsm brushed fleece",
  },
};

// ─── COLOR MAP ──────────────────────────────────────────────────────────────
const COLOR_MAP: Record<ProductColor, string> = {
  Siyah: "deep matte black",
  Beyaz: "clean optic white",
  Gri: "heather gray",
  Lacivert: "deep navy blue",
  "Kırmızı": "muted crimson red",
  "Yeşil": "olive forest green",
  Bej: "warm sand beige",
};

// ─── VARIANT PROMPT ENGINE ─────────────────────────────────────────────────
const PRINT_PLACEMENT_HINT =
  "Place the provided design PNG centered on the chest of the garment as a high-quality screen print. The print MUST follow the fabric folds, wrinkles, lighting and shadows realistically — not pasted flat. Keep the original colors, transparency edges and details of the design intact.";

const QUALITY_TAIL =
  "Ultra realistic, premium e-commerce product photography quality, Shopify/Etsy bestseller listing image, magazine fashion photography, 85mm prime lens look, soft cinematic lighting, true-to-life fabric texture, sharp focus, color-accurate, no watermark, no logo, no extra text outside the design itself, JPEG-ready high quality.";

interface VariantSpec {
  id: VariantId;
  label: string;
  prompt: (product: string, color: string, weight: string, cut: string) => string;
}

const VARIANTS: Record<VariantId, VariantSpec> = {
  folded: {
    id: "folded",
    label: "Katlanmış Ürün",
    prompt: (product, color, weight) =>
      `Premium flat-lay product photo of a folded ${color} ${product} on a clean light gray seamless paper studio background. ${weight}. The folded garment sits in the center of the frame with one corner subtly raised. ${PRINT_PLACEMENT_HINT} Soft top-down natural studio light, gentle shadows, no model, no props, no people. ${QUALITY_TAIL}`,
  },
  "man-standing-1": {
    id: "man-standing-1",
    label: "Erkek — Ayakta Poz 1",
    prompt: (product, color, weight, cut) =>
      `Full-body fashion photograph of a 25 year old male model wearing a ${color} ${cut} ${product}, paired with simple straight-leg dark jeans and white sneakers. ${weight}. He stands naturally facing the camera with arms relaxed at his sides, slight three-quarter angle. ${PRINT_PLACEMENT_HINT} Neutral seamless light-gray studio backdrop, professional softbox lighting, modern streetwear styling. ${QUALITY_TAIL}`,
  },
  "man-standing-2": {
    id: "man-standing-2",
    label: "Erkek — Ayakta Poz 2",
    prompt: (product, color, weight, cut) =>
      `Editorial full-body photo of a 25 year old male model wearing a ${color} ${cut} ${product}, hands casually tucked into his pants pockets. ${weight}. Side-profile shoulder turned slightly toward the camera, looking off-frame. ${PRINT_PLACEMENT_HINT} Warm minimalist concrete-wall background, golden hour window light, candid streetwear lookbook vibe. ${QUALITY_TAIL}`,
  },
  "man-sitting": {
    id: "man-sitting",
    label: "Erkek — Oturmuş",
    prompt: (product, color, weight, cut) =>
      `Full-body lifestyle photograph of a 25 year old male model wearing a ${color} ${cut} ${product}, sitting on a low minimalist concrete bench with one elbow resting on his knee. ${weight}. Front facing the camera, relaxed natural pose. ${PRINT_PLACEMENT_HINT} Clean neutral cream studio background, soft directional window light, modern lookbook aesthetic. ${QUALITY_TAIL}`,
  },
  "woman-standing-1": {
    id: "woman-standing-1",
    label: "Kadın — Ayakta Poz 1",
    prompt: (product, color, weight, cut) =>
      `Full-body fashion photograph of a 24 year old female model wearing a ${color} ${cut} ${product}, paired with simple high-waist baggy jeans and white sneakers. ${weight}. She stands facing the camera with one hand gently touching her hip, relaxed natural posture. ${PRINT_PLACEMENT_HINT} Neutral seamless light-gray studio backdrop, soft cinematic studio lighting, modern minimalist styling. ${QUALITY_TAIL}`,
  },
  "woman-standing-2": {
    id: "woman-standing-2",
    label: "Kadın — Ayakta Poz 2",
    prompt: (product, color, weight, cut) =>
      `Editorial full-body photo of a 24 year old female model wearing a ${color} ${cut} ${product}. ${weight}. Three-quarter angle pose, looking slightly down with a soft natural expression, hands tucked into the front of the garment. ${PRINT_PLACEMENT_HINT} Warm beige studio backdrop, soft directional golden window light, magazine fashion editorial vibe. ${QUALITY_TAIL}`,
  },
  "woman-crosslegged": {
    id: "woman-crosslegged",
    label: "Kadın — Bağdaş Kurmuş",
    prompt: (product, color, weight, cut) =>
      `Full-body lifestyle photograph of a 24 year old female model wearing a ${color} ${cut} ${product}, sitting cross-legged on a clean studio floor, hands resting gently on her knees. ${weight}. Facing the camera with a calm relaxed expression. ${PRINT_PLACEMENT_HINT} Soft cream seamless studio background, even soft top light, modern cozy lifestyle look. ${QUALITY_TAIL}`,
  },
  "flat-minimal": {
    id: "flat-minimal",
    label: "Düz Minimal Görünüm",
    prompt: (product, color, weight) =>
      `Premium ghost-mannequin / invisible-mannequin flat product photo of a ${color} ${product} laid perfectly straight and centered on a clean off-white seamless studio backdrop. ${weight}. The garment appears to float, holding its perfect silhouette. ${PRINT_PLACEMENT_HINT} Soft even studio lighting from both sides, sharp focus, minimal subtle shadow beneath. No people, no props. Premium minimal Shopify listing primary image. ${QUALITY_TAIL}`,
  },
};

// ─── HELPERS ────────────────────────────────────────────────────────────────
async function bufferFromDataUrl(dataUrl: string): Promise<Buffer> {
  const m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!m) throw new Error("Geçersiz tasarım data URL.");
  return Buffer.from(m[1], "base64");
}

async function bufferFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tasarım indirilemedi: HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

// ─── ROUTE ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
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

    // Acquire design bytes (data URL preferred; otherwise fetch remote URL)
    let designBuffer: Buffer;
    if (body.designDataUrl) {
      designBuffer = await bufferFromDataUrl(body.designDataUrl);
    } else if (body.designUrl) {
      designBuffer = await bufferFromUrl(body.designUrl);
    } else {
      return NextResponse.json(
        { ok: false, error: "Tasarım gönderilmedi (designDataUrl veya designUrl gerekli)." },
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
    const product = PRODUCT_MAP[productType];
    const colorEn = COLOR_MAP[color];

    const prompt = spec.prompt(product.en, colorEn, product.weight, product.cut);

    const openai = new OpenAI({ apiKey });

    const file = await toFile(designBuffer, "design.png", { type: "image/png" });

    const res = await openai.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt,
      size: "1024x1024",
      quality: "high",
      // gpt-image-1 doesn't accept response_format; b64_json is the default
    });

    const b64 = res.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("Mockup üretilemedi (boş yanıt).");
    }

    // Frontend expects JPEG; OpenAI returns PNG. We just label correctly.
    // We don't transcode server-side to keep latency low; the PNG opens
    // identically in browsers and download flow renames to .jpg if desired.
    const imageDataUrl = `data:image/png;base64,${b64}`;

    return NextResponse.json({
      ok: true,
      variantId,
      label: spec.label,
      prompt,
      imageDataUrl,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
