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
import { cn } from "@/lib/utils";
import { useDesignStore } from "@/lib/store";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const PRODUCT_TYPES = ["Tişört", "Hoodie", "Sweatshirt"] as const;
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

type VariantId = (typeof VARIANTS)[number]["id"];

const HISTORY_KEY = "novaprint:mockup-history";
const AI_DESIGNS_KEY = "novaprint:generated-designs";
const HISTORY_LIMIT = 24;

// ─── TYPES ──────────────────────────────────────────────────────────────────
type DesignSource =
  | { type: "ai"; id: string; prompt: string; imageDataUrl: string }
  | { type: "store"; id: string; name: string; imageUrl: string }
  | { type: "upload"; id: string; name: string; imageDataUrl: string };

interface MockupResult {
  variantId: VariantId;
  label: string;
  imageDataUrl: string;
  createdAt: number;
}

interface MockupSession {
  id: string;
  designLabel: string;
  designThumbnail: string;
  productType: string;
  color: string;
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
  const [color, setColor] =
    useState<(typeof COLORS)[number]["id"]>("Siyah");
  const [selectedVariants, setSelectedVariants] = useState<VariantId[]>(
    VARIANTS.map((v) => v.id)
  );

  // Generation state
  type VariantStatus = "pending" | "doing" | "done" | "error";
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<Partial<Record<VariantId, VariantStatus>>>({});
  const [errors, setErrors] = useState<Partial<Record<VariantId, string>>>({});
  const [results, setResults] = useState<MockupResult[]>([]);

  // History + Modal
  const [history, setHistory] = useState<MockupSession[]>([]);
  const [modalImage, setModalImage] = useState<string | null>(null);

  // ─── Load persisted state ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const ai = localStorage.getItem(AI_DESIGNS_KEY);
      if (ai) setAiDesigns(JSON.parse(ai));
    } catch {}
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setHistory(JSON.parse(h));
    } catch {}
  }, []);

  const persistHistory = useCallback((next: MockupSession[]) => {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
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

  // ─── Generation ──────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedDesign) {
      toast.error("Önce bir tasarım seç veya yükle.");
      return;
    }
    if (selectedVariants.length === 0) {
      toast.error("En az 1 mockup türü seç.");
      return;
    }

    setGenerating(true);
    setResults([]);
    setErrors({});

    const initialProgress: Partial<Record<VariantId, VariantStatus>> = {};
    selectedVariants.forEach((v) => (initialProgress[v] = "pending"));
    setProgress(initialProgress);

    const collected: MockupResult[] = [];
    const collectedErrors: Partial<Record<VariantId, string>> = {};

    // Run in batches of 3 to keep mostly-parallel + avoid OpenAI rate-limit
    const BATCH_SIZE = 3;

    const designPayload =
      selectedDesign.type === "store"
        ? { designUrl: selectedDesign.imageUrl }
        : { designDataUrl: selectedDesign.imageDataUrl };

    for (let i = 0; i < selectedVariants.length; i += BATCH_SIZE) {
      const batch = selectedVariants.slice(i, i + BATCH_SIZE);
      // mark "doing"
      setProgress((prev) => {
        const next = { ...prev };
        batch.forEach((v) => (next[v] = "doing"));
        return next;
      });

      await Promise.all(
        batch.map(async (vid) => {
          try {
            const r = await fetch("/api/mockup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                variantId: vid,
                productType,
                color,
                ...designPayload,
              }),
            });
            const json = await r.json();
            if (!r.ok || !json.ok)
              throw new Error(json.error || "Mockup üretilemedi.");
            const item: MockupResult = {
              variantId: vid,
              label: json.label,
              imageDataUrl: json.imageDataUrl,
              createdAt: Date.now(),
            };
            collected.push(item);
            setResults((prev) => [...prev, item]);
            setProgress((prev) => ({ ...prev, [vid]: "done" }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Hata";
            collectedErrors[vid] = msg;
            setErrors((prev) => ({ ...prev, [vid]: msg }));
            setProgress((prev) => ({ ...prev, [vid]: "error" }));
            console.error(`[mockup] ${vid} failed:`, err);
          }
        })
      );
    }

    setGenerating(false);

    if (collected.length === 0) {
      toast.error("Hiçbir mockup üretilemedi.");
      return;
    }

    // Persist session to history
    const designThumbnail =
      selectedDesign.type === "store"
        ? selectedDesign.imageUrl
        : selectedDesign.imageDataUrl;
    const designLabel =
      selectedDesign.type === "ai"
        ? selectedDesign.prompt
        : selectedDesign.type === "store"
          ? selectedDesign.name
          : selectedDesign.name;
    const session: MockupSession = {
      id: Math.random().toString(36).slice(2, 10),
      designLabel,
      designThumbnail,
      productType,
      color,
      results: collected,
      createdAt: Date.now(),
    };
    persistHistory([session, ...history].slice(0, HISTORY_LIMIT));

    toast.success(
      `${collected.length} mockup üretildi${
        Object.keys(collectedErrors).length > 0
          ? ` (${Object.keys(collectedErrors).length} başarısız)`
          : ""
      }`
    );
  };

  // ─── Download helpers ────────────────────────────────────────────────────
  const downloadOne = (item: MockupResult) => {
    const link = document.createElement("a");
    link.href = item.imageDataUrl;
    link.download = `${productType.toLowerCase()}-${color.toLowerCase()}-${item.variantId}.jpg`;
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
        zip.file(
          `${productType.toLowerCase()}-${color.toLowerCase()}-${r.variantId}.jpg`,
          m[1],
          { base64: true }
        );
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.download = `mockups-${productType}-${color}-${date}.zip`.toLowerCase();
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
  const visibleDesigns: DesignSource[] = useMemo(() => {
    if (activeSource === "ai")
      return aiDesigns.map((d) => ({
        type: "ai" as const,
        id: d.id,
        prompt: d.prompt,
        imageDataUrl: d.imageDataUrl,
      }));
    if (activeSource === "store")
      return storeDesigns.map((d) => ({
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
  }, [activeSource, aiDesigns, storeDesigns, uploadedDesigns]);

  const SOURCES = [
    { id: "ai", label: "AI Tasarımlarım", count: aiDesigns.length },
    { id: "store", label: "Mağaza Tasarımları", count: storeDesigns.length },
    { id: "upload", label: "PNG Yükle", count: uploadedDesigns.length },
  ] as const;

  return (
    <div>
      <PageHeader
        title="AI Mockup Studio"
        description="Tasarım seç, ürün ve renk belirle, tek tıkla 8 farklı premium e-ticaret mockupu üret."
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

            {mounted && (
              <DesignGrid
                designs={visibleDesigns}
                selectedId={selectedDesign?.id}
                onSelect={(d) => setSelectedDesign(d)}
                emptyHint={
                  activeSource === "ai"
                    ? "Henüz AI tasarım üretmedin. /olustur sayfasına git."
                    : activeSource === "store"
                      ? "Mağazada tasarım yok. Yusuf'un yüklediği ürünler burada görünür."
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
          </Section>

          {/* Color */}
          <Section title="3. Renk" icon={<Palette className="h-4 w-4 text-pink-400" />}>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => {
                const active = color === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setColor(c.id)}
                    className={cn(
                      "flex items-center gap-2 py-1.5 pl-1.5 pr-3 rounded-full transition-all border",
                      active
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-100 shadow-sm"
                        : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                    )}
                  >
                    <span
                      className="h-5 w-5 rounded-full ring-1 ring-slate-700 shrink-0"
                      style={{ background: c.swatch }}
                    />
                    <span className="text-xs font-semibold">{c.label}</span>
                  </button>
                );
              })}
            </div>
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

          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedDesign || selectedVariants.length === 0}
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
                Mockup Oluştur ({selectedVariants.length})
              </>
            )}
          </Button>

          <div className="rounded-xl border border-slate-800/50 bg-slate-950/30 p-3 flex gap-2.5 text-[11px] text-slate-500 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 text-slate-600 mt-0.5" />
            <span>
              Her variant ayrı OpenAI çağrısıdır. 3&apos;lü gruplar halinde paralel
              çalışır. Tüm 8&apos;i ~60-90 sn sürer.{" "}
              <span className="text-slate-400">JPEG 1024×1024</span>.
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
            onDownloadOne={downloadOne}
            onDownloadAll={downloadAllZip}
            onPreview={setModalImage}
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
                  persistHistory([]);
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
  onDownloadOne,
  onDownloadAll,
  onPreview,
}: {
  results: MockupResult[];
  progress: Partial<Record<VariantId, "pending" | "doing" | "done" | "error">>;
  errors: Partial<Record<VariantId, string>>;
  generating: boolean;
  selectedVariants: VariantId[];
  onDownloadOne: (item: MockupResult) => void;
  onDownloadAll: () => void;
  onPreview: (src: string) => void;
}) {
  const slots = generating || results.length > 0 ? selectedVariants : [];

  const hasAny = results.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">
          {hasAny ? "Üretilen Mockuplar" : "Mockuplar burada görünecek"}
        </h2>
        {hasAny && (
          <Button onClick={onDownloadAll} size="sm" variant="success">
            <Archive className="h-3.5 w-3.5" />
            Hepsini ZIP İndir
          </Button>
        )}
      </div>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500/15 to-violet-500/10 ring-1 ring-blue-500/25 flex items-center justify-center mb-3">
            <ImageIcon className="h-7 w-7 text-blue-400" />
          </div>
          <p className="text-sm font-semibold text-slate-300 mb-1">
            Sol panelden başla
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Tasarımını seç, ürün ve renk belirle ve &quot;Mockup Oluştur&quot;a tıkla.
            8 ayrı premium mockup grid&apos;de görünecek.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {slots.map((vid) => {
            const variantDef = VARIANTS.find((v) => v.id === vid);
            const item = results.find((r) => r.variantId === vid);
            const status = progress[vid] || "pending";
            const errorMsg = errors[vid];

            return (
              <div
                key={vid}
                className={cn(
                  "rounded-2xl overflow-hidden border bg-gradient-to-br from-slate-900/70 to-slate-900/30 backdrop-blur transition-all",
                  status === "done"
                    ? "border-slate-800/70 hover:border-blue-500/40 hover:-translate-y-1 hover:shadow-elev-3 cursor-pointer"
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
                      <div className="relative">
                        <div className="h-12 w-12 rounded-full border-3 border-blue-500/20 border-t-blue-400 animate-spin" />
                      </div>
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
      )}
    </div>
  );
}

function HistorySession({
  session,
  onPreview,
}: {
  session: MockupSession;
  onPreview: (src: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur p-4">
      <div className="flex items-center gap-3 mb-3">
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
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{session.productType}</Badge>
            <Badge variant="secondary">{session.color}</Badge>
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
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
        {session.results.map((r) => (
          <button
            key={r.variantId}
            onClick={() => onPreview(r.imageDataUrl)}
            className="aspect-square rounded-lg overflow-hidden border border-slate-800 hover:border-slate-700 transition-all group relative"
            title={r.label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.imageDataUrl}
              alt={r.label}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </button>
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
