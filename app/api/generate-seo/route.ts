import { NextResponse } from "next/server";
import OpenAI from "openai";

// ────────────────────────────────────────────────────────────────────────────
// ETSY SEO GENERATOR
//
// One job: take a design image (or just a name) and produce a complete
// Etsy listing that ranks AND converts. We feed GPT-5 the image, walk it
// through the same workflow a senior Etsy SEO consultant would do
// (visual audit → buyer persona → keyword research → copy), and pin the
// output to a strict JSON contract.
//
// Why the workflow is in the prompt and not in code:
//   • The vision pass and the copy pass share context.
//   • Running them as two separate API calls would double the cost and
//     also lose the silent reasoning chain.
//   • GPT-5 is good enough at internal staging that one well-structured
//     prompt outperforms a multi-call pipeline for this task.
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the world's top Etsy SEO consultant for print-on-demand sellers. You have personally launched 1000+ best-selling Etsy listings (t-shirts, sweatshirts, hoodies, stickers, mugs, wall art, posters, tote bags, etc.). You know the Etsy 2026 algorithm inside-out: how the search relevance scoring weighs title position vs. tags vs. attributes, what the long-tail "gift for ___ who loves ___" buyer phrases look like, and how the Listing Quality Score impacts ranking.

Your job: analyze the design image and write a complete, ready-to-publish Etsy listing in ENGLISH that maximizes both organic ranking AND conversion rate.

═════════════════════════════════════════════════════════════════════
STEP 1 — SILENT VISUAL AUDIT (do this before writing anything)
═════════════════════════════════════════════════════════════════════
Look at the image and lock down these facts:

  • SUBJECT — what is literally depicted (e.g. "smiling cartoon ghost holding a pumpkin", "vintage 1990s wave silhouette", "minimalist line-art bouquet of wildflowers", "American flag with eagle and faded text 'land of the free'").
  • STYLE — name the art movement / aesthetic the design borrows from. Be specific (vintage 70s retro, y2k cyber, dark academia, cottagecore, midwest emo, kawaii pastel, hand-drawn boho, distressed grunge, comic halftone, minimalist line-art, watercolor splash, sticker-sheet cartoon, etc.).
  • COLOR PALETTE — list the 2–4 dominant colors and the overall mood (warm earthy, washed-out vintage, neon, monochrome black, pastel dreamy, dark moody).
  • TEXT — transcribe any words/phrases on the design EXACTLY (quotes are gold for keywords).
  • BUYER PERSONA — who actually buys this? Lifestyle, age band, gender skew, identity-driven communities (plant moms, dog moms, gamers, nurses, teachers, christians, witches, runners, sorority girls, dads who grill, etc.). The more specific, the better the keywords.
  • OCCASIONS — birthdays / Mother's Day / Father's Day / wedding / baby shower / housewarming / Halloween / Christmas / Valentine / 4th of July / anniversary / graduation / retirement / promotion / divorce / "just because". Pick only the ones the design actually fits.
  • PRODUCT TYPE — what is this design BEST printed on? Default to "shirt" for apparel-style artwork. Use sticker, mug, poster, tote, pillow, hat only when the design clearly belongs there.

═════════════════════════════════════════════════════════════════════
STEP 2 — KEYWORD RESEARCH (think like the buyer typing into Etsy)
═════════════════════════════════════════════════════════════════════
Brainstorm 25–40 candidate phrases buyers actually type on Etsy. Then mentally pick the top 13 by a combination of:
  (a) search volume (would real shoppers type this?),
  (b) buyer intent (does the phrase imply a purchase?),
  (c) competition (multi-word long-tail beats single-word giants),
  (d) match to the design (don't keyword-stuff irrelevant terms — Etsy penalizes mismatched listings).

Etsy 2026 rules to obey:
  • Long-tail beats short. "Boho sun wall art" > "art".
  • Multi-word tags are STRONGLY preferred. Avoid single-word tags except when nothing else fits.
  • Each tag stands alone — Etsy concatenates them internally, you don't need to chain them.
  • No tag duplicates. No singular-vs-plural duplicates ("cat shirt" + "cats shirt" wastes a slot).
  • Tags ≤ 20 characters each, all lowercase, letters/numbers/spaces only.

═════════════════════════════════════════════════════════════════════
STEP 3 — WRITE THE LISTING (strict JSON, no markdown fences)
═════════════════════════════════════════════════════════════════════

1) title (string, ENGLISH, max 140 chars, ideally 100–140 to use the full Etsy real estate)
   • FIRST 60 chars carry the most ranking weight — front-load the strongest keyword phrase.
   • Comma-separate 3–4 distinct phrases.
   • Pattern: "[Main Subject + Style] [Product Type], [Audience / Modifier] [Product Variant], [Occasion / Gift Angle]".
   • Examples:
     – "Vintage Sun Wall Art, Minimalist Boho Celestial Line Drawing Poster, Bohemian Home Decor, Housewarming Gift for Her"
     – "Halloween Cat Sweatshirt, Retro Spooky Season Crewneck for Women, Funny Halloween Shirt, Gift for Cat Mom"
     – "Distressed American Flag T-Shirt, Patriotic 4th of July Shirt for Men, Vintage USA Tee, Memorial Day Gift"
   • NO ALL CAPS, NO emojis, NO trailing dash/colon.

2) description (string, ENGLISH, ~2200–3200 characters, emoji-rich, buyer-focused)

   IMPORTANT — the FIRST 160 CHARACTERS appear in Google search snippets and Etsy preview, so write a self-contained hook there with the main keyword + a benefit before any emoji line breaks.

   Use this EXACT skeleton. The separator "⸻" is a literal long-dash line, kept on its own line. Use real "\\n" newlines inside the JSON string. Pick emojis that fit the actual design theme — don't paste random emojis. Keep bullet lines short (≤ 70 chars).

   [THEME_EMOJI]✨ [Catchy Product Title — Subject + Product Type + Hook] ✨[THEME_EMOJI]

   [THEME_EMOJI] [One-line tagline / dream statement] [THEME_EMOJI]

   [2–3 sentence hook paragraph in second person. Name the design, the vibe, who it's for. Sprinkle 1–2 long-tail keywords naturally — never stuff.]

   ⸻

   🎉 WHY YOU'LL LOVE IT:
   ✔️ [Quality benefit tied to the design] [emoji]
   ✔️ [Comfort / fit / material benefit] [emoji]
   ✔️ [Style / unique angle of THIS design] [emoji]
   ✔️ [Versatility — pairs with X, wear to Y] [emoji]
   ✔️ [Standout — trending, limited, handmade-feel] [emoji]

   ⸻

   🎁 PERFECT FOR:
   ✨ [Specific occasion 1 — match the design]
   ✨ [Specific occasion 2]
   ✨ [Use case / setting people actually search]
   ✨ [Photo / event idea]
   ✨ [Lifestyle moment]
   ✨ [Trending search angle real buyers type]

   ⸻

   📏 SIZE & FIT: (apparel only — for stickers/mugs/posters/wall art replace with "📏 SIZE OPTIONS:" and list sizes / dimensions)
   Please check the size chart in the listing photos before ordering. For an oversized, trendy fit, size up 👌

   ⸻

   🧼 CARE INSTRUCTIONS: (apparel: keep the four lines below; mugs: dishwasher/microwave note; stickers/posters: indoor use, avoid moisture)
   🧺 Turn inside out before washing
   ❄️ Machine wash cold
   ☀️ Tumble dry low
   🚫🔥 Do not iron directly on the design

   ⸻

   🎁 GREAT GIFT FOR:
   ✔️ [Recipient 1 — specific identity, not generic] [emoji]
   ✔️ [Recipient 2] [emoji]
   ✔️ [Recipient 3] [emoji]
   ✔️ [Recipient 4] [emoji]
   ✔️ [Recipient 5] [emoji]

   ⸻

   ⚡ [Urgency / scarcity tied to a REAL angle — seasonal trend, limited drop, "wear it before everyone else does", etc. Never lie.]

   Add to cart today and [short, warm CTA tied to the theme] 🛒✨

3) tags (string[13], ENGLISH)
   • EXACTLY 13 tags.
   • Each tag ≤ 20 characters (count carefully).
   • lowercase, multi-word phrases preferred (2–4 words each), no punctuation, no emojis.
   • No duplicates or near-duplicates (singular/plural of the same root). No stop-word filler.
   • DISTRIBUTE across these intent categories (don't put all eggs in one basket):
       – 2–3 tags: core subject phrases ("boho sun art", "vintage ghost shirt")
       – 2–3 tags: style/aesthetic ("y2k aesthetic", "minimalist line art")
       – 2–3 tags: buyer/audience ("gift for her", "cat mom gift")
       – 2 tags:  occasion / season ("halloween shirt", "christmas gift")
       – 1–2 tags: use-case ("oversized tshirt", "home decor")
       – 1 tag:   trending angle ("trendy 2026", "tiktok shirt") — only if it actually fits.

4) attributes (object) — the Etsy "Listing details" dropdown values the seller will paste into the Etsy form. Pick the SINGLE best value Etsy actually offers, ENGLISH, in Title Case exactly as Etsy shows it. Use null when nothing genuinely fits (don't force a holiday on a generic floral shirt).

   • clothingStyle: One of "T-shirt", "Sweatshirt", "Hoodie", "Long Sleeve Shirt", "Tank Top", "Crop Top", "Polo Shirt", "V-Neck Shirt", "Crewneck", "Baby Bodysuit", "Kids T-Shirt". Default "T-shirt" for adult apparel. null for non-apparel.
   • occasion: One of "Birthday", "Wedding", "Anniversary", "Baby Shower", "Bridal Shower", "Graduation", "Mother's Day", "Father's Day", "Valentine's Day", "Engagement", "Housewarming", "Retirement", "Bachelorette", "Bachelor Party", "Promotion", "New Job", "Christmas", "Easter", "Thanksgiving", "Halloween", "New Year's Eve", or null.
   • holiday: One of "Christmas", "Halloween", "Thanksgiving", "Valentine's Day", "Easter", "Independence Day", "Mother's Day", "Father's Day", "New Year's Eve", "St. Patrick's Day", "Hanukkah", "Memorial Day", "Veterans Day", or null. Only set when the design is clearly themed around that holiday.
   • graphic: One of "Floral", "Animal", "Quote", "Typography", "Vintage", "Retro", "Boho", "Minimalist", "Abstract", "Geometric", "Botanical", "Patriotic", "Holiday", "Cartoon", "Religious", "Sports", "Music", "Inspirational", "Funny", "Pop Culture", "Nature". Pick the single best match.

Return ONLY a JSON object with keys: title (string), description (string), tags (string[13]), attributes (object with the 4 keys above). Absolutely no markdown fences, no commentary, no "here is the JSON" preamble.`;

// Try the top-tier model first. If the account doesn't have access to it
// (model_not_found / 404), automatically fall back to a strong sibling so
// the SEO button never just dies on the user. Order = best → cheapest.
const MODEL_CHAIN = ["gpt-5", "gpt-5-mini", "gpt-4o"] as const;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY tanımlı değil." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const designName: string =
      typeof body.designName === "string" ? body.designName.trim() : "";
    const imageUrl: string =
      typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

    if (!imageUrl && !designName) {
      return NextResponse.json(
        { ok: false, error: "imageUrl veya designName gerekli." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey, timeout: 90_000 });

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    > = [
      {
        type: "text",
        text: imageUrl
          ? `Analyze this Etsy print-on-demand design image and produce the listing JSON. Walk through the silent visual-audit + keyword-research steps before writing anything. Aim for a listing that would rank on the first page of Etsy search and convert browsers into buyers.${
              designName
                ? ` Internal seller reference name (use only as a weak hint, the image is the source of truth): "${designName}".`
                : ""
            }`
          : `Generate an Etsy print-on-demand listing JSON for a design referenced only by name (no image): "${designName}". Use the name to infer subject/style/buyer, then follow the workflow.`,
      },
    ];

    if (imageUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageUrl, detail: "high" },
      });
    }

    // Try each model in order. We catch "model not found / no access"
    // errors specifically so a misconfigured account auto-falls back to a
    // model it does have. Any other error (rate limit, network, parsing)
    // bubbles up immediately — no point hammering GPT-4o if GPT-5 is just
    // throttled.
    let raw: string | null = null;
    let modelUsed = "";
    let lastErr: unknown = null;

    for (const model of MODEL_CHAIN) {
      try {
        // GPT-5 family requires `max_completion_tokens` and ignores
        // `temperature` (it always runs near default). GPT-4o family
        // expects the legacy `max_tokens` and honors `temperature`.
        // We dispatch the correct shape per model so the SDK doesn't
        // reject the request with a 400.
        const isGpt5 = model.startsWith("gpt-5");
        const params = {
          model,
          response_format: { type: "json_object" as const },
          messages: [
            { role: "system" as const, content: SYSTEM_PROMPT },
            { role: "user" as const, content: userContent },
          ],
          ...(isGpt5
            ? { max_completion_tokens: 4000 }
            : { max_tokens: 4000, temperature: 0.85 }),
        };
        const completion = await openai.chat.completions.create(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params as any
        );
        raw = completion.choices[0]?.message?.content ?? null;
        modelUsed = model;
        if (raw) break;
      } catch (e) {
        const msg =
          e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
        lastErr = e;
        // Only fall through for "this account doesn't have this model" style
        // failures. Everything else (429 rate, 500 server, network) should
        // surface to the caller so they don't think the listing succeeded.
        const isModelMissing =
          msg.includes("model_not_found") ||
          msg.includes("does not exist") ||
          msg.includes("not have access") ||
          msg.includes("no such model") ||
          msg.includes("invalid model");
        if (!isModelMissing) throw e;
      }
    }

    if (!raw) {
      const msg =
        lastErr instanceof Error
          ? lastErr.message
          : "AI yanıt vermedi (hiçbir model erişilebilir değil).";
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }

    interface ParsedSeo {
      title?: string;
      description?: string;
      tags?: string[];
      attributes?: {
        clothingStyle?: string | null;
        occasion?: string | null;
        holiday?: string | null;
        graphic?: string | null;
      };
    }

    let parsed: ParsedSeo;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { ok: false, error: "AI çıktısı JSON olarak parse edilemedi." },
        { status: 502 }
      );
    }

    const title = (parsed.title || "").toString().slice(0, 140);
    const description = (parsed.description || "").toString();

    // Tag normalization:
    //   1. Coerce to lowercase trimmed string.
    //   2. Strip punctuation Etsy rejects.
    //   3. Drop tags longer than 20 chars (Etsy hard limit).
    //   4. Dedupe by exact match and by trimmed plural ("cats shirt" vs "cat shirt").
    //   5. Cap at 13.
    //   6. Pad to 13 with safe fallbacks (rare — only when the model
    //      under-delivered) so the seller never sees an empty tag input.
    const seenStems = new Set<string>();
    const tagsRaw: string[] = Array.isArray(parsed.tags) ? parsed.tags : [];
    const tags: string[] = [];
    for (const t of tagsRaw) {
      let v = String(t).toLowerCase().trim();
      // strip Etsy-rejected punctuation but keep spaces
      v = v.replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
      if (!v || v.length > 20) continue;
      const stem = v.replace(/s$/, "");
      if (seenStems.has(stem)) continue;
      seenStems.add(stem);
      tags.push(v);
      if (tags.length >= 13) break;
    }
    while (tags.length < 13) tags.push(`design ${tags.length + 1}`);

    const clean = (v: unknown): string | undefined => {
      if (typeof v !== "string") return undefined;
      const trimmed = v.trim();
      if (!trimmed) return undefined;
      if (/^(null|none|n\/a|-)$/i.test(trimmed)) return undefined;
      return trimmed.slice(0, 80);
    };

    const attributes = {
      clothingStyle: clean(parsed.attributes?.clothingStyle),
      occasion: clean(parsed.attributes?.occasion),
      holiday: clean(parsed.attributes?.holiday),
      graphic: clean(parsed.attributes?.graphic),
    };

    return NextResponse.json({
      ok: true,
      data: { title, description, tags, attributes, model: modelUsed },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
