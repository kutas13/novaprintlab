"use client";

import { Design } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface DesignCardProps {
  design: Design;
  onClick?: () => void;
  highlight?: boolean;
  showMockup?: boolean;
}

export function DesignCard({
  design,
  onClick,
  highlight,
  showMockup,
}: DesignCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden border-slate-800/80 bg-gradient-to-br from-slate-900/70 to-slate-900/30 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:shadow-2xl hover:shadow-blue-500/10",
        onClick && "cursor-pointer",
        highlight && "ring-1 ring-blue-500/30 hover:ring-blue-400/40"
      )}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-blue-500/5 via-transparent to-violet-500/5 pointer-events-none" />
      <div className="relative aspect-square checkerboard">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={design.originalImageUrl}
          alt={design.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
        />
        {showMockup && design.mockups.length > 0 && (
          <div className="absolute bottom-2 right-2 flex -space-x-2">
            {design.mockups.slice(0, 3).map((m, i) => (
              <div
                key={m.path}
                className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden ring-2 ring-slate-900 shadow-xl bg-slate-900"
                style={{ zIndex: 10 - i }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt={`mockup ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {design.mockups.length > 3 && (
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg ring-2 ring-slate-900 bg-slate-950/90 flex items-center justify-center text-[11px] font-semibold text-slate-300">
                +{design.mockups.length - 3}
              </div>
            )}
          </div>
        )}
        <div className="absolute top-2 left-2">
          <StatusBadge status={design.status} />
        </div>
      </div>
      <div className="p-3 space-y-1 relative">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-medium text-sm truncate flex-1" title={design.name}>
            {design.name}
          </p>
          {design.sku && (
            <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-800/80 rounded px-1.5 py-0.5">
              {design.sku}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          {format(new Date(design.createdAt), "d MMM yyyy • HH:mm", {
            locale: tr,
          })}
        </p>
      </div>
    </Card>
  );
}
