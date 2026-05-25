"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  CreditCard,
  Trash2,
  Loader2,
  CalendarDays,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useExpensesStore } from "@/lib/expenses-store";
import type { Expense, ExpenseOwner } from "@/lib/types";
import { ExpenseAddDialog } from "@/components/expense-add-dialog";
import { cn } from "@/lib/utils";

const OWNER_ACCENT: Record<ExpenseOwner, string> = {
  Yusuf: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Kerim: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  Taha: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

interface MonthOccurrence {
  /** Source expense row. */
  expense: Expense;
  /** Concrete date inside the selected month. */
  occurrenceDate: string;
  /** True if generated from a subscription for a month other than the
   * original start month (i.e. an auto-recurrence). */
  isVirtual: boolean;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function expandExpensesForMonth(
  expenses: Expense[],
  year: number,
  month: number
): MonthOccurrence[] {
  const out: MonthOccurrence[] = [];
  const dim = daysInMonth(year, month);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month, dim);
  const monthStartTs = monthStart.getTime();
  const monthEndTs = monthEnd.getTime();

  for (const exp of expenses) {
    const startDate = new Date(exp.expenseDate);
    if (Number.isNaN(startDate.getTime())) continue;
    const startTs = new Date(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate()
    ).getTime();

    if (!exp.isSubscription) {
      if (startTs >= monthStartTs && startTs <= monthEndTs) {
        out.push({
          expense: exp,
          occurrenceDate: exp.expenseDate,
          isVirtual: false,
        });
      }
      continue;
    }

    // Subscription: skip months before the start.
    if (startTs > monthEndTs) continue;

    const day = Math.min(
      exp.subscriptionDay ?? startDate.getUTCDate(),
      dim
    );
    const occYear = year;
    const occMonth = month;
    const occDateObj = new Date(occYear, occMonth, day);
    const occISO = `${occYear.toString().padStart(4, "0")}-${(occMonth + 1)
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    const isStartMonth =
      startDate.getUTCFullYear() === year &&
      startDate.getUTCMonth() === month;
    out.push({
      expense: exp,
      occurrenceDate: occISO,
      isVirtual: !isStartMonth,
    });
    // Suppress unused var warning
    void occDateObj;
  }

  return out.sort((a, b) => {
    const ta = new Date(a.occurrenceDate).getTime();
    const tb = new Date(b.occurrenceDate).getTime();
    if (ta !== tb) return tb - ta;
    return a.expense.name.localeCompare(b.expense.name);
  });
}

export default function GiderlerPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const expenses = useExpensesStore((s) => s.expenses);
  const loading = useExpensesStore((s) => s.loading);
  const deleteExpense = useExpensesStore((s) => s.deleteExpense);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const occurrences = useMemo(
    () => expandExpensesForMonth(expenses, year, month),
    [expenses, year, month]
  );

  const totalUSD = occurrences
    .filter((o) => o.expense.currency === "USD")
    .reduce((s, o) => s + o.expense.amount, 0);
  const totalTRY = occurrences
    .filter((o) => o.expense.currency === "TRY")
    .reduce((s, o) => s + o.expense.amount, 0);

  const subscriptionsActive = expenses.filter(
    (e) => e.isSubscription && new Date(e.expenseDate) <= new Date(year, month + 1, 0)
  ).length;

  const moveMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  const handleDelete = async (exp: Expense) => {
    const isSub = exp.isSubscription;
    const ok = confirm(
      isSub
        ? `"${exp.name}" aboneliğini KALICI olarak sil?\n\nTüm aylardaki otomatik tekrar kayıtları da kaybolur.`
        : `"${exp.name}" giderini sil?`
    );
    if (!ok) return;
    setDeleting(exp.id);
    try {
      await deleteExpense(exp.id);
      toast.success(`'${exp.name}' silindi.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Hata";
      toast.error(`Silme başarısız: ${msg}`);
    } finally {
      setDeleting(null);
    }
  };

  const monthLabel = format(new Date(year, month, 1), "LLLL yyyy", {
    locale: tr,
  });

  return (
    <div>
      <PageHeader
        title="Giderler"
        description="Tek seferlik harcamalar ve tekrar eden abonelikler. Aboneliğin çekildiği gün her ay otomatik gider olarak listelenir."
        icon={<Wallet className="h-5 w-5" />}
        accent="from-yellow-500 to-amber-500"
      >
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-90 shadow-lg shadow-amber-500/20"
        >
          <Plus className="h-4 w-4" /> Yeni Gider
        </Button>
      </PageHeader>

      {/* Month picker */}
      <div className="mb-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded-lg p-1 w-fit">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => moveMonth(-1)}
            className="h-9 w-9"
            aria-label="Önceki ay"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 py-1.5 text-sm font-semibold capitalize min-w-[150px] text-center flex items-center gap-2 justify-center">
            <CalendarDays className="h-3.5 w-3.5 text-amber-400" />
            {monthLabel}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => moveMonth(1)}
            className="h-9 w-9"
            aria-label="Sonraki ay"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setYear(now.getFullYear());
              setMonth(now.getMonth());
            }}
            className="ml-1 text-xs"
          >
            Bu Ay
          </Button>
        </div>
        {mounted && (
          <Badge variant="secondary" className="w-fit">
            {occurrences.length} kayıt
          </Badge>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Toplam USD"
          value={`$${totalUSD.toFixed(2)}`}
          accent="from-emerald-500 to-teal-500"
        />
        <StatCard
          label="Toplam TL"
          value={`₺${totalTRY.toFixed(2)}`}
          accent="from-rose-500 to-pink-500"
        />
        <StatCard
          label="Aktif Abonelik"
          value={`${subscriptionsActive}`}
          accent="from-violet-500 to-fuchsia-500"
        />
        <StatCard
          label="Toplam Kayıt"
          value={`${expenses.length}`}
          accent="from-blue-500 to-cyan-500"
        />
      </div>

      {/* Expenses list */}
      {mounted && loading && occurrences.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg border border-slate-800 bg-slate-900/30 animate-pulse"
            />
          ))}
        </div>
      )}

      {mounted && !loading && occurrences.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <Wallet className="h-10 w-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">
            {monthLabel} için kayıtlı gider yok.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Sağ üstteki "Yeni Gider" butonu ile ilk gideri ekle.
          </p>
        </div>
      )}

      {mounted && occurrences.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-800 bg-slate-900/50">
            <div className="col-span-1 hidden sm:block">Gün</div>
            <div className="col-span-12 sm:col-span-4">Gider</div>
            <div className="col-span-4 sm:col-span-2">Tutar</div>
            <div className="col-span-4 sm:col-span-2">Kart</div>
            <div className="col-span-4 sm:col-span-2">Kim</div>
            <div className="col-span-12 sm:col-span-1 text-right">
              <span className="sr-only">İşlem</span>
            </div>
          </div>
          <ul className="divide-y divide-slate-800">
            {occurrences.map((occ) => {
              const day = new Date(occ.occurrenceDate).getDate();
              const isDeleting = deleting === occ.expense.id;
              return (
                <li
                  key={`${occ.expense.id}-${occ.occurrenceDate}`}
                  className={cn(
                    "grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm transition-colors",
                    occ.isVirtual
                      ? "bg-violet-500/[0.03] hover:bg-violet-500/[0.06]"
                      : "hover:bg-slate-800/40"
                  )}
                >
                  <div className="col-span-1 hidden sm:block">
                    <div className="text-lg font-bold tabular-nums">{day}</div>
                  </div>
                  <div className="col-span-12 sm:col-span-4 min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{occ.expense.name}</span>
                          {occ.expense.isSubscription && (
                            <Badge
                              variant="violet"
                              className="text-[9px] gap-1 shrink-0"
                            >
                              <RotateCw className="h-2.5 w-2.5" /> Abonelik
                            </Badge>
                          )}
                          {occ.isVirtual && (
                            <Badge
                              variant="info"
                              className="text-[9px] shrink-0"
                            >
                              Otomatik
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="sm:hidden">{day}.</span>
                          {occ.expense.notes && (
                            <span className="flex items-center gap-1 truncate">
                              <FileText className="h-2.5 w-2.5" />
                              <span className="truncate">
                                {occ.expense.notes}
                              </span>
                            </span>
                          )}
                          {occ.expense.isSubscription && (
                            <span className="text-slate-600">
                              her ay {occ.expense.subscriptionDay}'inde
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <div
                      className={cn(
                        "font-bold tabular-nums text-sm",
                        occ.expense.currency === "USD"
                          ? "text-emerald-400"
                          : "text-rose-300"
                      )}
                    >
                      {occ.expense.currency === "USD" ? "$" : "₺"}
                      {occ.expense.amount.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      {occ.expense.currency}
                    </div>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    {occ.expense.cardLast4 ? (
                      <div className="inline-flex items-center gap-1 text-xs font-mono bg-slate-800/60 px-2 py-1 rounded border border-slate-700">
                        <CreditCard className="h-3 w-3 text-slate-400" />
                        •••• {occ.expense.cardLast4}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-600">—</span>
                    )}
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                        OWNER_ACCENT[occ.expense.cardOwner]
                      )}
                    >
                      {occ.expense.cardOwner}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(occ.expense)}
                      disabled={isDeleting}
                      className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      title={
                        occ.isVirtual
                          ? "Aboneliği komple sil"
                          : "Gideri sil"
                      }
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {addOpen && <ExpenseAddDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div
        className={cn(
          "h-1 w-10 rounded-full mb-2 bg-gradient-to-r",
          accent
        )}
      />
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </p>
      <p className="text-xl font-bold mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
