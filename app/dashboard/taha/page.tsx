"use client";

import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Download,
  Copy,
  CheckCircle2,
  Rocket,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { DesignCard } from "@/components/design-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dropzone } from "@/components/dropzone";
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
import { copyToClipboard } from "@/lib/utils";

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
        description="Tasarımı indir, SEO'yu kopyala, kâr hesapla, mockup yükle ve Etsy'de yayınla."
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

function TahaDialog({ design, onClose }: { design: Design; onClose: () => void }) {
  const updatePricing = useDesignStore((s) => s.updatePricing);
  const attachMockup = useDesignStore((s) => s.attachMockup);
  const removeMockup = useDesignStore((s) => s.removeMockup);
  const publishDesign = useDesignStore((s) => s.publishDesign);
  const liveDesign = useDesignStore((s) =>
    s.designs.find((d) => d.id === design.id)
  );
  const current = liveDesign ?? design;

  const [busy, setBusy] = useState<"upload" | "publish" | "pricing" | null>(
    null
  );

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

  const handleMockupUpload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setBusy("upload");
    try {
      await attachMockup(current.id, file);
      toast.success("Mockup yüklendi.");
    } catch {
      toast.error("Mockup yüklenemedi.");
    } finally {
      setBusy(null);
    }
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
    if (!current.mockupImagePath) {
      toast.error("Önce bitmiş mockup'ı yüklemelisin.");
      return;
    }
    if (!current.pricing?.finalPrice) {
      toast.error("Etsy fiyatını sabitlemen gerek.");
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

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-amber-400" /> {current.name}
          </DialogTitle>
          <DialogDescription>
            Tasarımı indir, SEO metinlerini kopyala, kâr hesapla, mockup yükle ve
            yayınla.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="aspect-square checkerboard rounded-lg overflow-hidden relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.originalImageUrl}
                alt={current.name}
                className="absolute inset-0 w-full h-full object-contain p-3"
              />
            </div>
            <Button
              onClick={downloadOriginal}
              variant="outline"
              className="w-full border-slate-700"
            >
              <Download className="h-4 w-4" /> Şeffaf PNG'yi İndir
            </Button>

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
                        className="group"
                      >
                        <Badge
                          variant="violet"
                          className="cursor-pointer group-hover:opacity-80"
                        >
                          #{t}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <ProfitCalculator
              initial={current.pricing}
              onLock={lockPricing}
              busy={busy === "pricing"}
            />

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-blue-400" /> Bitmiş Mockup
              </h3>

              {current.mockupImageUrl ? (
                <div className="space-y-2">
                  <div className="aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={current.mockupImageUrl}
                      alt="mockup"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeMockup(current.id)}
                      disabled={busy !== null}
                      className="absolute top-2 right-2 h-7 w-7 rounded-md bg-slate-950/80 hover:bg-red-500/80 border border-slate-700 flex items-center justify-center disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" /> Mockup hazır
                  </p>
                </div>
              ) : busy === "upload" ? (
                <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 p-10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                </div>
              ) : (
                <Dropzone
                  multiple={false}
                  onFiles={handleMockupUpload}
                  hint="Hazırladığın mockup fotoğrafı (JPEG/PNG)"
                  className="p-6"
                />
              )}
            </div>

            <Button
              onClick={publish}
              disabled={
                !current.mockupImagePath ||
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
                  <Rocket className="h-4 w-4" /> Etsy'de Yayınlandı Olarak
                  İşaretle
                </>
              )}
            </Button>
            <p className="text-[11px] text-slate-500 text-center">
              Yayınladığında takvimdeki bugünün kutusu güncellenir.
            </p>
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
        className={
          multiline
            ? "text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto scrollbar-thin pr-2"
            : "text-sm text-slate-200 font-medium leading-snug"
        }
      >
        {value}
      </p>
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
