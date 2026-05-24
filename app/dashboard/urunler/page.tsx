"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, Search, Images, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDesignStore } from "@/lib/store";
import { Design } from "@/lib/types";
import { ProductDetailDialog } from "@/components/product-detail-dialog";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "price" | "name";

export default function UrunlerPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [active, setActive] = useState<Design | null>(null);

  const products = useMemo(() => {
    const onlyActive = designs.filter((d) => d.status === "Aktif Mağaza");
    const q = search.trim().toLowerCase();
    const filtered = q
      ? onlyActive.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.seo?.title?.toLowerCase().includes(q) ||
            d.seo?.tags?.some((t) => t.toLowerCase().includes(q))
        )
      : onlyActive;
    return [...filtered].sort((a, b) => {
      if (sort === "newest" || sort === "oldest") {
        const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return sort === "newest" ? tb - ta : ta - tb;
      }
      if (sort === "price") {
        const pa = a.pricing?.finalPrice ?? 0;
        const pb = b.pricing?.finalPrice ?? 0;
        return pb - pa;
      }
      return a.name.localeCompare(b.name, "tr");
    });
  }, [designs, search, sort]);

  return (
    <div>
      <PageHeader
        title="Ürünler — Aktif Mağaza"
        description="Etsy'de yayınladığın tüm ürünler. Tıklayınca tasarım + mockup + SEO + fiyat detayları ve indirme."
        icon={<Package className="h-5 w-5" />}
        accent="from-rose-500 to-pink-500"
      >
        <Badge variant="success">{mounted ? products.length : 0} ürün</Badge>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Ürün adı, SEO başlığı veya etiket ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-900 border-slate-800"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md bg-slate-900 border border-slate-800 p-1">
          {(
            [
              { id: "newest", label: "Yeni" },
              { id: "oldest", label: "Eski" },
              { id: "price", label: "Fiyat" },
              { id: "name", label: "A-Z" },
            ] as { id: SortKey; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSort(opt.id)}
              className={cn(
                "px-3 py-1.5 text-xs rounded font-medium transition-colors",
                sort === opt.id
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mounted && loading && products.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg border border-slate-800 bg-slate-900/30 animate-pulse"
            />
          ))}
        </div>
      )}

      {mounted && !loading && products.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <Package className="h-10 w-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">
            {search.trim()
              ? "Arama sonucunda ürün bulunamadı."
              : "Henüz yayınlanmış ürün yok."}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Taha bir ürünü "Etsy'de Yayınlandı" yapınca burada görünecek.
          </p>
        </div>
      )}

      {mounted && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              design={p}
              onClick={() => setActive(p)}
            />
          ))}
        </div>
      )}

      {active && (
        <ProductDetailDialog
          key={active.id}
          design={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function ProductCard({
  design,
  onClick,
}: {
  design: Design;
  onClick: () => void;
}) {
  const cover = design.mockups[0]?.url || design.originalImageUrl;
  const hasMockup = design.mockups.length > 0;
  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer overflow-hidden border-slate-800/80 bg-gradient-to-br from-slate-900/70 to-slate-900/30 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-rose-500/40 hover:shadow-2xl hover:shadow-rose-500/10"
    >
      <div
        className={cn(
          "relative aspect-square",
          hasMockup ? "bg-slate-950" : "checkerboard"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={design.name}
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-105",
            hasMockup ? "object-cover" : "object-contain p-2"
          )}
        />
        {hasMockup && design.mockups.length > 1 && (
          <Badge
            variant="info"
            className="absolute top-2 left-2 text-[10px] flex items-center gap-1"
          >
            <Images className="h-2.5 w-2.5" /> {design.mockups.length}
          </Badge>
        )}
        {design.pricing?.finalPrice && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-emerald-500/90 text-emerald-950 text-[11px] font-bold shadow-lg flex items-center">
            <DollarSign className="h-2.5 w-2.5" />
            {design.pricing.finalPrice.toFixed(2)}
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="font-medium text-sm truncate" title={design.name}>
          {design.name}
        </p>
        <p className="text-[11px] text-slate-500">
          {design.publishedAt &&
            format(new Date(design.publishedAt), "d MMM yyyy", { locale: tr })}
        </p>
      </div>
    </Card>
  );
}
