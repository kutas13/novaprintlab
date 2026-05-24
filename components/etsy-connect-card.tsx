"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Status {
  ok?: boolean;
  apiKeyConfigured: boolean;
  connected: boolean;
  shopId?: string;
  shopName?: string;
  expiresAt?: string;
  updatedAt?: string;
  error?: string;
}

export function EtsyConnectCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/etsy/status", { cache: "no-store" });
      const json = (await res.json()) as Status;
      setStatus(json);
    } catch (e) {
      setStatus({
        apiKeyConfigured: false,
        connected: false,
        error: e instanceof Error ? e.message : "Bilinmeyen hata",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // Re-check whenever we come back from the OAuth roundtrip.
    const url = new URL(window.location.href);
    const etsy = url.searchParams.get("etsy");
    if (etsy === "connected") {
      toast.success("Etsy hesabı bağlandı.");
      url.searchParams.delete("etsy");
      url.searchParams.delete("msg");
      window.history.replaceState({}, "", url.toString());
    } else if (etsy === "error") {
      const msg = url.searchParams.get("msg") || "Bağlantı başarısız.";
      toast.error(`Etsy bağlantı hatası: ${decodeURIComponent(msg)}`);
      url.searchParams.delete("etsy");
      url.searchParams.delete("msg");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function handleConnect() {
    window.location.href = "/api/etsy/oauth/start";
  }

  async function handleDisconnect() {
    if (!confirm("Etsy bağlantısını kaldırmak istediğinden emin misin?")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/etsy/disconnect", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        toast.success("Etsy bağlantısı kaldırıldı.");
        await refresh();
      } else {
        toast.error(json.error || "Bağlantı kaldırılamadı.");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-slate-800/80 bg-slate-900/40 p-4 flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
        <span className="text-sm text-slate-400">
          Etsy bağlantı durumu kontrol ediliyor…
        </span>
      </Card>
    );
  }

  // 1) ETSY_API_KEY missing on the server
  if (!status?.apiKeyConfigured) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">
              Etsy API Key ayarlı değil
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Vercel → Settings → Environment Variables sayfasına git ve{" "}
              <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">
                ETSY_API_KEY
              </code>{" "}
              değişkenini ekle. Değer Etsy Developer Portal'da uygulamanı
              oluşturduktan sonra "keystring" alanından kopyalanır.
            </p>
            <a
              href="https://www.etsy.com/developers/your-apps"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 mt-2 font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              Etsy Developer Portal'ı aç
            </a>
          </div>
        </div>
      </Card>
    );
  }

  // 2) Not connected yet
  if (!status.connected) {
    return (
      <Card className="border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">
                Etsy hesabı henüz bağlı değil
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Aşağıdaki butona bas → Etsy'de izin ver → tüm siparişler
                otomatik çekilmeye başlar. Token'lar uygulama tarafından
                otomatik yenilenir.
              </p>
            </div>
          </div>
          <Button
            onClick={handleConnect}
            className="bg-gradient-to-br from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-md shadow-cyan-500/20 gap-2 whitespace-nowrap"
          >
            <Link2 className="h-4 w-4" />
            Etsy ile Bağlan
          </Button>
        </div>
      </Card>
    );
  }

  // 3) Connected — show shop + expiry + disconnect
  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-100">
                {status.shopName || "Etsy mağazan"}
              </p>
              <Badge variant="success">Bağlı</Badge>
              {status.shopId && (
                <code className="text-[10px] font-mono text-slate-500">
                  shop #{status.shopId}
                </code>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {status.expiresAt && (
                <>
                  Token süresi:{" "}
                  <span className="text-slate-400">
                    {format(new Date(status.expiresAt), "d MMM HH:mm", {
                      locale: tr,
                    })}
                  </span>{" "}
                  • otomatik yenilenir.{" "}
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="border-slate-700 text-slate-300 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/40 gap-2"
        >
          <Link2Off className="h-3.5 w-3.5" />
          {disconnecting ? "Kaldırılıyor…" : "Bağlantıyı Kaldır"}
        </Button>
      </div>
    </Card>
  );
}
