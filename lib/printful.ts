// ────────────────────────────────────────────────────────────────────────────
// NOVAPRINTLAB — PRINTFUL CLIENT (server-side only)
//
// Wraps the bits of the Printful v2 API we need for the mockup studio:
//   • Catalog product/variant lookup (resolves "Siyah Tişört" → variant_id)
//   • POST /v2/mockup-tasks (kicks off a mockup render job)
//   • GET  /v2/mockup-tasks (polls until the job is completed)
//
// Auth: Bearer token from PRINTFUL_API_KEY env var.
// Never imported from client components — keeps the token server-side only.
// ────────────────────────────────────────────────────────────────────────────

const PRINTFUL_BASE = "https://api.printful.com";

export class PrintfulError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface PfFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
  /** When true, skip auto-injecting `X-PF-Store-Id` (used by getStoreId itself
      to avoid infinite recursion + by store-agnostic endpoints like /v2/stores). */
  skipStoreHeader?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// STORE ID RESOLUTION
//
// Printful's v2 endpoints (mockup-tasks etc.) require an `X-PF-Store-Id`
// header identifying which store the request is for. You can either:
//   • set PRINTFUL_STORE_ID in env (preferred for production), OR
//   • leave it blank — we'll call /v2/stores on first request and cache the
//     first store the token has access to.
// The cache lives for the lifetime of the serverless invocation (per-runtime
// in-memory). Cheap (~10ms) miss on cold starts.
// ────────────────────────────────────────────────────────────────────────────
let cachedStoreId: string | null = null;
let storeIdPromise: Promise<string> | null = null;

interface StoreListItem {
  id: number | string;
  name?: string;
  type?: string;
}
interface StoresResponse {
  data?: StoreListItem[];
  // V1 shape fallback (just in case)
  result?: StoreListItem[];
}

async function fetchStoreIdFromApi(): Promise<string> {
  const envOverride = (process.env.PRINTFUL_STORE_ID || "").trim();
  if (envOverride) {
    cachedStoreId = envOverride;
    return envOverride;
  }
  const json = await pfFetch<StoresResponse>("/v2/stores", {
    skipStoreHeader: true,
  });
  const list = json.data || json.result || [];
  if (!list.length) {
    throw new PrintfulError(
      400,
      "Printful tokenine bağlı hiç store yok. https://www.printful.com/dashboard → store oluştur. (Türkiye için Manual Order/API platform seçilebilir.)"
    );
  }
  const first = list[0];
  if (!first?.id) {
    throw new PrintfulError(
      500,
      "Printful /v2/stores yanıtı beklenmedik şekilde — store id bulunamadı."
    );
  }
  const id = String(first.id);
  cachedStoreId = id;
  return id;
}

async function getStoreId(): Promise<string> {
  if (cachedStoreId) return cachedStoreId;
  if (!storeIdPromise) {
    storeIdPromise = fetchStoreIdFromApi().catch((e) => {
      // Reset so a future caller can retry
      storeIdPromise = null;
      throw e;
    });
  }
  return storeIdPromise;
}

async function pfFetch<T>(path: string, opts: PfFetchOptions = {}): Promise<T> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    throw new PrintfulError(
      500,
      "PRINTFUL_API_KEY env var tanımlı değil. Vercel → Settings → Environment Variables üzerinden ekle."
    );
  }
  const qs = opts.query
    ? "?" +
      new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : "";
  const url = `${PRINTFUL_BASE}${path}${qs}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (!opts.skipStoreHeader) {
    try {
      const storeId = await getStoreId();
      headers["X-PF-Store-Id"] = storeId;
    } catch (e) {
      // Bubble up; this is the most actionable error the user can see.
      if (e instanceof PrintfulError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new PrintfulError(500, `Printful store_id çözülemedi: ${msg}`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 30_000
  );
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const txt = await res.text();
    let parsed: unknown = null;
    try {
      parsed = txt ? JSON.parse(txt) : null;
    } catch {
      // non-JSON response (rare); we will fail loudly below
    }
    if (!res.ok) {
      const rawMsg =
        (parsed as { error?: { message?: string }; result?: string } | null)
          ?.error?.message ||
        (parsed as { result?: string } | null)?.result ||
        `Printful HTTP ${res.status}`;
      // Turn the most common 400 ("requires store_id") into a hint pointing
      // at the env var users can set themselves if /v2/stores didn't work.
      const friendly = /requires\s+`?store_id`?/i.test(rawMsg)
        ? `${rawMsg} — token'da "Stores" scope'u eksik olabilir. Çözüm: Printful Dashboard → API → Token'ı yeni baştan oluştur (Mockups + Stores + Catalog scope'larıyla) VEYA .env.local'a PRINTFUL_STORE_ID=<store_id> ekle.`
        : rawMsg;
      throw new PrintfulError(res.status, friendly, parsed);
    }
    return parsed as T;
  } catch (e) {
    if (e instanceof PrintfulError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("AbortError")) {
      throw new PrintfulError(504, "Printful isteği zaman aşımına uğradı.");
    }
    throw new PrintfulError(502, `Printful network hatası: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CATALOG TYPES (only the fields we read)
// ────────────────────────────────────────────────────────────────────────────
export interface PrintfulCatalogProduct {
  id: number;
  main_category_id?: number;
  type?: string;
  name: string;
  brand?: string;
  model?: string;
  image?: string;
}

export interface PrintfulCatalogVariant {
  id: number;
  catalog_product_id: number;
  name: string;
  size: string;
  color: string;
  color_code?: string;
  color_code2?: string;
  image?: string;
}

interface ListResp<T> {
  data: T[];
  paging?: { total: number; offset: number; limit: number };
}

// ────────────────────────────────────────────────────────────────────────────
// HIGH-LEVEL HELPERS
// ────────────────────────────────────────────────────────────────────────────
export async function listCatalogProducts(params?: {
  search?: string;
  limit?: number;
}): Promise<PrintfulCatalogProduct[]> {
  // Catalog endpoints are store-agnostic — skip X-PF-Store-Id so we don't
  // need the "Stores" scope on the token just to browse the catalog.
  const json = await pfFetch<ListResp<PrintfulCatalogProduct>>(
    "/v2/catalog-products",
    {
      query: {
        ...(params?.search ? { name: params.search } : {}),
        limit: params?.limit ?? 50,
      },
      skipStoreHeader: true,
    }
  );
  return json.data || [];
}

export async function listCatalogVariants(
  productId: number,
  limit = 100
): Promise<PrintfulCatalogVariant[]> {
  const out: PrintfulCatalogVariant[] = [];
  let offset = 0;
  // 5 pages cap = 500 variants, plenty
  for (let i = 0; i < 5; i++) {
    const json = await pfFetch<ListResp<PrintfulCatalogVariant>>(
      `/v2/catalog-products/${productId}/catalog-variants`,
      { query: { limit, offset }, skipStoreHeader: true }
    );
    const batch = json.data || [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// MOCKUP TASK
// ────────────────────────────────────────────────────────────────────────────
export interface MockupTaskLayer {
  type: "file";
  /** Public HTTPS URL of the design PNG (transparent background). */
  url: string;
  /** Position in inches. Centered chest defaults work for tees/hoodies. */
  position?: {
    width: number;
    height: number;
    top: number;
    left: number;
  };
}

export interface CreateMockupTaskParams {
  catalogProductId: number;
  catalogVariantIds: number[];
  /** Public URL to the design PNG. Printful's worker fetches it directly. */
  designUrl: string;
  /** Restrict to specific lifestyle/flat mockup styles; omit for defaults. */
  mockupStyleIds?: number[];
  /** Output image width in pixels. 1000–2000 typical. */
  widthPx?: number;
  /** "jpg" (default) or "png". JPG is ~4× smaller, fine for listings. */
  format?: "jpg" | "png";
}

export interface MockupResult {
  /** "front", "back", "left", "right", "sleeve_left", etc. */
  placement: string;
  /** Which Printful variants this image covers. */
  variant_ids: number[];
  /** Public CDN URL of the rendered mockup. */
  mockup_url: string;
  /** Style id used to render (lifestyle / flat / etc.). */
  style_id?: number;
  extra?: unknown;
}

export interface MockupTaskStatusBody {
  data: {
    id: number;
    status: "pending" | "processing" | "completed" | "failed";
    catalog_variant_mockups?: Array<{
      catalog_variant_id: number;
      mockups: MockupResult[];
    }>;
    /** Older v2 shape — flat mockups[] at the top level. */
    mockups?: MockupResult[];
    failure_reasons?: Array<{ type: string; detail: string }>;
    _links?: { self?: { href: string } };
  };
}

interface CreateMockupTaskResponse {
  data: {
    id: number;
    status: string;
    _links?: { self?: { href: string } };
  };
}

export async function createMockupTask(
  params: CreateMockupTaskParams
): Promise<number> {
  // We deliberately DO NOT pass a `position` block. Printful applies a
  // sensible default placement (centered chest, max safe print area) when
  // the layer omits position, which is the most robust setting for the
  // generator. Passing position requires exact inch dimensions per product
  // and a wrong value silently produces a blank / scaled mockup.
  const body = {
    format: params.format ?? "jpg",
    mockup_width_px: params.widthPx ?? 1000,
    products: [
      {
        source: "catalog",
        ...(params.mockupStyleIds && params.mockupStyleIds.length > 0
          ? { mockup_style_ids: params.mockupStyleIds }
          : {}),
        catalog_product_id: params.catalogProductId,
        catalog_variant_ids: params.catalogVariantIds,
        orientation: "vertical",
        placements: [
          {
            placement: "front",
            technique: "dtg",
            print_area_type: "simple",
            layers: [
              {
                type: "file",
                url: params.designUrl,
              },
            ],
          },
        ],
      },
    ],
  };

  const json = await pfFetch<CreateMockupTaskResponse>("/v2/mockup-tasks", {
    method: "POST",
    body,
    timeoutMs: 45_000,
  });
  if (!json?.data?.id) {
    throw new PrintfulError(502, "Printful task ID dönmedi.");
  }
  return json.data.id;
}

export async function getMockupTask(
  taskId: number
): Promise<MockupTaskStatusBody> {
  return pfFetch<MockupTaskStatusBody>("/v2/mockup-tasks", {
    query: { id: taskId },
  });
}

/**
 * Polls Printful until the task is `completed` or `failed`.
 * Defaults: 1s initial wait, then 2s, then 3s+ up to 60s total.
 */
export async function waitForMockupTask(
  taskId: number,
  opts: { totalTimeoutMs?: number } = {}
): Promise<MockupTaskStatusBody["data"]> {
  const totalTimeoutMs = opts.totalTimeoutMs ?? 90_000;
  const start = Date.now();
  let wait = 1500;
  // First check is immediate
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await getMockupTask(taskId);
    const status = res.data?.status;
    if (status === "completed") return res.data;
    if (status === "failed") {
      const reasons = res.data?.failure_reasons
        ?.map((r) => r.detail)
        .join(" | ");
      throw new PrintfulError(
        502,
        `Printful mockup task başarısız: ${reasons || "bilinmeyen hata"}`,
        res.data
      );
    }
    if (Date.now() - start > totalTimeoutMs) {
      throw new PrintfulError(
        504,
        "Printful mockup task süresi doldu (poll timeout)."
      );
    }
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(wait + 1000, 5000);
  }
}
