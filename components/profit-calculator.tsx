"use client";

import { useMemo, useState, useEffect } from "react";
import { Calculator, Lock, DollarSign } from "lucide-react";
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

interface ProfitCalculatorProps {
  initial?: PricingData;
  onLock: (data: PricingData) => void | Promise<void>;
  busy?: boolean;
}

export function ProfitCalculator({ initial, onLock, busy }: ProfitCalculatorProps) {
  const [printifyCost, setPrintifyCost] = useState(initial?.printifyCost ?? 0);
  const [shippingCost, setShippingCost] = useState(initial?.shippingCost ?? 0);
  const [targetProfit, setTargetProfit] = useState(initial?.targetProfit ?? 10);

  useEffect(() => {
    if (initial) {
      setPrintifyCost(initial.printifyCost);
      setShippingCost(initial.shippingCost);
      setTargetProfit(initial.targetProfit);
    }
  }, [initial]);

  const result = useMemo(
    () => calculateEtsyPrice(printifyCost, shippingCost, targetProfit),
    [printifyCost, shippingCost, targetProfit]
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-amber-400" />
        <h3 className="font-semibold">Dinamik Kâr Hesaplayıcı</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        <PriceInput
          label="Hedef Net Kâr ($)"
          value={targetProfit}
          onChange={setTargetProfit}
        />
      </div>

      <div className="rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 p-4">
        <p className="text-xs text-amber-300/80 uppercase tracking-wider font-semibold">
          Net ${targetProfit.toFixed(2)} kâr için minimum Etsy fiyatı
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
        disabled={busy}
        className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold disabled:opacity-60"
      >
        <Lock className="h-4 w-4" /> {busy ? "Kaydediliyor…" : `$${result.price.toFixed(2)} olarak sabitle`}
      </Button>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Etsy ücretleri: %{(ETSY_TRANSACTION_FEE * 100).toFixed(1)} işlem +
        %{(ETSY_PAYMENT_PERCENT * 100).toFixed(0)} + ${ETSY_PAYMENT_FIXED.toFixed(2)} ödeme +
        ${ETSY_LISTING_FEE.toFixed(2)} listeleme. Free shipping listing varsayılır.
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
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      <div className="relative">
        <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <Input
          type="number"
          step="0.01"
          min="0"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
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
