"use client";

import { useMemo, useState } from "react";
import { Download, ExternalLink, ImageOff, Search, X } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  OrderStatusBadge,
  ORDER_STATUS_OPTIONS,
} from "@/components/order-status-badge";
import { useDesignStore } from "@/lib/store";
import { useOrdersStore } from "@/lib/orders-store";
import { Design, Order, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { downloadUrl, extFromUrl, safeFilename } from "@/lib/download";

function flagEmoji(code?: string): string {
  if (!code || code.length !== 2) return "";
  const A = 0x1f1e6;
  const a = code.toUpperCase().charCodeAt(0);
  const b = code.toUpperCase().charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return "";
  return String.fromCodePoint(A + a - 65, A + b - 65);
}

export function OrdersTable() {
  const orders = useOrdersStore((s) => s.orders);
  const loading = useOrdersStore((s) => s.loading);
  const designs = useDesignStore((s) => s.designs);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // SKU -> Design lookup. Case-insensitive.
  const designBySku = useMemo(() => {
    const m = new Map<string, Design>();
    for (const d of designs) {
      if (d.sku) m.set(d.sku.trim().toUpperCase(), d);
    }
    return m;
  }, [designs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (o.orderNumber || "").toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q) ||
        (o.customerCountry || "").toLowerCase().includes(q) ||
        (o.productTitle || "").toLowerCase().includes(q) ||
        (o.productSku || "").toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<OrderStatus | "all", number> = {
      all: orders.length,
      paid: 0,
      processing: 0,
      shipped: 0,
      completed: 0,
      canceled: 0,
      refunded: 0,
    };
    for (const o of orders) map[o.status] = (map[o.status] ?? 0) + 1;
    return map;
  }, [orders]);

  function resolveDesign(order: Order): Design | undefined {
    const sku = order.productSku?.trim().toUpperCase();
    if (!sku) return undefined;
    return designBySku.get(sku);
  }

  async function handleDownload(order: Order, design: Design) {
    if (!design.originalImageUrl) {
      toast.error("Tasarım dosyası bulunamadı.");
      return;
    }
    setDownloadingId(order.id);
    const ext = extFromUrl(design.originalImageUrl, "png");
    const filename = `${safeFilename(
      `${order.orderNumber || order.etsyReceiptId}-${design.sku || design.name}`
    )}.${ext}`;
    const ok = await downloadUrl(design.originalImageUrl, filename);
    setDownloadingId(null);
    if (ok) toast.success(`İndirildi: ${filename}`);
    else toast.error("İndirme başarısız oldu.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Sipariş No, müşteri, ürün veya SKU ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-900 border-slate-800"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200"
              aria-label="Aramayı temizle"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin rounded-md bg-slate-900 border border-slate-800 p-1 -mx-1 px-1">
        {ORDER_STATUS_OPTIONS.map((opt) => {
          const c = counts[opt.id];
          return (
            <button
              key={opt.id}
              onClick={() => setStatusFilter(opt.id)}
              className={cn(
                "shrink-0 px-3 py-1.5 text-xs rounded font-medium transition-colors flex items-center gap-2",
                statusFilter === opt.id
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <span>{opt.label}</span>
              <span
                className={cn(
                  "text-[10px] tabular-nums px-1.5 rounded-full",
                  statusFilter === opt.id
                    ? "bg-slate-700 text-slate-100"
                    : "bg-slate-800 text-slate-500"
                )}
              >
                {c}
              </span>
            </button>
          );
        })}
      </div>

      {loading && orders.length === 0 && (
        <Card className="border-slate-800 bg-slate-900/30 p-12 text-center">
          <p className="text-sm text-slate-400">Siparişler yükleniyor…</p>
        </Card>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <p className="text-sm text-slate-400 font-medium">
            {orders.length === 0
              ? "Henüz sipariş yok. Etsy ile senkronla veya webhook bağla."
              : "Filtreyle eşleşen sipariş yok."}
          </p>
          {orders.length === 0 && (
            <p className="text-xs text-slate-600 mt-2">
              Sağ üstteki <span className="text-slate-300">Senkronla</span>{" "}
              butonu Etsy API üzerinden son siparişleri çeker, veya{" "}
              <code className="text-slate-300">/api/etsy/webhook</code>{" "}
              endpoint'ine POST gönderebilirsin.
            </p>
          )}
        </Card>
      )}

      {filtered.length > 0 && (
        <Card className="border-slate-800/80 bg-slate-900/30 backdrop-blur overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[140px]">Sipariş No</TableHead>
                <TableHead className="w-[200px]">Müşteri</TableHead>
                <TableHead className="w-[150px]">Tarih</TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead className="w-[100px]">SKU</TableHead>
                <TableHead className="w-[140px]">Durum</TableHead>
                <TableHead className="w-[170px] text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const design = resolveDesign(order);
                const matched = !!design;
                return (
                  <TableRow key={order.id} className="group">
                    <TableCell className="font-mono text-xs text-slate-200">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {order.orderNumber || `#${order.etsyReceiptId}`}
                        </span>
                        {order.listingId && (
                          <a
                            href={`https://www.etsy.com/listing/${order.listingId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-slate-600 hover:text-blue-400 flex items-center gap-1 mt-0.5"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            Etsy
                          </a>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-100 truncate max-w-[180px]">
                          {order.customerName || (
                            <span className="text-slate-600 italic">
                              — bilinmiyor —
                            </span>
                          )}
                        </span>
                        {order.customerCountry && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span className="text-base leading-none">
                              {flagEmoji(order.customerCountry)}
                            </span>
                            {order.customerCountry}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-sm text-slate-300 tabular-nums">
                      {order.orderDate ? (
                        <div className="flex flex-col">
                          <span>
                            {format(new Date(order.orderDate), "d MMM yyyy", {
                              locale: tr,
                            })}
                          </span>
                          <span className="text-[11px] text-slate-600">
                            {format(new Date(order.orderDate), "HH:mm", {
                              locale: tr,
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-slate-800 border border-slate-700/60 flex items-center justify-center">
                          {order.productImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={order.productImageUrl}
                              alt={order.productTitle ?? ""}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : design?.mockups[0]?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={design.mockups[0].url}
                              alt={design.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <ImageOff className="h-4 w-4 text-slate-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-sm text-slate-200 truncate max-w-[260px]"
                            title={order.productTitle || ""}
                          >
                            {order.productTitle || (
                              <span className="text-slate-600 italic">
                                — başlık yok —
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="tabular-nums">
                              x{order.quantity}
                            </span>
                            {typeof order.totalPrice === "number" && (
                              <span className="text-emerald-400/80 font-medium">
                                {order.totalPrice.toFixed(2)} {order.currency}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      {order.productSku ? (
                        <code className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[11px] font-mono text-slate-200">
                          {order.productSku}
                        </code>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>

                    <TableCell className="text-right">
                      {matched ? (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={downloadingId === order.id}
                          onClick={() => handleDownload(order, design)}
                          className="bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {downloadingId === order.id
                            ? "İndiriliyor…"
                            : "Tasarımı İndir"}
                        </Button>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge variant="outline" className="text-slate-500">
                            Eşleşme yok
                          </Badge>
                          <span className="text-[10px] text-slate-600">
                            {order.productSku
                              ? `SKU "${order.productSku}" arşivde yok`
                              : "Etsy ürününde SKU yok"}
                          </span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="text-[11px] text-slate-600 text-right pr-1">
        {filtered.length} sipariş • {orders.length} toplam
      </div>
    </div>
  );
}
