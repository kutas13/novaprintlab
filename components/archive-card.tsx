"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Design } from "@/lib/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { DollarSign, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { cn } from "@/lib/utils";

export function ArchiveCard({ design }: { design: Design }) {
  const [idx, setIdx] = useState(0);
  const total = design.mockups.length;
  const current = total > 0 ? design.mockups[idx] : null;

  return (
    <Card className="group overflow-hidden border-slate-800/80 bg-gradient-to-br from-slate-900/70 to-slate-900/30 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-xl hover:shadow-emerald-500/5">
      <div className="grid grid-cols-2 gap-px bg-slate-800">
        <div className="relative aspect-square checkerboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={design.originalImageUrl}
            alt={`${design.name} orijinal`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-contain p-2"
          />
          <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px]">
            Şeffaf PNG
          </Badge>
        </div>
        <div className="relative aspect-square bg-slate-950">
          {current ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={`${design.name} mockup ${idx + 1}`}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <Badge variant="info" className="absolute top-1.5 left-1.5 text-[10px] flex items-center gap-1">
                <Images className="h-2.5 w-2.5" /> {idx + 1}/{total}
              </Badge>
              {total > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setIdx((i) => (i - 1 + total) % total);
                    }}
                    aria-label="Önceki mockup"
                    className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-slate-950/70 hover:bg-slate-950 text-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setIdx((i) => (i + 1) % total);
                    }}
                    aria-label="Sonraki mockup"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-slate-950/70 hover:bg-slate-950 text-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                    {design.mockups.map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1 w-1 rounded-full transition-all",
                          i === idx ? "bg-white w-3" : "bg-white/40"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
              Mockup yok
            </div>
          )}
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="font-medium text-sm truncate" title={design.name}>
          {design.name}
        </p>
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {design.publishedAt &&
              format(new Date(design.publishedAt), "d MMM yyyy", { locale: tr })}
          </span>
          {design.pricing?.finalPrice && (
            <span className="flex items-center gap-0.5 text-emerald-400 font-medium">
              <DollarSign className="h-3 w-3" />
              {design.pricing.finalPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
