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
      sub: "Hızlı, basit detay",
      cost: 0.02,
      accent: "from-emerald-500 to-teal-500",
    },
    {
      id: "medium",
      label: "Standart",
      sub: "Önerilen denge",
      cost: 0.05,
      accent: "from-blue-500 to-violet-500",
    },
    {
      id: "high",
      label: "Premium HD",
      sub: "Maksimum detay",
      cost: 0.2,
      accent: "from-fuchsia-500 to-pink-500",
    },
  ];

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
  const [selectedVariants, setSelectedVariants] = useState<VariantId[]>(
    VARIANTS.map((v) => v.id)
  );
  const [quality, setQuality] = useState<Quality>("medium");
  const qualityDef =
    QUALITY_TIERS.find((q) => q.id === quality) || QUALITY_TIERS[1];

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

  // ─── Load persisted state ─────────────────────────────────────────────────
  // On mount AND every time the tab regains visibility we re-read from
  // localStorage. This guarantees that navigating away and coming back never
  // shows a stale `[]` for history (which previously caused the apparent
  // "history got wiped" bug when a new generation finished while React state
  // was still empty).
  useEffect(() => {
    const loadAll = () => {
      try {
        const ai = localStorage.getItem(AI_DESIGNS_KEY);
        if (ai) setAiDesigns(JSON.parse(ai));
      } catch {}
      try {
        const h = localStorage.getItem(HISTORY_KEY);
        setHistory(h ? (JSON.parse(h) as MockupSession[]) : []);
      } catch {
        setHistory([]);
      }
    };
    loadAll();

    const onVisibility = () => {
      if (document.visibilityState === "visible") loadAll();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === HISTORY_KEY || e.key === AI_DESIGNS_KEY) loadAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Always read localStorage as the source of truth. The component's `history`
  // state can be stale (e.g. before the mount-time useEffect runs, after page
  // navigation, or while a long async generation is in flight) — relying on
  // it caused old sessions to get silently overwritten.
  const readHistoryFromStorage = useCallback((): MockupSession[] => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as MockupSession[]) : [];
    } catch {
      return [];
    }
  }, []);

  const writeHistoryToStorage = useCallback((next: MockupSession[]) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
    setHistory(next);
  }, []);

  // High-level safe writers (use these — never call writeHistoryToStorage with
  // a value derived from the stale `history` state directly).
  const appendSession = useCallback(
    (session: MockupSession) => {
      const existing = readHistoryFromStorage();
      const next = [session, ...existing].slice(0, HISTORY_LIMIT);
      writeHistoryToStorage(next);
    },
    [readHistoryFromStorage, writeHistoryToStorage]
  );

  const mergeIntoLatestSession = useCallback(
    (
      newItems: MockupResult[],
      matcher: (head: MockupSession) => boolean
    ): boolean => {
      const existing = readHistoryFromStorage();
      const head = existing[0];
      if (!head || !matcher(head)) return false;
      const dedup = new Map<string, MockupResult>();
      head.results.forEach((r) =>
        dedup.set(slotKey(r.color, r.variantId), r)
      );
      newItems.forEach((r) => dedup.set(slotKey(r.color, r.variantId), r));
      const merged: MockupSession = { ...head, results: Array.from(dedup.values()) };
      writeHistoryToStorage([merged, ...existing.slice(1)]);
      return true;
    },
    [readHistoryFromStorage, writeHistoryToStorage]
  );

  const deleteSessionFromStorage = useCallback(
    (sessionId: string) => {
      const existing = readHistoryFromStorage();
      writeHistoryToStorage(existing.filter((s) => s.id !== sessionId));
    },
    [readHistoryFromStorage, writeHistoryToStorage]
  );

  const clearAllHistoryStorage = useCallback(() => {
    writeHistoryToStorage([]);
  }, [writeHistoryToStorage]);

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

  const handleGenerate = async () => {
    if (!selectedDesign) {
      toast.error("Önce bir tasarım seç veya yükle.");
      return;
    }
    if (selectedVariants.length === 0) {
      toast.error("En az 1 mockup türü seç.");
      return;
    }
    if (selectedColors.length === 0) {
      toast.error("En az 1 renk seç.");
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
  const downloadOne = (item: MockupResult) => {
    const link = document.createElement("a");
    link.href = item.imageDataUrl;
    link.download = `${slugify(productType)}-${slugify(item.color)}-${item.variantId}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllZip = async () => {
    if (results.length === 0) return;
    toast.loading("ZIP hazırlanıyor…", { id: "zip" });
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      results.forEach((r) => {
        const m = r.imageDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (!m) return;
        // Group by color folder when multiple colors
        const hasMultipleColors = new Set(results.map((x) => x.color)).size > 1;
        const path = hasMultipleColors
          ? `${slugify(r.color)}/${slugify(productType)}-${slugify(r.color)}-${r.variantId}.jpg`
          : `${slugify(productType)}-${slugify(r.color)}-${r.variantId}.jpg`;
        zip.file(path, m[1], { base64: true });
      });
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
        description="Tasarım seç, ürün ve birden fazla renk belirle. Seçtiğin her renk için 8 farklı premium e-ticaret mockupu ayrı ayrı üretilir."
        icon={<ImageIcon className="h-5 w-5" />}
        accent="from-blue-500 to-violet-600"
      >
        <Badge variant="violet" className="gap-1.5">
          <Sparkles className="h-3 w-3" /> gpt-image-1 edit
        </Badge>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5">
        {/* ─── LEFT PANEL ─── */}
        <div className="space-y-4">
          {/* Daily $5 OpenAI usage meter */}
          <UsageMeter snapshot={usageSnapshot} />

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
                Kalıp / Model
              </p>
              <p className="text-xs font-bold text-slate-100">
                {PRODUCT_INFO[productType].model}
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                {PRODUCT_INFO[productType].details}
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

          {/* Variant picker */}
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

          {/* Quality tier */}
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
              <span className="font-bold text-slate-200 tabular-nums">
                ${(totalJobs * qualityDef.cost).toFixed(2)}
              </span>{" "}
              olacak ({totalJobs} mockup × ${qualityDef.cost.toFixed(2)}).
            </p>
          </Section>

          <Button
            onClick={handleGenerate}
            disabled={
              generating ||
              !selectedDesign ||
              selectedVariants.length === 0 ||
              selectedColors.length === 0
            }
            size="lg"
            className="w-full !bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 !shadow-blue-500/30 hover:!shadow-blue-500/50 text-base h-14"
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Mockuplar Üretiliyor…
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
            <span>
              Her renk × variant ayrı OpenAI çağrısıdır. 3&apos;lü gruplar halinde
              paralel çalışır.{" "}
              <span className="text-slate-400">
                Standart $0.05/mockup · Premium $0.20/mockup
              </span>
              .
            </span>
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
