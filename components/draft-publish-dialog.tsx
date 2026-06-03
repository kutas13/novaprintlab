"use client";

import { useState } from "react";
import {
  Rocket,
  Download,
  Copy,
  Hash,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  FileEdit,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProfitCalculator } from "@/components/profit-calculator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useDesignStore } from "@/lib/store";
import type { Design, PricingData } from "@/lib/types";
import { copyToClipboard, cn } from "@/lib/utils";
import { DesignActions } from "@/components/design-actions";
import { EtsyAttributesPanel } from "@/components/etsy-attributes-panel";
import { MockupDownloadButton } from "@/components/mockup-download-button";

export function DraftPublishDialog({
  design,
  onClose,
}: {
  design: Design;
  onClose: () => void;
}) {
  const updatePricing = useDesignStore((s) => s.updatePricing);
  const publishDesign = useDesignStore((s) => s.publishDesign);
  const liveDesign = useDesignStore((s) =>
    s.designs.find((d) => d.id === design.id)
  );
  const current = liveDesign ?? design;

  const [busy, setBusy] = useState<"pricing" | "publish" | null>(null);
  const [activeMockup, setActiveMockup] = useState(0);
  const total = current.mockups.length;

  const downloadOriginal = async () => {
    try {
      const res = await fetch(current.originalImageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext = (blob.type.split("/").pop() || "png").replace("jpeg", "jpg");
      const link = document.createElement("a");
      link.href = url;
      link.download = `${current.name}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("İndirme başarısız.");
    }
  };

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`${label} kopyalandı`);
    else toast.error("Kopyalama başarısız (clipboard izni).");
  };

  const lockPricing = async (pricing: PricingData) => {
    setBusy("pricing");
    try {
      await updatePricing(current.id, pricing);
      toast.success(`Fiyat sabitlendi: $${pricing.finalPrice?.toFixed(2)}`);
    } catch {
      toast.error("Fiyat kaydedilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (current.mockups.length === 0) {
      toast.error("Mockup yok. Önce Taha'nın mockup yüklemesi gerek.");
      return;
    }
    if (!current.pricing?.finalPrice) {
      toast.error("Önce fiyatı sabitle.");
      return;
    }
    setBusy("publish");
    try {
      await publishDesign(current.id);
      toast.success(
        `'${current.name}' Etsy'de yayınlandı olarak işaretlendi. Takvim güncellendi.`
      );
      onClose();
    } catch {
      toast.error("Yayınlama başarısız.");
    } finally {
      setBusy(null);
    }
  };

  const currentMockup = total > 0 ? current.mockups[activeMockup] : null;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 sm:max-w-4xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FileEdit className="h-5 w-5 text-violet-400" /> {current.name}
            <Badge variant="violet" className="text-[10px]">
              Taslak
            </Badge>
            {current.sku && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700">
                <Hash className="h-3 w-3" />
                {current.sku}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Taha mockup(lar)ı hazırladı. Fiyatı belirle, Mağazada Yayınla'ya
            bas — ürün Aktif Mağaza'ya geçsin.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* LEFT: visuals + SEO */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <div className="aspect-square checkerboard rounded-lg overflow-hidden relative border border-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.originalImageUrl}
                    alt={current.name}
                    className="absolute inset-0 w-full h-full object-contain p-2"
                  />
                  <Badge
                    variant="secondary"
                    className="absolute top-2 left-2 text-[10px]"
                  >
                    Şeffaf PNG
                  </Badge>
                </div>
                <Button
                  onClick={downloadOriginal}
                  variant="outline"
                  size="sm"
                  className="w-full border-slate-700"
                >
                  <Download className="h-3.5 w-3.5" /> Orijinali İndir
                </Button>
              </div>

              <div className="space-y-2">
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-950 relative border border-slate-800">
                  {currentMockup ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentMockup.url}
                        alt={`mockup ${activeMockup + 1}`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <Badge
                        variant="info"
                        className="absolute top-2 left-2 text-[10px]"
                      >
                        Mockup {activeMockup + 1}/{total}
                      </Badge>
                      {total > 1 && (
                        <>
                          <button
                            onClick={() =>
                              setActiveMockup((i) => (i - 1 + total) % total)
                            }
                            className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-slate-950/80 hover:bg-slate-950 text-slate-200 flex items-center justify-center"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              setActiveMockup((i) => (i + 1) % total)
                            }
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-slate-950/80 hover:bg-slate-950 text-slate-200 flex items-center justify-center"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                      <ImageIcon className="h-6 w-6 mr-2" /> Mockup yok
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-center text-slate-500">
                  {total > 0
                    ? `${total} bitmiş mockup`
                    : "Taha henüz mockup yüklemedi"}
                </div>
                {total > 0 && (
                  <MockupDownloadButton design={current} variant="full" />
                )}
              </div>
            </div>

            {current.seo && (
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <CopyRow
                  label="Başlık"
                  value={current.seo.title}
                  onCopy={() => copy(current.seo!.title, "Başlık")}
                  multiline={false}
                />
                <Separator className="bg-slate-800" />
                <CopyRow
                  label="Açıklama"
                  value={current.seo.description}
                  onCopy={() => copy(current.seo!.description, "Açıklama")}
                  multiline
                />
                <Separator className="bg-slate-800" />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      Etiketler (13)
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copy(current.seo!.tags.join(", "), "Etiketler")
                      }
                      className="h-7 text-xs"
                    >
                      <Copy className="h-3 w-3" /> Tümünü Kopyala
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {current.seo.tags.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => copy(t, `Etiket "${t}"`)}
                      >
                        <Badge variant="violet" className="cursor-pointer">
                          #{t}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <EtsyAttributesPanel attributes={current.seo?.attributes} />
          </div>

          {/* RIGHT: pricing + publish */}
          <div className="space-y-4">
            <ProfitCalculator
              initial={current.pricing}
              onLock={lockPricing}
              busy={busy === "pricing"}
            />

            <Button
              onClick={publish}
              disabled={
                total === 0 ||
                !current.pricing?.finalPrice ||
                busy !== null
              }
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-90 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              size="lg"
            >
              {busy === "publish" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Yayınlanıyor…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" /> Mağazada Yayınla
                </>
              )}
            </Button>
            {(total === 0 || !current.pricing?.finalPrice) && (
              <ul className="text-[11px] text-slate-500 space-y-1">
                {total === 0 && (
                  <li className="text-amber-400">
                    • Taha'nın mockup yüklemesi bekleniyor.
                  </li>
                )}
                {!current.pricing?.finalPrice && (
                  <li className="text-amber-400">
                    • Önce fiyatı sabitle (yukarıdaki hesaplayıcı).
                  </li>
                )}
              </ul>
            )}

            <DesignActions
              design={current}
              variant="full"
              onActed={onClose}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
  multiline,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  multiline: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
          {label}
        </span>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 text-xs">
          <Copy className="h-3 w-3" /> Kopyala
        </Button>
      </div>
      <p
        className={cn(
          multiline
            ? "text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto scrollbar-thin pr-2 font-mono"
            : "text-sm text-slate-200 font-medium leading-snug"
        )}
      >
        {value}
      </p>
    </div>
  );
}
