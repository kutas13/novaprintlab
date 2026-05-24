"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, Wand2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { DesignCard } from "@/components/design-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useDesignStore } from "@/lib/store";
import { DesignActions } from "@/components/design-actions";
import type { Design, SeoData } from "@/lib/types";

export default function KerimPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);
  const updateSeo = useDesignStore((s) => s.updateSeo);

  const waiting = designs.filter((d) => d.status === "SEO Bekliyor");
  const [active, setActive] = useState<Design | null>(null);

  return (
    <div>
      <PageHeader
        title="Kerim — AI Destekli SEO"
        description="Yusuf'un yüklediği tasarımlara Etsy uyumlu başlık, açıklama ve 13 etiket üret."
        icon={<Sparkles className="h-5 w-5" />}
        accent="from-violet-500 to-fuchsia-500"
      />

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">SEO Bekleyenler</h2>
          {mounted && <Badge variant="warning">{waiting.length} ürün</Badge>}
        </div>

        {mounted && loading && waiting.length === 0 && <SkeletonGrid />}

        {mounted && !loading && waiting.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
            Şu anda SEO bekleyen tasarım yok. Yusuf yenilerini yüklediğinde
            burada görünecek.
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
        <SeoDialog
          key={active.id}
          design={active}
          onClose={() => setActive(null)}
          onSave={async (seo) => {
            try {
              await updateSeo(active.id, seo);
              toast.success(
                "SEO kaydedildi. Ürün 'Mockup ve Yayınlama Bekliyor' durumuna geçti."
              );
              setActive(null);
            } catch (e) {
              toast.error("Kaydetme başarısız. Tekrar dene.");
            }
          }}
        />
      )}
    </div>
  );
}

function SeoDialog({
  design,
  onClose,
  onSave,
}: {
  design: Design;
  onClose: () => void;
  onSave: (seo: SeoData) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(design.seo?.title || "");
  const [description, setDescription] = useState(design.seo?.description || "");
  const [tags, setTags] = useState<string[]>(
    design.seo?.tags && design.seo.tags.length === 13
      ? design.seo.tags
      : Array(13).fill("")
  );
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designName: design.name,
          imageUrl: design.originalImageUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error || "AI çağrısı başarısız.");
        return;
      }
      const { data } = json as { data: SeoData };
      setTitle(data.title);
      setDescription(data.description);
      const next = [...data.tags];
      while (next.length < 13) next.push("");
      setTags(next.slice(0, 13));
      toast.success("AI içerik üretildi. Kontrol edip kaydedebilirsin.");
    } catch {
      toast.error("AI isteği gönderilemedi.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!title.trim() || !description.trim() || tags.some((t) => !t.trim())) {
      toast.error("Başlık, açıklama ve 13 etiketin tamamı dolu olmalı.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim().slice(0, 140),
        description: description.trim(),
        tags: tags
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 13),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 sm:max-w-4xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" /> {design.name}
          </DialogTitle>
          <DialogDescription>
            Etsy SEO içeriğini AI ile oluştur veya elle düzenle. Açıklama
            emoji-zengin, bölümlü Etsy formatında üretilir.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
          <div className="aspect-square checkerboard rounded-lg overflow-hidden relative shrink-0 max-w-[200px] mx-auto md:mx-0 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={design.originalImageUrl}
              alt={design.name}
              className="absolute inset-0 w-full h-full object-contain p-2"
            />
          </div>

          <div className="space-y-4">
            <Button
              onClick={generate}
              disabled={generating || saving}
              className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white hover:opacity-90 shadow-lg shadow-violet-500/20"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Görsel analiz ediliyor…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" /> Görseli AI ile Analiz Et & SEO Üret
                </>
              )}
            </Button>
            <p className="text-[11px] text-slate-500 -mt-2">
              AI tasarımın görselini analiz edip Etsy'ye optimize İngilizce
              başlık, açıklama ve 13 etiket üretir.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Başlık (max 140)</Label>
                <span
                  className={
                    title.length > 140
                      ? "text-xs text-red-400"
                      : "text-xs text-slate-500"
                  }
                >
                  {title.length} / 140
                </span>
              </div>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 140))}
                placeholder="AI önerisi burada görünecek…"
                className="bg-slate-900 border-slate-800"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Açıklama</Label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {description.length.toLocaleString()} karakter
                </span>
              </div>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="AI üretilen emoji-zengin, bölümlü Etsy açıklaması burada görünecek…"
                className="bg-slate-900 border-slate-800 min-h-[360px] font-mono text-xs leading-relaxed whitespace-pre-wrap"
                disabled={saving}
              />
            </div>

            <Separator className="bg-slate-800" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Etiketler (13 adet)</Label>
                <span className="text-xs text-slate-500">
                  {tags.filter((t) => t.trim()).length} / 13
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {tags.map((tag, i) => (
                  <div key={i} className="relative">
                    <Input
                      value={tag}
                      onChange={(e) =>
                        setTags((arr) =>
                          arr.map((x, idx) =>
                            idx === i ? e.target.value.slice(0, 20) : x
                          )
                        )
                      }
                      placeholder={`Etiket ${i + 1}`}
                      className="bg-slate-900 border-slate-800 pl-7 text-xs"
                      disabled={saving}
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600">
                      #
                    </span>
                  </div>
                ))}
              </div>
              {tags.some((t) => t.trim()) && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {tags
                    .filter((t) => t.trim())
                    .map((t, i) => (
                      <Badge key={i} variant="violet">
                        #{t}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-800">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-700"
            disabled={saving}
          >
            <X className="h-4 w-4" /> İptal
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Onayla & Taha'ya Gönder
              </>
            )}
          </Button>
        </div>

        <DesignActions design={design} variant="full" onActed={onClose} />
      </DialogContent>
    </Dialog>
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
