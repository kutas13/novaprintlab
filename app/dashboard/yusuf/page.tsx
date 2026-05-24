"use client";

import { useEffect, useState } from "react";
import { Upload, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Dropzone } from "@/components/dropzone";
import { DesignCard } from "@/components/design-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export default function YusufPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const addDesign = useDesignStore((s) => s.addDesign);
  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [pending]);

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
    try {
      await Promise.all(
        pending.map(async (p) => {
          setPending((arr) =>
            arr.map((x) => (x.id === p.id ? { ...x, uploading: true } : x))
          );
          const design = await addDesign(p.name, p.file, p.sku);
          if (design) success++;
          setPending((arr) =>
            arr.map((x) =>
              x.id === p.id ? { ...x, uploading: false, done: !!design } : x
            )
          );
        })
      );
      if (success > 0) {
        toast.success(
          `${success} tasarım yüklendi. Durum: SEO Bekliyor — Kerim'in listesine düştü.`
        );
        setTimeout(() => {
          setPending([]);
        }, 700);
      } else {
        toast.error("Yükleme başarısız. Konsolu kontrol et.");
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

  return (
    <div>
      <PageHeader
        title="Yusuf — Tasarım Yükle"
        description="Şeffaf PNG/JPEG tasarımları yükle. Durum otomatik olarak 'SEO Bekliyor' atanır ve Kerim'in listesine düşer."
        icon={<Upload className="h-5 w-5" />}
        accent="from-emerald-500 to-teal-500"
      />

      <Dropzone onFiles={handleFiles} disabled={saving} />

      {pending.length > 0 && (
        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-300">
              Kaydedilmeyi Bekleyen ({pending.length})
            </h2>
            <Button
              onClick={saveAll}
              disabled={saving}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white shadow-lg shadow-emerald-500/20"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
                </>
              ) : (
                <>Hepsini Kaydet & SEO Bekliyor'a Gönder</>
              )}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pending.map((p) => (
              <Card
                key={p.id}
                className="border-slate-800 bg-slate-900/50 overflow-hidden relative"
              >
                {(p.uploading || p.done) && (
                  <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center">
                    {p.uploading && (
                      <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
                    )}
                    {p.done && (
                      <CheckCircle2 className="h-8 w-8 text-emerald-400" />
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
                      className="absolute top-2 right-2 h-7 w-7 rounded-md bg-slate-950/70 hover:bg-red-500/80 border border-slate-700 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="p-3 space-y-2">
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
                    className="bg-slate-950 border-slate-800 text-sm"
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
                    className="bg-slate-950 border-slate-800 text-xs font-mono uppercase tracking-wider"
                    placeholder="SKU (örn. NPL-001)"
                  />
                  <p className="text-[11px] text-slate-500 truncate">
                    {(p.file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Tasarım Galerisi</h2>
          {mounted && (
            <span className="text-xs text-slate-500">
              {designs.length} tasarım
            </span>
          )}
        </div>
        {mounted && loading && designs.length === 0 && (
          <SkeletonGrid />
        )}
        {mounted && !loading && designs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
            Galeri boş. Yukarıdan ilk tasarımını yükle.
          </div>
        )}
        {mounted && designs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {designs.map((d) => (
              <DesignCard key={d.id} design={d} showMockup />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-lg border border-slate-800 bg-slate-900/30 animate-pulse"
        />
      ))}
    </div>
  );
}
