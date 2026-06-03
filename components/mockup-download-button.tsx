"use client";

// ────────────────────────────────────────────────────────────────────────────
// MOCKUP DOWNLOAD BUTTON
//
// One component, three visual variants. Both the Taha workshop and the
// Drafts page need to expose "download all mockups as a ZIP" but they
// have very different layouts:
//
//   • `icon`           — 28×28 round button used as a card-corner badge
//                         (Taha workshop card overlay).
//   • `compact`        — small pill button used in dense action rows
//                         (Drafts card actions, sitting next to "Yayınla").
//   • `full`           — full-width gradient CTA used inside dialogs
//                         (TahaDialog / DraftPublishDialog).
//
// All three share the same fetch+zip pipeline via `downloadMockupsZip`,
// so behavior stays identical no matter where the button is rendered.
// ────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Archive, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadMockupsZip } from "@/lib/download-mockups";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MockupDownloadButtonProps {
  design: Design;
  variant?: "icon" | "compact" | "full";
  className?: string;
  /** Override the visible label on `compact` / `full` variants. */
  label?: string;
}

export function MockupDownloadButton({
  design,
  variant = "compact",
  className,
  label,
}: MockupDownloadButtonProps) {
  const [busy, setBusy] = useState(false);

  // No mockups → don't render anything. The page should still let the
  // designer open the dialog where mockups can be uploaded.
  if (!design.mockups || design.mockups.length === 0) return null;

  const handleClick = async (e: React.MouseEvent) => {
    // Stop the event from bubbling into a parent card click handler
    // (Taha / Drafts cards open a dialog on click — without this the
    // dialog would pop up the moment the user starts a download).
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const count = await downloadMockupsZip(design);
      toast.success(`${count} mockup ZIP olarak indirildi.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "İndirme başarısız.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={`${design.mockups.length} mockup'ı ZIP olarak indir`}
        aria-label="Mockup'ları ZIP olarak indir"
        className={cn(
          "h-7 w-7 rounded-md bg-slate-950/85 hover:bg-emerald-500/90 border border-slate-700 hover:border-emerald-300 flex items-center justify-center text-slate-200 hover:text-white transition-colors disabled:opacity-50 backdrop-blur-sm shrink-0",
          className
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={`${design.mockups.length} mockup'ı ZIP olarak indir`}
        className={cn(
          "inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-emerald-500/80 border border-slate-700 hover:border-emerald-400 text-[11px] font-semibold text-slate-200 hover:text-white transition-colors disabled:opacity-50",
          className
        )}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Archive className="h-3 w-3" />
        )}
        {label || `ZIP (${design.mockups.length})`}
      </button>
    );
  }

  // full variant — full-width gradient CTA
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={cn(
        "w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all hover:-translate-y-0.5",
        className
      )}
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> ZIP hazırlanıyor…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          {label || `${design.mockups.length} Mockup ZIP olarak indir`}
        </>
      )}
    </button>
  );
}
