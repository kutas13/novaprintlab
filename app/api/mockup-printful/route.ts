import { NextResponse } from "next/server";
import {
  createMockupTask,
  listCatalogVariants,
  waitForMockupTask,
  PrintfulError,
} from "@/lib/printful";
import {
  PRINTFUL_PRODUCTS,
  COLOR_ALIASES,
  resolveColorVariant,
  type ProductType,
  type ColorId,
} from "@/lib/printful-products";

export const runtime = "nodejs";
// Vercel Hobby plan caps at 60s. Pro lets us go to 300s but we should plan
// for the cheapest tier. Printful renders a batch (≤7 variants in one task)
// in ~10-25 seconds total so 60s is plenty.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// PRINTFUL MOCKUP ENDPOINT
// Body: { productType, colors[], designUrl, mockupStyleIds?, widthPx? }
//
// Pipeline:
//   1. Pull catalog variants once for the product.
//   2. Resolve each requested UI color → real variant_id (alias matching).
//   3. Submit ONE mockup task with all resolved variant_ids → single
//      Printful render job → results returned together (much cheaper on
//      function time than one task per color).
//   4. Poll until completed, map per-variant mockups into a flat list, and
//      group them back by UI color for the frontend.
// ────────────────────────────────────────────────────────────────────────────

interface RequestBody {
  productType?: ProductType;
  colors?: ColorId[];
  designUrl?: string;
  mockupStyleIds?: number[];
  widthPx?: number;
}

interface RenderedMockup {
  color: ColorId;
  variantId: number;
  printfulColor: string;
  placement: string;
  styleId?: number;
  imageUrl: string;
}

export async function POST(req: Request) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const productType = (body.productType || "Tişört") as ProductType;
    const productDef = PRINTFUL_PRODUCTS[productType];
    if (!productDef) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz ürün tipi." },
        { status: 400 }
      );
    }

    const colors = (body.colors || []) as ColorId[];
    const validColors = colors.filter((c) => COLOR_ALIASES[c]);
    if (validColors.length === 0) {
      return NextResponse.json(
        { ok: false, error: "En az 1 geçerli renk seç." },
        { status: 400 }
      );
    }

    const designUrl = (body.designUrl || "").trim();
    if (!/^https?:\/\//i.test(designUrl)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "designUrl public HTTPS olmalı. AI/upload tasarımları önce /api/printful-upload üzerinden Supabase'e yükle.",
        },
        { status: 400 }
      );
    }

    // 1) Pull catalog variants once for this product → resolve UI colors.
    const variants = await listCatalogVariants(productDef.catalogProductId);
    if (!variants.length) {
      return NextResponse.json(
        { ok: false, error: "Printful katalog variantları boş döndü." },
        { status: 502 }
      );
    }

    const resolved: Array<{
      color: ColorId;
      variantId: number;
      printfulColor: string;
    }> = [];
    const unresolved: ColorId[] = [];

    for (const color of validColors) {
      const hit = resolveColorVariant(variants, color);
      if (hit) {
        resolved.push({
          color,
          variantId: hit.id,
          printfulColor: hit.printfulColor,
        });
      } else {
        unresolved.push(color);
      }
    }

    if (resolved.length === 0) {
      // Pull a sample of available colors to help the user figure out the
      // mismatch and update their selection (e.g. "Mocha" isn't a real BC
      // 3001 color, "Heather Dust" is).
      const sampleColors = Array.from(
        new Set(variants.map((v) => v.color).filter(Boolean))
      ).slice(0, 16);
      return NextResponse.json(
        {
          ok: false,
          error: `Renkler Printful kataloğunda eşleşmedi: ${unresolved.join(
            ", "
          )}. Mevcut renk örnekleri: ${sampleColors.join(", ")}`,
          unresolved,
          availableColorsSample: sampleColors,
        },
        { status: 422 }
      );
    }

    // 2) Single batched task — all variants rendered in one Printful job.
    const variantIdToColor = new Map<number, ColorId>();
    const variantIdToPrintfulColor = new Map<number, string>();
    for (const r of resolved) {
      variantIdToColor.set(r.variantId, r.color);
      variantIdToPrintfulColor.set(r.variantId, r.printfulColor);
    }

    let taskId: number;
    try {
      taskId = await createMockupTask({
        catalogProductId: productDef.catalogProductId,
        catalogVariantIds: resolved.map((r) => r.variantId),
        designUrl,
        mockupStyleIds: body.mockupStyleIds,
        widthPx: body.widthPx ?? 1000,
        format: "jpg",
      });
    } catch (err) {
      if (err instanceof PrintfulError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Printful task açılamadı: ${err.message}`,
            status: err.status,
            body: err.body,
            debug: {
              productId: productDef.catalogProductId,
              variantIds: resolved.map((r) => r.variantId),
            },
          },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
        );
      }
      throw err;
    }

    let result: Awaited<ReturnType<typeof waitForMockupTask>>;
    try {
      result = await waitForMockupTask(taskId, { totalTimeoutMs: 50_000 });
    } catch (err) {
      if (err instanceof PrintfulError) {
        return NextResponse.json(
          {
            ok: false,
            error: err.message,
            status: err.status,
            taskId,
            body: err.body,
          },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
        );
      }
      throw err;
    }

    const rendered: RenderedMockup[] = [];
    const groups = result.catalog_variant_mockups || [];

    for (const g of groups) {
      const color = variantIdToColor.get(g.catalog_variant_id);
      const printfulColor =
        variantIdToPrintfulColor.get(g.catalog_variant_id) || "";
      if (!color) continue;
      for (const m of g.mockups || []) {
        if (!m.mockup_url) continue;
        rendered.push({
          color,
          variantId: g.catalog_variant_id,
          printfulColor,
          placement: m.placement || "front",
          styleId: m.style_id,
          imageUrl: m.mockup_url,
        });
      }
    }

    // v2 sometimes returns a flat top-level `mockups` array too
    if (rendered.length === 0 && Array.isArray(result.mockups)) {
      for (const m of result.mockups) {
        const v = m.variant_ids?.[0];
        if (typeof v !== "number") continue;
        const color = variantIdToColor.get(v);
        const printfulColor = variantIdToPrintfulColor.get(v) || "";
        if (!color || !m.mockup_url) continue;
        rendered.push({
          color,
          variantId: v,
          printfulColor,
          placement: m.placement || "front",
          styleId: m.style_id,
          imageUrl: m.mockup_url,
        });
      }
    }

    if (rendered.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Printful task tamamlandı ama hiçbir mockup_url dönmedi. Bu genellikle tasarım URL'inin Printful tarafından indirilemediği anlamına gelir (Supabase bucket'ın 'design-images' public olmalı veya signed URL kullanılmalı).",
          taskId,
          debug: {
            productId: productDef.catalogProductId,
            resolvedColors: resolved,
            failureReasons: result.failure_reasons || [],
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      productType,
      brandModel: productDef.brandModel,
      details: productDef.details,
      mockups: rendered,
      unresolved,
    });
  } catch (err) {
    if (err instanceof PrintfulError) {
      return NextResponse.json(
        { ok: false, error: err.message, status: err.status, body: err.body },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Bilinmeyen sunucu hatası.";
    console.error("[mockup-printful] fatal:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
