import { NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are an expert Etsy SEO specialist for a print-on-demand store. Given a raw design name, you write listing copy that ranks on Etsy and converts buyers.

Rules:
- Output STRICT JSON only — no markdown, no commentary.
- title: English, MAX 140 characters, keyword-front-loaded, no ALL CAPS, no emojis.
- description: 3–5 short paragraphs, English, friendly-professional, includes use cases (gift, room decor, t-shirt, sticker, etc.), shipping/quality reassurance, and a soft call-to-action.
- tags: EXACTLY 13 unique English tags, each <= 20 characters, lowercase, multi-word allowed (e.g. "boho wall art"), no punctuation, no duplicates, no plural-of-itself duplicates.
- Tags must cover: subject, style, audience, gift occasion, room/use, color/aesthetic, related searches.

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

    const { designName } = await req.json();
    if (typeof designName !== "string" || !designName.trim()) {
      return NextResponse.json(
        { ok: false, error: "designName gerekli." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Design name: "${designName}"\n\nGenerate the listing JSON now.`,
        },
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
