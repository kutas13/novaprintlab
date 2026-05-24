export type DesignStatus =
  | "SEO Bekliyor"
  | "Mockup ve Yayınlama Bekliyor"
  | "Aktif Mağaza";

export interface SeoData {
  title: string;
  description: string;
  tags: string[];
}

export interface PricingData {
  printifyCost: number;
  shippingCost: number;
  targetProfit: number;
  finalPrice: number | null;
}

/** Application-level shape (used across UI). */
export interface Design {
  id: string;
  name: string;
  status: DesignStatus;
  createdAt: string;
  publishedAt?: string;
  originalImagePath: string;
  mockupImagePath?: string;
  originalImageUrl: string;
  mockupImageUrl?: string;
  seo?: SeoData;
  pricing?: PricingData;
}

/** Row exactly as it lives in Supabase. */
export interface DesignRow {
  id: string;
  name: string;
  status: DesignStatus;
  original_image_path: string;
  mockup_image_path: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_tags: string[] | null;
  pricing_printify_cost: string | number | null;
  pricing_shipping_cost: string | number | null;
  pricing_target_profit: string | number | null;
  pricing_final_price: string | number | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function rowToDesign(
  row: DesignRow,
  publicUrl: (p: string | null | undefined) => string
): Design {
  const seo: SeoData | undefined =
    row.seo_title || row.seo_description || (row.seo_tags && row.seo_tags.length)
      ? {
          title: row.seo_title ?? "",
          description: row.seo_description ?? "",
          tags: row.seo_tags ?? [],
        }
      : undefined;

  const finalPrice = num(row.pricing_final_price);
  const pricing: PricingData | undefined =
    finalPrice !== null ||
    row.pricing_printify_cost !== null ||
    row.pricing_shipping_cost !== null ||
    row.pricing_target_profit !== null
      ? {
          printifyCost: num(row.pricing_printify_cost) ?? 0,
          shippingCost: num(row.pricing_shipping_cost) ?? 0,
          targetProfit: num(row.pricing_target_profit) ?? 10,
          finalPrice,
        }
      : undefined;

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at ?? undefined,
    originalImagePath: row.original_image_path,
    mockupImagePath: row.mockup_image_path ?? undefined,
    originalImageUrl: publicUrl(row.original_image_path),
    mockupImageUrl: row.mockup_image_path ? publicUrl(row.mockup_image_path) : undefined,
    seo,
    pricing,
  };
}
