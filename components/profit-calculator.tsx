"use client";

import { useMemo, useState, useEffect } from "react";
import { Calculator, Lock, DollarSign, Percent, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  calculateEtsyPrice,
  ETSY_LISTING_FEE,
  ETSY_PAYMENT_FIXED,
  ETSY_PAYMENT_PERCENT,
  ETSY_TRANSACTION_FEE,
} from "@/lib/pricing";
import type { PricingData } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProfitCalculatorProps {
  initial?: PricingData;
  onLock: (data: PricingData) => void | Promise<void>;
  busy?: boolean;
  /**
   * Auto-tracked AI generation cost for this design (design gen + all mockup
   * gens). Shown as a read-only line-item that gets subtracted from net
   * profit. Default 0 means "no AI cost recorded".
   */
  aiCost?: number;
}

const PROFIT_OPTIONS = [5, 10, 15, 20, 25, 30, 50] as const;
const DEFAULT_PERCENT = 30;

function inferPercent(profit: number, cost: number): number {
  if (cost <= 0 || profit <= 0) return DEFAULT_PERCENT;
  const ratio = (profit / cost) * 100;
  let closest: number = PROFIT_OPTIONS[0];
  let minDiff = Math.abs(ratio - closest);
  for (const opt of PROFIT_OPTIONS) {
    const d = Math.abs(ratio - opt);
    if (d < minDiff) {
      minDiff = d;
      closest = opt;
    }
  }
  return closest;
}

export function ProfitCalculator({
  initial,
  onLock,
  busy,
  aiCost = 0,
}: ProfitCalculatorProps) {
  const [printifyCost, setPrintifyCost] = useState(initial?.printifyCost ?? 0);
  const [shippingCost, setShippingCost] = useState(initial?.shippingCost ?? 0);
  const [profitPercent, setProfitPercent] = useState<number>(() =>
    initial
      ? inferPercent(
          initial.targetProfit,
          initial.printifyCost + initial.shippingCost + aiCost
        )
      : DEFAULT_PERCENT
  );

  useEffect(() => {
    if (initial) {
      setPrintifyCost(initial.printifyCost);
      setShippingCost(initial.shippingCost);
      setProfitPercent(
        inferPercent(
          initial.targetProfit,
          initial.printifyCost + initial.shippingCost + aiCost
        )
      );
    }
  }, [initial, aiCost]);

  // AI cost is part of total cost for the percent-of-cost profit target so
  // the seller's "%30 kâr" actually nets %30 of EVERYTHING they spent.
  const totalCost = printifyCost + shippingCost + aiCost;
  const targetProfit = useMemo(
    () => (totalCost * profitPercent) / 100,
    [totalCost, profitPercent]
  );

  const result = useMemo(
    () => calculateEtsyPrice(printifyCost, shippingCost, targetProfit, aiCost),
    [printifyCost, shippingCost, targetProfit, aiCost]
  );

  const lockDisabled = busy || totalCost <= 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-amber-400" />
        <h3 className="font-semibold">Dinamik Kâr Hesaplayıcı</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PriceInput
          label="Printify Ürün ($)"
          value={printifyCost}
          onChange={setPrintifyCost}
        />
        <PriceInput
          label="Printify Kargo ($)"
          value={shippingCost}
          onChange={setShippingCost}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-slate-400 flex items-center gap-1.5">
            <Percent className="h-3 w-3" /> Kâr Oranı (maliyet üzerinden)
          </Label>
          {totalCost > 0 && (
            <span className="text-[11px] text-slate-500">
              = ${targetProfit.toFixed(2)} net kâr
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {PROFIT_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProfitPercent(p)}
              className={cn(
                "py-2 rounded-md text-sm font-semibold border transition-all",
                profitPercent === p
                  ? "bg-amber-500 border-amber-400 text-amber-950 shadow-md shadow-amber-500/30"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:border-amber-500/40 hover:text-amber-300"
              )}
            >
              %{p}
            </button>
          ))}
        </div>
        {totalCost <= 0 && (
          <p className="text-[11px] text-amber-400/80">
            Önce Printify ürün ve kargo maliyetini gir.
          </p>
        )}
      </div>

      <div className="rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 p-4">
        <p className="text-xs text-amber-300/80 uppercase tracking-wider font-semibold">
          %{profitPercent} kâr (= ${targetProfit.toFixed(2)} net) için minimum Etsy fiyatı
        </p>
        <p className="text-3xl font-bold text-amber-200 mt-1">
          ${result.price.toFixed(2)}
        </p>
        <Separator className="my-3 bg-amber-500/10" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <Stat label="Transaction (6.5%)" value={`$${result.breakdown.transactionFee.toFixed(2)}`} />
          <Stat label="Payment (3% + $0.25)" value={`$${result.breakdown.paymentFee.toFixed(2)}`} />
          <Stat label="Listing" value={`$${result.breakdown.listingFee.toFixed(2)}`} />
          <Stat label="Net kâr" value={`$${result.breakdown.netProfit.toFixed(2)}`} highlight />
        </div>
      </div>

      <Button
        onClick={() =>
          onLock({
            printifyCost,
            shippingCost,
            targetProfit,
            finalPrice: result.price,
          })
        }
        disabled={lockDisabled}
        className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold disabled:opacity-60"
      >
        <Lock className="h-4 w-4" />{" "}
        {busy
          ? "Kaydediliyor…"
          : totalCost <= 0
            ? "Önce maliyet gir"
            : `$${result.price.toFixed(2)} olarak sabitle (%${profitPercent} kâr)`}
      </Button>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Etsy ücretleri: %{(ETSY_TRANSACTION_FEE * 100).toFixed(1)} işlem +
        %{(ETSY_PAYMENT_PERCENT * 100).toFixed(0)} + ${ETSY_PAYMENT_FIXED.toFixed(2)} ödeme +
        ${ETSY_LISTING_FEE.toFixed(2)} listeleme. Free shipping listing varsayılır.
        <br />
        Kâr oranı = net kâr ÷ (ürün + kargo maliyeti).
      </p>
    </div>
  );
}

function PriceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed) && parsed === value) return;
    setText(value > 0 ? String(value) : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      <div className="relative">
        <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="0.00"
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            const n = parseFloat(v);
            onChange(Number.isFinite(n) && n >= 0 ? n : 0);
          }}
          onFocus={(e) => e.target.select()}
          className="bg-slate-950 border-slate-800 pl-7"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className={highlight ? "text-emerald-300 font-semibold" : "text-slate-300 font-medium"}>
        {value}
      </p>
    </div>
  );
}
