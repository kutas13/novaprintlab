import { NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are an elite Etsy SEO copywriter specializing in print-on-demand listings (wall art, t-shirts, stickers, mugs, posters, tote bags, etc.). You will be shown the actual design image. Your job is to analyze the visual content and write listing copy that ranks high on Etsy search and converts buyers.

ANALYZE the image first:
- What is the subject/illustration? (animal, person, quote, abstract, floral, retro, minimalist, etc.)
- What is the art style? (line art, watercolor, vintage, boho, y2k, kawaii, dark academia, cottagecore, etc.)
- What is the dominant color palette / mood?
- Who is the target buyer? (women, men, kids, gift-givers, plant moms, dog moms, gamers, etc.)
- What occasions / use cases fit? (Christmas gift, mother's day, birthday, baby shower, wedding, anniversary, housewarming, valentine, halloween, etc.)
- What product types would this design sell well on? (shirt, mug, sticker, poster, sweatshirt, tote, etc.)

OUTPUT RULES (strict JSON, no markdown, no commentary):
- title: ENGLISH, max 140 characters. Front-load the strongest keyword. No ALL CAPS, no emojis. Format: "[Subject + Style] [Product Type] | [Occasion/Audience] [Modifier], [Gift Keyword]". Example: "Boho Sun Wall Art, Minimalist Celestial Line Drawing Poster, Bohemian Home Decor, Housewarming Gift for Her".
- description: ENGLISH, 3–5 short paragraphs separated by blank lines. Friendly-professional tone. Include:
  (1) Hook describing the design and who it's perfect for.
  (2) Product details / why they'll love it.
  (3) Gift / use-case angles (3–4 occasions).
  (4) Quality + shipping reassurance (high-quality print, fast shipping, satisfaction guarantee).
  (5) Soft CTA ("Add to cart today" / "Order yours now").
- tags: EXACTLY 13 ENGLISH tags. Each tag ≤ 20 characters, lowercase, multi-word allowed, no punctuation, no duplicates, no plural-of-singular duplicates. Cover: subject, style, audience, gift occasion, room/use, color/aesthetic, related searches buyers actually type on Etsy.

Return JSON with keys: title (string), description (string), tags (string[13]).`;

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
      temperature: 0.75,
      max_tokens: 1200,
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

    let parsed: { title?: string; description?: string; tags?: string[] };
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

    return NextResponse.json({
      ok: true,
      data: { title, description, tags },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
