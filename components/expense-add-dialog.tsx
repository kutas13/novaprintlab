"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  CreditCard,
  RotateCw,
  Calendar as CalendarIcon,
  Save,
  X,
  Loader2,
  User2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useExpensesStore, type NewExpenseInput } from "@/lib/expenses-store";
import type { ExpenseCurrency, ExpenseOwner } from "@/lib/types";
import { cn } from "@/lib/utils";

const OWNERS: { value: ExpenseOwner; accent: string }[] = [
  { value: "Yusuf", accent: "from-emerald-500 to-teal-500" },
  { value: "Kerim", accent: "from-violet-500 to-fuchsia-500" },
  { value: "Taha", accent: "from-amber-500 to-orange-500" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseAddDialog({ onClose }: { onClose: () => void }) {
  const addExpense = useExpensesStore((s) => s.addExpense);

  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [currency, setCurrency] = useState<ExpenseCurrency>("USD");
  const [isSubscription, setIsSubscription] = useState(false);
  const [subscriptionDay, setSubscriptionDay] = useState<string>("1");
  const [cardLast4, setCardLast4] = useState("");
  const [cardOwner, setCardOwner] = useState<ExpenseOwner>("Yusuf");
  const [expenseDate, setExpenseDate] = useState<string>(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // When the user picks the start date for a subscription, default the
  // monthly charge day to that day. They can override.
  useEffect(() => {
    if (!isSubscription) return;
    const d = new Date(expenseDate);
    if (!Number.isNaN(d.getTime())) {
      setSubscriptionDay(String(d.getUTCDate()));
    }
  }, [isSubscription, expenseDate]);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Gider adı gerekli.");
      return;
    }
    const amount = parseFloat(amountStr.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Geçerli bir tutar gir.");
      return;
    }
    if (cardLast4.trim() && !/^\d{4}$/.test(cardLast4.trim())) {
      toast.error("Kart son 4 hanesi tam 4 rakam olmalı.");
      return;
    }
    let subDay: number | undefined;
    if (isSubscription) {
      subDay = parseInt(subscriptionDay, 10);
      if (!Number.isFinite(subDay) || subDay < 1 || subDay > 31) {
        toast.error("Abonelik günü 1-31 arasında olmalı.");
        return;
      }
    }

    const input: NewExpenseInput = {
      name: trimmedName,
      amount: Math.round(amount * 100) / 100,
      currency,
      isSubscription,
      subscriptionDay: subDay,
      cardLast4: cardLast4.trim() || undefined,
      cardOwner,
      expenseDate,
      notes: notes.trim() || undefined,
    };

    setSaving(true);
    try {
      await addExpense(input);
      toast.success(
        isSubscription
          ? `'${trimmedName}' aboneliği kaydedildi. Her ayın ${subDay}'inde otomatik gider olarak görünecek.`
          : `'${trimmedName}' gideri kaydedildi.`
      );
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      toast.error(`Kaydetme başarısız: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 sm:max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-400" /> Yeni Gider
          </DialogTitle>
          <DialogDescription>
            Tek seferlik harcama veya tekrar eden abonelik ekle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-name">Gider Adı</Label>
            <Input
              id="exp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Canva Pro, Printify aylık, Vercel"
              className="bg-slate-900 border-slate-800"
              disabled={saving}
              autoFocus
            />
          </div>

          {/* Amount + currency */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-amount">Tutar</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                  {currency === "USD" ? "$" : "₺"}
                </span>
                <Input
                  id="exp-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(e) =>
                    setAmountStr(e.target.value.replace(/[^0-9.,]/g, ""))
                  }
                  placeholder="0.00"
                  className="bg-slate-900 border-slate-800 pl-7"
                  disabled={saving}
                />
              </div>
              <div className="flex bg-slate-900 border border-slate-800 rounded-md p-0.5 shrink-0">
                {(["USD", "TRY"] as ExpenseCurrency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    disabled={saving}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded transition-colors",
                      currency === c
                        ? "bg-amber-500 text-slate-950 shadow"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {c === "USD" ? "$ USD" : "₺ TL"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card owner */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User2 className="h-3.5 w-3.5" /> Kart Sahibi
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {OWNERS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setCardOwner(o.value)}
                  disabled={saving}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all",
                    cardOwner === o.value
                      ? `bg-gradient-to-br ${o.accent} text-white border-transparent shadow-md`
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  )}
                >
                  {o.value}
                </button>
              ))}
            </div>
          </div>

          {/* Card last 4 */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-card" className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Kart Son 4 Hane
              <span className="text-slate-500 font-normal text-[10px]">
                (opsiyonel)
              </span>
            </Label>
            <Input
              id="exp-card"
              value={cardLast4}
              onChange={(e) =>
                setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="1234"
              inputMode="numeric"
              maxLength={4}
              className="bg-slate-900 border-slate-800 font-mono tracking-widest"
              disabled={saving}
            />
          </div>

          {/* Subscription toggle */}
          <button
            type="button"
            onClick={() => setIsSubscription((v) => !v)}
            disabled={saving}
            className={cn(
              "w-full flex items-center justify-between rounded-lg border px-3 py-3 transition-colors",
              isSubscription
                ? "bg-violet-500/15 border-violet-500/40"
                : "bg-slate-900 border-slate-800 hover:border-slate-700"
            )}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center",
                  isSubscription
                    ? "bg-violet-500/30 text-violet-200"
                    : "bg-slate-800 text-slate-500"
                )}
              >
                <RotateCw
                  className={cn("h-4 w-4", isSubscription && "animate-spin")}
                  style={isSubscription ? { animationDuration: "4s" } : {}}
                />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">
                  Tekrar eden abonelik
                </p>
                <p className="text-[11px] text-slate-500">
                  Her ay otomatik gider olarak listelenir
                </p>
              </div>
            </div>
            <span
              className={cn(
                "h-6 w-11 rounded-full relative transition-colors shrink-0",
                isSubscription ? "bg-violet-500" : "bg-slate-700"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                  isSubscription ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </span>
          </button>

          {/* Date(s) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="exp-date"
                className="flex items-center gap-1.5"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {isSubscription
                  ? "Abonelik Başlangıç Tarihi"
                  : "Harcama Tarihi"}
              </Label>
              <Input
                id="exp-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="bg-slate-900 border-slate-800"
                disabled={saving}
              />
            </div>
            {isSubscription && (
              <div className="space-y-1.5">
                <Label htmlFor="exp-sub-day">
                  Her Ay Çekim Günü
                </Label>
                <div className="relative">
                  <Input
                    id="exp-sub-day"
                    type="number"
                    min={1}
                    max={31}
                    value={subscriptionDay}
                    onChange={(e) =>
                      setSubscriptionDay(
                        e.target.value.replace(/\D/g, "").slice(0, 2)
                      )
                    }
                    className="bg-slate-900 border-slate-800 pr-12"
                    disabled={saving}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 uppercase tracking-wider">
                    günü
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-notes">
              Not{" "}
              <span className="text-slate-500 font-normal text-[10px]">
                (opsiyonel)
              </span>
            </Label>
            <Textarea
              id="exp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn. ekibe ait Canva hesabı"
              className="bg-slate-900 border-slate-800 min-h-[60px] text-sm"
              disabled={saving}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-800">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-700"
            disabled={saving}
          >
            <X className="h-4 w-4" /> İptal
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-90"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Kaydet
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
