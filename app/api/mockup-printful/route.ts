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
export const maxDuration = 90;
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// PRINTFUL MOCKUP ENDPOINT
// Body: { productType, colors[], designUrl, mockupStyleIds? }
// Notes:
//   - designUrl MUST be a public https URL (Printful worker fetches it).
//   - For "store" designs from Supabase the public bucket URL works directly.
//   - For AI/upload designs (base64), upload to Supabase first OR use
//     /api/printful-upload (server uploads then returns public URL).
//   - One Printful task can render N variants at once; we batch by color.
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
  placement: string; // "front" | etc.
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
      return NextResponse.json(
        {
          ok: false,
          error: `Hiçbir renk Printful kataloğunda eşleşmedi: ${unresolved.join(
            ", "
          )}`,
        },
        { status: 422 }
      );
    }

    // 2) One task per color so we can attribute mockups back to colors cleanly.
    //    Printful renders fast (~5-15s/task); 7 colors finish well under 90s.
    const rendered: RenderedMockup[] = [];
    const errors: Record<string, string> = {};

    for (const slot of resolved) {
      try {
        const taskId = await createMockupTask({
          catalogProductId: productDef.catalogProductId,
          catalogVariantIds: [slot.variantId],
          designUrl,
          mockupStyleIds: body.mockupStyleIds,
          widthPx: body.widthPx ?? 1000,
          format: "jpg",
        });
        const result = await waitForMockupTask(taskId);
        const groups = result.catalog_variant_mockups || [];
        const flatMockups = result.mockups || [];

        const collect = (mockup: {
          placement: string;
          mockup_url: string;
          style_id?: number;
        }) =>
          rendered.push({
            color: slot.color,
            variantId: slot.variantId,
            printfulColor: slot.printfulColor,
            placement: mockup.placement,
            styleId: mockup.style_id,
            imageUrl: mockup.mockup_url,
          });

        if (groups.length > 0) {
          for (const g of groups) {
            for (const m of g.mockups || []) {
              if (m.mockup_url) collect(m);
            }
          }
        } else if (flatMockups.length > 0) {
          for (const m of flatMockups) {
            if (m.mockup_url) collect(m);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Hata";
        errors[slot.color] = msg;
        console.error(`[mockup-printful] ${slot.color} failed:`, err);
      }
    }

    if (rendered.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Hiçbir Printful mockup üretilemedi.",
          errors,
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
      errors,
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
