import { NextResponse } from "next/server";
import {
  listCatalogProducts,
  listCatalogVariants,
  PrintfulError,
} from "@/lib/printful";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// PRINTFUL CATALOG DEBUG ENDPOINT
//   GET /api/printful-catalog                      → first 50 products
//   GET /api/printful-catalog?search=Bella+Canvas  → search by name
//   GET /api/printful-catalog?product=71           → variants for product 71
//
// Used to verify the Printful token and look up real product/variant IDs
// before wiring them into the product map.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const product = searchParams.get("product");
    const search = searchParams.get("search") || undefined;

    if (product) {
      const productId = Number(product);
      if (!Number.isInteger(productId)) {
        return NextResponse.json(
          { ok: false, error: "product geçerli bir integer olmalı." },
          { status: 400 }
        );
      }
      const variants = await listCatalogVariants(productId);
      return NextResponse.json({
        ok: true,
        productId,
        variantCount: variants.length,
        // Show only one row per color (size=M preferred) so the response is
        // readable in the browser.
        colors: dedupColors(variants),
        variants,
      });
    }

    const products = await listCatalogProducts({ search, limit: 50 });
    return NextResponse.json({
      ok: true,
      count: products.length,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        model: p.model,
        type: p.type,
        image: p.image,
      })),
    });
  } catch (err) {
    if (err instanceof PrintfulError) {
      return NextResponse.json(
        { ok: false, error: err.message, status: err.status, body: err.body },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function dedupColors(
  variants: Array<{ id: number; color: string; size: string; color_code?: string }>
) {
  const map = new Map<
    string,
    { id: number; color: string; color_code?: string }
  >();
  // Prefer size M when grouping by color so the picked variant_id is
  // representative.
  const sorted = [...variants].sort((a, b) => {
    const aScore = a.size?.toUpperCase() === "M" ? 0 : 1;
    const bScore = b.size?.toUpperCase() === "M" ? 0 : 1;
    return aScore - bScore;
  });
  for (const v of sorted) {
    if (!map.has(v.color)) {
      map.set(v.color, {
        id: v.id,
        color: v.color,
        color_code: v.color_code,
      });
    }
  }
  return Array.from(map.values());
}
