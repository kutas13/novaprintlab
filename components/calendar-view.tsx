"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Rocket, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDesignStore } from "@/lib/store";
import { formatDateKey } from "@/lib/utils";

export function CalendarView() {
  const [cursor, setCursor] = useState(new Date());
  const dailyTarget = useDesignStore((s) => s.dailyTarget);
  const designs = useDesignStore((s) => s.designs);

  const countsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of designs) {
      if (d.publishedAt) {
        const key = formatDateKey(new Date(d.publishedAt));
        map[key] = (map[key] ?? 0) + 1;
      }
    }
    return map;
  }, [designs]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      out.push(d);
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }
    return out;
  }, [cursor]);

  const weekNames = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

  const today = new Date();
  const todayCount = countsByDay[formatDateKey(today)] ?? 0;
  const monthCount = days
    .filter((d) => isSameMonth(d, cursor))
    .reduce((sum, d) => sum + (countsByDay[formatDateKey(d)] ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Bugün Yüklenen"
          value={`${todayCount} / ${dailyTarget}`}
          icon={<Target className="h-4 w-4" />}
          accent={
            todayCount >= dailyTarget
              ? "from-emerald-500 to-teal-500"
              : "from-amber-500 to-orange-500"
          }
        />
        <StatCard
          label={`${format(cursor, "MMMM", { locale: tr })} ayı toplamı`}
          value={`${monthCount} ürün`}
          icon={<Rocket className="h-4 w-4" />}
          accent="from-blue-500 to-violet-500"
        />
        <StatCard
          label="Toplam Aktif Ürün"
          value={`${designs.filter((d) => d.status === "Aktif Mağaza").length}`}
          icon={<Rocket className="h-4 w-4" />}
          accent="from-violet-500 to-fuchsia-500"
        />
      </div>

      <div className="rounded-2xl border border-slate-800/80 glass p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold capitalize">
            {format(cursor, "LLLL yyyy", { locale: tr })}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="bg-slate-900 border-slate-700"
              onClick={() => setCursor(addMonths(cursor, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-slate-900 border-slate-700"
              onClick={() => setCursor(new Date())}
            >
              Bugün
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-slate-900 border-slate-700"
              onClick={() => setCursor(addMonths(cursor, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
          {weekNames.map((w) => (
            <div
              key={w}
              className="text-center text-[11px] font-semibold tracking-wider uppercase text-slate-500"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((day) => {
            const key = formatDateKey(day);
            const count = countsByDay[key] ?? 0;
            const inMonth = isSameMonth(day, cursor);
            const reached = count >= dailyTarget;
            const partial = count > 0 && !reached;
            const isFuture = day > today && !isSameDay(day, today);

            return (
              <div
                key={key}
                className={cn(
                  "relative rounded-lg p-1.5 sm:p-2 min-h-[64px] sm:min-h-[96px] border text-xs transition-all",
                  inMonth ? "border-slate-800" : "border-slate-900 opacity-40",
                  isToday(day) && "ring-1 ring-blue-500/50",
                  reached &&
                    "bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/40 shadow-inner shadow-emerald-500/10",
                  partial && "bg-gradient-to-br from-amber-500/15 to-orange-500/10 border-amber-500/30",
                  !reached && !partial && !isFuture && inMonth && count === 0 && "bg-rose-950/20 border-rose-900/30",
                  isFuture && "bg-slate-900/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "font-semibold",
                      isToday(day) ? "text-blue-300" : "text-slate-300"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-md font-bold",
                        reached ? "bg-emerald-500/30 text-emerald-200" : "bg-amber-500/30 text-amber-200"
                      )}
                    >
                      {count}/{dailyTarget}
                    </span>
                  )}
                </div>
                {reached && (
                  <div className="absolute inset-x-1.5 bottom-1 text-[9px] sm:text-[10px] font-medium text-emerald-300 leading-tight hidden sm:block">
                    {count}/{dailyTarget} Yüklendi! 🚀
                  </div>
                )}
                {partial && (
                  <div className="absolute inset-x-1.5 bottom-1 text-[9px] sm:text-[10px] text-amber-300 leading-tight hidden sm:block">
                    {count}/{dailyTarget}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-slate-400">
          <LegendDot className="bg-emerald-500/60" label={`Hedef tamam (${dailyTarget}+ ürün)`} />
          <LegendDot className="bg-amber-500/60" label="Kısmi (1 ürün)" />
          <LegendDot className="bg-rose-500/60" label="Boş gün" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex items-center gap-3">
      <div
        className={cn(
          "h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white",
          accent
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      <span>{label}</span>
    </div>
  );
}
