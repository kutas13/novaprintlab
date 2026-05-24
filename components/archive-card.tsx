"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Design } from "@/lib/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { DollarSign } from "lucide-react";

export function ArchiveCard({ design }: { design: Design }) {
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
          <Badge
            variant="secondary"
            className="absolute top-1.5 left-1.5 text-[10px]"
          >
            Şeffaf PNG
          </Badge>
        </div>
        <div className="relative aspect-square bg-slate-950">
          {design.mockupImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={design.mockupImageUrl}
                alt={`${design.name} mockup`}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <Badge variant="info" className="absolute top-1.5 left-1.5 text-[10px]">
                Mockup
              </Badge>
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
