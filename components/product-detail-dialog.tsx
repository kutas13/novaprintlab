"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import {
  Download,
  Copy,
  Package,
  DollarSign,
  Calendar,
  Tags,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Hash,
} from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";
import { Design } from "@/lib/types";
import { copyToClipboard, cn } from "@/lib/utils";
import { downloadUrl, extFromUrl, safeFilename } from "@/lib/download";
import { DesignActions } from "@/components/design-actions";

export function ProductDetailDialog({
  design,
  onClose,
}: {
  design: Design;
  onClose: () => void;
}) {
  const [activeMockup, setActiveMockup] = useState(0);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingSingle, setDownloadingSingle] = useState<string | null>(
    null
  );

  const base = safeFilename(design.name);
  const total = design.mockups.length;
  const current = total > 0 ? design.mockups[activeMockup] : null;

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`${label} kopyalandı`);
    else toast.error("Kopyalama başarısız.");
  };

  const handleDownloadOriginal = async () => {
    setDownloadingSingle("original");
    const ext = extFromUrl(design.originalImageUrl, "png");
    const ok = await downloadUrl(
      design.originalImageUrl,
      `${base}-original.${ext}`
    );
    setDownloadingSingle(null);
    if (!ok) toast.error("Orijinal PNG indirilemedi.");
  };

  const handleDownloadOne = async (url: string, idx: number) => {
    setDownloadingSingle(url);
    const ext = extFromUrl(url, "jpg");
    const ok = await downloadUrl(url, `${base}-mockup-${idx + 1}.${ext}`);
    setDownloadingSingle(null);
    if (!ok) toast.error(`Mockup #${idx + 1} indirilemedi.`);
  };

  const handleDownloadAll = async () => {
    if (design.mockups.length === 0) return;
    setDownloadingAll(true);
    try {
      const orig = downloadUrl(
        design.originalImageUrl,
        `${base}-original.${extFromUrl(design.originalImageUrl, "png")}`
      );
      const mockups = design.mockups.map((m, i) =>
        downloadUrl(m.url, `${base}-mockup-${i + 1}.${extFromUrl(m.url, "jpg")}`)
      );
      await Promise.all([orig, ...mockups]);
      toast.success(
        `${design.mockups.length + 1} dosya indirildi (orijinal + ${design.mockups.length} mockup).`
      );
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 sm:max-w-5xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Package className="h-5 w-5 text-rose-400" /> {design.name}
            </DialogTitle>
            <StatusBadge status={design.status} />
            {design.sku && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700">
                <Hash className="h-3 w-3" />
                {design.sku}
              </span>
            )}
          </div>
          <DialogDescription className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
            {design.publishedAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(design.publishedAt), "d MMM yyyy • HH:mm", {
                  locale: tr,
                })}{" "}
                yayınlandı
              </span>
            )}
            {design.pricing?.finalPrice && (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <DollarSign className="h-3 w-3" />
                {design.pricing.finalPrice.toFixed(2)} Etsy fiyatı
              </span>
            )}
            <span className="flex items-center gap-1">
              <Tags className="h-3 w-3" /> {design.mockups.length} mockup
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">
          {/* LEFT: Visual gallery */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {/* Original */}
              <div className="space-y-2">
                <div className="aspect-square rounded-xl overflow-hidden checkerboard relative group/orig border border-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={design.originalImageUrl}
                    alt={design.name}
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
                  onClick={handleDownloadOriginal}
                  disabled={downloadingSingle === "original"}
                  variant="outline"
                  size="sm"
                  className="w-full border-slate-700"
                >
                  {downloadingSingle === "original" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}{" "}
                  Orijinal İndir
                </Button>
              </div>

              {/* Active mockup */}
              <div className="space-y-2">
                <div className="aspect-square rounded-xl overflow-hidden bg-slate-950 relative border border-slate-800 group/mock">
                  {current ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={current.url}
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
                            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-950/80 hover:bg-slate-950 text-slate-200 flex items-center justify-center"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              setActiveMockup((i) => (i + 1) % total)
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-950/80 hover:bg-slate-950 text-slate-200 flex items-center justify-center"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                      Mockup yok
                    </div>
                  )}
                </div>
                {current && (
                  <Button
                    onClick={() => handleDownloadOne(current.url, activeMockup)}
                    disabled={downloadingSingle === current.url}
                    variant="outline"
                    size="sm"
                    className="w-full border-slate-700"
                  >
                    {downloadingSingle === current.url ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}{" "}
                    Mockup #{activeMockup + 1} İndir
                  </Button>
                )}
              </div>
            </div>

            {/* Mockup thumbnails */}
            {total > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Tüm Mockuplar ({total})
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {design.mockups.map((m, i) => (
                    <button
                      key={m.path}
                      onClick={() => setActiveMockup(i)}
                      className={cn(
                        "aspect-square rounded-lg overflow-hidden border-2 transition-all relative",
                        i === activeMockup
                          ? "border-rose-400 ring-2 ring-rose-500/20"
                          : "border-slate-800 hover:border-slate-700"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.url}
                        alt={`thumb ${i + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold bg-slate-950/80 text-slate-200 rounded px-1">
                        {i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleDownloadAll}
              disabled={downloadingAll || total === 0}
              className="w-full bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:opacity-90 shadow-lg shadow-rose-500/20"
            >
              {downloadingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> İndiriliyor…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Tümünü İndir (Orijinal + {total} mockup)
                </>
              )}
            </Button>
          </div>

          {/* RIGHT: Details */}
          <div className="space-y-4">
            {/* SEO */}
            {design.seo && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Tags className="h-4 w-4 text-violet-400" /> Etsy SEO
                </h3>

                <CopyBlock
                  label="Başlık"
                  value={design.seo.title}
                  onCopy={() => copy(design.seo!.title, "Başlık")}
                />
                <Separator className="bg-slate-800" />
                <CopyBlock
                  label="Açıklama"
                  value={design.seo.description}
                  multiline
                  onCopy={() => copy(design.seo!.description, "Açıklama")}
                />
                <Separator className="bg-slate-800" />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      13 Etiket
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copy(design.seo!.tags.join(", "), "Etiketler")
                      }
                      className="h-7 text-xs"
                    >
                      <Copy className="h-3 w-3" /> Tümünü Kopyala
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {design.seo.tags.map((t, i) => (
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

            {/* Pricing */}
            {design.pricing && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-400" /> Fiyatlandırma
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <PriceRow
                    label="Printify ürün"
                    value={`$${design.pricing.printifyCost.toFixed(2)}`}
                  />
                  <PriceRow
                    label="Printify kargo"
                    value={`$${design.pricing.shippingCost.toFixed(2)}`}
                  />
                  <PriceRow
                    label="Hedef kâr"
                    value={`$${design.pricing.targetProfit.toFixed(2)}`}
                  />
                  <PriceRow
                    label="Etsy fiyatı"
                    value={
                      design.pricing.finalPrice
                        ? `$${design.pricing.finalPrice.toFixed(2)}`
                        : "—"
                    }
                    highlight
                  />
                </div>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full border-slate-700"
              onClick={() => window.open(design.originalImageUrl, "_blank")}
            >
              <ExternalLink className="h-4 w-4" /> Orijinali Yeni Sekmede Aç
            </Button>

            <DesignActions
              design={design}
              variant="full"
              onActed={onClose}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyBlock({
  label,
  value,
  onCopy,
  multiline,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCopy}
          className="h-7 text-xs"
        >
          <Copy className="h-3 w-3" /> Kopyala
        </Button>
      </div>
      <p
        className={cn(
          multiline
            ? "text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto scrollbar-thin pr-2 font-mono"
            : "text-sm text-slate-200 font-medium leading-snug"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PriceRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-2.5 border",
        highlight
          ? "bg-amber-500/10 border-amber-500/30"
          : "bg-slate-950/60 border-slate-800"
      )}
    >
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">
        {label}
      </p>
      <p
        className={cn(
          "font-bold text-sm mt-0.5",
          highlight ? "text-amber-300" : "text-slate-200"
        )}
      >
        {value}
      </p>
    </div>
  );
}
