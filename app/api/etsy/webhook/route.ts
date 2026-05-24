import { NextResponse } from "next/server";
import {
  fetchListingImagesMap,
  readEtsyEnv,
  receiptToOrderRows,
  type EtsyReceipt,
  type OrderUpsertRow,
} from "@/lib/etsy";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { OrderStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebhookResponse {
  ok: boolean;
  inserted?: number;
  error?: string;
}

/**
 * POST /api/etsy/webhook
 *
 * Accepts two payload shapes:
 *
 * 1) Native Etsy receipt object (you forward it from your own poller / Zapier /
 *    Etsy's notification system). Looks like the receipts.results[i] entries.
 *
 * 2) A manual payload (handy for testing or for non-Etsy integrations):
 *    {
 *      receipt_id: "1234",
 *      order_number?: "#1234",
 *      customer_name?: "...",
 *      customer_country?: "US",
 *      order_date?: "2026-05-24T10:00:00Z",
 *      status?: "paid",
 *      transactions: [
 *        { transaction_id?, title, sku, listing_id?, quantity?, price?, image_url? }
 *      ]
 *    }
 *
 * If `ETSY_WEBHOOK_SECRET` is set, the request must include header
 * `x-webhook-secret: <secret>`.
 */
export async function POST(req: Request) {
  const expected = process.env.ETSY_WEBHOOK_SECRET?.trim();
  if (expected) {
    const got = req.headers.get("x-webhook-secret")?.trim();
    if (got !== expected) {
      return NextResponse.json<WebhookResponse>(
        { ok: false, error: "Invalid webhook secret." },
        { status: 401 }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<WebhookResponse>(
      { ok: false, error: "Body must be JSON." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json<WebhookResponse>(
      { ok: false, error: "Empty or invalid body." },
      { status: 400 }
    );
  }

  const obj = body as Record<string, unknown>;
  let rows: OrderUpsertRow[];

  if ("receipt_id" in obj && Array.isArray(obj.transactions)) {
    rows = await coerceManualPayload(obj);
  } else if ("receipts" in obj && Array.isArray((obj as { receipts: unknown[] }).receipts)) {
    const receipts = (obj as { receipts: EtsyReceipt[] }).receipts;
    rows = await coerceEtsyReceipts(receipts);
  } else if ("created_timestamp" in obj || "transactions" in obj) {
    rows = await coerceEtsyReceipts([obj as unknown as EtsyReceipt]);
  } else {
    return NextResponse.json<WebhookResponse>(
      {
        ok: false,
        error:
          "Unrecognized payload shape. Expected an Etsy receipt, a {receipts: [...]} envelope, or a manual {receipt_id, transactions: [...]} body.",
      },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json<WebhookResponse>({ ok: true, inserted: 0 });
  }

  const supabase = getSupabaseServer();

  const skus = Array.from(
    new Set(rows.map((r) => r.product_sku).filter((s): s is string => !!s))
  );
  let designMap = new Map<string, string>();
  if (skus.length > 0) {
    const { data: designs } = await supabase
      .from("designs")
      .select("id, sku")
      .in("sku", skus);
    designMap = new Map(
      (designs ?? [])
        .filter((d: { sku: string | null }) => !!d.sku)
        .map((d: { id: string; sku: string | null }) => [d.sku as string, d.id])
    );
  }

  const withDesigns = rows.map((r) => ({
    ...r,
    design_id: r.product_sku ? (designMap.get(r.product_sku) ?? null) : null,
  }));

  const { error, count } = await supabase
    .from("orders")
    .upsert(withDesigns, {
      onConflict: "etsy_receipt_id,etsy_transaction_id",
      count: "exact",
    });

  if (error) {
    return NextResponse.json<WebhookResponse>(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json<WebhookResponse>({
    ok: true,
    inserted: count ?? withDesigns.length,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "Etsy webhook endpoint. POST a receipt payload here.",
  });
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

async function coerceEtsyReceipts(
  receipts: EtsyReceipt[]
): Promise<OrderUpsertRow[]> {
  const env = readEtsyEnv();
  let imageMap = new Map<number, string>();
  if (!("error" in env)) {
    const ids = receipts.flatMap(
      (r) => r.transactions?.map((t) => t.listing_id).filter(Boolean) ?? []
    );
    try {
      imageMap = await fetchListingImagesMap(env, ids);
    } catch {
      // Swallow — fall through with no images
    }
  }
  return receipts.flatMap((r) => receiptToOrderRows(r, imageMap));
}

interface ManualTransaction {
  transaction_id?: string | number;
  title?: string;
  sku?: string;
  listing_id?: string | number;
  quantity?: number;
  price?: number;
  image_url?: string;
}

async function coerceManualPayload(
  body: Record<string, unknown>
): Promise<OrderUpsertRow[]> {
  const receiptId = String(body.receipt_id ?? "");
  if (!receiptId) return [];

  const transactions = Array.isArray(body.transactions)
    ? (body.transactions as ManualTransaction[])
    : [];

  const statusVal = (body.status as string | undefined) ?? "paid";
  const allowed: OrderStatus[] = [
    "paid",
    "processing",
    "shipped",
    "completed",
    "canceled",
    "refunded",
  ];
  const status: OrderStatus = allowed.includes(statusVal as OrderStatus)
    ? (statusVal as OrderStatus)
    : "paid";

  const orderNumber =
    (body.order_number as string | undefined) ?? `#${receiptId}`;
  const orderDate =
    (body.order_date as string | undefined) ?? new Date().toISOString();

  return transactions.map((tx) => ({
    etsy_receipt_id: receiptId,
    etsy_transaction_id: tx.transaction_id ? String(tx.transaction_id) : null,
    order_number: orderNumber,
    customer_name: (body.customer_name as string | undefined) ?? null,
    customer_country: (body.customer_country as string | undefined) ?? null,
    order_date: orderDate,
    status,
    product_title: tx.title ?? null,
    product_sku: tx.sku?.trim() || null,
    product_image_url: tx.image_url ?? null,
    listing_id: tx.listing_id ? String(tx.listing_id) : null,
    quantity: tx.quantity ?? 1,
    total_price:
      typeof tx.price === "number" && Number.isFinite(tx.price)
        ? tx.price
        : null,
    currency: (body.currency as string | undefined) ?? "USD",
    raw_payload: body,
  }));
}
