"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ImageIcon,
  Upload,
  Loader2,
  Download,
  Sparkles,
  X,
  CheckCircle2,
  Maximize2,
  Trash2,
  Package,
  Palette,
  Shirt,
  AlertCircle,
  History as HistoryIcon,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UsageMeter } from "@/components/usage-meter";
import { cn } from "@/lib/utils";
import { useDesignStore } from "@/lib/store";
import { idbGet, idbSet, idbDel } from "@/lib/idb-kv";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const PRODUCT_TYPES = ["Tişört", "Hoodie", "Sweatshirt"] as const;

// UI-only product blueprint info (matches the server-side PRODUCT_MAP locks)
const PRODUCT_INFO: Record<
  (typeof PRODUCT_TYPES)[number],
  { model: string; details: string }
> = {
  "Tişört": {
    model: "Gildan 5000 — Heavy Cotton",
    details:
      "Unisex klasik kesim · 5.3 oz / 180 gsm %100 pamuk · ince ribbed yaka (kalın değil) · double-needle dikiş",
  },
  Hoodie: {
    model: "Heavyweight Pullover Hoodie",
    details:
      "Oversized streetwear · 400 gsm brushed fleece · kangaroo pocket · drawstring kapüşon",
  },
  Sweatshirt: {
    model: "Crewneck Sweatshirt",
    details:
      "Oversized boxy · 380 gsm brushed fleece · ribbed crew yaka · ribbed cuff & hem",
  },
};

// Printful catalog uses different blanks; we surface them in the UI when the
// engine is set to Printful so the user knows which real product they'll get.
const PRINTFUL_PRODUCT_INFO: Record<
  (typeof PRODUCT_TYPES)[number],
  { model: string; details: string }
> = {
  "Tişört": {
    model: "Bella+Canvas 3001 — Unisex Jersey",
    details:
      "Hafif/midweight, klasik unisex kesim. Printful kataloğunda Gildan 5000 yok; 3001 en yakın POD eşdeğeri ve en yaygın kullanılan unisex tee.",
  },
  Hoodie: {
    model: "Gildan 18500 — Heavy Blend Hoodie",
    details:
      "Klasik pullover, kanguru cebi, drawstring kapüşon. 50/50 cotton-poly.",
  },
  Sweatshirt: {
    model: "Gildan 18000 — Heavy Blend Crewneck",
    details: "Klasik crew yaka, ribbed cuff & hem. 50/50 cotton-poly.",
  },
};
const COLORS = [
  { id: "Siyah", swatch: "#0a0a0a", label: "Siyah" },
  { id: "Beyaz", swatch: "#f5f5f4", label: "Beyaz" },
  { id: "Gri", swatch: "#9ca3af", label: "Gri" },
  { id: "Lacivert", swatch: "#1e293b", label: "Lacivert" },
  { id: "Kırmızı", swatch: "#b91c1c", label: "Kırmızı" },
  { id: "Yeşil", swatch: "#3f6212", label: "Yeşil" },
  { id: "Bej", swatch: "#d6b894", label: "Bej" },
] as const;

const VARIANTS = [
  { id: "folded", label: "Katlanmış Ürün", emoji: "📦" },
  { id: "man-standing-1", label: "Erkek Ayakta 1", emoji: "🧍‍♂️" },
  { id: "man-standing-2", label: "Erkek Ayakta 2", emoji: "🚶‍♂️" },
  { id: "man-sitting", label: "Erkek Oturmuş", emoji: "💺" },
  { id: "woman-standing-1", label: "Kadın Ayakta 1", emoji: "🧍‍♀️" },
  { id: "woman-standing-2", label: "Kadın Ayakta 2", emoji: "🚶‍♀️" },
  { id: "woman-crosslegged", label: "Kadın Bağdaş", emoji: "🧘‍♀️" },
  { id: "flat-minimal", label: "Düz Minimal", emoji: "✨" },
] as const;

type Quality = "low" | "medium" | "high";

const QUALITY_TIERS: { id: Quality; label: string; sub: string; cost: number; accent: string }[] =
  [
    {
      id: "low",
      label: "Ekonomik",
      sub: "Önerilen · cüzdan dostu",
      cost: 0.015,
      accent: "from-emerald-500 to-teal-500",
    },
    {
      id: "medium",
      label: "Standart",
      sub: "Detay biraz artar",
      cost: 0.05,
      accent: "from-blue-500 to-violet-500",
    },
    {
      id: "high",
      label: "Premium HD",
      sub: "Maksimum detay · pahalı",
      cost: 0.18,
      accent: "from-fuchsia-500 to-pink-500",
    },
  ];

// 4 "essential" variants — for Etsy listing you usually only need a hero
// folded shot, one male model, one female model, and a flat ghost mannequin.
// Used as the cheap-by-default selection on first mount.
const ESSENTIAL_VARIANTS = [
  "folded",
  "man-standing-1",
  "woman-standing-1",
  "flat-minimal",
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];
type ColorId = (typeof COLORS)[number]["id"];

const HISTORY_KEY = "novaprint:mockup-history";
const AI_DESIGNS_KEY = "novaprint:generated-designs";
const HISTORY_LIMIT = 24;

// Composite key for color × variant slot
const slotKey = (color: string, variantId: VariantId) => `${color}::${variantId}`;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ─── TYPES ──────────────────────────────────────────────────────────────────
type DesignSource =
  | { type: "ai"; id: string; prompt: string; imageDataUrl: string }
  | { type: "store"; id: string; name: string; imageUrl: string }
  | { type: "upload"; id: string; name: string; imageDataUrl: string };

interface MockupResult {
  variantId: VariantId;
  color: string;
  label: string;
  imageDataUrl: string;
  createdAt: number;
}

interface MockupSession {
  id: string;
  designLabel: string;
  designThumbnail: string;
  productType: string;
  colors: string[];
  results: MockupResult[];
  createdAt: number;
}

interface AiHistoryItem {
  id: string;
  prompt: string;
  imageDataUrl: string;
}

// ─── PAGE ───────────────────────────────────────────────────────────────────
export default function MockupPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const storeDesigns = useDesignStore((s) => s.designs);
  const initStore = useDesignStore((s) => s.initialize);
  const addMockups = useDesignStore((s) => s.addMockups);
  const setDesignStatus = useDesignStore((s) => s.setStatus);
  useEffect(() => {
    initStore();
  }, [initStore]);

  // Only Kerim-approved designs without mockups go into Taha's mockup queue.
  // Toggle lets him browse the entire store if needed.
  const [showAllStore, setShowAllStore] = useState(false);
  const taskedStoreDesigns = useMemo(
    () =>
      storeDesigns.filter(
        (d) =>
          d.status === "Mockup ve Yayınlama Bekliyor" && d.mockups.length === 0
      ),
    [storeDesigns]
  );

  // AI designs from localStorage
  const [aiDesigns, setAiDesigns] = useState<AiHistoryItem[]>([]);

  // Upload state
  const [uploadedDesigns, setUploadedDesigns] = useState<
    { id: string; name: string; imageDataUrl: string }[]
  >([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selection
  const [activeSource, setActiveSource] =
    useState<"ai" | "store" | "upload">("ai");
  const [selectedDesign, setSelectedDesign] = useState<DesignSource | null>(null);

  // Settings
  const [productType, setProductType] =
    useState<(typeof PRODUCT_TYPES)[number]>("Tişört");
  const [selectedColors, setSelectedColors] = useState<ColorId[]>(["Siyah"]);
  // Cheap-by-default: 4 essential variants × 1 color × low quality ≈ $0.06.
  // User can opt into more via the "Hepsini seç" button or quality tiers.
  const [selectedVariants, setSelectedVariants] = useState<VariantId[]>(
    ESSENTIAL_VARIANTS as unknown as VariantId[]
  );
  const [quality, setQuality] = useState<Quality>("low");
  const qualityDef =
    QUALITY_TIERS.find((q) => q.id === quality) || QUALITY_TIERS[1];

  // ─── Engine: OpenAI (paid, multi-pose) vs Printful (free, 1 default pose/color)
  // Default: Printful — it's free, no OpenAI bill, instant catalogue mockups.
  // Switch to OpenAI when you need lifestyle photo poses (8 variants).
  type Engine = "openai" | "printful";
  const [engine, setEngine] = useState<Engine>("printful");
  // When the user switches engines we lock the variant selection to what
  // each engine actually supports, so the CTA always matches what'll be
  // produced. Printful always renders 1 default front view per color.
  useEffect(() => {
    if (engine === "printful") {
      setSelectedVariants(["folded"] as VariantId[]);
    } else {
      setSelectedVariants(ESSENTIAL_VARIANTS as unknown as VariantId[]);
    }
  }, [engine]);

  // Generation state
  type VariantStatus = "pending" | "doing" | "done" | "error";
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<Record<string, VariantStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [results, setResults] = useState<MockupResult[]>([]);

  // History + Modal
  const [history, setHistory] = useState<MockupSession[]>([]);
  const [modalImage, setModalImage] = useState<string | null>(null);

  // Daily $5 usage snapshot (force-pushed to <UsageMeter />)
  interface UsageSnapshot {
    day: string;
    costUsd: number;
    mockupCount: number;
    designCount: number;
    limitUsd: number;
    remainingUsd: number;
    percent: number;
  }
  const [usageSnapshot, setUsageSnapshot] = useState<UsageSnapshot | null>(null);
  const limitHitRef = useRef(false);

  // Approval (Taslaklara gönder) — only available when source is a Supabase design
  const [approving, setApproving] = useState(false);
  const [approvedDesignIds, setApprovedDesignIds] = useState<string[]>([]);

  const APPROVAL_KEY = "novaprint:mockup-approvals";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(APPROVAL_KEY);
      if (raw) setApprovedDesignIds(JSON.parse(raw));
    } catch {}
  }, []);

  const persistApprovals = useCallback((next: string[]) => {
    setApprovedDesignIds(next);
    try {
      localStorage.setItem(APPROVAL_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const dataUrlToFile = useCallback(
    async (dataUrl: string, filename: string): Promise<File> => {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type || "image/jpeg" });
    },
    []
  );

  const handleApproveToDrafts = useCallback(async () => {
    if (
      !selectedDesign ||
      selectedDesign.type !== "store" ||
      results.length === 0
    )
      return;
    const designId = selectedDesign.id;
    if (approvedDesignIds.includes(designId)) {
      toast.info("Bu tasarımın mockupları zaten Taslaklara gönderildi.");
      return;
    }
    setApproving(true);
    const toastId = `approve-${designId}`;
    toast.loading(`${results.length} mockup yükleniyor…`, { id: toastId });
    try {
      const files: File[] = await Promise.all(
        results.map((r) =>
          dataUrlToFile(
            r.imageDataUrl,
            `${slugify(productType)}-${slugify(r.color)}-${r.variantId}.jpg`
          )
        )
      );
      await addMockups(designId, files);
      await setDesignStatus(designId, "Taslak");
      persistApprovals([designId, ...approvedDesignIds]);
      toast.success(
        `${results.length} mockup Taslaklara gönderildi. Sayfa: /dashboard/taslaklar`,
        { id: toastId, duration: 6000 }
      );
      // Clear the workspace so Taha can move to the next design
      setSelectedDesign(null);
      setResults([]);
      setProgress({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Onay başarısız";
      toast.error(`Taslağa gönderme başarısız: ${msg}`, {
        id: toastId,
        duration: 8000,
      });
    } finally {
      setApproving(false);
    }
  }, [
    selectedDesign,
    results,
    approvedDesignIds,
    productType,
    addMockups,
    setDesignStatus,
    persistApprovals,
    dataUrlToFile,
  ]);

  // ─── Persisted history (IndexedDB) ────────────────────────────────────────
  // Previously the history lived in localStorage. localStorage has a hard
  // ~5MB quota per origin and our mockup sessions (each session = up to 32
  // base64 JPEGs, 100-300KB each) blow past that within 1-2 generations.
  // Writes then fail silently and reloading the page shows a blank history.
  //
  // We now keep history in IndexedDB (no practical quota), and migrate any
  // pre-existing localStorage data on first mount so users don't lose work.
  // A ref mirrors the React state so all writer callbacks see the latest
  // value without depending on a re-render.
  const historyRef = useRef<MockupSession[]>([]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      try {
        const ai = localStorage.getItem(AI_DESIGNS_KEY);
        if (!cancelled && ai) setAiDesigns(JSON.parse(ai));
      } catch {}

      // 1) Prefer IDB.
      let h: MockupSession[] | null = null;
      try {
        h = await idbGet<MockupSession[]>(HISTORY_KEY);
      } catch {
        h = null;
      }

      // 2) Migration: if nothing in IDB yet, take whatever was in localStorage.
      if (!h) {
        try {
          const ls = localStorage.getItem(HISTORY_KEY);
          if (ls) {
            const parsed = JSON.parse(ls) as MockupSession[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              h = parsed;
              // Write to IDB, then free up the localStorage quota slot.
              await idbSet(HISTORY_KEY, parsed);
              try {
                localStorage.removeItem(HISTORY_KEY);
              } catch {}
            }
          }
        } catch {}
      }

      if (!cancelled) setHistory(h || []);
    };
    loadAll();

    const onVisibility = () => {
      if (document.visibilityState === "visible") loadAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Single source of truth for writes: update React state synchronously (so
  // the UI repaints immediately) and persist to IDB in the background. We
  // never re-read storage before writing — `historyRef.current` always has
  // the freshest value.
  const persistHistory = useCallback((next: MockupSession[]) => {
    setHistory(next);
    historyRef.current = next;
    void idbSet(HISTORY_KEY, next);
  }, []);

  const appendSession = useCallback(
    (session: MockupSession) => {
      const next = [session, ...historyRef.current].slice(0, HISTORY_LIMIT);
      persistHistory(next);
    },
    [persistHistory]
  );

  const mergeIntoLatestSession = useCallback(
    (
      newItems: MockupResult[],
      matcher: (head: MockupSession) => boolean
    ): boolean => {
      const existing = historyRef.current;
      const head = existing[0];
      if (!head || !matcher(head)) return false;
      const dedup = new Map<string, MockupResult>();
      head.results.forEach((r) =>
        dedup.set(slotKey(r.color, r.variantId), r)
      );
      newItems.forEach((r) => dedup.set(slotKey(r.color, r.variantId), r));
      const merged: MockupSession = {
        ...head,
        results: Array.from(dedup.values()),
      };
      persistHistory([merged, ...existing.slice(1)]);
      return true;
    },
    [persistHistory]
  );

  const deleteSessionFromStorage = useCallback(
    (sessionId: string) => {
      persistHistory(historyRef.current.filter((s) => s.id !== sessionId));
    },
    [persistHistory]
  );

  const clearAllHistoryStorage = useCallback(() => {
    setHistory([]);
    historyRef.current = [];
    void idbDel(HISTORY_KEY);
  }, []);

  // ─── File upload ─────────────────────────────────────────────────────────
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = Array.from(files).filter((f) =>
      /image\/(png|jpe?g|webp)/i.test(f.type)
    );
    if (accepted.length === 0) {
      toast.error("PNG / JPG / WEBP dosyası seç.");
      return;
    }
    accepted.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const item = {
          id: Math.random().toString(36).slice(2, 10),
          name: f.name,
          imageDataUrl: dataUrl,
        };
        setUploadedDesigns((arr) => [item, ...arr]);
        setActiveSource("upload");
        setSelectedDesign({ type: "upload", ...item });
      };
      reader.readAsDataURL(f);
    });
  }, []);

  // ─── Selection helpers ───────────────────────────────────────────────────
  const toggleVariant = (id: VariantId) =>
    setSelectedVariants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const selectAllVariants = () => setSelectedVariants(VARIANTS.map((v) => v.id));
  const clearAllVariants = () => setSelectedVariants([]);

  const toggleColor = (id: ColorId) =>
    setSelectedColors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const selectAllColors = () =>
    setSelectedColors(COLORS.map((c) => c.id) as ColorId[]);
  const clearAllColors = () => setSelectedColors([]);

  const totalJobs = selectedColors.length * selectedVariants.length;

  // ─── Generation ──────────────────────────────────────────────────────────
  // Core runner — used by handleGenerate (fresh run) AND handleRetryFailed
  // (only the slots that errored out). Always preserves prior `results`.
  type Job = { color: ColorId; variantId: VariantId };
  const runJobs = async (jobs: Job[], mode: "fresh" | "retry") => {
    if (jobs.length === 0) return;
    setGenerating(true);
    limitHitRef.current = false;

    setProgress((prev) => {
      const next: Record<string, VariantStatus> =
        mode === "fresh" ? {} : { ...prev };
      jobs.forEach((j) => (next[slotKey(j.color, j.variantId)] = "pending"));
      return next;
    });
    if (mode === "fresh") {
      setResults([]);
      setErrors({});
    } else {
      // Clear errors for the jobs we are about to retry
      setErrors((prev) => {
        const next = { ...prev };
        jobs.forEach((j) => delete next[slotKey(j.color, j.variantId)]);
        return next;
      });
    }

    const collected: MockupResult[] = [];
    const collectedErrors: Record<string, string> = {};

    // Run in batches of 3 to keep mostly-parallel + avoid OpenAI rate-limit
    const BATCH_SIZE = 3;

    if (!selectedDesign) {
      setGenerating(false);
      return;
    }
    const designPayload =
      selectedDesign.type === "store"
        ? { designUrl: selectedDesign.imageUrl }
        : { designDataUrl: selectedDesign.imageDataUrl };

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE);
      // mark "doing"
      setProgress((prev) => {
        const next = { ...prev };
        batch.forEach((j) => (next[slotKey(j.color, j.variantId)] = "doing"));
        return next;
      });

      // Stop early if a previous batch hit the daily cap — no point billing more.
      if (limitHitRef.current) {
        batch.forEach((j) => {
          const key = slotKey(j.color, j.variantId);
          collectedErrors[key] = "Günlük $5 limiti dolu";
          setErrors((prev) => ({ ...prev, [key]: "Günlük $5 limiti dolu" }));
          setProgress((prev) => ({ ...prev, [key]: "error" }));
        });
        continue;
      }

      await Promise.all(
        batch.map(async (job) => {
          const key = slotKey(job.color, job.variantId);
          try {
            const r = await fetch("/api/mockup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                variantId: job.variantId,
                productType,
                color: job.color,
                quality,
                ...designPayload,
              }),
            });
            const json = await r.json();
            // Push usage snapshot to the meter even on errors
            if (json?.usage) setUsageSnapshot(json.usage);
            if (r.status === 429) {
              limitHitRef.current = true;
              throw new Error(json.error || "Günlük $5 limiti dolu");
            }
            if (!r.ok || !json.ok)
              throw new Error(json.error || "Mockup üretilemedi.");
            const item: MockupResult = {
              variantId: job.variantId,
              color: job.color,
              label: json.label,
              imageDataUrl: json.imageDataUrl,
              createdAt: Date.now(),
            };
            collected.push(item);
            setResults((prev) => [...prev, item]);
            setProgress((prev) => ({ ...prev, [key]: "done" }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Hata";
            collectedErrors[key] = msg;
            setErrors((prev) => ({ ...prev, [key]: msg }));
            setProgress((prev) => ({ ...prev, [key]: "error" }));
            console.error(`[mockup] ${key} failed:`, err);
          }
        })
      );
    }

    setGenerating(false);

    const failedCount = Object.keys(collectedErrors).length;

    if (collected.length === 0) {
      toast.error(
        mode === "retry"
          ? "Yeniden deneme başarısız."
          : "Hiçbir mockup üretilemedi."
      );
      return;
    }

    if (mode === "fresh") {
      // Persist a new session to history — using the storage-as-truth helper
      // so we never overwrite older sessions with a stale React state.
      const designThumbnail =
        selectedDesign.type === "store"
          ? selectedDesign.imageUrl
          : selectedDesign.imageDataUrl;
      const designLabel =
        selectedDesign.type === "ai"
          ? selectedDesign.prompt
          : selectedDesign.name;
      const session: MockupSession = {
        id: Math.random().toString(36).slice(2, 10),
        designLabel,
        designThumbnail,
        productType,
        colors: [...selectedColors],
        results: collected,
        createdAt: Date.now(),
      };
      appendSession(session);
    } else {
      // Retry: merge new results into the most-recent matching history session
      // (within a 30-minute window). Falls back to a new session if no match.
      const merged = mergeIntoLatestSession(collected, (head) => {
        const now = Date.now();
        return (
          now - head.createdAt < 30 * 60 * 1000 &&
          head.productType === productType &&
          head.designLabel ===
            (selectedDesign.type === "ai"
              ? selectedDesign.prompt
              : selectedDesign.name)
        );
      });
      if (!merged) {
        // No mergeable head session — record retry results as their own row
        // so they don't get lost.
        const designThumbnail =
          selectedDesign.type === "store"
            ? selectedDesign.imageUrl
            : selectedDesign.imageDataUrl;
        const designLabel =
          selectedDesign.type === "ai"
            ? selectedDesign.prompt
            : selectedDesign.name;
        appendSession({
          id: Math.random().toString(36).slice(2, 10),
          designLabel,
          designThumbnail,
          productType,
          colors: [...selectedColors],
          results: collected,
          createdAt: Date.now(),
        });
      }
    }

    if (limitHitRef.current) {
      toast.error(
        `Günlük $5 OpenAI limiti doldu — ${collected.length} mockup tamamlandı, ${failedCount} atlandı.`,
        { duration: 8000 }
      );
    } else {
      toast.success(
        mode === "retry"
          ? `${collected.length} mockup yeniden üretildi${
              failedCount > 0 ? ` (${failedCount} hala başarısız)` : ""
            }`
          : `${collected.length} mockup üretildi${
              failedCount > 0 ? ` (${failedCount} başarısız)` : ""
            }`
      );
    }
  };

  // ─── PRINTFUL ENGINE ─────────────────────────────────────────────────────
  // Renders one default front mockup per color via Printful's free mockup
  // generator. Compared to OpenAI:
  //   • $0 per mockup (Printful is free if you have a Printful account)
  //   • Photorealistic (real product photos with overlay, not AI)
  //   • Only 1 pose per color (default front view)
  // Pipeline:
  //   1) Get a public HTTPS URL for the design (Supabase for store designs,
  //      our /api/printful-upload helper for AI/uploaded base64 designs).
  //   2) POST /api/mockup-printful → 1 task per color, polled to completion.
  //   3) Map result mockups into the existing `results` shape (slot=folded
  //      placeholder) so the rest of the page reuses the same grid/zip/
  //      approve-to-drafts pipeline.
  const ensurePublicUrl = useCallback(async (): Promise<string | null> => {
    if (!selectedDesign) return null;

    // STORE designs: imageUrl is already a Supabase public URL — but if the
    // bucket is private OR the public flag was toggled off, Printful won't be
    // able to fetch it. Round-trip through /api/printful-design-url which
    // converts public URLs into 24h signed URLs that work regardless of
    // bucket visibility.
    if (selectedDesign.type === "store") {
      try {
        const res = await fetch("/api/printful-design-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designUrl: selectedDesign.imageUrl }),
        });
        const json = await res.json();
        if (res.ok && json.ok && json.url) return json.url as string;
      } catch {
        // fall back to raw URL
      }
      return selectedDesign.imageUrl;
    }

    // AI / upload designs are base64 — upload to Supabase via our helper
    // endpoint so Printful's worker can fetch the file over HTTPS.
    const filename =
      selectedDesign.type === "ai"
        ? slugify(selectedDesign.prompt).slice(0, 40) || "ai-design"
        : slugify(selectedDesign.name).replace(/\.[a-z0-9]+$/, "") || "upload";
    const res = await fetch("/api/printful-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl: selectedDesign.imageDataUrl,
        filename,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(
        json.error || "Tasarım Supabase'e yüklenemedi (Printful için public URL gerekli)."
      );
    }
    return json.publicUrl as string;
  }, [selectedDesign]);

  const runPrintfulJobs = async () => {
    if (!selectedDesign) {
      toast.error("Önce bir tasarım seç veya yükle.");
      return;
    }
    if (selectedColors.length === 0) {
      toast.error("En az 1 renk seç.");
      return;
    }
    setGenerating(true);
    setResults([]);
    setErrors({});
    // Mark every requested color as pending → doing
    const initProg: Record<string, VariantStatus> = {};
    selectedColors.forEach(
      (c) => (initProg[slotKey(c, "folded" as VariantId)] = "doing")
    );
    setProgress(initProg);

    const toastId = `printful-${Date.now()}`;
    toast.loading(
      `Printful: ${selectedColors.length} renk için mockup üretiliyor…`,
      { id: toastId }
    );

    try {
      const designUrl = await ensurePublicUrl();
      if (!designUrl) {
        toast.error("Tasarım URL'i çıkarılamadı.", { id: toastId });
        setGenerating(false);
        return;
      }

      const res = await fetch("/api/mockup-printful", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productType,
          colors: selectedColors,
          designUrl,
        }),
      });
      const json = await res.json();
      // Always log the full payload so the browser console has the per-color
      // error map (json.errors) and resolved variant IDs (json.debug) — these
      // are the bits we need to diagnose a "hiçbir mockup üretilemedi" run.
      console.log("[printful] response", res.status, json);
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Printful API hatası.");
      }

      // Group multiple mockups per color (Printful may return 2-3 views for
      // a single variant) into our flat results array. We use "folded" as a
      // placeholder slot and label each result with its placement.
      const collected: MockupResult[] = [];
      const collectedErrors: Record<string, string> = { ...(json.errors || {}) };

      type PfMockup = {
        color: ColorId;
        printfulColor: string;
        placement: string;
        imageUrl: string;
        styleId?: number;
      };
      const list = (json.mockups || []) as PfMockup[];

      list.forEach((m, idx) => {
        const item: MockupResult = {
          variantId: "folded" as VariantId,
          color: m.color,
          label: `Printful · ${m.printfulColor}${
            m.placement && m.placement !== "front" ? ` · ${m.placement}` : ""
          }`,
          imageDataUrl: m.imageUrl, // HTTPS URL (Printful CDN)
          createdAt: Date.now() + idx,
        };
        collected.push(item);
      });

      // Mark progress
      setProgress(() => {
        const next: Record<string, VariantStatus> = {};
        selectedColors.forEach((c) => {
          const hasResult = list.some((m) => m.color === c);
          next[slotKey(c, "folded" as VariantId)] = hasResult
            ? "done"
            : "error";
          if (!hasResult && !collectedErrors[c]) {
            collectedErrors[c] = "Bu renk için mockup üretilemedi.";
          }
        });
        return next;
      });
      // Map color-level errors to slot-level for the UI
      const slotErrors: Record<string, string> = {};
      Object.entries(collectedErrors).forEach(([color, msg]) => {
        slotErrors[slotKey(color, "folded" as VariantId)] = msg;
      });
      setErrors(slotErrors);
      setResults(collected);

      if (collected.length > 0) {
        const designThumbnail =
          selectedDesign.type === "store"
            ? selectedDesign.imageUrl
            : selectedDesign.imageDataUrl;
        const designLabel =
          selectedDesign.type === "ai"
            ? selectedDesign.prompt
            : selectedDesign.name;
        appendSession({
          id: Math.random().toString(36).slice(2, 10),
          designLabel,
          designThumbnail,
          productType,
          colors: [...selectedColors],
          results: collected,
          createdAt: Date.now(),
        });
      }

      if (collected.length === 0) {
        toast.error("Hiçbir Printful mockup üretilemedi.", { id: toastId });
      } else if (Object.keys(collectedErrors).length > 0) {
        toast.success(
          `${collected.length} Printful mockup üretildi · ${
            Object.keys(collectedErrors).length
          } renk başarısız`,
          { id: toastId }
        );
      } else {
        toast.success(`${collected.length} Printful mockup üretildi (ÜCRETSİZ).`, {
          id: toastId,
          duration: 5000,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata";
      console.error("[printful] generation failed:", err);
      // The error message from the API already includes diagnostic detail
      // (per-color reasons, available colors sample, etc.). Show the long
      // form so the user sees actionable info, but cap so the toast fits.
      const compact = msg.length > 280 ? msg.slice(0, 277) + "…" : msg;
      toast.error(compact, { id: toastId, duration: 12000 });
      // Reset progress on failure
      setProgress((prev) => {
        const next: Record<string, VariantStatus> = { ...prev };
        selectedColors.forEach((c) => {
          const k = slotKey(c, "folded" as VariantId);
          if (next[k] !== "done") next[k] = "error";
        });
        return next;
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDesign) {
      toast.error("Önce bir tasarım seç veya yükle.");
      return;
    }
    if (selectedColors.length === 0) {
      toast.error("En az 1 renk seç.");
      return;
    }
    if (engine === "printful") {
      await runPrintfulJobs();
      return;
    }
    if (selectedVariants.length === 0) {
      toast.error("En az 1 mockup türü seç.");
      return;
    }
    const jobs: Job[] = [];
    selectedColors.forEach((c) =>
      selectedVariants.forEach((v) => jobs.push({ color: c, variantId: v }))
    );
    await runJobs(jobs, "fresh");
  };

  // Failed slots → rebuild jobs from the errors map and rerun them only.
  const failedSlots = Object.keys(errors);
  const handleRetryFailed = async () => {
    if (!selectedDesign) {
      toast.error("Tasarım seçimi kayıp — yeniden başla.");
      return;
    }
    if (failedSlots.length === 0) return;
    const jobs: Job[] = failedSlots
      .map((k) => {
        const [color, variantId] = k.split("::") as [ColorId, VariantId];
        return { color, variantId };
      })
      .filter((j) => j.color && j.variantId);
    if (jobs.length === 0) return;
    toast.info(`${jobs.length} başarısız mockup yeniden deneniyor…`);
    await runJobs(jobs, "retry");
  };

  // ─── Download helpers ────────────────────────────────────────────────────
  // Both OpenAI (data:image/jpeg;base64,...) AND Printful (https://files.cdn.printful.com/...)
  // URLs land in `imageDataUrl`. Anchor downloads ignore `download` for
  // cross-origin HTTPS, so we fetch + Blob + ObjectURL for those.
  const downloadOne = async (item: MockupResult) => {
    const isHttps = /^https?:\/\//i.test(item.imageDataUrl);
    const link = document.createElement("a");
    link.download = `${slugify(productType)}-${slugify(item.color)}-${item.variantId}.jpg`;
    if (!isHttps) {
      link.href = item.imageDataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    try {
      const res = await fetch(item.imageDataUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Fall back to opening in a new tab
      window.open(item.imageDataUrl, "_blank");
    }
  };

  const downloadAllZip = async () => {
    if (results.length === 0) return;
    toast.loading("ZIP hazırlanıyor…", { id: "zip" });
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const hasMultipleColors = new Set(results.map((x) => x.color)).size > 1;

      // For HTTPS results we have to fetch every URL in parallel.
      // We dedupe by path so two identical mockups don't overwrite each other.
      const tasks = results.map(async (r, idx) => {
        const ext = "jpg";
        const path = hasMultipleColors
          ? `${slugify(r.color)}/${slugify(productType)}-${slugify(r.color)}-${r.variantId}-${idx}.${ext}`
          : `${slugify(productType)}-${slugify(r.color)}-${r.variantId}-${idx}.${ext}`;

        const dataMatch = r.imageDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (dataMatch) {
          zip.file(path, dataMatch[1], { base64: true });
          return;
        }
        if (/^https?:\/\//i.test(r.imageDataUrl)) {
          try {
            const res = await fetch(r.imageDataUrl);
            const buf = await res.arrayBuffer();
            zip.file(path, buf);
          } catch (err) {
            console.warn(`[zip] failed fetching ${r.imageDataUrl}`, err);
          }
        }
      });
      await Promise.all(tasks);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      const colorTag =
        selectedColors.length > 1
          ? `${selectedColors.length}colors`
          : slugify(selectedColors[0] || "color");
      link.download = `mockups-${slugify(productType)}-${colorTag}-${date}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("ZIP indirildi", { id: "zip" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata";
      toast.error(`ZIP hatası: ${msg}`, { id: "zip" });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const storeListForVisible = showAllStore ? storeDesigns : taskedStoreDesigns;
  const visibleDesigns: DesignSource[] = useMemo(() => {
    if (activeSource === "ai")
      return aiDesigns.map((d) => ({
        type: "ai" as const,
        id: d.id,
        prompt: d.prompt,
        imageDataUrl: d.imageDataUrl,
      }));
    if (activeSource === "store")
      return storeListForVisible.map((d) => ({
        type: "store" as const,
        id: d.id,
        name: d.name,
        imageUrl: d.originalImageUrl,
      }));
    return uploadedDesigns.map((d) => ({
      type: "upload" as const,
      id: d.id,
      name: d.name,
      imageDataUrl: d.imageDataUrl,
    }));
  }, [activeSource, aiDesigns, storeListForVisible, uploadedDesigns]);

  const SOURCES = [
    { id: "ai", label: "AI Tasarımlarım", count: aiDesigns.length },
    {
      id: "store",
      label: "Kerim'den Gelen",
      count: taskedStoreDesigns.length,
    },
    { id: "upload", label: "PNG Yükle", count: uploadedDesigns.length },
  ] as const;

  return (
    <div>
      <PageHeader
        title="AI Mockup Studio"
        description={
          engine === "printful"
            ? "Tasarım seç, ürün ve renkleri belirle. Printful gerçek ürün fotoğrafına otomatik overlay yapar — ücretsiz."
            : "Tasarım seç, ürün ve birden fazla renk belirle. Seçtiğin her renk için 8 farklı premium e-ticaret mockupu ayrı ayrı üretilir."
        }
        icon={<ImageIcon className="h-5 w-5" />}
        accent={engine === "printful" ? "from-emerald-500 to-teal-600" : "from-blue-500 to-violet-600"}
      >
        {engine === "printful" ? (
          <Badge className="gap-1.5 bg-emerald-500/15 text-emerald-200 border-emerald-500/30">
            <Sparkles className="h-3 w-3" /> Printful · Ücretsiz
          </Badge>
        ) : (
          <Badge variant="violet" className="gap-1.5">
            <Sparkles className="h-3 w-3" /> gpt-image-1 edit
          </Badge>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5">
        {/* ─── LEFT PANEL ─── */}
        <div className="space-y-4">
          {/* Engine selector — chooses between Printful (free, 1 mockup/color)
              and OpenAI (paid, multi-pose). Default is Printful for cost reasons. */}
          <div className="rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-900/80 to-slate-950/60 backdrop-blur p-3 shadow-elev-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2 px-1">
              Üretim Motoru
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEngine("printful")}
                disabled={generating}
                className={cn(
                  "p-3 rounded-xl text-left transition-all border relative overflow-hidden",
                  engine === "printful"
                    ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30 shadow-elev-1"
                    : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xl">🎨</span>
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      engine === "printful"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-slate-800 text-slate-500"
                    )}
                  >
                    ÜCRETSİZ
                  </span>
                </div>
                <p
                  className={cn(
                    "text-sm font-bold",
                    engine === "printful" ? "text-white" : "text-slate-200"
                  )}
                >
                  Printful Studio
                </p>
                <p className="text-[10.5px] text-slate-400 leading-snug mt-0.5">
                  Gerçek ürün foto + overlay. Renk başına 1 default mockup.
                </p>
              </button>
              <button
                onClick={() => setEngine("openai")}
                disabled={generating}
                className={cn(
                  "p-3 rounded-xl text-left transition-all border",
                  engine === "openai"
                    ? "bg-gradient-to-br from-blue-500/20 to-violet-500/15 border-blue-500/40 ring-1 ring-blue-500/30 shadow-elev-1"
                    : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xl">🤖</span>
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      engine === "openai"
                        ? "bg-blue-500/20 text-blue-200"
                        : "bg-slate-800 text-slate-500"
                    )}
                  >
                    AI · $0.015+
                  </span>
                </div>
                <p
                  className={cn(
                    "text-sm font-bold",
                    engine === "openai" ? "text-white" : "text-slate-200"
                  )}
                >
                  OpenAI Studio
                </p>
                <p className="text-[10.5px] text-slate-400 leading-snug mt-0.5">
                  8 farklı poz (lifestyle, model, katlanmış…). Yapay zekâ.
                </p>
              </button>
            </div>
          </div>

          {/* Daily $5 OpenAI usage meter — only relevant for OpenAI engine */}
          {engine === "openai" && <UsageMeter snapshot={usageSnapshot} />}

          {/* Design source picker */}
          <Section title="1. Tasarım Kaynağı" icon={<Sparkles className="h-4 w-4 text-blue-400" />}>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/50 border border-slate-800 mb-3">
              {SOURCES.map((s) => {
                const active = activeSource === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSource(s.id)}
                    className={cn(
                      "flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5",
                      active
                        ? "bg-gradient-to-br from-blue-500/15 to-violet-500/10 text-blue-200 ring-1 ring-blue-500/30 shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {s.label}
                    {mounted && (
                      <span
                        className={cn(
                          "tabular-nums text-[9px] px-1 py-0.5 rounded",
                          active ? "bg-blue-500/20 text-blue-300" : "bg-slate-800 text-slate-500"
                        )}
                      >
                        {s.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeSource === "upload" && (
              <UploadDropzone
                dragActive={dragActive}
                setDragActive={setDragActive}
                onFiles={handleFiles}
                fileInputRef={fileInputRef}
              />
            )}

            {mounted && activeSource === "store" && (
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[10.5px] text-slate-500 leading-snug">
                  {showAllStore
                    ? "Tüm mağaza tasarımları"
                    : "Sadece Kerim'in SEO'sunu yapıp mockup bekleyen tasarımlar"}
                </p>
                <button
                  onClick={() => setShowAllStore((v) => !v)}
                  className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
                >
                  {showAllStore ? "Sadece kuyruk" : "Hepsini göster"}
                </button>
              </div>
            )}
            {mounted && (
              <DesignGrid
                designs={visibleDesigns}
                selectedId={selectedDesign?.id}
                onSelect={(d) => setSelectedDesign(d)}
                emptyHint={
                  activeSource === "ai"
                    ? "Henüz AI tasarım üretmedin. /olustur sayfasına git."
                    : activeSource === "store"
                      ? showAllStore
                        ? "Mağazada hiç tasarım yok."
                        : "Kerim'den gelen mockup kuyruğu boş. Kerim SEO yaptıktan sonra burada görünürler."
                      : "Yüklü tasarım yok. Üstten PNG sürükle veya seç."
                }
              />
            )}

            {selectedDesign && (
              <div className="mt-3 flex items-center gap-3 p-2.5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20">
                <div className="h-12 w-12 rounded-lg checkerboard overflow-hidden relative shrink-0 ring-1 ring-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      selectedDesign.type === "store"
                        ? selectedDesign.imageUrl
                        : selectedDesign.imageDataUrl
                    }
                    alt="Seçili"
                    className="absolute inset-0 w-full h-full object-contain p-1"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">
                    Seçili Tasarım
                  </p>
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {selectedDesign.type === "ai"
                      ? selectedDesign.prompt
                      : selectedDesign.name}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDesign(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label="Kaldır"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </Section>

          {/* Product */}
          <Section title="2. Ürün Tipi" icon={<Shirt className="h-4 w-4 text-violet-400" />}>
            <div className="grid grid-cols-3 gap-2">
              {PRODUCT_TYPES.map((p) => {
                const active = productType === p;
                return (
                  <button
                    key={p}
                    onClick={() => setProductType(p)}
                    className={cn(
                      "py-3 rounded-xl text-xs font-bold transition-all border",
                      active
                        ? "bg-gradient-to-br from-blue-500/20 to-violet-500/15 border-blue-500/40 text-blue-100 shadow-sm"
                        : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300 mb-1 flex items-center gap-1.5">
                <Shirt className="h-3 w-3" />
                Kalıp / Model {engine === "printful" && (
                  <span className="text-emerald-400/80 normal-case font-semibold tracking-normal">
                    · Printful kataloğu
                  </span>
                )}
              </p>
              <p className="text-xs font-bold text-slate-100">
                {engine === "printful"
                  ? PRINTFUL_PRODUCT_INFO[productType].model
                  : PRODUCT_INFO[productType].model}
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                {engine === "printful"
                  ? PRINTFUL_PRODUCT_INFO[productType].details
                  : PRODUCT_INFO[productType].details}
              </p>
            </div>
          </Section>

          {/* Color */}
          <Section
            title="3. Renkler"
            icon={<Palette className="h-4 w-4 text-pink-400" />}
            rightSlot={
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500 tabular-nums">
                  {selectedColors.length}/{COLORS.length}
                </span>
                <button
                  onClick={selectAllColors}
                  className="text-blue-400 hover:text-blue-300"
                >
                  Hepsi
                </button>
                <button
                  onClick={clearAllColors}
                  className="text-slate-500 hover:text-slate-300"
                >
                  Temizle
                </button>
              </div>
            }
          >
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => {
                const active = selectedColors.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleColor(c.id)}
                    className={cn(
                      "flex items-center gap-2 py-1.5 pl-1.5 pr-3 rounded-full transition-all border",
                      active
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-100 shadow-sm"
                        : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                    )}
                  >
                    <span className="relative h-5 w-5 shrink-0">
                      <span
                        className="absolute inset-0 rounded-full ring-1 ring-slate-700"
                        style={{ background: c.swatch }}
                      />
                      {active && (
                        <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-semibold">{c.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedColors.length > 1 && (
              <p className="mt-3 text-[11px] text-blue-300/80 leading-relaxed flex items-start gap-1.5">
                <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
                Her renk için {selectedVariants.length} mockup ayrı ayrı üretilecek
                — toplam{" "}
                <span className="font-bold text-blue-200">
                  {totalJobs}
                </span>{" "}
                varyant.
              </p>
            )}
          </Section>

          {/* Variant + Quality only matter for the OpenAI engine. Printful
              always renders 1 default front view per color. */}
          {engine === "printful" && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300 mb-1 flex items-center gap-1.5">
                <Package className="h-3 w-3" />
                Printful Modu
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Her renk için <span className="font-bold text-emerald-200">1 profesyonel front mockup</span> üretilir
                (Printful'un gerçek ürün fotoğrafına otomatik overlay). Poz/varyant seçimine gerek yok.
              </p>
              <p className="text-[11px] text-emerald-400/80 mt-1.5">
                <span className="font-bold">Maliyet: $0.00</span> · Printful hesabın var olduğu sürece sınırsız.
              </p>
            </div>
          )}

          {/* Variant picker */}
          {engine === "openai" && (
          <Section
            title="4. Mockup Türleri"
            icon={<Package className="h-4 w-4 text-emerald-400" />}
            rightSlot={
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500">
                  {selectedVariants.length}/8
                </span>
                <button
                  onClick={selectAllVariants}
                  className="text-blue-400 hover:text-blue-300"
                >
                  Hepsi
                </button>
                <button
                  onClick={clearAllVariants}
                  className="text-slate-500 hover:text-slate-300"
                >
                  Temizle
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-1.5">
              {VARIANTS.map((v) => {
                const active = selectedVariants.includes(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleVariant(v.id)}
                    className={cn(
                      "flex items-center gap-2 py-2 px-2.5 rounded-xl text-xs font-semibold transition-all border text-left",
                      active
                        ? "bg-blue-500/[0.08] border-blue-500/40 text-blue-100"
                        : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    )}
                  >
                    <span className="text-base shrink-0">{v.emoji}</span>
                    <span className="flex-1 leading-tight">{v.label}</span>
                    {active && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
          )}

          {/* Quality tier — OpenAI only */}
          {engine === "openai" && (
          <Section
            title="5. Görsel Kalitesi"
            icon={<Sparkles className="h-4 w-4 text-amber-400" />}
          >
            <div className="grid grid-cols-3 gap-2">
              {QUALITY_TIERS.map((q) => {
                const active = quality === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => setQuality(q.id)}
                    className={cn(
                      "p-2.5 rounded-xl text-left transition-all border",
                      active
                        ? `bg-gradient-to-br ${q.accent} bg-opacity-10 border-white/15 ring-1 ring-white/10 shadow-elev-1`
                        : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-bold",
                        active ? "text-white" : "text-slate-200"
                      )}
                    >
                      {q.label}
                    </p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {q.sub}
                    </p>
                    <p
                      className={cn(
                        "text-[10.5px] font-bold tabular-nums mt-1.5",
                        active ? "text-white" : "text-slate-400"
                      )}
                    >
                      ${q.cost.toFixed(2)}/adet
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-[11px] text-slate-500 leading-relaxed">
              Bu üretim toplamda{" "}
              <span className="font-bold text-emerald-300 tabular-nums">
                ${(totalJobs * qualityDef.cost).toFixed(2)}
              </span>{" "}
              olacak ({totalJobs} mockup × ${qualityDef.cost.toFixed(2)}).
              {quality === "low" && (
                <span className="block mt-1 text-emerald-400/80">
                  Cüzdan modu aktif. Listeleme için 4 essential mockup +
                  Ekonomik kalite genelde yeterli.
                </span>
              )}
              {quality === "high" && (
                <span className="block mt-1 text-amber-400/80">
                  Premium HD ~12× pahalı. Sadece hero görsel için kullan.
                </span>
              )}
            </p>
          </Section>
          )}

          <Button
            onClick={handleGenerate}
            disabled={
              generating ||
              !selectedDesign ||
              selectedColors.length === 0 ||
              (engine === "openai" && selectedVariants.length === 0)
            }
            size="lg"
            className={cn(
              "w-full text-base h-14",
              engine === "printful"
                ? "!bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 !shadow-emerald-500/30 hover:!shadow-emerald-500/50"
                : "!bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 !shadow-blue-500/30 hover:!shadow-blue-500/50"
            )}
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Mockuplar Üretiliyor…
              </>
            ) : engine === "printful" ? (
              <>
                <Sparkles className="h-5 w-5" />
                Printful Mockup Oluştur ({selectedColors.length}) · ÜCRETSİZ
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Mockup Oluştur ({totalJobs}) · ${(totalJobs * qualityDef.cost).toFixed(2)}
              </>
            )}
          </Button>

          <div className="rounded-xl border border-slate-800/50 bg-slate-950/30 p-3 flex gap-2.5 text-[11px] text-slate-500 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 text-slate-600 mt-0.5" />
            {engine === "printful" ? (
              <span>
                Printful renk başına 1 default front mockup üretir (gerçek ürün
                fotoğrafına overlay). Üretim ~10-15 saniye/renk.{" "}
                <span className="text-emerald-400">Tamamen ücretsiz.</span>
              </span>
            ) : (
              <span>
                Her renk × variant ayrı OpenAI çağrısıdır. 3&apos;lü gruplar halinde
                paralel çalışır.{" "}
                <span className="text-slate-400">
                  Standart $0.05/mockup · Premium $0.20/mockup
                </span>
                .
              </span>
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div>
          <ResultGrid
            results={results}
            progress={progress}
            errors={errors}
            generating={generating}
            selectedVariants={selectedVariants}
            selectedColors={selectedColors}
            onDownloadOne={downloadOne}
            onDownloadAll={downloadAllZip}
            onPreview={setModalImage}
            canApproveToDrafts={
              !!selectedDesign && selectedDesign.type === "store"
            }
            isApproving={approving}
            isAlreadyApproved={
              !!selectedDesign &&
              approvedDesignIds.includes(selectedDesign.id)
            }
            onApproveToDrafts={handleApproveToDrafts}
            failedCount={failedSlots.length}
            onRetryFailed={handleRetryFailed}
          />
        </div>
      </div>

      {/* History */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-slate-400" />
            Mockup Geçmişi
            {mounted && history.length > 0 && (
              <Badge variant="secondary">{history.length} oturum</Badge>
            )}
          </h2>
          {mounted && history.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Tüm mockup geçmişi silinsin mi?")) {
                  clearAllHistoryStorage();
                  toast.success("Geçmiş temizlendi");
                }
              }}
              className="text-[11px] text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Geçmişi sil
            </button>
          )}
        </div>

        {mounted && history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
            <p className="text-sm text-slate-500">
              Henüz mockup oturumu yok. Üstten tasarım seçip ilk üretimi başlat.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((sess) => (
              <HistorySession
                key={sess.id}
                session={sess}
                onPreview={setModalImage}
                onDelete={() => {
                  deleteSessionFromStorage(sess.id);
                  toast.success("Oturum silindi");
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Fullscreen Preview */}
      {modalImage && (
        <FullscreenModal
          src={modalImage}
          onClose={() => setModalImage(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  rightSlot,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function UploadDropzone({
  dragActive,
  setDragActive,
  onFiles,
  fileInputRef,
}: {
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  onFiles: (files: FileList | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "relative cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-all mb-3",
        dragActive
          ? "border-blue-500 bg-blue-500/5"
          : "border-slate-700 bg-slate-950/40 hover:border-blue-500/60 hover:bg-slate-900/70"
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 ring-1 ring-blue-500/30 flex items-center justify-center">
          <Upload className="h-4 w-4 text-blue-400" />
        </div>
        <p className="text-xs font-semibold text-slate-200">
          PNG / JPG sürükle bırak
        </p>
        <p className="text-[10.5px] text-slate-500">
          veya tıkla — transparan PNG desteklenir
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  );
}

function DesignGrid({
  designs,
  selectedId,
  onSelect,
  emptyHint,
}: {
  designs: DesignSource[];
  selectedId?: string;
  onSelect: (d: DesignSource) => void;
  emptyHint: string;
}) {
  if (designs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/30 p-5 text-center">
        <p className="text-[11px] text-slate-500">{emptyHint}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto scrollbar-thin pr-1">
      {designs.map((d) => {
        const active = selectedId === d.id;
        const src = d.type === "store" ? d.imageUrl : d.imageDataUrl;
        const label = d.type === "ai" ? d.prompt : d.name;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            className={cn(
              "relative aspect-square rounded-lg checkerboard overflow-hidden transition-all ring-1 group",
              active
                ? "ring-2 ring-blue-500 shadow-elev-2"
                : "ring-slate-800 hover:ring-slate-700"
            )}
            title={label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={label}
              className="absolute inset-0 w-full h-full object-contain p-1"
            />
            {active && (
              <div className="absolute inset-0 flex items-end p-1.5 bg-gradient-to-t from-blue-500/40 via-transparent">
                <CheckCircle2 className="h-4 w-4 text-white drop-shadow-md" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ResultGrid({
  results,
  progress,
  errors,
  generating,
  selectedVariants,
  selectedColors,
  onDownloadOne,
  onDownloadAll,
  onPreview,
  canApproveToDrafts,
  isApproving,
  isAlreadyApproved,
  onApproveToDrafts,
  failedCount,
  onRetryFailed,
}: {
  results: MockupResult[];
  progress: Record<string, "pending" | "doing" | "done" | "error">;
  errors: Record<string, string>;
  generating: boolean;
  selectedVariants: VariantId[];
  selectedColors: string[];
  onDownloadOne: (item: MockupResult) => void;
  onDownloadAll: () => void;
  onPreview: (src: string) => void;
  canApproveToDrafts: boolean;
  isApproving: boolean;
  isAlreadyApproved: boolean;
  onApproveToDrafts: () => void;
  failedCount: number;
  onRetryFailed: () => void;
}) {
  const hasAny = results.length > 0;
  const resultColors = Array.from(new Set(results.map((r) => r.color)));
  const colorsToShow = generating
    ? selectedColors
    : resultColors.length > 0
      ? resultColors
      : [];

  // Per-color download (slugify imported from parent scope via closure)
  const downloadColorZip = async (color: string) => {
    const colorResults = results.filter((r) => r.color === color);
    if (colorResults.length === 0) return;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      colorResults.forEach((r) => {
        const m = r.imageDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (!m) return;
        zip.file(`${slugify(color)}-${r.variantId}.jpg`, m[1], { base64: true });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mockups-${slugify(color)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${color} ZIP indirildi`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata";
      toast.error(`ZIP hatası: ${msg}`);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-white">
          {hasAny ? "Üretilen Mockuplar" : "Mockuplar burada görünecek"}
        </h2>
        {hasAny && (
          <div className="flex flex-wrap items-center gap-2">
            {failedCount > 0 && (
              <Button
                onClick={onRetryFailed}
                disabled={generating}
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/20"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                Başarısızları Tekrar Dene ({failedCount})
              </Button>
            )}
            <Button onClick={onDownloadAll} size="sm" variant="success">
              <Archive className="h-3.5 w-3.5" />
              Hepsini ZIP İndir
            </Button>
            {canApproveToDrafts && (
              <Button
                onClick={onApproveToDrafts}
                disabled={isApproving || isAlreadyApproved || generating}
                size="sm"
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20"
              >
                {isApproving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Yükleniyor…
                  </>
                ) : isAlreadyApproved ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Taslağa Gönderildi
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Onayla &amp; Taslaklara Gönder
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
      {hasAny && canApproveToDrafts && !isAlreadyApproved && (
        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
          Onayladığında {results.length} mockup tasarıma eklenir ve durum{" "}
          <span className="text-slate-300 font-medium">Taslak</span> olur. Yusuf
          taslaklar sayfasından devam edebilir.
        </p>
      )}

      {colorsToShow.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500/15 to-violet-500/10 ring-1 ring-blue-500/25 flex items-center justify-center mb-3">
            <ImageIcon className="h-7 w-7 text-blue-400" />
          </div>
          <p className="text-sm font-semibold text-slate-300 mb-1">
            Sol panelden başla
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Tasarımını seç, ürün ve bir veya birden fazla renk belirle, &quot;Mockup
            Oluştur&quot;a tıkla. Her renk için ayrı ayrı premium mockuplar
            burada görünecek.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {colorsToShow.map((color) => {
            const colorDef = COLORS.find((c) => c.id === color);
            const colorDone = results.filter(
              (r) => r.color === color && progress[slotKey(color, r.variantId)] === "done"
            ).length;
            return (
              <div key={color}>
                {/* Color group header */}
                <div className="flex items-center justify-between mb-2.5 sticky top-0 z-10 bg-slate-950/60 backdrop-blur-sm py-1.5 -mx-1 px-1 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-7 w-7 rounded-full ring-2 ring-slate-800 shadow-md shrink-0"
                      style={{ background: colorDef?.swatch }}
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-100 leading-tight">
                        {color}
                      </p>
                      <p className="text-[10.5px] text-slate-500 tabular-nums">
                        {colorDone}/{selectedVariants.length} mockup
                      </p>
                    </div>
                  </div>
                  {colorDone > 0 && (
                    <button
                      onClick={() => downloadColorZip(color)}
                      className="text-[11px] font-semibold text-blue-300 hover:text-blue-200 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-colors"
                    >
                      <Archive className="h-3 w-3" />
                      {color} ZIP
                    </button>
                  )}
                </div>

                {/* Variant grid for this color */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {selectedVariants.map((vid) => {
                    const variantDef = VARIANTS.find((v) => v.id === vid);
                    const item = results.find(
                      (r) => r.variantId === vid && r.color === color
                    );
                    const key = slotKey(color, vid);
                    const status = progress[key] || "pending";
                    const errorMsg = errors[key];

                    return (
                      <div
                        key={key}
                        className={cn(
                          "rounded-2xl overflow-hidden border bg-gradient-to-br from-slate-900/70 to-slate-900/30 backdrop-blur transition-all",
                          status === "done"
                            ? "border-slate-800/70 hover:border-blue-500/40 hover:-translate-y-1 hover:shadow-elev-3"
                            : "border-slate-800/70"
                        )}
                      >
                        <div className="relative aspect-square bg-slate-950/40 overflow-hidden">
                          {status === "done" && item ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.imageDataUrl}
                                alt={item.label}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              <button
                                onClick={() => onPreview(item.imageDataUrl)}
                                className="absolute inset-0 flex items-center justify-center bg-slate-950/0 hover:bg-slate-950/40 transition-colors group"
                              >
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/80 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-semibold text-white flex items-center gap-1.5">
                                  <Maximize2 className="h-3 w-3" />
                                  Önizle
                                </span>
                              </button>
                            </>
                          ) : status === "error" ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                              <AlertCircle className="h-7 w-7 text-red-400" />
                              <p className="text-[10.5px] text-red-300 leading-tight line-clamp-3">
                                {errorMsg || "Üretim başarısız"}
                              </p>
                            </div>
                          ) : status === "doing" ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                              <div className="h-12 w-12 rounded-full border-3 border-blue-500/20 border-t-blue-400 animate-spin" />
                              <p className="text-[11px] text-blue-300 font-semibold">
                                Üretiliyor…
                              </p>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/30 animate-pulse">
                              <span className="text-2xl opacity-30">
                                {variantDef?.emoji}
                              </span>
                              <p className="text-[10px] text-slate-600 font-medium">
                                Sırada bekliyor
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="p-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm shrink-0">{variantDef?.emoji}</span>
                            <p className="text-xs font-semibold text-slate-200 truncate">
                              {variantDef?.label}
                            </p>
                          </div>
                          {status === "done" && item && (
                            <button
                              onClick={() => onDownloadOne(item)}
                              className="shrink-0 h-7 w-7 rounded-lg bg-slate-800/60 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-400 flex items-center justify-center transition-colors"
                              aria-label="İndir"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistorySession({
  session,
  onPreview,
  onDelete,
}: {
  session: MockupSession;
  onPreview: (src: string) => void;
  onDelete: () => void;
}) {
  const [zipBusy, setZipBusy] = useState<string | null>(null);

  const downloadOneResult = (r: MockupResult) => {
    const link = document.createElement("a");
    link.href = r.imageDataUrl;
    link.download = `${slugify(session.productType)}-${slugify(r.color || "color")}-${r.variantId}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllZip = async () => {
    setZipBusy("all");
    toast.loading("ZIP hazırlanıyor…", { id: `zip-${session.id}` });
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const hasMultipleColors =
        new Set(session.results.map((r) => r.color || "color")).size > 1;
      session.results.forEach((r) => {
        const m = r.imageDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (!m) return;
        const color = r.color || "color";
        const path = hasMultipleColors
          ? `${slugify(color)}/${slugify(session.productType)}-${slugify(color)}-${r.variantId}.jpg`
          : `${slugify(session.productType)}-${slugify(color)}-${r.variantId}.jpg`;
        zip.file(path, m[1], { base64: true });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date(session.createdAt).toISOString().split("T")[0];
      link.download = `mockups-${slugify(session.productType)}-${date}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("ZIP indirildi", { id: `zip-${session.id}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata";
      toast.error(`ZIP hatası: ${msg}`, { id: `zip-${session.id}` });
    } finally {
      setZipBusy(null);
    }
  };

  const downloadColorZip = async (color: string) => {
    const items = session.results.filter((r) => (r.color || "") === color);
    if (items.length === 0) return;
    setZipBusy(color);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      items.forEach((r) => {
        const m = r.imageDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (!m) return;
        zip.file(
          `${slugify(session.productType)}-${slugify(color)}-${r.variantId}.jpg`,
          m[1],
          { base64: true }
        );
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date(session.createdAt).toISOString().split("T")[0];
      link.download = `mockups-${slugify(session.productType)}-${slugify(color)}-${date}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${color} ZIP indirildi`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata";
      toast.error(`ZIP hatası: ${msg}`);
    } finally {
      setZipBusy(null);
    }
  };

  // Backward-compat: older sessions stored a single `color` instead of `colors`
  const sessionColors: string[] =
    session.colors && session.colors.length > 0
      ? session.colors
      : ((session as unknown as { color?: string }).color
          ? [(session as unknown as { color: string }).color]
          : Array.from(new Set(session.results.map((r) => r.color).filter(Boolean))));

  // Group results by color
  const grouped = sessionColors.map((c) => ({
    color: c,
    items: session.results.filter((r) => (r.color || sessionColors[0]) === c),
  }));

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur p-4">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="h-12 w-12 rounded-lg checkerboard overflow-hidden relative shrink-0 ring-1 ring-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.designThumbnail}
            alt={session.designLabel}
            className="absolute inset-0 w-full h-full object-contain p-1"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">
            {session.designLabel}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{session.productType}</Badge>
            {sessionColors.map((c) => {
              const def = COLORS.find((x) => x.id === c);
              return (
                <Badge key={c} variant="secondary" className="!gap-1.5 !pl-1">
                  <span
                    className="h-3 w-3 rounded-full ring-1 ring-slate-700"
                    style={{ background: def?.swatch || "#777" }}
                  />
                  {c}
                </Badge>
              );
            })}
            <span className="text-[11px] text-slate-500">
              {new Date(session.createdAt).toLocaleString("tr-TR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <Badge variant="info">{session.results.length} mockup</Badge>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={downloadAllZip}
            disabled={zipBusy !== null}
            size="sm"
            variant="success"
          >
            {zipBusy === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            ZIP İndir
          </Button>
          <button
            onClick={() => {
              if (confirm("Bu oturum geçmişten silinsin mi?")) onDelete();
            }}
            className="h-8 w-8 rounded-lg bg-slate-800/60 hover:bg-red-500/15 hover:text-red-400 text-slate-400 flex items-center justify-center transition-colors"
            aria-label="Sil"
            title="Bu oturumu sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3 mt-1">
        {grouped.map((g) => (
          <div key={g.color}>
            <div className="flex items-center justify-between mb-1.5">
              {sessionColors.length > 1 ? (
                <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-slate-700"
                    style={{
                      background:
                        COLORS.find((x) => x.id === g.color)?.swatch || "#777",
                    }}
                  />
                  {g.color}
                  <span className="text-slate-600 font-normal">
                    · {g.items.length} mockup
                  </span>
                </p>
              ) : (
                <span />
              )}
              {sessionColors.length > 1 && (
                <button
                  onClick={() => downloadColorZip(g.color)}
                  disabled={zipBusy !== null}
                  className="text-[11px] font-semibold text-blue-300 hover:text-blue-200 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                >
                  {zipBusy === g.color ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Archive className="h-3 w-3" />
                  )}
                  {g.color} ZIP
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
              {g.items.map((r) => (
                <div
                  key={`${r.color}-${r.variantId}`}
                  className="aspect-square rounded-lg overflow-hidden border border-slate-800 hover:border-slate-700 transition-all group relative"
                  title={r.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.imageDataUrl}
                    alt={r.label}
                    onClick={() => onPreview(r.imageDataUrl)}
                    className="absolute inset-0 w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition-transform"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadOneResult(r);
                    }}
                    className="absolute bottom-1 right-1 h-6 w-6 rounded-md bg-slate-950/85 hover:bg-emerald-500/85 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center shadow-md"
                    aria-label="İndir"
                    title="JPEG indir"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FullscreenModal({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 h-10 w-10 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center z-10"
        aria-label="Kapat"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="relative max-w-5xl w-full max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Mockup önizleme"
          className="w-full h-full object-contain rounded-2xl shadow-elev-3"
        />
      </div>
    </div>
  );
}
