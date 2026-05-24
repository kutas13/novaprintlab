"use client";

import { useEffect, useState } from "react";
import { FileEdit, Rocket, Loader2, Hash } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { DesignCard } from "@/components/design-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDesignStore } from "@/lib/store";
import type { Design } from "@/lib/types";
import { DraftPublishDialog } from "@/components/draft-publish-dialog";

export default function TaslaklarPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);
  const publishDesign = useDesignStore((s) => s.publishDesign);

  const drafts = designs.filter((d) => d.status === "Taslak");
  const [active, setActive] = useState<Design | null>(null);
  const [quickPublishing, setQuickPublishing] = useState<string | null>(null);

  const quickPublish = async (design: Design, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!design.pricing?.finalPrice) {
      toast.error(
        "Önce fiyatı sabitle. Karta tıkla, hesaplayıcıdan fiyat belirle."
      );
      setActive(design);
      return;
    }
    if (design.mockups.length === 0) {
      toast.error("Mockup yok. Taha'nın yüklemesi gerek.");
      setActive(design);
      return;
    }
    setQuickPublishing(design.id);
    try {
      await publishDesign(design.id);
      toast.success(`'${design.name}' Mağazada yayınlandı.`);
    } catch {
      toast.error("Yayınlama başarısız.");
    } finally {
      setQuickPublishing(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Taslaklar — Fiyatlama & Yayın"
        description="Taha mockup'ı tamamladı. Yusuf burada fiyatı belirleyip 'Mağazada Yayınla' butonuna basıyor."
        icon={<FileEdit className="h-5 w-5" />}
        accent="from-violet-500 to-fuchsia-500"
      >
        <Badge variant="violet">{mounted ? drafts.length : 0} taslak</Badge>
      </PageHeader>

      {mounted && loading && drafts.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg border border-slate-800 bg-slate-900/30 animate-pulse"
            />
          ))}
        </div>
      )}

      {mounted && !loading && drafts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <FileEdit className="h-10 w-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">
            Taslak yok.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Taha bir ürünü "Yusuf'a Gönder" yaptığında burada görünecek.
          </p>
        </div>
      )}

      {mounted && drafts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {drafts.map((d) => (
            <div key={d.id} className="space-y-2">
              <DesignCard
                design={d}
                onClick={() => setActive(d)}
                showMockup
                highlight
              />
              <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                {d.sku && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-300">
                    <Hash className="h-2.5 w-2.5" />
                    {d.sku}
                  </span>
                )}
                {d.pricing?.finalPrice ? (
                  <span className="text-emerald-400 font-semibold">
                    ${d.pricing.finalPrice.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-amber-400">Fiyat yok</span>
                )}
                <span className="text-slate-500">
                  • {d.mockups.length} mockup
                </span>
              </div>
              <Button
                onClick={(e) => quickPublish(d, e)}
                disabled={quickPublishing === d.id}
                size="sm"
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-90 disabled:opacity-50"
              >
                {quickPublishing === d.id ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Yayınlanıyor…
                  </>
                ) : (
                  <>
                    <Rocket className="h-3.5 w-3.5" /> Mağazada Yayınla
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {active && (
        <DraftPublishDialog
          key={active.id}
          design={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
