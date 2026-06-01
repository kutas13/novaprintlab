"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  Wand2,
  Check,
  X,
  ArrowRight,
  Clock,
  Hash,
  ListChecks,
  Brain,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
import type { Design, EtsyAttributes, SeoData } from "@/lib/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function KerimPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);
  const updateSeo = useDesignStore((s) => s.updateSeo);

  const waiting = useMemo(
    () => designs.filter((d) => d.status === "SEO Bekliyor"),
    [designs]
  );

  const completed = useMemo(
    () =>
      designs.filter(
        (d) =>
          d.status !== "SEO Bekliyor" &&
          d.seo &&
          (d.seo.title || (d.seo.tags && d.seo.tags.length))
      ),
    [designs]
  );

  const todayDone = useMemo(() => {
    if (!mounted) return 0;
    const today = new Date().toDateString();
    return completed.filter(
      (d) => new Date(d.createdAt).toDateString() === today
    ).length;
  }, [completed, mounted]);

  const [active, setActive] = useState<Design | null>(null);
  const next = waiting[0];

  return (
    <div>
      <PageHeader
        title="SEO Komuta Merkezi"
        description="Yusuf'un yüklediği tasarımlara AI ile Etsy uyumlu başlık, açıklama ve 13 etiket üret."
        icon={<Sparkles className="h-5 w-5" />}
        accent="from-violet-500 to-fuchsia-500"
      >
        <Badge
          variant={waiting.length > 0 ? "warning" : "success"}
          className="gap-1.5"
        >
          <Clock className="h-3 w-3" />
          {waiting.length} kuyrukta
        </Badge>
      </PageHeader>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-7">
        <KpiCard
          label="SEO Kuyruğu"
          value={waiting.length}
          icon={Clock}
          accent="amber"
        />
        <KpiCard
          label="Bugün tamamlanan"
          value={todayDone}
          icon={CheckCircle2}
          accent="emerald"
        />
        <KpiCard
          label="Toplam tamamlanan"
          value={completed.length}
          icon={FileText}
          accent="violet"
        />
        <KpiCard
          label="AI hızı"
          value={completed.length > 0 ? "~12s" : "Hazır"}
          icon={Brain}
          accent="blue"
          isText
        />
      </div>

      {/* Next-up hero CTA */}
      {mounted && next && (
        <NextUpCard design={next} onOpen={() => setActive(next)} count={waiting.length} />
      )}

      {/* Queue list */}
      <section className="mt-9">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            SEO Kuyruğu
            {mounted && waiting.length > 0 && (
              <Badge variant="warning">{waiting.length}</Badge>
            )}
          </h2>
        </div>

        {mounted && loading && waiting.length === 0 && <SkeletonRows />}

        {mounted && !loading && waiting.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <p className="text-base font-semibold text-slate-200 mb-1">
              Kuyruk boş 🎉
            </p>
            <p className="text-sm text-slate-500">
              Yusuf yeni tasarım yüklediğinde burada görünecek.
            </p>
          </div>
        )}

        {mounted && waiting.length > 0 && (
          <div className="space-y-2.5">
            {waiting.map((d, i) => (
              <QueueRow
                key={d.id}
                design={d}
                index={i + 1}
                onOpen={() => setActive(d)}
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
                "SEO kaydedildi. Ürün 'Mockup Bekliyor' durumuna geçti."
              );
              setActive(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Bilinmeyen hata.";
              const code =
                (e as Error & { code?: string })?.code ??
                ((e as { code?: string })?.code as string | undefined);
              if (code === "ATTRIBUTES_NOT_PERSISTED") {
                toast.warning(msg, { duration: 8000 });
                setActive(null);
              } else {
                toast.error(`Kaydetme başarısız: ${msg}`, { duration: 10000 });
                console.error("[Kerim updateSeo]", e);
              }
            }
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  isText,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "amber" | "emerald" | "violet" | "blue";
  isText?: boolean;
}) {
  const map = {
    amber: { bg: "bg-amber-500/10", ring: "ring-amber-500/25", text: "text-amber-300" },
    emerald: { bg: "bg-emerald-500/10", ring: "ring-emerald-500/25", text: "text-emerald-300" },
    violet: { bg: "bg-violet-500/10", ring: "ring-violet-500/25", text: "text-violet-300" },
    blue: { bg: "bg-blue-500/10", ring: "ring-blue-500/25", text: "text-blue-300" },
  };
  const c = map[accent];

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-3.5 backdrop-blur shadow-elev-1">
      <span className={cn("h-8 w-8 rounded-lg ring-1 flex items-center justify-center mb-2", c.bg, c.ring)}>
        <Icon className={cn("h-4 w-4", c.text)} />
      </span>
      <div className={cn("font-bold text-white leading-none tabular-nums", isText ? "text-xl" : "text-2xl")}>
        {value}
      </div>
      <div className="text-[11px] text-slate-500 mt-1.5 font-medium">{label}</div>
    </div>
  );
}

function NextUpCard({
  design,
  onOpen,
  count,
}: {
  design: Design;
  onOpen: () => void;
  count: number;
}) {
  return (
    <div className="relative animate-slide-up">
      <div className="absolute inset-x-8 -top-2 h-24 bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-pink-500/10 blur-3xl pointer-events-none" />
      <div className="relative rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-slate-900/60 to-slate-900/40 backdrop-blur p-5 sm:p-6 shadow-elev-3">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <div className="flex items-center gap-4 sm:flex-col sm:items-stretch shrink-0">
            <div className="aspect-square w-24 sm:w-32 lg:w-36 rounded-2xl checkerboard overflow-hidden relative shrink-0 ring-1 ring-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={design.originalImageUrl}
                alt={design.name}
                className="absolute inset-0 w-full h-full object-contain p-2"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="violet" className="gap-1.5">
                <Sparkles className="h-3 w-3" /> Sıradaki
              </Badge>
              {count > 1 && (
                <span className="text-[11px] text-slate-500">
                  · {count - 1} daha bekliyor
                </span>
              )}
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-1 truncate">
              {design.name}
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-5">
              {design.sku && (
                <span className="font-mono bg-slate-800/60 rounded px-2 py-0.5 text-slate-300">
                  {design.sku}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(design.createdAt), "d MMM • HH:mm", {
                  locale: tr,
                })}
              </span>
            </div>

            <Button
              onClick={onOpen}
              size="lg"
              className="w-full sm:w-auto"
            >
              <Wand2 className="h-4 w-4" />
              AI ile SEO Üret
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueRow({
  design,
  index,
  onOpen,
}: {
  design: Design;
  index: number;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left group relative flex items-center gap-3 sm:gap-4 p-3 rounded-2xl border border-slate-800/70 bg-slate-900/40 hover:bg-slate-900/80 hover:border-violet-500/30 transition-all backdrop-blur"
    >
      <span className="shrink-0 h-7 w-7 rounded-lg bg-slate-800/80 text-slate-400 text-xs font-bold flex items-center justify-center tabular-nums group-hover:bg-violet-500/15 group-hover:text-violet-300 transition-colors">
        {index}
      </span>

      <div className="aspect-square h-14 w-14 sm:h-16 sm:w-16 rounded-xl checkerboard overflow-hidden relative shrink-0 ring-1 ring-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={design.originalImageUrl}
          alt={design.name}
          className="absolute inset-0 w-full h-full object-contain p-1.5"
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white truncate group-hover:text-violet-200 transition-colors">
          {design.name}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
          {design.sku && (
            <span className="font-mono bg-slate-800/70 rounded px-1.5 py-0.5 text-slate-400">
              {design.sku}
            </span>
          )}
          <span>
            {format(new Date(design.createdAt), "d MMM • HH:mm", { locale: tr })}
          </span>
        </div>
      </div>

      <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-400 group-hover:text-violet-300 transition-colors">
        AI SEO üret
        <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
      </span>
      <ArrowRight className="sm:hidden h-4 w-4 text-slate-500 group-hover:text-violet-300 transition-colors" />
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-20 rounded-2xl border border-slate-800 bg-slate-900/30 animate-pulse"
        />
      ))}
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
  const [attrs, setAttrs] = useState<EtsyAttributes>({
    clothingStyle: design.seo?.attributes?.clothingStyle ?? "",
    occasion: design.seo?.attributes?.occasion ?? "",
    holiday: design.seo?.attributes?.holiday ?? "",
    graphic: design.seo?.attributes?.graphic ?? "",
  });
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
      if (data.attributes) {
        setAttrs({
          clothingStyle: data.attributes.clothingStyle ?? "",
          occasion: data.attributes.occasion ?? "",
          holiday: data.attributes.holiday ?? "",
          graphic: data.attributes.graphic ?? "",
        });
      }
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
      const cleanAttrs: EtsyAttributes = {
        clothingStyle: attrs.clothingStyle?.trim() || undefined,
        occasion: attrs.occasion?.trim() || undefined,
        holiday: attrs.holiday?.trim() || undefined,
        graphic: attrs.graphic?.trim() || undefined,
      };
      const hasAttrs = Object.values(cleanAttrs).some(Boolean);
      await onSave({
        title: title.trim().slice(0, 140),
        description: description.trim(),
        tags: tags
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 13),
        attributes: hasAttrs ? cleanAttrs : undefined,
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
            Etsy SEO içeriğini AI ile oluştur veya elle düzenle. Açıklama emoji-zengin, bölümlü Etsy formatında üretilir.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
          <div className="aspect-square checkerboard rounded-xl overflow-hidden relative shrink-0 max-w-[200px] mx-auto md:mx-0 w-full ring-1 ring-slate-800">
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
              AI tasarımın görselini analiz edip Etsy&apos;ye optimize İngilizce başlık, açıklama ve 13 etiket üretir.
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
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-cyan-400" />
                <Label className="text-sm">Etsy Listeleme Özellikleri</Label>
                <span className="text-[10px] text-slate-500">
                  ({
                    [attrs.clothingStyle, attrs.occasion, attrs.holiday, attrs.graphic].filter(
                      (v) => v && v.trim()
                    ).length
                  } / 4)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">
                Etsy listeleme formundaki 4 dropdown için AI önerisi. Taha & ekip Etsy&apos;de bu değerleri seçecek; istersen düzenle.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <AttrInput
                  label="Giyim tarzı"
                  hint="Clothing style"
                  placeholder="Örn. T-shirt, Hoodie, Sweatshirt"
                  value={attrs.clothingStyle ?? ""}
                  onChange={(v) => setAttrs((a) => ({ ...a, clothingStyle: v }))}
                  disabled={saving}
                />
                <AttrInput
                  label="Vekalet"
                  hint="Occasion"
                  placeholder="Örn. Birthday, Christmas, Wedding"
                  value={attrs.occasion ?? ""}
                  onChange={(v) => setAttrs((a) => ({ ...a, occasion: v }))}
                  disabled={saving}
                />
                <AttrInput
                  label="Tatil"
                  hint="Holiday"
                  placeholder="Örn. Christmas, Halloween, Easter"
                  value={attrs.holiday ?? ""}
                  onChange={(v) => setAttrs((a) => ({ ...a, holiday: v }))}
                  disabled={saving}
                />
                <AttrInput
                  label="Grafik"
                  hint="Graphic"
                  placeholder="Örn. Floral, Quote, Animal, Vintage"
                  value={attrs.graphic ?? ""}
                  onChange={(v) => setAttrs((a) => ({ ...a, graphic: v }))}
                  disabled={saving}
                />
              </div>
            </div>

            <Separator className="bg-slate-800" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-slate-500" />
                  Etiketler (13 adet)
                </Label>
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
                      className="!pl-7 !text-xs !h-9"
                      disabled={saving}
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-600">
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
            disabled={saving}
          >
            <X className="h-4 w-4" /> İptal
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            variant="success"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Onayla & Taha&apos;ya Gönder
              </>
            )}
          </Button>
        </div>

        <DesignActions design={design} variant="full" onActed={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function AttrInput({
  label,
  hint,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] flex items-baseline gap-1.5 uppercase tracking-wider text-slate-400 font-semibold">
        {label}
        <span className="text-[10px] text-slate-600 normal-case font-normal">
          · {hint}
        </span>
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 80))}
        placeholder={placeholder}
        disabled={disabled}
        className="!h-9 !text-xs"
      />
    </div>
  );
}
