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
// `details` is appended verbatim to every prompt so the AI can't drift on
// construction. For T-shirt we lock to Gildan 5000 — POD industry-standard
// heavyweight unisex tee with its signature thick ribbed crewneck.
const PRODUCT_MAP: Record<
  ProductType,
  { en: string; cut: string; weight: string; details: string }
> = {
  "Tişört": {
    en: "Gildan 5000 unisex classic-fit heavyweight cotton crewneck t-shirt",
    cut: "classic regular unisex fit, true-to-size, NOT oversized, NOT drop-shoulder, set-in short sleeves with double-needle hems",
    weight: "midweight 5.3 oz / 180 gsm 100% preshrunk ringspun cotton jersey, soft matte cotton finish (no shiny polyester sheen)",
    details:
      "EXACT garment construction is Gildan 5000 Heavy Cotton: a slim 1x1 rib-knit crewneck collar with a tight, NORMAL thickness (about 1.5cm) — DO NOT make the collar thick, chunky, mock-neck or rolled. Shoulders are taped, sleeves have double-needle stitched hems, body has a straight bottom hem. Classic mass-market tee silhouette, not fashion-oversized.",
  },
  Hoodie: {
    en: "premium heavyweight pullover hoodie",
    cut: "oversized streetwear fit with drawstrings and kangaroo pocket",
    weight: "heavyweight 400gsm brushed fleece",
    details:
      "Standard hoodie construction: double-layer hood with flat drawstrings, kangaroo front pocket, ribbed cuffs and waistband.",
  },
  Sweatshirt: {
    en: "premium crewneck sweatshirt",
    cut: "oversized boxy fit with ribbed cuffs and hem",
    weight: "heavyweight 380gsm brushed fleece",
    details:
      "Standard crewneck sweatshirt construction: ribbed crew collar of normal thickness, ribbed cuffs and waistband, set-in sleeves.",
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

// Negative / construction-lock list — appended to EVERY tee prompt to stop
// the model from drifting into chunky/mock necks or fashion-oversized fits.
const TEE_NEGATIVE_LOCK =
  "STRICT garment rules: the collar must be a SLIM and NORMAL THICKNESS ribbed crewneck (about 1.5cm) — absolutely NOT a thick collar, NOT a mock neck, NOT a turtleneck, NOT a rolled neck, NOT a chunky band. The fit must be classic regular unisex, NOT oversized, NOT cropped, NOT baggy drop-shoulder. Sleeves are normal short sleeves with double-needle hem (not extra-long, not raw-cut). Treat this as the industry-standard Gildan 5000 Heavy Cotton blank.";

const QUALITY_TAIL =
  "Ultra realistic, premium e-commerce product photography quality, Shopify/Etsy bestseller listing image, magazine fashion photography, 85mm prime lens look, soft cinematic lighting, true-to-life fabric texture, sharp focus, color-accurate, no watermark, no logo, no extra text outside the design itself, JPEG-ready high quality.";

interface PromptCtx {
  product: string;
  color: string;
  weight: string;
  cut: string;
  details: string;
  // True only when the rendered garment is a t-shirt — extra collar/fit lock
  isTee: boolean;
}

interface VariantSpec {
  id: VariantId;
  label: string;
  prompt: (ctx: PromptCtx) => string;
}

function constructionBlock(ctx: PromptCtx): string {
  return `${ctx.details}${ctx.isTee ? " " + TEE_NEGATIVE_LOCK : ""}`;
}

const VARIANTS: Record<VariantId, VariantSpec> = {
  folded: {
    id: "folded",
    label: "Katlanmış Ürün",
    prompt: (ctx) =>
      `Premium flat-lay product photo of a folded ${ctx.color} ${ctx.product} on a clean light gray seamless paper studio background. ${ctx.weight}. The folded garment sits in the center of the frame with one corner subtly raised so the collar and front panel are clearly visible. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Soft top-down natural studio light, gentle shadows, no model, no props, no people. ${QUALITY_TAIL}`,
  },
  "man-standing-1": {
    id: "man-standing-1",
    label: "Erkek — Ayakta Poz 1",
    prompt: (ctx) =>
      `Full-body fashion photograph of a 25 year old male model wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, paired with simple straight-leg dark jeans and white sneakers. ${ctx.weight}. He stands naturally facing the camera with arms relaxed at his sides, slight three-quarter angle. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Neutral seamless light-gray studio backdrop, professional softbox lighting, modern minimalist styling. ${QUALITY_TAIL}`,
  },
  "man-standing-2": {
    id: "man-standing-2",
    label: "Erkek — Ayakta Poz 2",
    prompt: (ctx) =>
      `Editorial full-body photo of a 25 year old male model wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, hands casually tucked into his pants pockets. ${ctx.weight}. Side-profile shoulder turned slightly toward the camera, looking off-frame. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Warm minimalist concrete-wall background, golden hour window light, candid lookbook vibe. ${QUALITY_TAIL}`,
  },
  "man-sitting": {
    id: "man-sitting",
    label: "Erkek — Oturmuş",
    prompt: (ctx) =>
      `Full-body lifestyle photograph of a 25 year old male model wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, sitting on a low minimalist concrete bench with one elbow resting on his knee. ${ctx.weight}. Front facing the camera, relaxed natural pose. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Clean neutral cream studio background, soft directional window light, modern lookbook aesthetic. ${QUALITY_TAIL}`,
  },
  "woman-standing-1": {
    id: "woman-standing-1",
    label: "Kadın — Ayakta Poz 1",
    prompt: (ctx) =>
      `Full-body fashion photograph of a 24 year old female model wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, paired with simple high-waist straight jeans and white sneakers. ${ctx.weight}. She stands facing the camera with one hand gently touching her hip, relaxed natural posture. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Neutral seamless light-gray studio backdrop, soft cinematic studio lighting, modern minimalist styling. ${QUALITY_TAIL}`,
  },
  "woman-standing-2": {
    id: "woman-standing-2",
    label: "Kadın — Ayakta Poz 2",
    prompt: (ctx) =>
      `Editorial full-body photo of a 24 year old female model wearing a ${ctx.color} ${ctx.cut} ${ctx.product}. ${ctx.weight}. Three-quarter angle pose, looking slightly down with a soft natural expression, hands tucked into the front of the garment. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Warm beige studio backdrop, soft directional golden window light, magazine fashion editorial vibe. ${QUALITY_TAIL}`,
  },
  "woman-crosslegged": {
    id: "woman-crosslegged",
    label: "Kadın — Bağdaş Kurmuş",
    prompt: (ctx) =>
      `Full-body lifestyle photograph of a 24 year old female model wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, sitting cross-legged on a clean studio floor, hands resting gently on her knees. ${ctx.weight}. Facing the camera with a calm relaxed expression. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Soft cream seamless studio background, even soft top light, modern cozy lifestyle look. ${QUALITY_TAIL}`,
  },
  "flat-minimal": {
    id: "flat-minimal",
    label: "Düz Minimal Görünüm",
    prompt: (ctx) =>
      `Premium ghost-mannequin / invisible-mannequin flat product photo of a ${ctx.color} ${ctx.product} laid perfectly straight and centered on a clean off-white seamless studio backdrop, collar clearly visible at the top of the frame. ${ctx.weight}. The garment appears to float, holding its perfect silhouette. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Soft even studio lighting from both sides, sharp focus, minimal subtle shadow beneath. No people, no props. Premium minimal Shopify listing primary image. ${QUALITY_TAIL}`,
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

    const prompt = spec.prompt({
      product: product.en,
      color: colorEn,
      weight: product.weight,
      cut: product.cut,
      details: product.details,
      isTee: productType === "Tişört",
    });

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
