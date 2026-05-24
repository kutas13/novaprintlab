import { NextResponse } from "next/server";
import {
  fetchListingImagesMap,
  fetchReceipts,
  readEtsyEnv,
  receiptToOrderRows,
  type OrderUpsertRow,
} from "@/lib/etsy";
import { getSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SyncResponse {
  ok: boolean;
  inserted?: number;
  total?: number;
  error?: string;
  setupRequired?: boolean;
}

async function runSync(limitParam: number | null) {
  const env = readEtsyEnv();
  if ("error" in env) {
    return NextResponse.json<SyncResponse>(
      { ok: false, error: env.error, setupRequired: true },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(limitParam ?? 50, 1), 100);

  let receipts;
  try {
    receipts = await fetchReceipts(env, { limit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Etsy fetch failed";
    return NextResponse.json<SyncResponse>(
      { ok: false, error: message },
      { status: 502 }
    );
  }

  const allListingIds = receipts.results.flatMap(
    (r) => r.transactions?.map((t) => t.listing_id).filter(Boolean) ?? []
  );

  let imageMap = new Map<number, string>();
  try {
    imageMap = await fetchListingImagesMap(env, allListingIds);
  } catch (err) {
    console.warn("[etsy/sync] image map failed (continuing):", err);
  }

  const rows: OrderUpsertRow[] = receipts.results.flatMap((r) =>
    receiptToOrderRows(r, imageMap)
  );

  if (rows.length === 0) {
    return NextResponse.json<SyncResponse>({ ok: true, inserted: 0, total: 0 });
  }

  const supabase = getSupabaseServer();

  // Resolve SKU -> design_id so the Orders page can offer instant download.
  const skus = Array.from(
    new Set(rows.map((r) => r.product_sku).filter((s): s is string => !!s))
  );
  let designMap = new Map<string, string>();
  if (skus.length > 0) {
    const { data: designs, error: designErr } = await supabase
      .from("designs")
      .select("id, sku")
      .in("sku", skus);
    if (designErr) {
      console.warn("[etsy/sync] design lookup failed:", designErr);
    } else {
      designMap = new Map(
        (designs ?? [])
          .filter((d: { sku: string | null }) => !!d.sku)
          .map((d: { id: string; sku: string | null }) => [d.sku as string, d.id])
      );
    }
  }

  const rowsWithDesignId = rows.map((r) => ({
    ...r,
    design_id: r.product_sku ? (designMap.get(r.product_sku) ?? null) : null,
  }));

  const { error: upsertErr, count } = await supabase
    .from("orders")
    .upsert(rowsWithDesignId, {
      onConflict: "etsy_receipt_id,etsy_transaction_id",
      count: "exact",
    });

  if (upsertErr) {
    return NextResponse.json<SyncResponse>(
      { ok: false, error: upsertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json<SyncResponse>({
    ok: true,
    inserted: count ?? rows.length,
    total: receipts.count,
  });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  return runSync(limit ? parseInt(limit, 10) : null);
}

export async function GET(req: Request) {
  return POST(req);
}
