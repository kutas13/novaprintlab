// ────────────────────────────────────────────────────────────────────────────
// SHARED MOCKUP PROMPT LIBRARY
//
// Every engine (OpenAI, Replicate, fal.ai, Gemini) uses the same product map,
// color map, variant pose list, and design-preservation lock so that switching
// engines doesn't subtly change the look of the listing.
// ────────────────────────────────────────────────────────────────────────────

export type ProductType = "Tişört" | "Hoodie" | "Sweatshirt";
export type ProductColor =
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

export const PRODUCT_MAP: Record<
  ProductType,
  { en: string; cut: string; weight: string; details: string }
> = {
  "Tişört": {
    en: "Gildan 5000 unisex classic-fit heavyweight cotton crewneck t-shirt",
    cut: "classic regular unisex fit, true-to-size, NOT oversized, NOT drop-shoulder, set-in short sleeves with double-needle hems",
    weight:
      "midweight 5.3 oz / 180 gsm 100% preshrunk ringspun cotton jersey, soft matte cotton finish (no shiny polyester sheen)",
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

export const COLOR_MAP: Record<ProductColor, string> = {
  Siyah: "deep matte black",
  Beyaz: "clean optic white",
  Gri: "heather gray",
  Lacivert: "deep navy blue",
  "Kırmızı": "muted crimson red",
  "Yeşil": "olive forest green",
  Bej: "warm sand beige",
};

export const DESIGN_PRESERVATION_LOCK =
  "═══════════════════════════════════════════════════════════════════════\n" +
  "ABSOLUTE TOP PRIORITY — DESIGN ASSET PRESERVATION RULE — READ FIRST\n" +
  "═══════════════════════════════════════════════════════════════════════\n" +
  "The supplied input image is the GROUND TRUTH ARTWORK. It is the final, " +
  "completed, customer-approved print design for this garment. Your job is " +
  "to PHOTOGRAPH a t-shirt that ALREADY has this exact artwork screen-printed " +
  "on its chest. You are NOT designing — you are STAGING and PHOTOGRAPHING " +
  "a garment that already has the print on it.\n" +
  "\n" +
  "CRITICAL DESIGN RULES:\n" +
  "1. The artwork must appear in the output IDENTICAL to the input — pixel for pixel.\n" +
  "2. Every letter, word, character, glyph, accent mark and number must match EXACTLY. " +
  "If the input says 'LONDON 2026' the output MUST say 'LONDON 2026' — not 'London 2026', " +
  "not 'LONDON 2025', not translated to any other language.\n" +
  "3. Every color, hue, gradient, ink shade and tonal value in the artwork must match EXACTLY.\n" +
  "4. Every illustration, icon, character, shape, line and stroke must match EXACTLY. " +
  "Do not redraw faces, do not redraw eyes, do not redraw hair, do not redraw any element.\n" +
  "5. The composition, layout, spacing, alignment and proportions of all design elements " +
  "must match the input EXACTLY.\n" +
  "6. Do NOT add: new text, taglines, captions, signatures, watermarks, brand names, " +
  "borders, frames, badges, or any extra graphics into or near the design.\n" +
  "7. Do NOT remove or omit any element that is in the original design.\n" +
  "8. Do NOT 'clean up', 'improve', 'vectorize', 'simplify', or 'stylize' the design — " +
  "treat its current state as PERFECT and FINAL.\n" +
  "\n" +
  "MENTAL MODEL: Imagine the input image is a high-resolution photograph of an " +
  "existing sticker that is already stuck on the shirt. Your only freedom is " +
  "(a) how the shirt is folded/worn/posed, and (b) the lighting, fabric folds " +
  "and natural shadows that sit OVER the print. The print itself never changes.\n" +
  "═══════════════════════════════════════════════════════════════════════";

export const PRINT_PLACEMENT_HINT =
  "PRINT PLACEMENT: Project the supplied design (exact pixels, unchanged) centered " +
  "on the chest of the garment as if it is an EXISTING high-quality screen print " +
  "already physically present on the fabric. The print should follow natural fabric " +
  "folds, wrinkles, lighting and shadows for realism — but the artwork content (every " +
  "letter, font, color, shape, illustration) MUST remain pixel-identical to the input. " +
  "Do not redraw, retype, retranslate, or recolor any part of the design under any " +
  "circumstance. If you cannot preserve a detail, leave it untouched rather than " +
  "guessing or recreating it.";

export const TEE_NEGATIVE_LOCK =
  "STRICT garment rules: the collar must be a SLIM and NORMAL THICKNESS ribbed crewneck (about 1.5cm) — absolutely NOT a thick collar, NOT a mock neck, NOT a turtleneck, NOT a rolled neck, NOT a chunky band. The fit must be classic regular unisex, NOT oversized, NOT cropped, NOT baggy drop-shoulder. Sleeves are normal short sleeves with double-needle hem (not extra-long, not raw-cut). Treat this as the industry-standard Gildan 5000 Heavy Cotton blank.";

// Camera framing rule — applied to every variant that includes a human
// model. Stops the AI from cropping the head/feet off and from generating
// bald/headless models. We give it concrete framing percentages plus an
// explicit "complete head with full hair visible" requirement.
export const FRAMING_LOCK =
  "CAMERA & FRAMING RULES (mandatory): The shot is a clean studio fashion " +
  "photograph framed in a 1:1 square aspect ratio. The model's ENTIRE BODY " +
  "must fit fully inside the frame from the top of the head down to the feet, " +
  "with comfortable safe-area margin on every side (at least 6% empty space " +
  "above the highest hair strand, at least 6% below the shoes). " +
  "THE MODEL'S COMPLETE HEAD IS VISIBLE: full natural hairstyle (a normal " +
  "amount of hair — not bald, not cropped, not cut off by the frame), full " +
  "forehead, full face, full neck, full ears. Do NOT crop the head, do NOT " +
  "crop the feet, do NOT zoom in tight on the chest. The composition must " +
  "look like a professional full-length fashion catalog shot where the entire " +
  "model is in frame and the printed chest design is the clear focal point. " +
  "Eye level horizontal camera angle, no extreme low or high angles.";

export const QUALITY_TAIL =
  "Ultra realistic, premium e-commerce product photography quality, Shopify/Etsy bestseller listing image, magazine fashion photography, 85mm prime lens look, soft cinematic lighting, true-to-life fabric texture, sharp focus, color-accurate, no watermark, no logo, no extra text outside the design itself, JPEG-ready high quality. " +
  "═══ FINAL REMINDER — DESIGN PRESERVATION ═══ " +
  "The printed design on the chest MUST be pixel-identical to the supplied input image. " +
  "Every letter must match, every color must match, every illustration must match. " +
  "You are PHOTOGRAPHING an existing print, you are NOT designing or redrawing it. " +
  "If anything in the output design differs from the input by even one letter or one color, " +
  "the result is WRONG and must be regenerated. Only the garment, the model and the scene " +
  "are generated; the artwork is preserved as-is.";

export interface PromptCtx {
  product: string;
  color: string;
  weight: string;
  cut: string;
  details: string;
  isTee: boolean;
}

export interface VariantSpec {
  id: VariantId;
  label: string;
  prompt: (ctx: PromptCtx) => string;
}

function constructionBlock(ctx: PromptCtx): string {
  return `${ctx.details}${ctx.isTee ? " " + TEE_NEGATIVE_LOCK : ""}`;
}

// Appended to every human-model variant. Centralised here so a single edit
// changes every pose. Folded/flat-minimal variants skip this because they
// don't include a person.
const HUMAN_BLOCK = ` ${FRAMING_LOCK}`;

export const VARIANTS: Record<VariantId, VariantSpec> = {
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
      `Full-body fashion photograph of a 25 year old male model with a normal short modern hairstyle (full natural hair clearly visible on top of the head — NOT bald, NOT cropped, NOT shaved), wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, paired with simple straight-leg dark jeans and white sneakers. ${ctx.weight}. He stands naturally facing the camera with arms relaxed at his sides, slight three-quarter angle. The frame includes his entire body from the very top of his hair down to below his shoes, with safe-area margin on all sides. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Neutral seamless light-gray studio backdrop, professional softbox lighting, modern minimalist styling.${HUMAN_BLOCK} ${QUALITY_TAIL}`,
  },
  "man-standing-2": {
    id: "man-standing-2",
    label: "Erkek — Ayakta Poz 2",
    prompt: (ctx) =>
      `Editorial full-body photo of a 25 year old male model with a normal modern medium-short hairstyle (complete natural hair fully visible on the top of his head — NOT bald, NOT shaved, NOT cropped off by the frame), wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, hands casually tucked into his pants pockets. ${ctx.weight}. Side-profile shoulder turned slightly toward the camera, looking off-frame. The frame includes his entire body from the very top of his hair down to below his shoes, with safe-area margin on all sides. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Warm minimalist concrete-wall background, golden hour window light, candid lookbook vibe.${HUMAN_BLOCK} ${QUALITY_TAIL}`,
  },
  "man-sitting": {
    id: "man-sitting",
    label: "Erkek — Oturmuş",
    prompt: (ctx) =>
      `Full-body lifestyle photograph of a 25 year old male model with a normal modern short hairstyle (full natural hair clearly visible on top of his head — NOT bald, NOT cropped), wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, sitting on a low minimalist concrete bench with one elbow resting on his knee. ${ctx.weight}. Front facing the camera, relaxed natural pose. The frame includes his entire seated body from the top of his hair down to his shoes with comfortable margin around. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Clean neutral cream studio background, soft directional window light, modern lookbook aesthetic.${HUMAN_BLOCK} ${QUALITY_TAIL}`,
  },
  "woman-standing-1": {
    id: "woman-standing-1",
    label: "Kadın — Ayakta Poz 1",
    prompt: (ctx) =>
      `Full-body fashion photograph of a 24 year old female model with natural shoulder-length brown hair (FULL HAIR clearly visible at the top of her head — NOT cropped by the frame, NOT hidden), wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, paired with simple high-waist straight jeans and white sneakers. ${ctx.weight}. She stands facing the camera with one hand gently touching her hip, relaxed natural posture. The frame includes her entire body from the very top of her hair down to below her shoes, with safe-area margin on all sides. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Neutral seamless light-gray studio backdrop, soft cinematic studio lighting, modern minimalist styling.${HUMAN_BLOCK} ${QUALITY_TAIL}`,
  },
  "woman-standing-2": {
    id: "woman-standing-2",
    label: "Kadın — Ayakta Poz 2",
    prompt: (ctx) =>
      `Editorial full-body photo of a 24 year old female model with natural medium-length hair (FULL HAIR clearly visible at the top of her head — NOT cropped, NOT cut off by the frame), wearing a ${ctx.color} ${ctx.cut} ${ctx.product}. ${ctx.weight}. Three-quarter angle pose, looking slightly down with a soft natural expression, hands tucked into the front of the garment. The frame includes her entire body from the very top of her hair down to below her shoes, with safe-area margin on all sides. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Warm beige studio backdrop, soft directional golden window light, magazine fashion editorial vibe.${HUMAN_BLOCK} ${QUALITY_TAIL}`,
  },
  "woman-crosslegged": {
    id: "woman-crosslegged",
    label: "Kadın — Bağdaş Kurmuş",
    prompt: (ctx) =>
      `Full-body lifestyle photograph of a 24 year old female model with natural shoulder-length hair (FULL HAIR clearly visible at the top of her head — NOT cropped by the frame), wearing a ${ctx.color} ${ctx.cut} ${ctx.product}, sitting cross-legged on a clean studio floor, hands resting gently on her knees. ${ctx.weight}. Facing the camera with a calm relaxed expression. The frame includes her entire seated body from the top of her hair down to her ankles with comfortable margin around. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} Soft cream seamless studio background, even soft top light, modern cozy lifestyle look.${HUMAN_BLOCK} ${QUALITY_TAIL}`,
  },
  "flat-minimal": {
    id: "flat-minimal",
    label: "Düz Minimal Görünüm",
    prompt: (ctx) =>
      `Modern minimalist boutique showroom display photo of a ${ctx.color} ${ctx.product}, presented as the hero piece of a premium fashion flagship. The garment is laid perfectly straight and centered using a ghost-mannequin / invisible-mannequin effect — it appears to float and holds its perfect silhouette with the collar clearly visible at the top of the frame. ${ctx.weight}. ${PRINT_PLACEMENT_HINT} ${constructionBlock(ctx)} The background is a softly out-of-focus modern showroom interior: warm off-white plastered walls, light oak wooden display fixtures, a minimalist floating display shelf or a single tasteful design accent piece far behind the product, gentle architectural lines — premium boutique vibe but completely uncluttered. Soft balanced showroom lighting (subtle key + soft fill), natural directional shadow beneath the garment, sharp focus on the product, no people, no other clothing visible in the foreground. Designer flagship store catalog aesthetic, contemporary modern fashion brand minimalism, magazine campaign feel. ${QUALITY_TAIL}`,
  },
};

// ─── HELPERS ────────────────────────────────────────────────────────────────
export async function bufferFromDataUrl(dataUrl: string): Promise<Buffer> {
  const m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!m) throw new Error("Geçersiz tasarım data URL.");
  return Buffer.from(m[1], "base64");
}

export async function bufferFromUrl(url: string): Promise<Buffer> {
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

/**
 * Resolve a request body into a Buffer of the design PNG.
 * Accepts either a data URL or a public HTTPS URL.
 */
export async function loadDesignBuffer(opts: {
  designDataUrl?: string;
  designUrl?: string;
}): Promise<Buffer> {
  if (opts.designDataUrl?.startsWith("data:image/")) {
    return bufferFromDataUrl(opts.designDataUrl);
  }
  if (opts.designUrl && /^https?:\/\//i.test(opts.designUrl)) {
    return bufferFromUrl(opts.designUrl);
  }
  throw new Error("designDataUrl veya designUrl gerekli.");
}

export function buildPromptCtx(
  productType: ProductType,
  color: ProductColor
): PromptCtx {
  const productDef = PRODUCT_MAP[productType];
  const colorEn = COLOR_MAP[color];
  return {
    product: productDef.en,
    color: colorEn,
    weight: productDef.weight,
    cut: productDef.cut,
    details: productDef.details,
    isTee: productType === "Tişört",
  };
}

export function buildMockupPrompt(
  variantId: VariantId,
  ctx: PromptCtx,
  preservationLock = true
): string {
  const spec = VARIANTS[variantId];
  if (!spec) throw new Error(`Bilinmeyen variantId: ${variantId}`);
  return preservationLock
    ? `${DESIGN_PRESERVATION_LOCK}\n\n${spec.prompt(ctx)}`
    : spec.prompt(ctx);
}
