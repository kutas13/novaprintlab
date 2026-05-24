"use client";

import { useState, useEffect } from "react";
import { CalendarDays, Archive, Wifi } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CalendarView } from "@/components/calendar-view";
import { ArchiveCard } from "@/components/archive-card";
import { useDesignStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";

export default function DashboardHomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);

  const archive = designs
    .filter((d) => d.status === "Aktif Mağaza")
    .sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });

  return (
    <div>
      <PageHeader
        title="Genel Takvim & Arşiv"
        description="Günlük 2 ürün hedefini takip et, yayınlanan tasarımların orijinal & mockup'ını yan yana gör."
        icon={<CalendarDays className="h-5 w-5" />}
        accent="from-blue-500 to-cyan-500"
      >
        <Badge variant="success" className="gap-1.5">
          <Wifi className="h-3 w-3" /> Canlı senkron
        </Badge>
      </PageHeader>

      {mounted && <CalendarView />}

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-slate-400" />
            <h2 className="text-lg font-semibold">Aktif Mağaza Arşivi</h2>
          </div>
          {mounted && <Badge variant="success">{archive.length} ürün</Badge>}
        </div>

        {mounted && loading && archive.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[2/1] rounded-lg border border-slate-800 bg-slate-900/30 animate-pulse"
              />
            ))}
          </div>
        )}

        {mounted && !loading && archive.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
            Henüz yayınlanmış ürün yok. Yusuf → Kerim → Taha akışı tamamlandıkça
            burada şeffaf PNG ve bitmiş mockup yan yana sergilenecek.
          </div>
        )}

        {mounted && archive.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {archive.map((d) => (
              <ArchiveCard key={d.id} design={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
