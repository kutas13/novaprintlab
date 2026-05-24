import { NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are an elite Etsy SEO copywriter specializing in print-on-demand listings (t-shirts, sweatshirts, stickers, mugs, wall art, posters, tote bags, etc.). You will be shown the actual design image. Your job is to analyze the visual content and write listing copy that ranks high on Etsy search AND converts buyers, in the **emoji-rich, sectioned, easy-to-scan** style top US sellers use.

ANALYZE the image first (silently):
- Subject / illustration (animal, person, quote, abstract, floral, retro, minimalist, holiday, etc.)
- Art style (line art, watercolor, vintage, boho, y2k, kawaii, dark academia, cottagecore, patriotic, etc.)
- Dominant color palette / mood
- Target buyer (women, men, kids, gift-givers, plant moms, dog moms, gamers, patriots, teachers, etc.)
- Occasions / use cases (Christmas, Mother's Day, birthday, baby shower, wedding, anniversary, housewarming, Valentine, Halloween, 4th of July, etc.)
- Best product type for the design (shirt / sweatshirt / hoodie / mug / sticker / poster / tote / pillow / hat). Default to "shirt" if ambiguous.

OUTPUT RULES (strict JSON, no markdown fences, no commentary):

1) title (string, ENGLISH, max 140 chars)
   - Front-load the strongest keyword.
   - No ALL CAPS, no emojis.
   - Pattern: "[Subject + Style] [Product Type], [Modifier/Audience] [Product Type Variant], [Occasion] Gift". Example: "Boho Sun Wall Art, Minimalist Celestial Line Drawing Poster, Bohemian Home Decor, Housewarming Gift for Her".

2) description (string, ENGLISH, EMOJI-RICH, ~2200–3200 characters, target real shoppers, NOT keyword-stuffed)
   Use this EXACT skeleton. Use the literal long-dash line "⸻" as the section separator. Use real "\\n" newlines inside the JSON string. Pick emojis that fit the actual design theme (don't force unrelated ones). Keep bullet lines short (≤ 70 chars).

   [THEME_EMOJI]✨ [Catchy Product Title – Subject + Product Type + Hook] ✨[THEME_EMOJI]

   [THEME_EMOJI] [One-line tagline / dream statement] [THEME_EMOJI]

   [2–3 sentence hook paragraph: describe the design, who it's for, the vibe it gives. Speak to the buyer in second person ("You'll love…").]

   ⸻

   🎉 WHY YOU'LL LOVE IT:
   ✔️ [Quality benefit] [emoji]
   ✔️ [Comfort / fit / material benefit] [emoji]
   ✔️ [Style / unique design benefit] [emoji]
   ✔️ [Versatility benefit] [emoji]
   ✔️ [Standout angle — limited / trending / handmade-feel] [emoji]

   ⸻

   🎁 PERFECT FOR:
   ✨ [Specific occasion 1]
   ✨ [Specific occasion 2]
   ✨ [Use case / setting]
   ✨ [Photo / event idea]
   ✨ [Lifestyle moment]
   ✨ [Trending search angle buyers actually type]

   ⸻

   📏 SIZE & FIT: (apparel ONLY — for stickers/mugs/posters/wall art replace with "📏 SIZE OPTIONS:" and list sizes / dimensions from the photos)
   Please check the size chart in the listing photos before ordering. For an oversized, trendy look, size up 👌

   ⸻

   🧼 CARE INSTRUCTIONS: (apparel: keep the four lines below; mugs: dishwasher/microwave note; stickers/posters: indoor use, avoid moisture, etc.)
   🧺 Turn inside out before washing
   ❄️ Machine wash cold
   ☀️ Tumble dry low
   🚫🔥 Do not iron directly on the design

   ⸻

   🎁 GREAT GIFT FOR:
   ✔️ [Recipient 1] [emoji]
   ✔️ [Recipient 2] [emoji]
   ✔️ [Recipient 3] [emoji]
   ✔️ [Recipient 4] [emoji]
   ✔️ [Recipient 5] [emoji]

   ⸻

   ⚡ [Urgency / scarcity line tied to a real angle — seasonal trend, limited drop, "be the first to wear it to your party", etc.]

   Add to cart today and [short, warm CTA tied to the theme] 🛒✨

3) tags (string[13], ENGLISH)
   - EXACTLY 13.
   - Each tag ≤ 20 characters.
   - lowercase, multi-word phrases allowed, no punctuation, no emojis.
   - No duplicates or plural-of-singular duplicates.
   - Cover: subject, style, audience, gift occasion, room/use, color/aesthetic, real Etsy search phrases.

4) attributes (object) — the 4 Etsy "Listing details" dropdowns the seller must fill in the Etsy listing form. Pick the SINGLE best value Etsy actually offers, ENGLISH, exactly as it appears in Etsy's dropdown (Title Case). Use null when nothing fits the design (e.g. holiday null for a generic floral shirt).

   - clothingStyle: One of "T-shirt", "Sweatshirt", "Hoodie", "Long Sleeve Shirt", "Tank Top", "Crop Top", "Polo Shirt", "V-Neck Shirt", "Crewneck", "Baby Bodysuit", "Kids T-Shirt". Default to "T-shirt" for adult apparel designs. Use null for non-apparel.
   - occasion: One of "Birthday", "Wedding", "Anniversary", "Baby Shower", "Bridal Shower", "Graduation", "Mother's Day", "Father's Day", "Valentine's Day", "Engagement", "Housewarming", "Retirement", "Bachelorette", "Bachelor Party", "Promotion", "New Job", "Christmas", "Easter", "Thanksgiving", "Halloween", "New Year's Eve", or null.
   - holiday: One of "Christmas", "Halloween", "Thanksgiving", "Valentine's Day", "Easter", "Independence Day", "Mother's Day", "Father's Day", "New Year's Eve", "St. Patrick's Day", "Hanukkah", "Memorial Day", "Veterans Day", or null. Only set when the design is clearly themed around that holiday.
   - graphic: One of "Floral", "Animal", "Quote", "Typography", "Vintage", "Retro", "Boho", "Minimalist", "Abstract", "Geometric", "Botanical", "Patriotic", "Holiday", "Cartoon", "Religious", "Sports", "Music", "Inspirational", "Funny", "Pop Culture", "Nature". Pick the single best match.

Return ONLY a JSON object with keys: title (string), description (string), tags (string[13]), attributes (object with the 4 keys above).`;

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

    const openai = new OpenAI({ apiKey });

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    > = [
      {
        type: "text",
        text: imageUrl
          ? `Analyze this design image and produce Etsy listing JSON for it.${
              designName ? ` Internal reference name (use only as a weak hint): "${designName}".` : ""
            }`
          : `Generate Etsy listing JSON for a design referenced only by name: "${designName}".`,
      },
    ];

    if (imageUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageUrl, detail: "high" },
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 2400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "AI yanıt vermedi." },
        { status: 502 }
      );
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
    let tags: string[] = Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : [];

    tags = Array.from(new Set(tags))
      .filter((t) => t.length <= 20)
      .slice(0, 13);

    while (tags.length < 13) {
      tags.push(`tag${tags.length + 1}`);
    }

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
      data: { title, description, tags, attributes },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
