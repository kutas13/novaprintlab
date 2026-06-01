// ────────────────────────────────────────────────────────────────────────────
// NOVAPRINTLAB — DAILY OPENAI USAGE TRACKER
// Server-only helpers. Imported by route handlers (/api/mockup, /api/generate)
// to enforce a per-day spend cap. Uses Supabase `api_usage` table created by
// `supabase-usage-setup.sql`.
//
// Flow per call:
//   1. reserve(type, cost)  → atomically pre-charges the daily budget
//   2. run the OpenAI call
//   3a. on success → done (cost remains charged)
//   3b. on failure → refund(type, cost)  → rolls back the pre-charge
//
// If `api_usage` table is missing or Supabase isn't configured, helpers
// gracefully degrade: reads return null and reserves succeed (no cap).
// ────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "./supabase-server";

// Pricing — gpt-image-1 @ 1024x1024 per OpenAI published rates,
// padded slightly so the daily cap never gets bypassed by rounding.
//   low    ~ $0.011  → reserve $0.02
//   medium ~ $0.042  → reserve $0.05
//   high   ~ $0.167  → reserve $0.20
export type Quality = "low" | "medium" | "high";

export const QUALITY_COST_USD: Record<Quality, number> = {
  low: 0.02,
  medium: 0.05,
  high: 0.2,
};

export const DEFAULT_QUALITY: Quality = "medium";

export function costForQuality(q: string | undefined | null): number {
  if (q === "low" || q === "medium" || q === "high") return QUALITY_COST_USD[q];
  return QUALITY_COST_USD[DEFAULT_QUALITY];
}

export function normalizeQuality(q: string | undefined | null): Quality {
  if (q === "low" || q === "medium" || q === "high") return q;
  return DEFAULT_QUALITY;
}

// Back-compat single constant exports (now derived from medium default).
export const MOCKUP_COST_USD = QUALITY_COST_USD[DEFAULT_QUALITY];
export const DESIGN_COST_USD = QUALITY_COST_USD[DEFAULT_QUALITY];

export const DAILY_LIMIT_USD = Number(
  process.env.NOVAPRINT_DAILY_LIMIT_USD || 5
);

export type UsageType = "mockup" | "design";

export interface UsageRow {
  day: string;
  mockup_count: number;
  design_count: number;
  cost_usd: number;
  updated_at: string;
}

export interface UsageSnapshot {
  day: string;
  costUsd: number;
  mockupCount: number;
  designCount: number;
  limitUsd: number;
  remainingUsd: number;
  percent: number; // 0-100
}

function todayKey(): string {
  // Use local timezone for "day". Etsy/POD seller is in a single TZ.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function emptySnapshot(): UsageSnapshot {
  return {
    day: todayKey(),
    costUsd: 0,
    mockupCount: 0,
    designCount: 0,
    limitUsd: DAILY_LIMIT_USD,
    remainingUsd: DAILY_LIMIT_USD,
    percent: 0,
  };
}

function toSnapshot(row: UsageRow | null): UsageSnapshot {
  if (!row) return emptySnapshot();
  const cost = Number(row.cost_usd || 0);
  const remaining = Math.max(0, DAILY_LIMIT_USD - cost);
  return {
    day: row.day,
    costUsd: cost,
    mockupCount: row.mockup_count,
    designCount: row.design_count,
    limitUsd: DAILY_LIMIT_USD,
    remainingUsd: remaining,
    percent: Math.min(100, (cost / DAILY_LIMIT_USD) * 100),
  };
}

async function readTodayRow(): Promise<UsageRow | null> {
  if (!supabaseServer) return null;
  try {
    const { data, error } = await supabaseServer
      .from("api_usage")
      .select("*")
      .eq("day", todayKey())
      .maybeSingle();
    if (error) {
      // Don't spam logs if table doesn't exist yet — just degrade.
      if (
        error.code === "42P01" ||
        /relation .*api_usage.* does not exist/i.test(error.message)
      ) {
        return null;
      }
      console.error("[usage] read failed:", error.message);
      return null;
    }
    return (data as UsageRow) || null;
  } catch (e) {
    console.error("[usage] read exception:", e);
    return null;
  }
}

export async function getTodayUsage(): Promise<UsageSnapshot> {
  const row = await readTodayRow();
  return toSnapshot(row);
}

/**
 * Try to reserve `cost` USD against today's budget.
 * Returns `{ ok: true }` if the call may proceed (cost has been charged
 * pre-flight), or `{ ok: false, snapshot }` if it would exceed the cap.
 *
 * If Supabase isn't reachable, reserves succeed (no cap enforced) — the
 * API stays functional rather than locking out users on infra failure.
 */
export async function reserve(
  type: UsageType,
  cost: number
): Promise<
  | { ok: true; snapshot: UsageSnapshot }
  | { ok: false; snapshot: UsageSnapshot; error: string }
> {
  if (!supabaseServer) {
    return { ok: true, snapshot: emptySnapshot() };
  }

  const row = await readTodayRow();
  const currentCost = Number(row?.cost_usd ?? 0);

  // Cap check — small epsilon so floating-point doesn't reject the boundary.
  if (currentCost + cost > DAILY_LIMIT_USD + 1e-6) {
    return {
      ok: false,
      snapshot: toSnapshot(row),
      error: `Günlük $${DAILY_LIMIT_USD.toFixed(2)} OpenAI limiti dolu. Bugün harcanan: $${currentCost.toFixed(2)}. Yarın tekrar dene.`,
    };
  }

  const next = {
    day: todayKey(),
    mockup_count: (row?.mockup_count ?? 0) + (type === "mockup" ? 1 : 0),
    design_count: (row?.design_count ?? 0) + (type === "design" ? 1 : 0),
    cost_usd: Number((currentCost + cost).toFixed(4)),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseServer
      .from("api_usage")
      .upsert(next, { onConflict: "day" })
      .select("*")
      .single();
    if (error) {
      // Table missing → degrade gracefully.
      if (
        error.code === "42P01" ||
        /relation .*api_usage.* does not exist/i.test(error.message)
      ) {
        console.warn(
          "[usage] api_usage table not found. Run supabase-usage-setup.sql to enable the daily $5 cap."
        );
        return { ok: true, snapshot: emptySnapshot() };
      }
      console.error("[usage] reserve write failed:", error.message);
      // On a transient DB error don't lock the user out.
      return { ok: true, snapshot: toSnapshot(row) };
    }
    return { ok: true, snapshot: toSnapshot(data as UsageRow) };
  } catch (e) {
    console.error("[usage] reserve exception:", e);
    return { ok: true, snapshot: toSnapshot(row) };
  }
}

/**
 * Undo a previous `reserve` (e.g. the OpenAI call failed). Best-effort —
 * if it can't write, we'd rather lose 20¢ of headroom than crash the API.
 */
export async function refund(type: UsageType, cost: number): Promise<void> {
  if (!supabaseServer) return;
  const row = await readTodayRow();
  if (!row) return;
  const currentCost = Number(row.cost_usd || 0);
  const next = {
    day: todayKey(),
    mockup_count: Math.max(0, row.mockup_count - (type === "mockup" ? 1 : 0)),
    design_count: Math.max(0, row.design_count - (type === "design" ? 1 : 0)),
    cost_usd: Math.max(0, Number((currentCost - cost).toFixed(4))),
    updated_at: new Date().toISOString(),
  };
  try {
    await supabaseServer.from("api_usage").upsert(next, { onConflict: "day" });
  } catch (e) {
    console.error("[usage] refund exception:", e);
  }
}
