"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DollarSign, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageSnapshot {
  day: string;
  costUsd: number;
  mockupCount: number;
  designCount: number;
  limitUsd: number;
  remainingUsd: number;
  percent: number;
}

interface UsageMeterProps {
  /** Optional snapshot from the last API response — when provided, applied immediately. */
  snapshot?: UsageSnapshot | null;
  /** Compact one-line variant (for headers / sidebars). */
  compact?: boolean;
  className?: string;
}

/**
 * Live meter for today's OpenAI spend vs the daily $5 cap.
 * - Fetches /api/usage on mount + every 60s + on window focus.
 * - Can also be force-updated by parent via the `snapshot` prop after a
 *   successful (or rate-limited) API response.
 */
export function UsageMeter({ snapshot, compact, className }: UsageMeterProps) {
  const [data, setData] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/usage", { cache: "no-store" });
      const j = await r.json();
      if (j && j.ok && mounted.current) {
        setData({
          day: j.day,
          costUsd: j.costUsd,
          mockupCount: j.mockupCount,
          designCount: j.designCount,
          limitUsd: j.limitUsd,
          remainingUsd: j.remainingUsd,
          percent: j.percent,
        });
      }
    } catch {
      // Network failure — keep last known snapshot.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // Apply prop snapshot immediately when parent passes one.
  useEffect(() => {
    if (snapshot) setData(snapshot);
  }, [snapshot]);

  // Mount + polling + window focus refresh
  useEffect(() => {
    mounted.current = true;
    refresh();
    const interval = setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const view = data;
  const percent = view ? Math.min(100, view.percent) : 0;
  const remaining = view ? view.remainingUsd : 5;
  const cost = view ? view.costUsd : 0;
  const limit = view ? view.limitUsd : 5;

  const tier =
    percent >= 100
      ? "exhausted"
      : percent >= 80
        ? "danger"
        : percent >= 50
          ? "warn"
          : "ok";

  const barColor = {
    ok: "from-emerald-500 to-teal-500",
    warn: "from-amber-400 to-yellow-500",
    danger: "from-orange-500 to-red-500",
    exhausted: "from-red-500 to-red-700",
  }[tier];

  const accentText = {
    ok: "text-emerald-300",
    warn: "text-amber-300",
    danger: "text-orange-300",
    exhausted: "text-red-300",
  }[tier];

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border bg-slate-900/60 border-slate-800",
          className
        )}
        title={`Bugün $${cost.toFixed(2)} / $${limit.toFixed(2)} OpenAI harcandı`}
      >
        <DollarSign className={cn("h-3 w-3", accentText)} />
        <span className="text-[10.5px] font-bold tabular-nums text-slate-200">
          ${cost.toFixed(2)}
          <span className="text-slate-500 font-normal">
            {" "}
            / ${limit.toFixed(2)}
          </span>
        </span>
        <div className="w-12 h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r transition-all duration-500",
              barColor
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "h-9 w-9 rounded-xl bg-gradient-to-br ring-1 ring-white/10 flex items-center justify-center",
              barColor
            )}
          >
            <DollarSign className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Günlük OpenAI Harcaması
            </p>
            <p className="text-lg font-extrabold tabular-nums text-white leading-tight">
              ${cost.toFixed(2)}
              <span className="text-sm font-semibold text-slate-500">
                {" "}
                / ${limit.toFixed(2)}
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="h-7 w-7 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors disabled:opacity-50"
          aria-label="Yenile"
          title="Yenile"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden mb-2.5">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-all duration-700",
            barColor,
            tier === "exhausted" && "animate-pulse"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3 text-slate-400">
          {view && (
            <>
              <span className="tabular-nums">
                <span className="font-semibold text-slate-300">
                  {view.mockupCount}
                </span>{" "}
                mockup
              </span>
              <span className="text-slate-700">·</span>
              <span className="tabular-nums">
                <span className="font-semibold text-slate-300">
                  {view.designCount}
                </span>{" "}
                tasarım
              </span>
            </>
          )}
        </div>
        <span className={cn("font-bold tabular-nums", accentText)}>
          ${remaining.toFixed(2)} kaldı
        </span>
      </div>

      {tier === "exhausted" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/[0.08] border border-red-500/25 p-2.5 text-[11px] text-red-200 leading-relaxed">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400" />
          <span>
            Günlük limit doldu. Yeni üretim yapılamaz — sayaç gece yarısı
            (yerel saat) sıfırlanır.
          </span>
        </div>
      )}
      {tier === "danger" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-orange-500/[0.06] border border-orange-500/20 p-2.5 text-[11px] text-orange-200 leading-relaxed">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-orange-400" />
          <span>
            Limitin %80&apos;ini geçtin. Üretimleri kısa tut — ~
            {Math.floor(remaining / 0.2)} mockup hakkın kaldı.
          </span>
        </div>
      )}
    </div>
  );
}
