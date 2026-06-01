"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  CheckCircle2,
  UploadCloud,
  Target,
  Layers,
  Sparkles,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Dropzone } from "@/components/dropzone";
import { DesignCard } from "@/components/design-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDesignStore } from "@/lib/store";

interface Pending {
  id: string;
  name: string;
  sku: string;
  file: File;
  previewUrl: string;
  uploading?: boolean;
  done?: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const DAILY_TARGET = 2;

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "seo", label: "SEO Bekliyor" },
  { key: "mockup", label: "Mockup Bekliyor" },
  { key: "active", label: "Aktif Mağaza" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function YusufPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const addDesign = useDesignStore((s) => s.addDesign);
  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [pending]);

  const todayUploads = useMemo(() => {
    if (!mounted) return 0;
    const todayStr = new Date().toDateString();
    return designs.filter(
      (d) => new Date(d.createdAt).toDateString() === todayStr
    ).length;
  }, [designs, mounted]);

  const handleFiles = (files: File[]) => {
    const next: Pending[] = files.map((f) => ({
      id: uid(),
      name: f.name.replace(/\.(png|jpe?g|webp)$/i, ""),
      sku: "",
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    setPending((p) => [...next, ...p]);
  };

  const saveAll = async () => {
    if (pending.length === 0) return;
    setSaving(true);
    let success = 0;
    const errors: string[] = [];
    try {
      await Promise.all(
        pending.map(async (p) => {
          setPending((arr) =>
            arr.map((x) => (x.id === p.id ? { ...x, uploading: true } : x))
          );
          try {
            const design = await addDesign(p.name, p.file, p.sku);
            if (design) success++;
            setPending((arr) =>
              arr.map((x) =>
                x.id === p.id
                  ? { ...x, uploading: false, done: !!design }
                  : x
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
            errors.push(`${p.name}: ${msg}`);
            setPending((arr) =>
              arr.map((x) =>
                x.id === p.id
                  ? { ...x, uploading: false, done: false }
                  : x
              )
            );
          }
        })
      );
      if (success > 0) {
        toast.success(
          `${success} tasarım yüklendi. Kerim'in SEO listesine düştü.`
        );
        setTimeout(() => {
          setPending((arr) => arr.filter((x) => !x.done));
        }, 700);
      }
      if (errors.length > 0) {
        toast.error(errors[0], {
          description:
            errors.length > 1
              ? `+${errors.length - 1} başka hata. Detay için konsolu aç.`
              : undefined,
          duration: 10_000,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const removePending = (id: string) => {
    setPending((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  };

  const filtered = useMemo(() => {
    return designs.filter((d) => {
      if (filter === "seo" && d.status !== "SEO Bekliyor") return false;
      if (filter === "mockup" && d.status !== "Mockup ve Yayınlama Bekliyor")
        return false;
      if (filter === "active" && d.status !== "Aktif Mağaza") return false;
      if (
        search &&
        !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !(d.sku || "").toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [designs, filter, search]);

  const dailyProgress = Math.min(100, (todayUploads / DAILY_TARGET) * 100);
  const targetReached = todayUploads >= DAILY_TARGET;

  return (
    <div>
      <PageHeader
        title="Tasarım Atölyesi"
        description="Şeffaf PNG/JPEG yükle. Yüklediğin her tasarım otomatik olarak Kerim'in SEO listesine düşer."
        icon={<Upload className="h-5 w-5" />}
        accent="from-emerald-500 to-teal-500"
      >
        <Badge variant={targetReached ? "success" : "warning"} className="gap-1.5">
          <Target className="h-3 w-3" />
          {targetReached ? "Bugün hedef tamam" : `${todayUploads}/${DAILY_TARGET} bugün`}
        </Badge>
      </PageHeader>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7">
        <StatTile
          label="Bugün yüklenen"
          value={todayUploads}
          accent="emerald"
          icon={Upload}
        />
        <StatTile
          label="SEO Bekliyor"
          value={designs.filter((d) => d.status === "SEO Bekliyor").length}
          accent="violet"
          icon={Sparkles}
        />
        <StatTile
          label="Mockup Bekliyor"
          value={
            designs.filter((d) => d.status === "Mockup ve Yayınlama Bekliyor")
              .length
          }
          accent="amber"
          icon={Layers}
        />
        <StatTile
          label="Toplam tasarım"
          value={designs.length}
          accent="blue"
          icon={Target}
        />
      </div>

      {/* Hero upload zone */}
      <div className="relative mb-8">
        <div className="absolute inset-x-8 -top-2 h-24 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur p-1 shadow-elev-3">
          <div className="rounded-[22px] overflow-hidden">
            <Dropzone
              onFiles={handleFiles}
              disabled={saving}
              className="border-2 border-dashed border-slate-700/60 !bg-transparent hover:!bg-emerald-500/[0.03] hover:!border-emerald-500/40 !p-10 sm:!p-14 !rounded-[22px]"
              hint="PNG / JPEG • çoklu sürükle-bırak • aynı anda 10 dosyaya kadar"
            />
          </div>

          {/* Daily progress bar */}
          <div className="px-5 py-3 border-t border-slate-800/60 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-400">Bugünkü ilerleme</span>
                <span className="text-slate-300 font-semibold tabular-nums">
                  {todayUploads} / {DAILY_TARGET}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    targetReached
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : "bg-gradient-to-r from-emerald-500/70 to-teal-500/70"
                  )}
                  style={{ width: `${dailyProgress}%` }}
                />
              </div>
            </div>
            {targetReached && (
              <Badge variant="success" className="gap-1 shrink-0">
                <CheckCircle2 className="h-3 w-3" /> Hedef
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <section className="mb-10 animate-slide-up">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
                <UploadCloud className="h-4 w-4 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  Kaydedilmeyi Bekleyen
                </h2>
                <p className="text-xs text-slate-500">
                  {pending.length} tasarım • SKU eklemek istersen şimdi yap
                </p>
              </div>
            </div>
            <Button
              onClick={saveAll}
              disabled={saving}
              variant="success"
              size="lg"
              className="shrink-0"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
                </>
              ) : (
                <>
                  Hepsini Kaydet ({pending.length})
                </>
              )}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {pending.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden relative group"
              >
                {(p.uploading || p.done) && (
                  <div className="absolute inset-0 z-20 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                    {p.uploading && (
                      <>
                        <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
                        <span className="text-[11px] text-emerald-300 font-medium">
                          Yükleniyor…
                        </span>
                      </>
                    )}
                    {p.done && (
                      <>
                        <div className="h-10 w-10 rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <span className="text-[11px] text-emerald-300 font-semibold">
                          Tamam
                        </span>
                      </>
                    )}
                  </div>
                )}
                <div className="aspect-square checkerboard relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt={p.name}
                    className="absolute inset-0 w-full h-full object-contain p-2"
                  />
                  {!saving && (
                    <button
                      onClick={() => removePending(p.id)}
                      className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-slate-950/80 hover:bg-red-500/90 border border-slate-700 hover:border-red-500 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                      aria-label="Kaldır"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur text-[10px] text-slate-300 font-medium tabular-nums">
                    {(p.file.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <div className="p-2.5 space-y-1.5">
                  <Input
                    value={p.name}
                    onChange={(e) =>
                      setPending((arr) =>
                        arr.map((x) =>
                          x.id === p.id ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                    disabled={saving}
                    className="!h-9 !text-sm"
                    placeholder="Tasarım adı"
                  />
                  <Input
                    value={p.sku}
                    onChange={(e) =>
                      setPending((arr) =>
                        arr.map((x) =>
                          x.id === p.id
                            ? { ...x, sku: e.target.value.toUpperCase() }
                            : x
                        )
                      )
                    }
                    disabled={saving}
                    className="!h-8 !text-[11px] font-mono uppercase tracking-wider !text-slate-300"
                    placeholder="SKU — NPL-001"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gallery */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-bold text-white">Tasarım Galerisi</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {mounted ? `${filtered.length} / ${designs.length}` : "Yükleniyor…"} tasarım listelendi
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ad / SKU ara…"
                className="!h-9 pl-8 !text-xs w-44 sm:w-56"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800 mb-5 overflow-x-auto scrollbar-thin">
          {FILTERS.map((f) => {
            const count =
              f.key === "all"
                ? designs.length
                : f.key === "seo"
                  ? designs.filter((d) => d.status === "SEO Bekliyor").length
                  : f.key === "mockup"
                    ? designs.filter(
                        (d) => d.status === "Mockup ve Yayınlama Bekliyor"
                      ).length
                    : designs.filter((d) => d.status === "Aktif Mağaza").length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2",
                  active
                    ? "bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-300 ring-1 ring-emerald-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
              >
                {f.label}
                {mounted && (
                  <span
                    className={cn(
                      "tabular-nums text-[10px] px-1.5 py-0.5 rounded-md",
                      active
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-800 text-slate-500"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {mounted && loading && filtered.length === 0 && <SkeletonGrid />}

        {mounted && !loading && filtered.length === 0 && (
          <EmptyState
            search={search}
            filter={filter}
            hasAny={designs.length > 0}
          />
        )}

        {mounted && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((d) => (
              <DesignCard key={d.id} design={d} showMockup />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number;
  accent: "emerald" | "violet" | "amber" | "blue";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const map = {
    emerald: { bg: "bg-emerald-500/10", ring: "ring-emerald-500/25", text: "text-emerald-300" },
    violet: { bg: "bg-violet-500/10", ring: "ring-violet-500/25", text: "text-violet-300" },
    amber: { bg: "bg-amber-500/10", ring: "ring-amber-500/25", text: "text-amber-300" },
    blue: { bg: "bg-blue-500/10", ring: "ring-blue-500/25", text: "text-blue-300" },
  };
  const c = map[accent];

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-3.5 backdrop-blur shadow-elev-1">
      <div className="flex items-center justify-between mb-2">
        <span className={cn("h-8 w-8 rounded-lg ring-1 flex items-center justify-center", c.bg, c.ring)}>
          <Icon className={cn("h-4 w-4", c.text)} />
        </span>
      </div>
      <div className="text-2xl font-bold text-white tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[11px] text-slate-500 mt-1.5 font-medium">{label}</div>
    </div>
  );
}

function EmptyState({
  search,
  filter,
  hasAny,
}: {
  search: string;
  filter: FilterKey;
  hasAny: boolean;
}) {
  if (search) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-slate-800/60 flex items-center justify-center mb-3">
          <Search className="h-5 w-5 text-slate-500" />
        </div>
        <p className="text-sm font-semibold text-slate-300 mb-1">
          &quot;{search}&quot; için sonuç yok
        </p>
        <p className="text-xs text-slate-500">Farklı bir kelime dene veya filtreyi temizle.</p>
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-14 text-center">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center mb-4">
          <UploadCloud className="h-7 w-7 text-emerald-400" />
        </div>
        <p className="text-base font-semibold text-slate-200 mb-1">
          İlk tasarımını yükle
        </p>
        <p className="text-sm text-slate-500">
          Üstteki alandan PNG/JPEG sürükle bırak. Otomatik olarak Kerim&apos;e geçer.
        </p>
      </div>
    );
  }

  const labels: Record<FilterKey, string> = {
    all: "Hiç tasarım yok",
    seo: "SEO bekleyen tasarım yok",
    mockup: "Mockup bekleyen tasarım yok",
    active: "Henüz aktif mağazada ürün yok",
  };
  return (
    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
      {labels[filter]}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-2xl border border-slate-800 bg-slate-900/30 animate-pulse"
        />
      ))}
    </div>
  );
}
