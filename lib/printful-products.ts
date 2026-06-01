// ────────────────────────────────────────────────────────────────────────────
// NOVAPRINTLAB — PRINTFUL PRODUCT MAP
//
// Maps our UI product types ("Tişört" / "Hoodie" / "Sweatshirt") and color
// names ("Siyah", "Beyaz", ...) onto Printful catalog product + variant IDs.
//
// Strategy:
//   • Each product points to a `catalogProductId` (the blank product).
//   • Color matching is fuzzy: we keep a list of Printful color labels that
//     correspond to each of our UI colors. At runtime we call
//     `listCatalogVariants(productId)` once, then resolve each UI color to a
//     real variant_id by picking the first variant whose `color` matches one
//     of the aliases AND whose size is the default fallback (M).
//
// The numeric IDs below are documented Printful v2 catalog IDs and are
// expected to be stable. If a product is missing (e.g. Gildan 5000 isn't in
// Printful's catalog) we fall back to the closest standard POD blank.
// ────────────────────────────────────────────────────────────────────────────

export type ProductType = "Tişört" | "Hoodie" | "Sweatshirt";

export interface PrintfulProductDef {
  catalogProductId: number;
  /** Human-friendly Printful brand+model for the UI hint card. */
  brandModel: string;
  /** Notes shown next to the model name in the studio. */
  details: string;
}

// Bella+Canvas 3001 (#71) is the de-facto POD unisex tee on Printful — Gildan
// 5000 is not in Printful's standard catalog. The fit/feel is close enough
// and partner support is best on this SKU.
//
// Gildan 18500 (#146) — heavy-blend pullover hoodie.
// Gildan 18000 (#91)  — heavy-blend crewneck sweatshirt.
export const PRINTFUL_PRODUCTS: Record<ProductType, PrintfulProductDef> = {
  "Tişört": {
    catalogProductId: 71,
    brandModel: "Bella+Canvas 3001 — Unisex Jersey",
    details:
      "Hafif/midweight, klasik unisex kesim. (Printful kataloğunda Gildan 5000 yok; 3001 en yakın POD eşdeğeri.)",
  },
  Hoodie: {
    catalogProductId: 146,
    brandModel: "Gildan 18500 — Heavy Blend Hoodie",
    details:
      "Klasik pullover, kanguru cebi, drawstring kapüşon. 50/50 cotton-poly.",
  },
  Sweatshirt: {
    catalogProductId: 91,
    brandModel: "Gildan 18000 — Heavy Blend Crewneck",
    details: "Klasik crew yaka, ribbed cuff & hem. 50/50 cotton-poly.",
  },
};

// Our UI colors → list of Printful "color" field aliases to try.
// Printful's color naming varies between products (e.g. "Athletic Heather"
// vs "Sport Grey"), so each UI color carries multiple potential matches.
// Resolved at runtime against listCatalogVariants().
export type ColorId =
  | "Siyah"
  | "Beyaz"
  | "Gri"
  | "Lacivert"
  | "Kırmızı"
  | "Yeşil"
  | "Bej";

// Aliases are ordered from "most preferred" → "fallback". The resolver tries
// each alias in turn, first as an exact size-M match, then case-insensitive
// contains, then any-size exact. Bella+Canvas 3001 has ~80 colors; Gildan
// hoodie/sweat have ~25. We list a wide pool so any one of the products has
// at least one viable match.
export const COLOR_ALIASES: Record<ColorId, string[]> = {
  Siyah: ["Black", "True Black", "Black Heather"],
  Beyaz: ["White", "Vintage White", "Off White"],
  Gri: [
    "Athletic Heather",
    "Sport Grey",
    "Heather Gray",
    "Heather Grey",
    "Heather",
    "Solid Athletic Heather",
    "Dark Heather Grey",
    "Charcoal",
  ],
  Lacivert: ["Navy", "True Navy", "Heather Navy", "Solid Navy"],
  "Kırmızı": ["Red", "True Red", "Cardinal Red", "Cardinal", "Heather Red"],
  "Yeşil": [
    "Forest",
    "Forest Green",
    "Heather Forest",
    "Olive",
    "Military Green",
    "Army",
  ],
  Bej: [
    "Sand",
    "Soft Cream",
    "Natural",
    "Heather Dust",
    "Tan",
    "Vintage Sand",
  ],
};

/** Default size we render the mockup at — variants always have an M usually. */
export const DEFAULT_SIZE = "M";

/**
 * Pick the best matching variant for a given UI color. Returns null if
 * nothing in the catalog matches — caller should surface a friendly error.
 */
export function resolveColorVariant(
  variants: Array<{ id: number; size: string; color: string }>,
  uiColor: ColorId
): { id: number; printfulColor: string } | null {
  const aliases = COLOR_ALIASES[uiColor];
  const sizeMatch = (v: { size: string }) =>
    v.size?.toUpperCase() === DEFAULT_SIZE;
  // Pass 1: exact alias match on the M size.
  for (const alias of aliases) {
    const hit = variants.find(
      (v) => v.color === alias && sizeMatch(v)
    );
    if (hit) return { id: hit.id, printfulColor: hit.color };
  }
  // Pass 2: case-insensitive contains match on M.
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    const hit = variants.find(
      (v) => v.color?.toLowerCase().includes(a) && sizeMatch(v)
    );
    if (hit) return { id: hit.id, printfulColor: hit.color };
  }
  // Pass 3: any size, exact alias.
  for (const alias of aliases) {
    const hit = variants.find((v) => v.color === alias);
    if (hit) return { id: hit.id, printfulColor: hit.color };
  }
  return null;
}
