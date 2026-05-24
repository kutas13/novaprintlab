"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DesignCard } from "@/components/design-card";
import { Badge } from "@/components/ui/badge";
import { TahaDialog } from "@/components/taha-dialog";
import { useDesignStore } from "@/lib/store";
import type { Design } from "@/lib/types";

export default function TahaPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);
  const waiting = designs.filter(
    (d) => d.status === "Mockup ve Yayınlama Bekliyor"
  );
  const [active, setActive] = useState<Design | null>(null);

  return (
    <div>
      <PageHeader
        title="Taha — Mockup & Yayınla"
        description="Tasarımı indir, SEO'yu kopyala, kâr hesapla, mockup'ları yükle, sonra taslağa kaydet veya doğrudan yayınla."
        icon={<ImageIcon className="h-5 w-5" />}
        accent="from-amber-500 to-orange-500"
      />

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Yayın Bekleyenler</h2>
          {mounted && <Badge variant="info">{waiting.length} ürün</Badge>}
        </div>

        {mounted && loading && waiting.length === 0 && <SkeletonGrid />}

        {mounted && !loading && waiting.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
            Şu anda mockup bekleyen ürün yok. Kerim SEO'yu onayladığında burada
            görünecek.
          </div>
        )}

        {mounted && waiting.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {waiting.map((d) => (
              <DesignCard
                key={d.id}
                design={d}
                onClick={() => setActive(d)}
                highlight
              />
            ))}
          </div>
        )}
      </section>

      {active && (
        <TahaDialog
          key={active.id}
          design={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-lg border border-slate-800 bg-slate-900/30 animate-pulse"
        />
      ))}
    </div>
  );
}
