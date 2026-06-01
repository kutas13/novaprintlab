export type DesignStatus =
  | "SEO Bekliyor"
  | "Mockup ve Yayınlama Bekliyor"
  | "Taslak"
  | "Aktif Mağaza";

/** Etsy listing attribute fields (the 4 dropdowns Etsy shows under
 * "Listeleme özellikleri" for apparel): Giyim tarzı, Vekalet (Occasion),
 * Tatil, Grafik. The AI fills these in based on the design image so the
 * partner just has to copy them into Etsy. */
export interface EtsyAttributes {
  clothingStyle?: string;
  occasion?: string;
  holiday?: string;
  graphic?: string;
}

export interface SeoData {
  title: string;
  description: string;
  tags: string[];
  attributes?: EtsyAttributes;
}

export interface PricingData {
  printifyCost: number;
  shippingCost: number;
  targetProfit: number;
  finalPrice: number | null;
}

export interface MockupAsset {
  path: string;
  url: string;
}

/** Application-level shape (used across UI). */
export interface Design {
  id: string;
  name: string;
  sku?: string;
  status: DesignStatus;
  createdAt: string;
  publishedAt?: string;
  originalImagePath: string;
  originalImageUrl: string;
  mockups: MockupAsset[];
  seo?: SeoData;
  pricing?: PricingData;
  /** Accumulated OpenAI cost for design + mockup generation (USD). */
  aiCostUsd: number;
}

/** Row exactly as it lives in Supabase. */
export interface DesignRow {
  id: string;
  name: string;
  sku: string | null;
  status: DesignStatus;
  original_image_path: string;
  mockup_image_paths: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_tags: string[] | null;
  seo_attributes: EtsyAttributes | null;
  pricing_printify_cost: string | number | null;
  pricing_shipping_cost: string | number | null;
  pricing_target_profit: string | number | null;
  pricing_final_price: string | number | null;
  ai_cost_usd?: string | number | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

// ============================================================
// Orders (Etsy)
// ============================================================
export type OrderStatus =
  | "paid"
  | "processing"
  | "shipped"
  | "completed"
  | "canceled"
  | "refunded";

export interface Order {
  id: string;
  etsyReceiptId: string;
  etsyTransactionId?: string;
  orderNumber?: string;
  customerName?: string;
  customerCountry?: string;
  orderDate?: string;
  status: OrderStatus;
  productTitle?: string;
  productSku?: string;
  productImageUrl?: string;
  listingId?: string;
  quantity: number;
  totalPrice?: number;
  currency: string;
  designId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderRow {
  id: string;
  etsy_receipt_id: string;
  etsy_transaction_id: string | null;
  order_number: string | null;
  customer_name: string | null;
  customer_country: string | null;
  order_date: string | null;
  status: OrderStatus;
  product_title: string | null;
  product_sku: string | null;
  product_image_url: string | null;
  listing_id: string | null;
  quantity: number;
  total_price: string | number | null;
  currency: string | null;
  raw_payload: unknown;
  design_id: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToOrder(row: OrderRow): Order {
  const totalRaw = row.total_price;
  const totalNum =
    totalRaw === null || totalRaw === undefined
      ? undefined
      : typeof totalRaw === "string"
        ? parseFloat(totalRaw)
        : totalRaw;
  return {
    id: row.id,
    etsyReceiptId: row.etsy_receipt_id,
    etsyTransactionId: row.etsy_transaction_id ?? undefined,
    orderNumber: row.order_number ?? undefined,
    customerName: row.customer_name ?? undefined,
    customerCountry: row.customer_country ?? undefined,
    orderDate: row.order_date ?? undefined,
    status: row.status,
    productTitle: row.product_title ?? undefined,
    productSku: row.product_sku ?? undefined,
    productImageUrl: row.product_image_url ?? undefined,
    listingId: row.listing_id ?? undefined,
    quantity: row.quantity ?? 1,
    totalPrice: Number.isFinite(totalNum) ? (totalNum as number) : undefined,
    currency: row.currency ?? "USD",
    designId: row.design_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// Expenses (Giderler)
// ============================================================
export type ExpenseOwner = "Yusuf" | "Kerim" | "Taha";
export type ExpenseCurrency = "USD" | "TRY";

export interface Expense {
  id: string;
  name: string;
  amount: number;
  currency: ExpenseCurrency;
  isSubscription: boolean;
  /** Day-of-month the subscription is charged (1-31). undefined for one-time. */
  subscriptionDay?: number;
  cardLast4?: string;
  cardOwner: ExpenseOwner;
  /** YYYY-MM-DD. For subscriptions this is the start date. */
  expenseDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRow {
  id: string;
  name: string;
  amount: string | number;
  currency: ExpenseCurrency;
  is_subscription: boolean;
  subscription_day: number | null;
  card_last4: string | null;
  card_owner: ExpenseOwner;
  expense_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    name: row.name,
    amount:
      typeof row.amount === "string" ? parseFloat(row.amount) : row.amount,
    currency: row.currency,
    isSubscription: row.is_subscription,
    subscriptionDay: row.subscription_day ?? undefined,
    cardLast4: row.card_last4 ?? undefined,
    cardOwner: row.card_owner,
    expenseDate: row.expense_date,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToDesign(
  row: DesignRow,
  publicUrl: (p: string | null | undefined) => string
): Design {
  const attrs = row.seo_attributes ?? undefined;
  const hasAttrs =
    attrs &&
    (attrs.clothingStyle || attrs.occasion || attrs.holiday || attrs.graphic);
  const seo: SeoData | undefined =
    row.seo_title ||
    row.seo_description ||
    (row.seo_tags && row.seo_tags.length) ||
    hasAttrs
      ? {
          title: row.seo_title ?? "",
          description: row.seo_description ?? "",
          tags: row.seo_tags ?? [],
          attributes: hasAttrs ? attrs : undefined,
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

  const mockupPaths = row.mockup_image_paths ?? [];
  const mockups: MockupAsset[] = mockupPaths
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((path) => ({ path, url: publicUrl(path) }));

  return {
    id: row.id,
    name: row.name,
    sku: row.sku ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at ?? undefined,
    originalImagePath: row.original_image_path,
    originalImageUrl: publicUrl(row.original_image_path),
    mockups,
    seo,
    pricing,
    aiCostUsd: num(row.ai_cost_usd) ?? 0,
  };
}
