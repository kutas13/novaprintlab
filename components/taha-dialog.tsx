"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  Download,
  Copy,
  CheckCircle2,
  Rocket,
  X,
  Loader2,
  Save,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
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
import { copyToClipboard, cn } from "@/lib/utils";

export function TahaDialog({
  design,
  onClose,
}: {
  design: Design;
  onClose: () => void;
}) {
  const updatePricing = useDesignStore((s) => s.updatePricing);
  const addMockups = useDesignStore((s) => s.addMockups);
  const removeMockup = useDesignStore((s) => s.removeMockup);
  const publishDesign = useDesignStore((s) => s.publishDesign);
  const saveAsDraft = useDesignStore((s) => s.saveAsDraft);
  const liveDesign = useDesignStore((s) =>
    s.designs.find((d) => d.id === design.id)
  );
  const current = liveDesign ?? design;

  const [busy, setBusy] = useState<
    "upload" | "publish" | "draft" | "pricing" | null
  >(null);

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
    if (files.length === 0) return;
    setBusy("upload");
    try {
      await addMockups(current.id, files);
      toast.success(
        files.length === 1
          ? "Mockup yüklendi."
          : `${files.length} mockup yüklendi.`
      );
    } catch {
      toast.error("Mockup yüklenemedi.");
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveMockup = async (path: string) => {
    setBusy("upload");
    try {
      await removeMockup(current.id, path);
    } catch {
      toast.error("Mockup silinemedi.");
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
    if (current.mockups.length === 0) {
      toast.error("Önce en az bir bitmiş mockup yüklemelisin.");
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

  const draft = async () => {
    if (current.mockups.length === 0) {
      toast.error("Taslağa kaydetmek için en az bir mockup yükle.");
      return;
    }
    setBusy("draft");
    try {
      await saveAsDraft(current.id);
      toast.success(
        `'${current.name}' Taslaklar'a kaydedildi. Daha sonra yayınlayabilirsin.`
      );
      onClose();
    } catch {
      toast.error("Taslağa kaydetme başarısız.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ImageIcon className="h-5 w-5 text-amber-400" /> {current.name}
            {current.sku && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700">
                <Hash className="h-3 w-3" />
                {current.sku}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Tasarımı indir, SEO'yu kopyala, kâr hesapla, mockup(lar) yükle, sonra
            Taslağa kaydet veya doğrudan yayınla.
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
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-blue-400" /> Bitmiş Mockuplar
                </h3>
                {current.mockups.length > 0 && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" /> {current.mockups.length} mockup
                  </span>
                )}
              </div>

              {current.mockups.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {current.mockups.map((m, i) => (
                    <div
                      key={m.path}
                      className="relative aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800 group/mock"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.url}
                        alt={`mockup ${i + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => handleRemoveMockup(m.path)}
                        disabled={busy !== null}
                        className="absolute top-1 right-1 h-6 w-6 rounded-md bg-slate-950/80 hover:bg-red-500/90 border border-slate-700 flex items-center justify-center disabled:opacity-50 opacity-0 group-hover/mock:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-slate-950/80 text-slate-300 rounded px-1.5 py-0.5">
                        #{i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {busy === "upload" ? (
                <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 p-6 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                </div>
              ) : (
                <Dropzone
                  multiple
                  onFiles={handleMockupUpload}
                  hint={
                    current.mockups.length > 0
                      ? "Daha fazla mockup ekle (birden fazla seçebilirsin)"
                      : "Birden fazla mockup seçebilir veya sürükleyebilirsin"
                  }
                  className="p-4"
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                onClick={draft}
                disabled={current.mockups.length === 0 || busy !== null}
                variant="outline"
                size="lg"
                className="w-full border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 disabled:opacity-50"
              >
                {busy === "draft" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Taslağa Kaydet
                  </>
                )}
              </Button>
              <Button
                onClick={publish}
                disabled={
                  current.mockups.length === 0 ||
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
                    <Rocket className="h-4 w-4" /> Etsy'de Yayınla
                  </>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              <strong className="text-violet-300">Taslak</strong>: fiyat
              opsiyonel, sonradan yayınlanabilir •{" "}
              <strong className="text-emerald-300">Yayınla</strong>: fiyat şart,
              takvim hemen güncellenir
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
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 text-xs">
          <Copy className="h-3 w-3" /> Kopyala
        </Button>
      </div>
      <p
        className={cn(
          multiline
            ? "text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto scrollbar-thin pr-2"
            : "text-sm text-slate-200 font-medium leading-snug"
        )}
      >
        {value}
      </p>
    </div>
  );
}
