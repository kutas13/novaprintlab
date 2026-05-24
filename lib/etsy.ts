// Server-side Etsy API v3 client.
// Used by /api/etsy/sync and /api/etsy/webhook on the server only.
// NEVER import this from a client component.

import { resolveEtsyAuth, type ResolvedAuth } from "./etsy-auth";
import type { OrderStatus } from "./types";

const ETSY_BASE = "https://openapi.etsy.com/v3/application";

export interface EtsyEnv {
  apiKey: string;
  shopId: string;
  accessToken: string;
}

/** Preferred resolver — checks the OAuth-stored credentials first, then falls
 *  back to legacy env vars, and auto-refreshes expired access tokens. */
export async function getEtsyAuth(): Promise<
  ResolvedAuth | { error: string; setupRequired?: boolean }
> {
  return resolveEtsyAuth();
}

export interface EtsyMoney {
  amount: number;
  divisor: number;
  currency_code: string;
}

export interface EtsyTransaction {
  transaction_id: number;
  receipt_id?: number;
  listing_id: number;
  title: string;
  sku?: string | null;
  quantity: number;
  price?: EtsyMoney;
}

export interface EtsyReceipt {
  receipt_id: number;
  name?: string | null;
  country_iso?: string | null;
  buyer_email?: string | null;
  created_timestamp: number;
  updated_timestamp?: number;
  status?: string;
  is_paid?: boolean;
  is_shipped?: boolean;
  grandtotal?: EtsyMoney;
  transactions?: EtsyTransaction[];
}

export interface EtsyListingImage {
  listing_image_id: number;
  url_75x75?: string;
  url_170x135?: string;
  url_570xN?: string;
  url_fullxfull?: string;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

export function moneyToNumber(m?: EtsyMoney): number | undefined {
  if (!m) return undefined;
  const div = m.divisor || 100;
  const n = m.amount / div;
  return Number.isFinite(n) ? n : undefined;
}

export function unixToIso(timestamp?: number): string | undefined {
  if (!timestamp) return undefined;
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Map an Etsy receipt to our internal order status union.
 * Etsy's "status" is loosely documented; we combine flags with the string field.
 */
export function mapEtsyStatus(receipt: EtsyReceipt): OrderStatus {
  const raw = (receipt.status || "").toLowerCase();
  if (raw.includes("cancel")) return "canceled";
  if (raw.includes("refund")) return "refunded";
  if (raw.includes("complete")) return "completed";
  if (receipt.is_shipped) return "shipped";
  if (receipt.is_paid) return "paid";
  if (raw.includes("processing") || raw.includes("open")) return "processing";
  return "paid";
}

// ------------------------------------------------------------
// HTTP
// ------------------------------------------------------------

async function etsyFetch<T>(
  env: EtsyEnv,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${ETSY_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "x-api-key": env.apiKey,
      Authorization: `Bearer ${env.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Etsy API ${res.status} ${res.statusText}: ${text || "(no body)"}`
    );
  }
  return (await res.json()) as T;
}

export async function fetchReceipts(
  env: EtsyEnv,
  opts: { limit?: number; offset?: number; minCreated?: number } = {}
): Promise<{ count: number; results: EtsyReceipt[] }> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  params.set("offset", String(opts.offset ?? 0));
  if (opts.minCreated) params.set("min_created", String(opts.minCreated));

  return etsyFetch<{ count: number; results: EtsyReceipt[] }>(
    env,
    `/shops/${env.shopId}/receipts?${params.toString()}`
  );
}

export async function fetchListingImage(
  env: EtsyEnv,
  listingId: number
): Promise<string | undefined> {
  try {
    const json = await etsyFetch<{ results: EtsyListingImage[] }>(
      env,
      `/listings/${listingId}/images`
    );
    const first = json.results?.[0];
    if (!first) return undefined;
    return (
      first.url_570xN ||
      first.url_fullxfull ||
      first.url_170x135 ||
      first.url_75x75
    );
  } catch (e) {
    console.warn(`[etsy] listing ${listingId} image fetch failed:`, e);
    return undefined;
  }
}

/**
 * For a list of unique listing ids, fetch their first image URLs in parallel
 * with a small concurrency cap (Etsy rate-limits aggressively).
 */
export async function fetchListingImagesMap(
  env: EtsyEnv,
  listingIds: number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const unique = Array.from(new Set(listingIds.filter(Boolean)));
  const CONCURRENCY = 4;

  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const idx = cursor++;
      const id = unique[idx];
      const url = await fetchListingImage(env, id);
      if (url) out.set(id, url);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return out;
}

// ------------------------------------------------------------
// Receipt → DB row(s)
// ------------------------------------------------------------

export interface OrderUpsertRow {
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
  total_price: number | null;
  currency: string | null;
  raw_payload: unknown;
}

export function receiptToOrderRows(
  receipt: EtsyReceipt,
  imageMap: Map<number, string>
): OrderUpsertRow[] {
  const status = mapEtsyStatus(receipt);
  const orderDate = unixToIso(receipt.created_timestamp) ?? null;
  const customer = receipt.name?.trim() || null;
  const country = receipt.country_iso?.trim() || null;
  const orderNumber = `#${receipt.receipt_id}`;

  const txs = receipt.transactions ?? [];
  if (txs.length === 0) {
    // Receipt with no transaction data — still record as one row
    const total = moneyToNumber(receipt.grandtotal) ?? null;
    return [
      {
        etsy_receipt_id: String(receipt.receipt_id),
        etsy_transaction_id: null,
        order_number: orderNumber,
        customer_name: customer,
        customer_country: country,
        order_date: orderDate,
        status,
        product_title: null,
        product_sku: null,
        product_image_url: null,
        listing_id: null,
        quantity: 1,
        total_price: total,
        currency: receipt.grandtotal?.currency_code ?? "USD",
        raw_payload: receipt,
      },
    ];
  }

  return txs.map((tx) => {
    const linePrice = moneyToNumber(tx.price);
    return {
      etsy_receipt_id: String(receipt.receipt_id),
      etsy_transaction_id: String(tx.transaction_id),
      order_number: orderNumber,
      customer_name: customer,
      customer_country: country,
      order_date: orderDate,
      status,
      product_title: tx.title || null,
      product_sku: tx.sku?.trim() || null,
      product_image_url: imageMap.get(tx.listing_id) ?? null,
      listing_id: tx.listing_id ? String(tx.listing_id) : null,
      quantity: tx.quantity || 1,
      total_price:
        typeof linePrice === "number" && Number.isFinite(linePrice)
          ? linePrice * (tx.quantity || 1)
          : null,
      currency:
        tx.price?.currency_code ?? receipt.grandtotal?.currency_code ?? "USD",
      raw_payload: { receipt_id: receipt.receipt_id, transaction: tx },
    };
  });
}
