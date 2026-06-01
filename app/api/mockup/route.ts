import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { reserve, refund, costForQuality, normalizeQuality } from "@/lib/usage";

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
  quality?: "low" | "medium" | "high"; // default: medium
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

// ─── DESIGN PRESERVATION LOCK (TOP-PRIORITY DIRECTIVE) ─────────────────────
// Prepended to EVERY mockup prompt. The image gen model has a strong tendency
// to "re-interpret" the supplied artwork (changing fonts, recoloring, redrawing
// shapes, translating text, replacing illustrations). This lock makes the
// preservation rule the FIRST and HIGHEST priority instruction in the prompt.
const DESIGN_PRESERVATION_LOCK =
  "ABSOLUTE TOP PRIORITY — DESIGN ASSET PRESERVATION RULE (read this BEFORE anything else): The supplied input image is a FINISHED, FINALIZED print design. You MUST treat that artwork as a SEALED, IMMUTABLE asset — like a printed sticker that is already on the shirt. " +
  "DO NOT redraw the design. " +
  "DO NOT change any letter, word, text, typography, font, character, language, or word order. " +
  "DO NOT translate or substitute any text. " +
  "DO NOT change the colors of the design (ink colors, palette, hue, saturation, contrast). " +
  "DO NOT change the shapes, illustrations, icons, logos, characters, or composition of the design. " +
  "DO NOT add new text, captions, taglines, signatures, watermarks, or extra graphics into the design. " +
  "DO NOT crop, mirror, rotate, stretch, or rearrange the design. " +
  "DO NOT 'improve', 'clean up', or 'reinterpret' the design — its current state is final. " +
  "Your ONLY job regarding the design is to project it AS-IS onto the garment fabric and add ONLY natural fabric folds, lighting and shadow OVER it (as if it were a real high-quality screen print already on the shirt). " +
  "Pixel-for-pixel, the design content must remain identical to the supplied image.";

// ─── VARIANT PROMPT ENGINE ─────────────────────────────────────────────────
const PRINT_PLACEMENT_HINT =
  "Project the supplied design (exact pixels, unchanged) centered on the chest of the garment as if it is already an existing screen print on the fabric. The print should sit naturally over the fabric — gently following the fabric folds, wrinkles, lighting and shadows for realism — but the design content, letters, fonts, colors and shapes MUST remain identical to the supplied input image. Do not redraw, retype, retranslate, or recolor any part of the design.";

// Negative / construction-lock list — appended to EVERY tee prompt to stop
// the model from drifting into chunky/mock necks or fashion-oversized fits.
const TEE_NEGATIVE_LOCK =
  "STRICT garment rules: the collar must be a SLIM and NORMAL THICKNESS ribbed crewneck (about 1.5cm) — absolutely NOT a thick collar, NOT a mock neck, NOT a turtleneck, NOT a rolled neck, NOT a chunky band. The fit must be classic regular unisex, NOT oversized, NOT cropped, NOT baggy drop-shoulder. Sleeves are normal short sleeves with double-needle hem (not extra-long, not raw-cut). Treat this as the industry-standard Gildan 5000 Heavy Cotton blank.";

const QUALITY_TAIL =
  "Ultra realistic, premium e-commerce product photography quality, Shopify/Etsy bestseller listing image, magazine fashion photography, 85mm prime lens look, soft cinematic lighting, true-to-life fabric texture, sharp focus, color-accurate, no watermark, no logo, no extra text outside the design itself, JPEG-ready high quality. " +
  "FINAL REMINDER: the printed design must be PIXEL-IDENTICAL to the supplied input image — no recoloring, no re-lettering, no re-illustration. Only the garment, the model and the scene are generated; the artwork is preserved as-is.";

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
      `Cozy at-home lifestyle top-down photo of a freshly folded ${ctx.color} ${ctx.product} placed neatly on a warm modern home surface — a wooden wardrobe shelf or a soft cream linen bed, NOT a studio paper backdrop. ${ctx.weight}. The HERO folded garment sits centered in the frame with one corner softly raised so the collar and chest print are clearly visible. UNDERNEATH and beside the hero shirt sit a small neat stack of 2 to 3 additional plain folded t-shirts in soft neutral tones (white, beige, light gray, sand) — these supporting shirts are BLANK, no prints, no logos, slightly out of focus so the printed hero shirt stays the main subject. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Warm natural window light from one side, soft golden-hour glow, gentle morning shadows, cozy modern home / wardrobe vibe. Minimal supporting texture is welcome at the edges (visible wood grain or woven linen) but no clutter, no other branded items, no people, no model. ${QUALITY_TAIL}`,
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
      `Modern minimalist boutique showroom display photo of a ${ctx.color} ${ctx.product}, presented as the hero piece of a premium fashion flagship. The garment is laid perfectly straight and centered using a ghost-mannequin / invisible-mannequin effect — it appears to float and holds its perfect silhouette with the collar clearly visible at the top of the frame. ${ctx.weight}. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} The background is a softly out-of-focus modern showroom interior: warm off-white plastered walls, light oak wooden display fixtures, a minimalist floating display shelf or a single tasteful design accent piece far behind the product, gentle architectural lines — premium boutique vibe but completely uncluttered. Soft balanced showroom lighting (subtle key + soft fill), natural directional shadow beneath the garment, sharp focus on the product, no people, no other clothing visible in the foreground. Designer flagship store catalog aesthetic, contemporary modern fashion brand minimalism, magazine campaign feel. ${QUALITY_TAIL}`,
  },
};

// ─── HELPERS ────────────────────────────────────────────────────────────────
async function bufferFromDataUrl(dataUrl: string): Promise<Buffer> {
  const m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!m) throw new Error("Geçersiz tasarım data URL.");
  return Buffer.from(m[1], "base64");
}

async function bufferFromUrl(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Tasarım indirilemedi: HTTP ${res.status}`);
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tasarım indirilemedi (20s timeout).");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

    const variantPrompt = spec.prompt({
      product: product.en,
      color: colorEn,
      weight: product.weight,
      cut: product.cut,
      details: product.details,
      isTee: productType === "Tişört",
    });
    // The preservation lock is intentionally prepended FIRST so the model
    // reads "do not modify the artwork" as the top-priority instruction.
    const prompt = `${DESIGN_PRESERVATION_LOCK}\n\n${variantPrompt}`;

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

    // Wider timeout + built-in retries (handles transient TLS / 5xx)
    const openai = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 });

    let b64: string | undefined;
    try {
      // Manual retry wrapper on top of SDK — only retries transient network
      // problems ("Connection error", ECONNRESET, fetch failed, 5xx). Each
      // retry waits 1.2s, 2.5s — small enough to stay under the 60s function
      // budget. We re-build the File for each retry because the underlying
      // ReadableStream gets consumed by the first attempt.
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
            // JPEG output keeps payload ~4× smaller than PNG; mockup is
            // photographic so JPEG artifacting is invisible at 85 quality.
            output_format: "jpeg",
            output_compression: 85,
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
        throw lastErr instanceof Error
          ? lastErr
          : new Error("Mockup üretilemedi.");
      }
    } catch (e) {
      // Roll back the pre-charge so a failed call doesn't eat budget
      await refund("mockup", cost);
      // Normalize the common transient error into something readable for the user
      const msg = e instanceof Error ? e.message : String(e);
      if (/connection error|fetch failed|timeout/i.test(msg)) {
        throw new Error(
          "OpenAI bağlantı hatası — bu mockup atlandı, biraz sonra tekrar dene."
        );
      }
      throw e;
    }

    const imageDataUrl = `data:image/jpeg;base64,${b64}`;

    return NextResponse.json({
      ok: true,
      variantId,
      label: spec.label,
      prompt,
      imageDataUrl,
      quality,
      cost,
      usage: reservation.snapshot,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
