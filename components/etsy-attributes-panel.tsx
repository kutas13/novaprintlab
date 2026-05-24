"use client";

import { Copy, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EtsyAttributes } from "@/lib/types";
import { copyToClipboard, cn } from "@/lib/utils";

interface FieldDef {
  key: keyof EtsyAttributes;
  label: string;
  hint: string;
}

const FIELDS: FieldDef[] = [
  {
    key: "clothingStyle",
    label: "Giyim tarzı",
    hint: "Etsy: Clothing style",
  },
  {
    key: "occasion",
    label: "Vekalet",
    hint: "Etsy: Occasion",
  },
  { key: "holiday", label: "Tatil", hint: "Etsy: Holiday" },
  { key: "graphic", label: "Grafik", hint: "Etsy: Graphic" },
];

export function EtsyAttributesPanel({
  attributes,
  className,
}: {
  attributes: EtsyAttributes | undefined;
  className?: string;
}) {
  const filledCount = attributes
    ? FIELDS.filter((f) => attributes[f.key]).length
    : 0;

  const copyValue = async (value: string, label: string) => {
    const ok = await copyToClipboard(value);
    if (ok) toast.success(`${label} kopyalandı`);
    else toast.error("Kopyalama başarısız.");
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-cyan-400" /> Etsy Listeleme Özellikleri
        </h3>
        <span className="text-[10px] text-slate-500">{filledCount} / 4</span>
      </div>
      <p className="text-[11px] text-slate-500 -mt-1">
        Etsy ürün düzenleme sayfasındaki 4 dropdown için AI önerileri. Etsy'de
        ilgili dropdown'a yapıştır.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FIELDS.map((f) => {
          const value = attributes?.[f.key];
          return (
            <div
              key={f.key}
              className={cn(
                "rounded-lg p-2.5 border flex items-start justify-between gap-2 min-h-[64px]",
                value
                  ? "bg-slate-950/60 border-slate-800"
                  : "bg-slate-900/40 border-slate-800/60 opacity-70"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  {f.label}
                  <span className="ml-1 text-slate-600 normal-case font-normal">
                    · {f.hint}
                  </span>
                </p>
                <p
                  className={cn(
                    "text-xs font-semibold mt-1 break-words",
                    value ? "text-slate-100" : "text-slate-500 italic"
                  )}
                >
                  {value || "AI henüz öneri vermedi"}
                </p>
              </div>
              {value && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyValue(value, f.label)}
                  className="h-7 w-7 p-0 shrink-0 hover:bg-cyan-500/20 hover:text-cyan-300"
                  title="Kopyala"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
