"use client";

import { useState } from "react";
import {
  ArrowLeftCircle,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDesignStore } from "@/lib/store";
import { Design } from "@/lib/types";
import { getStatusFlow } from "@/lib/status-flow";
import { cn } from "@/lib/utils";

interface DesignActionsProps {
  design: Design;
  /**
   * - compact: floating icon-only buttons (for hover overlays on cards)
   * - full: labeled buttons inside a 'Tehlikeli İşlemler' card (for dialogs)
   */
  variant?: "compact" | "full";
  onActed?: (action: "sent-back" | "deleted") => void;
  className?: string;
}

export function DesignActions({
  design,
  variant = "compact",
  onActed,
  className,
}: DesignActionsProps) {
  const setStatus = useDesignStore((s) => s.setStatus);
  const saveAsDraft = useDesignStore((s) => s.saveAsDraft);
  const deleteDesign = useDesignStore((s) => s.deleteDesign);
  const [busy, setBusy] = useState<null | "back" | "delete">(null);

  const flow = getStatusFlow(design.status);
  const canSendBack = !!flow.previous;

  const handleBack = async (e: React.MouseEvent | React.SyntheticEvent) => {
    e.stopPropagation();
    if (!canSendBack || !flow.previous) return;
    const ok = confirm(
      `"${design.name}" ürününü "${flow.previousLabel || flow.previous}" durumuna geri göndermek istediğine emin misin?${
        flow.clearsPublished
          ? "\n\nUyarı: Yayın tarihi sıfırlanacak, takvim güncellenecek."
          : ""
      }`
    );
    if (!ok) return;
    setBusy("back");
    try {
      if (flow.clearsPublished) {
        await saveAsDraft(design.id);
      } else {
        await setStatus(design.id, flow.previous);
      }
      toast.success(
        `'${design.name}' → ${flow.previousLabel || flow.previous}.`
      );
      onActed?.("sent-back");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(`Geri gönderme başarısız: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent | React.SyntheticEvent) => {
    e.stopPropagation();
    const ok = confirm(
      `"${design.name}" ürününü KALICI olarak silmek istediğine emin misin?\n\nBu işlem geri alınamaz. Tasarım PNG'si, tüm mockup'lar, SEO ve fiyat bilgisi silinecek.`
    );
    if (!ok) return;
    setBusy("delete");
    try {
      await deleteDesign(design.id);
      toast.success(`'${design.name}' silindi.`);
      onActed?.("deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(`Silme başarısız: ${msg}`);
      setBusy(null);
    }
  };

  if (variant === "compact") {
    return (
      <div
        className={cn("flex items-center gap-1", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {canSendBack && (
          <button
            type="button"
            onClick={handleBack}
            disabled={busy !== null}
            title={`${flow.previousLabel || flow.previous}'e geri gönder`}
            aria-label="Önceki göreve geri gönder"
            className="h-7 w-7 rounded-md bg-slate-950/85 hover:bg-amber-500/90 border border-slate-700 hover:border-amber-300 flex items-center justify-center text-slate-200 hover:text-white transition-colors disabled:opacity-50 backdrop-blur-sm"
          >
            {busy === "back" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowLeftCircle className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy !== null}
          title="Tasarımı kalıcı sil"
          aria-label="Tasarımı sil"
          className="h-7 w-7 rounded-md bg-slate-950/85 hover:bg-red-500/90 border border-slate-700 hover:border-red-300 flex items-center justify-center text-slate-200 hover:text-white transition-colors disabled:opacity-50 backdrop-blur-sm"
        >
          {busy === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    );
  }

  // full variant
  return (
    <div
      className={cn(
        "rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 min-w-0">
          <p className="font-semibold text-red-300">Tehlikeli İşlemler</p>
          <p className="mt-0.5 leading-relaxed">
            {canSendBack
              ? `Önceki göreve geri gönderebilir veya kalıcı olarak silebilirsin.`
              : `Bu tasarımı kalıcı olarak silebilirsin.`}
          </p>
        </div>
      </div>
      <div
        className={cn(
          "grid gap-2",
          canSendBack ? "sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {canSendBack && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={busy !== null}
            className="w-full border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200"
          >
            {busy === "back" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowLeftCircle className="h-3.5 w-3.5" />
            )}{" "}
            {flow.previousLabel || flow.previous}'e Geri Gönder
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={busy !== null}
          className="w-full border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-200"
        >
          {busy === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}{" "}
          Kalıcı Sil
        </Button>
      </div>
    </div>
  );
}
