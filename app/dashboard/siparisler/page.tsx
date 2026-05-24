"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrdersTable } from "@/components/orders-table";
import { EtsyConnectCard } from "@/components/etsy-connect-card";
import { useOrdersStore } from "@/lib/orders-store";

export default function SiparislerPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const orders = useOrdersStore((s) => s.orders);
  const syncing = useOrdersStore((s) => s.syncing);
  const syncFromEtsy = useOrdersStore((s) => s.syncFromEtsy);

  async function handleSync() {
    const res = await syncFromEtsy();
    if (res.ok) {
      toast.success(
        res.inserted
          ? `Senkron tamam — ${res.inserted} sipariş işlendi.`
          : "Senkron tamam — yeni sipariş yok."
      );
    } else if (res.error) {
      toast.error(`Etsy senkron hatası: ${res.error}`);
    }
  }

  return (
    <div>
      <PageHeader
        title="Siparişler"
        description="Etsy'den gelen tüm siparişler. SKU ile eşleşen tasarımlar anında indirilebilir."
        icon={<ShoppingBag className="h-5 w-5" />}
        accent="from-cyan-500 to-blue-600"
      >
        <Badge variant="info">{mounted ? orders.length : 0} sipariş</Badge>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="bg-gradient-to-br from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-md shadow-cyan-500/20 gap-2"
          size="sm"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Senkronlanıyor…" : "Etsy ile Senkronla"}
        </Button>
      </PageHeader>

      <div className="mb-6">
        <EtsyConnectCard />
      </div>

      <OrdersTable />
    </div>
  );
}
