import { NextResponse } from "next/server";
import OpenAI from "openai";
import { reserve, refund, costForQuality, normalizeQuality } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// NOVAPRINTLAB AI ENGINE
// Pipeline:
//   1. User Turkish input + selections
//   2. CONCEPT ENHANCER (LLM) → enriched English concept (subject + narrative)
//   3. POD PROMPT ENGINE (deterministic) → style/color/placement/anti-prompt
//   4. IMAGE GEN (gpt-image-1, transparent, hi-quality)
// ────────────────────────────────────────────────────────────────────────────

type Action = "enhance" | "random" | "generate";

interface RequestBody {
  action?: Action;
  prompt?: string;
  styles?: string[];       // multi-select (up to 2 for style mixing)
  color?: string;
  type?: string;
  placement?: string;
  preset?: string;         // optional preset id
  quality?: "low" | "medium" | "high"; // image-gen quality, default medium
  referenceImageDataUrl?: string; // optional inspiration image (base64 data url)
  referenceStrength?: "subtle" | "balanced" | "strong"; // how much DNA leaks
  /** When true, we render the SAME concept twice — once in pure black ink
   *  for light apparel, once in pure white ink for dark apparel — and
   *  return both in the response. Costs 2× a single image but Etsy POD
   *  sellers usually want both variants anyway. */
  pairBlackAndWhite?: boolean;
}

// ─── STYLE ENGINE ───────────────────────────────────────────────────────────
const STYLE_MAP: Record<
  string,
  { modifiers: string; pod: string }
> = {
  Vintage: {
    modifiers:
      "distressed grunge texture, faded retro 1970s color palette, aged screen-print effect, vintage serif typography, halftone shading, hand-drawn warmth",
    pod: "Etsy vintage bestseller aesthetic",
  },
  Retro: {
    modifiers:
      "retro 1980s aesthetic, sun-fade gradient bands, bold script typography, geometric sun-burst motifs, warm sunset palette, chrome accents",
    pod: "retro Americana POD design",
  },
  Minimal: {
    modifiers:
      "minimal single-color line illustration, generous negative space, clean monoline strokes, modern editorial layout, refined geometry",
    pod: "minimalist Etsy bestseller",
  },
  "Sokak Giyimi": {
    modifiers:
      "urban streetwear graphic, bold oversized display typography, layered editorial composition, trendy hype-brand aesthetic, gothic blackletter accents",
    pod: "streetwear hype-brand POD",
  },
  Y2K: {
    modifiers:
      "Y2K 2000s aesthetic, chrome metallic gradient, glossy bubble bold font, butterfly and star motifs, cyber-pink and lime accents",
    pod: "Y2K nostalgia bestseller",
  },
  Anime: {
    modifiers:
      "anime manga illustration, expressive cel-shaded lineart, dynamic action pose, vibrant Japanese pop colors, screentone halftone shading, kanji typography accents",
    pod: "anime streetwear POD",
  },
  Spor: {
    modifiers:
      "vintage college athletic typography, varsity block letters, distressed sports texture, classic team-jersey arc-and-stack layout, bold serif athletic font",
    pod: "Etsy vintage sports bestseller",
  },
  "Dövme": {
    modifiers:
      "old-school traditional tattoo flash, bold black ink linework, Sailor Jerry shading, dagger / rose / panther / serpent motifs, banner ribbon with script",
    pod: "tattoo flash POD bestseller",
  },
  Graffiti: {
    modifiers:
      "urban graffiti spray paint, wildstyle drip lettering, throw-up tag style, vibrant street art palette, stencil hard edges, sticker-bomb energy",
    pod: "graffiti street art POD",
  },
  Psychedelic: {
    modifiers:
      "psychedelic 1960s swirling motifs, groovy bubble script, kaleidoscopic acid colors, hippy floral mandala, trippy melt effect",
    pod: "psychedelic acid-trip POD",
  },
};

// ─── COLOR ENGINE ───────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
  Siyah:
    "monochrome single-color black ink palette only, suited for white or light apparel, no gradients",
  Beyaz:
    "single-color white ink palette only, suited for dark apparel, bold positive shapes on transparent canvas",
  "Kırmızı":
    "limited 2-color palette: deep crimson red with cream off-white, warm vintage bold tones",
  Mavi:
    "limited 2-color palette: navy and royal blue with off-white, cool athletic tones",
  Neon:
    "vivid neon palette: electric pink, lime green, cyan blue, glowing high-saturation contrast",
  Pastel:
    "soft pastel palette: dusty pink, sage mint, lavender, butter cream, low contrast, cozy mood",
  "Çok Renkli":
    "vibrant rich multi-color palette, 4–6 balanced saturated tones, retro screen-print color layering",
};

// ─── TYPE ENGINE ────────────────────────────────────────────────────────────
const TYPE_MAP: Record<string, string> = {
  "Yazı Tasarımı":
    "typography-led design, custom hand-drawn lettering as the hero element, NO illustration body — text is the artwork",
  "Grafik Tasarım":
    "illustration-led design, central iconic graphic as the hero, NO body copy or paragraph text, optional 1-3 word headline only",
  "Karışık":
    "balanced typography + illustration lockup, headline word stacked above or below the hero graphic",
};

// ─── COMPOSITION (PLACEMENT) ENGINE ─────────────────────────────────────────
const PLACEMENT_MAP: Record<string, string> = {
  "Ortalanmış":
    "centered chest composition, single focal point, balanced symmetric layout, equal margin on all sides",
  "Full Tasarım":
    "large full-front print composition, edge-to-edge artwork filling 90% of the canvas, ambitious oversized graphic",
  "Küçük Göğüs Tasarımı":
    "small left-chest pocket-size composition, compact icon-style minimal layout, only 20–25% of the canvas used, generous transparent margin",
};

// ─── PRESETS (Etsy Bestseller Combos) ───────────────────────────────────────
const PRESETS: Record<
  string,
  {
    label: string;
    description: string;
    styles: string[];
    color?: string;
    type?: string;
    placement?: string;
    extra?: string; // extra POD engine tokens
  }
> = {
  "etsy-sports": {
    label: "Etsy Bestseller Sports",
    description: "Vintage college sports + distressed texture. Spor/üniversite ürünleri için.",
    styles: ["Spor", "Vintage"],
    color: "Kırmızı",
    type: "Karışık",
    placement: "Ortalanmış",
    extra:
      "vintage 1970s NCAA-style varsity, arc-and-stack typography lockup, weathered halftone print",
  },
  "retro-travel": {
    label: "Retro Travel Poster",
    description: "70s seyahat poster estetiği, şehir/destinasyon temaları için.",
    styles: ["Retro", "Vintage"],
    color: "Çok Renkli",
    type: "Karışık",
    placement: "Ortalanmış",
    extra:
      "vintage 1970s travel poster, sunset gradient bands, retro destination badge, hand-lettered city name",
  },
  "y2k-streetwear": {
    label: "Y2K Streetwear",
    description: "2000s nostalji + streetwear. Genç-trendy hedef kitle.",
    styles: ["Y2K", "Sokak Giyimi"],
    color: "Neon",
    type: "Karışık",
    placement: "Full Tasarım",
    extra: "chrome bubble lockup, butterfly motif, glossy Y2K cyber gradients",
  },
  "tattoo-flash": {
    label: "Tattoo Flash",
    description: "Old-school dövme stili, koleksiyonluk tişört tasarımı.",
    styles: ["Dövme"],
    color: "Siyah",
    type: "Grafik Tasarım",
    placement: "Ortalanmış",
    extra:
      "Sailor Jerry traditional tattoo flash, banner ribbon with script slogan, bold black outline",
  },
  "anime-street": {
    label: "Anime Streetwear",
    description: "Anime karakter + urban streetwear lockup.",
    styles: ["Anime", "Sokak Giyimi"],
    color: "Çok Renkli",
    type: "Karışık",
    placement: "Full Tasarım",
    extra: "manga panel framing, kanji headline, hype-brand collab energy",
  },
  "minimal-quote": {
    label: "Minimal Quote",
    description: "Minimal yazı tasarımı, hediye/lifestyle kitle için.",
    styles: ["Minimal"],
    color: "Siyah",
    type: "Yazı Tasarımı",
    placement: "Ortalanmış",
    extra:
      "minimal sans-serif quote typography, single hairline accent, editorial gift design",
  },
  "graffiti-y2k": {
    label: "Graffiti × Y2K",
    description: "Sokak grafiti + 2000s Y2K karışımı, deneysel/genç.",
    styles: ["Graffiti", "Y2K"],
    color: "Neon",
    type: "Karışık",
    placement: "Full Tasarım",
    extra: "wildstyle graffiti tag combined with chrome Y2K bubble motif",
  },
};

// ─── ANTI-PROMPT (negative-prompt equivalent in positive form) ──────────────
const ANTI_INSTRUCTIONS =
  "ABSOLUTELY DO NOT include: a t-shirt or apparel mockup, a human model or mannequin, any scene/background/setting, photography, 3D render, watermark, signature, logo border, frame, cropped artwork, blurry edges, drop shadow on a fake surface, or any object outside the design itself.";

// ─── VECTOR / PRINT-READY ESSENTIALS (always appended) ──────────────────────
const PRINT_READY_TAIL =
  "Isolated vector-style artwork on a fully TRANSPARENT background (not white, not checkerboard — true alpha transparency), crisp clean edges, bold outline, high contrast screen-print-ready limited palette, centered on the canvas with even margins, premium POD print-ready quality, 4000x4000 export feel, no watermark, no mockup, no model, no scene.";

// ─── STAGE 1: CONCEPT ENHANCER (LLM) ────────────────────────────────────────
function buildEnhancerSystemPrompt() {
  return `You are NovaPrintLab's POD CONCEPT ENHANCER. You receive a SHORT Turkish design idea and turn it into a rich English CONCEPT block describing the artwork ONLY.

You DO NOT write style modifiers, color palette, layout rules, anti-prompts, or print-ready boilerplate — those are added downstream by a deterministic POD engine.

Your output describes ONLY:
- The subject (hero illustration or hero typography or both).
- The narrative theme (era, place, sport, fandom, occasion, vibe).
- Specific visual elements that should appear (e.g. "London skyline silhouette, double-decker bus, Big Ben, crown, football, year 2026").
- If the user wants text on the shirt, translate it to ENGLISH and put it in QUOTES inside the description (e.g. typography reading "England Football 2026").
- Suggest typography character if relevant ("bold varsity serif", "groovy script", "stencil sans-serif").

WRITING RULES:
- Output ONE rich English paragraph, 40–80 words.
- NO Turkish words in the output.
- NO mention of: t-shirt, apparel, mockup, model, background, scene, transparent, isolated, vector, PNG, screen-print, watermark — these are added later.
- NO style words like "vintage / minimal / Y2K" — those come from the user selections downstream.
- Just the concept, vividly described.

OUTPUT (strict JSON, no markdown):
{ "concept": "..." }`;
}

async function enhanceConcept(
  openai: OpenAI,
  userPrompt: string
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.85,
      max_tokens: 350,
      messages: [
        { role: "system", content: buildEnhancerSystemPrompt() },
        {
          role: "user",
          content: `Turkish idea: "${userPrompt}"\n\nReturn the rich English concept JSON.`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "";
    const parsed: { concept?: string } = JSON.parse(raw);
    const c = (parsed.concept || "").trim();
    if (c) return c;
  } catch (err) {
    console.error("[enhanceConcept] LLM failed, using fallback", err);
  }
  // Fallback: pass the Turkish idea through with a generic English wrapper
  return `Design concept based on the idea: "${userPrompt}". Hero subject prominently featured with thematic supporting elements.`;
}

// ─── STAGE 1.5: REFERENCE VISION ANALYZER ──────────────────────────────────
// Extracts the *visual DNA* (palette / motif / typography / mood) from an
// uploaded reference image WITHOUT describing it as a scene to replicate.
// The downstream image gen uses this as INSPIRATION ONLY — strong negative
// instructions ensure the new artwork is a distinctly different composition.
async function analyzeReferenceImage(
  openai: OpenAI,
  imageDataUrl: string
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content: `You analyze a reference image and extract its VISUAL DNA for a print-on-demand designer who wants to make a DIFFERENT artwork in the same family.

Describe ONLY these axes (no subject narration, no scene description, no replication instructions):
- Color palette (2–5 specific hues)
- Linework / texture (e.g. "bold black outlines, halftone shading")
- Typography character if any (e.g. "varsity serif", "groovy script")
- Composition energy (e.g. "centered emblem", "asymmetric drop", "edge-to-edge tile")
- Mood / era / aesthetic (e.g. "1970s NCAA vintage", "Y2K chrome", "old-school tattoo flash")
- Distinct motif vocabulary (e.g. "shield, banner ribbon, panther, rose")

OUTPUT JSON (no markdown):
{ "dna": "one rich paragraph 30–60 words covering the axes above, no copy/replicate language" }`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract this reference image's visual DNA. The user wants INSPIRATION — output must NOT instruct replication.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "";
    const parsed: { dna?: string } = JSON.parse(raw);
    const dna = (parsed.dna || "").trim();
    if (dna) return dna;
  } catch (err) {
    console.error("[analyzeReferenceImage] failed", err);
  }
  return "";
}

// ─── STAGE 2: POD PROMPT ENGINE (deterministic) ─────────────────────────────
function buildPodPrompt({
  concept,
  styles,
  color,
  type,
  placement,
  preset,
  referenceDNA,
  referenceStrength,
}: {
  concept: string;
  styles?: string[];
  color?: string;
  type?: string;
  placement?: string;
  preset?: string;
  referenceDNA?: string;
  referenceStrength?: "subtle" | "balanced" | "strong";
}): string {
  const segments: string[] = [];

  // Opener
  segments.push(
    "Professional print-on-demand t-shirt graphic design (the artwork itself, not on a shirt)."
  );

  // Concept (core subject)
  segments.push(concept);

  // Style modifiers (supports up to 2 stacked for style mixing)
  const validStyles = (styles || []).filter((s) => STYLE_MAP[s]).slice(0, 2);
  if (validStyles.length === 1) {
    const s = STYLE_MAP[validStyles[0]];
    segments.push(`${s.modifiers}, ${s.pod}.`);
  } else if (validStyles.length === 2) {
    const a = STYLE_MAP[validStyles[0]];
    const b = STYLE_MAP[validStyles[1]];
    segments.push(
      `Style fusion of ${validStyles[0].toLowerCase()} and ${validStyles[1].toLowerCase()}: ${a.modifiers}, blended with ${b.modifiers}. Aesthetic crossover of ${a.pod} and ${b.pod}.`
    );
  }

  // Color
  if (color && COLOR_MAP[color]) {
    segments.push(COLOR_MAP[color] + ".");
  }

  // Type (typography vs graphic vs mixed)
  if (type && TYPE_MAP[type]) {
    segments.push(TYPE_MAP[type] + ".");
  }

  // Placement / Composition
  if (placement && PLACEMENT_MAP[placement]) {
    segments.push(PLACEMENT_MAP[placement] + ".");
  } else {
    segments.push(PLACEMENT_MAP["Ortalanmış"] + ".");
  }

  // Preset extras
  if (preset && PRESETS[preset]?.extra) {
    segments.push(PRESETS[preset]!.extra + ".");
  }

  // ─── REFERENCE DNA INJECTION ────────────────────────────────────────────
  // The reference image is used ONLY as visual DNA — palette/typography/mood/
  // motif vocabulary — never as a composition to replicate. Strong negative
  // language enforces a distinctly different layout.
  if (referenceDNA && referenceDNA.length > 0) {
    const strength = referenceStrength || "balanced";
    const intensity =
      strength === "subtle"
        ? "Borrow ONLY the palette and mood — composition must be completely original."
        : strength === "strong"
          ? "Adopt the palette, typography character, texture, and motif vocabulary closely — but the subject and composition must be NEW."
          : "Echo the palette, typography character, and motif vocabulary — produce a sibling design with a distinctly different composition.";

    segments.push(
      `Visual DNA inspiration (for stylistic guidance only — DO NOT replicate, copy, or trace the reference; create a clearly DIFFERENT artwork that feels like a cousin of it): ${referenceDNA} ${intensity} The final artwork must be visibly NEW: different subject framing, different focal arrangement, different specific motifs, and no element should be a direct copy of the reference.`
    );
  }

  // Print-ready + anti-instructions
  segments.push(PRINT_READY_TAIL);
  segments.push(ANTI_INSTRUCTIONS);

  return segments.join(" ");
}

// ─── RANDOM IDEA ────────────────────────────────────────────────────────────
async function randomIdea(openai: OpenAI): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 1.1,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            'You are a creative director for an Etsy print-on-demand store. Suggest ONE catchy Turkish t-shirt design idea — a single short phrase (3 to 9 words). No quotes, no end punctuation. Output JSON: {"idea":"..."}. Make it commercial and sellable (vintage sports, retro travel, anime mascot, funny quote, niche hobby, holiday, animal, occupation).',
        },
        { role: "user", content: "Bana satılabilir, yeni bir Türkçe tasarım fikri ver." },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "";
    const parsed: { idea?: string } = JSON.parse(raw);
    const idea = (parsed.idea || "").trim();
    if (idea) return idea;
  } catch (err) {
    console.error("[randomIdea] fallback", err);
  }
  const FALLBACKS = [
    "Vintage New York basketbol takımı",
    "Retro Japonya seyahat poster",
    "Y2K kelebek minimal grafik",
    "Old-school dövme aslan başı",
    "İstanbul vintage seyahat poster",
    "Anime kedi street art",
    "Cottagecore botanik gül illüstrasyonu",
    "90s skateboard graffiti yazı",
    "Vintage kahve dükkanı maskotu",
    "England 2026 futbol vintage",
  ];
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

// ─── IMAGE GENERATION ───────────────────────────────────────────────────────
async function generateImage(
  openai: OpenAI,
  englishPrompt: string,
  quality: "low" | "medium" | "high"
): Promise<string> {
  const res = await openai.images.generate({
    model: "gpt-image-1",
    prompt: englishPrompt,
    n: 1,
    size: "1024x1024",
    background: "transparent",
    output_format: "png",
    quality,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Görsel üretilemedi (boş yanıt).");
  return `data:image/png;base64,${b64}`;
}

// ─── ROUTE ─────────────────────────────────────────────────────────────────
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
    const action: Action = (body.action || "generate") as Action;
    const openai = new OpenAI({ apiKey });

    if (action === "random") {
      const idea = await randomIdea(openai);
      return NextResponse.json({ ok: true, idea });
    }

    // Resolve preset → overlay on user selections (user takes precedence)
    let styles = body.styles || [];
    let color = body.color;
    let type = body.type;
    let placement = body.placement;
    let preset = body.preset;

    if (preset && PRESETS[preset]) {
      const p = PRESETS[preset]!;
      if (styles.length === 0) styles = p.styles;
      if (!color) color = p.color;
      if (!type) type = p.type;
      if (!placement) placement = p.placement;
    }

    // Both enhance & generate may use a reference image; analyze once.
    const referenceImageDataUrl = (body.referenceImageDataUrl || "").trim();
    const hasReference =
      referenceImageDataUrl.startsWith("data:image/") ||
      referenceImageDataUrl.startsWith("http");
    const referenceStrength = body.referenceStrength;
    let referenceDNA = "";
    if (hasReference) {
      referenceDNA = await analyzeReferenceImage(openai, referenceImageDataUrl);
    }

    if (action === "enhance") {
      const userPrompt = (body.prompt || "").trim();
      if (!userPrompt && !hasReference) {
        return NextResponse.json(
          { ok: false, error: "Prompt boş olamaz." },
          { status: 400 }
        );
      }
      const concept = await enhanceConcept(
        openai,
        userPrompt || "Reference-driven original design"
      );
      const englishPrompt = buildPodPrompt({
        concept,
        styles,
        color,
        type,
        placement,
        preset,
        referenceDNA,
        referenceStrength,
      });
      return NextResponse.json({
        ok: true,
        concept,
        englishPrompt,
        referenceDNA: referenceDNA || undefined,
      });
    }

    // action === "generate"
    const userPrompt = (body.prompt || "").trim();
    if (!userPrompt && !hasReference) {
      return NextResponse.json(
        { ok: false, error: "Tasarım için bir fikir yaz veya referans görsel yükle." },
        { status: 400 }
      );
    }

    const concept = await enhanceConcept(
      openai,
      userPrompt || "Original print-ready artwork inspired by the provided reference DNA"
    );
    const englishPrompt = buildPodPrompt({
      concept,
      styles,
      color,
      type,
      placement,
      preset,
      referenceDNA,
      referenceStrength,
    });

    // ─── Daily $5 cap — reserve before calling OpenAI image gen ────────
    const quality = normalizeQuality(body.quality);
    const cost = costForQuality(quality);
    const pair = Boolean(body.pairBlackAndWhite);
    // Pair mode = 2 images = 2× cost. Reserve up front so we don't blow
    // the cap if only the first image succeeds.
    const totalCost = pair ? cost * 2 : cost;

    const reservation = await reserve("design", totalCost);
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

    // POD-style monochrome lock that we APPEND to the base prompt for
    // the BW pair. The base concept stays identical → both versions
    // share subject, layout, typography, and composition; they differ
    // ONLY in ink color, which is exactly what the user asked for
    // ("tasarım aynı olacak").
    const blackLock = ` MONOCHROMATIC SOLID BLACK INK ONLY: render the entire artwork using ONLY pure black shapes and lines on a transparent background. NO colors, NO grayscale gradients, NO white fills — only flat 100% black ink suitable for screen-printing on LIGHT / WHITE apparel. Treat it like a one-color screen-print plate.`;
    const whiteLock = ` MONOCHROMATIC SOLID WHITE INK ONLY: render the entire artwork using ONLY pure white shapes and lines on a transparent background. NO colors, NO grayscale gradients, NO black fills — only flat 100% white ink suitable for screen-printing on DARK / BLACK apparel. Treat it like a one-color screen-print plate.`;

    if (pair) {
      // Run both renders in parallel — gpt-image-1 is rate-limited per
      // image, not per concurrent request, so this halves wall-clock time.
      let blackUrl: string;
      let whiteUrl: string;
      try {
        [blackUrl, whiteUrl] = await Promise.all([
          generateImage(openai, englishPrompt + blackLock, quality),
          generateImage(openai, englishPrompt + whiteLock, quality),
        ]);
      } catch (e) {
        await refund("design", totalCost);
        throw e;
      }
      return NextResponse.json({
        ok: true,
        concept,
        englishPrompt,
        pair: {
          black: { imageDataUrl: blackUrl, suffixLabel: "Siyah (açık ürünlere)" },
          white: { imageDataUrl: whiteUrl, suffixLabel: "Beyaz (koyu ürünlere)" },
        },
        quality,
        cost: totalCost,
        usage: reservation.snapshot,
        referenceDNA: referenceDNA || undefined,
      });
    }

    let imageDataUrl: string;
    try {
      imageDataUrl = await generateImage(openai, englishPrompt, quality);
    } catch (e) {
      await refund("design", totalCost);
      throw e;
    }

    return NextResponse.json({
      ok: true,
      concept,
      englishPrompt,
      imageDataUrl,
      quality,
      cost,
      usage: reservation.snapshot,
      referenceDNA: referenceDNA || undefined,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[generate] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
