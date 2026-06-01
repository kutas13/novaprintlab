"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Wand2,
  Sparkles,
  Loader2,
  Download,
  Copy,
  Check,
  Lightbulb,
  Trash2,
  ImageIcon,
  AlertCircle,
  Layers,
  Zap,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── SHARED CONSTANTS ───────────────────────────────────────────────────────
const STYLES = [
  "Vintage",
  "Retro",
  "Minimal",
  "Sokak Giyimi",
  "Y2K",
  "Anime",
  "Spor",
  "Dövme",
  "Graffiti",
  "Psychedelic",
] as const;

const COLORS = [
  "Siyah",
  "Beyaz",
  "Kırmızı",
  "Mavi",
  "Neon",
  "Pastel",
  "Çok Renkli",
] as const;

const TYPES = ["Yazı Tasarımı", "Grafik Tasarım", "Karışık"] as const;
const PLACEMENTS = ["Ortalanmış", "Full Tasarım", "Küçük Göğüs Tasarımı"] as const;

// Preset list mirrors backend ids (label/desc kept in sync with API route)
const PRESETS = [
  {
    id: "etsy-sports",
    label: "Etsy Sports",
    description: "Vintage college sports + distressed",
    accent: "from-red-500 to-orange-500",
    emoji: "🏈",
  },
  {
    id: "retro-travel",
    label: "Retro Travel",
    description: "70s seyahat poster estetiği",
    accent: "from-amber-500 to-yellow-500",
    emoji: "🌴",
  },
  {
    id: "y2k-streetwear",
    label: "Y2K Streetwear",
    description: "2000s nostalji + streetwear",
    accent: "from-pink-500 to-fuchsia-500",
    emoji: "💎",
  },
  {
    id: "tattoo-flash",
    label: "Tattoo Flash",
    description: "Old-school dövme stili",
    accent: "from-slate-500 to-zinc-700",
    emoji: "🗡️",
  },
  {
    id: "anime-street",
    label: "Anime Street",
    description: "Anime + urban streetwear",
    accent: "from-violet-500 to-purple-600",
    emoji: "👹",
  },
  {
    id: "minimal-quote",
    label: "Minimal Quote",
    description: "Minimal yazı tasarımı",
    accent: "from-slate-400 to-slate-600",
    emoji: "✍️",
  },
  {
    id: "graffiti-y2k",
    label: "Graffiti × Y2K",
    description: "Sokak grafiti + 2000s",
    accent: "from-lime-400 to-emerald-500",
    emoji: "🧪",
  },
] as const;

const HISTORY_KEY = "novaprint:generated-designs";
const HISTORY_LIMIT = 12;

interface GeneratedDesign {
  id: string;
  prompt: string;
  englishPrompt: string;
  concept?: string;
  imageDataUrl: string;
  styles?: string[];
  color?: string;
  type?: string;
  placement?: string;
  preset?: string;
  createdAt: number;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function OlusturPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [prompt, setPrompt] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [color, setColor] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [placement, setPlacement] = useState<string>("Ortalanmış");
  const [preset, setPreset] = useState<string>("");

  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [askingIdea, setAskingIdea] = useState(false);

  const [result, setResult] = useState<GeneratedDesign | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<string>("");
  const [history, setHistory] = useState<GeneratedDesign[]>([]);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const persistHistory = useCallback((next: GeneratedDesign[]) => {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  // Style multi-select toggle, max 2
  const toggleStyle = (s: string) => {
    setSelectedStyles((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      if (prev.length >= 2) {
        toast.info("Stil karışımı için en fazla 2 stil seç", { duration: 2500 });
        return prev;
      }
      return [...prev, s];
    });
  };

  const applyPreset = (id: string) => {
    if (preset === id) {
      setPreset("");
      return;
    }
    setPreset(id);
    toast.success("Preset uygulandı. İstersen alttaki seçimleri ezerek üzerine yaz.", {
      duration: 3000,
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Tasarım için bir fikir yaz.");
      textareaRef.current?.focus();
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          prompt: prompt.trim(),
          styles: selectedStyles,
          color: color || undefined,
          type: type || undefined,
          placement: placement || undefined,
          preset: preset || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Tasarım üretilemedi.");
      }
      const item: GeneratedDesign = {
        id: uid(),
        prompt: prompt.trim(),
        englishPrompt: json.englishPrompt,
        concept: json.concept,
        imageDataUrl: json.imageDataUrl,
        styles: selectedStyles.length > 0 ? selectedStyles : undefined,
        color: color || undefined,
        type: type || undefined,
        placement: placement || undefined,
        preset: preset || undefined,
        createdAt: Date.now(),
      };
      setResult(item);
      const next = [item, ...history].slice(0, HISTORY_LIMIT);
      persistHistory(next);
      toast.success("Tasarım üretildi!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(msg, { duration: 8000 });
    } finally {
      setGenerating(false);
    }
  };

  const handleEnhance = async () => {
    if (!prompt.trim()) {
      toast.error("Önce bir fikir yaz.");
      textareaRef.current?.focus();
      return;
    }
    setEnhancing(true);
    setPreviewPrompt("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enhance",
          prompt: prompt.trim(),
          styles: selectedStyles,
          color: color || undefined,
          type: type || undefined,
          placement: placement || undefined,
          preset: preset || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Hata");
      const enhanced = (json.englishPrompt as string) || "";
      if (enhanced) {
        setPreviewPrompt(enhanced);
        navigator.clipboard?.writeText(enhanced).catch(() => {});
        toast.success("Profesyonel POD prompt'u panoya kopyalandı!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(msg);
    } finally {
      setEnhancing(false);
    }
  };

  const handleRandom = async () => {
    setAskingIdea(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "random" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Hata");
      const idea = (json.idea as string) || "";
      if (idea) {
        setPrompt(idea);
        toast.success("Yeni fikir!");
        textareaRef.current?.focus();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(msg);
    } finally {
      setAskingIdea(false);
    }
  };

  const handleDownload = (item: GeneratedDesign) => {
    const link = document.createElement("a");
    link.href = item.imageDataUrl;
    const safe = item.prompt.replace(/[^a-z0-9çğıöşü\s-]/gi, "").trim().slice(0, 50);
    link.download = `${safe || "design"}-${item.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("PNG indirildi");
  };

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Prompt kopyalandı");
    } catch {
      toast.error("Kopyalama başarısız");
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    persistHistory(next);
    if (result?.id === id) setResult(null);
  };

  const clearAll = () => {
    setSelectedStyles([]);
    setColor("");
    setType("");
    setPlacement("Ortalanmış");
    setPreset("");
  };

  const hasAnySelection = useMemo(
    () =>
      selectedStyles.length > 0 ||
      !!color ||
      !!type ||
      !!preset ||
      placement !== "Ortalanmış",
    [selectedStyles, color, type, placement, preset]
  );

  return (
    <div>
      <PageHeader
        title="AI Tasarım Stüdyosu"
        description="3 aşamalı POD engine: Concept Enhancer → POD Prompt Engine → Image Gen. Etsy bestseller mantığıyla tasarım üretir."
        icon={<Wand2 className="h-5 w-5" />}
        accent="from-fuchsia-500 to-pink-500"
      >
        <Badge variant="violet" className="gap-1.5">
          <Zap className="h-3 w-3" /> POD Engine v1
        </Badge>
      </PageHeader>

      {/* ─── PRESETS BAR ──────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.18em] flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-400" />
            Bestseller Presetleri
          </p>
          {preset && (
            <button
              onClick={() => setPreset("")}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Preseti kaldır
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin -mx-1 px-1">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={cn(
                  "shrink-0 group rounded-2xl border p-3 text-left transition-all min-w-[170px] sm:min-w-[200px]",
                  active
                    ? "border-fuchsia-500/50 bg-gradient-to-br from-fuchsia-500/15 to-pink-500/10 shadow-elev-2"
                    : "border-slate-800/70 bg-slate-900/40 hover:border-slate-700"
                )}
              >
                <div
                  className={cn(
                    "h-9 w-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-lg mb-2 shadow-sm",
                    p.accent
                  )}
                >
                  {p.emoji}
                </div>
                <p
                  className={cn(
                    "text-sm font-bold mb-0.5",
                    active ? "text-fuchsia-100" : "text-slate-200"
                  )}
                >
                  {p.label}
                </p>
                <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                  {p.description}
                </p>
                {active && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-fuchsia-300 font-semibold">
                    <Check className="h-3 w-3" />
                    Aktif
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        {/* LEFT — Form */}
        <div className="space-y-4">
          {/* Prompt */}
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 backdrop-blur p-4 sm:p-5 shadow-elev-2">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-fuchsia-400" />
                Tasarım fikrin
              </label>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {prompt.length} / 300
              </span>
            </div>
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 300))}
              placeholder="Nasıl bir tasarım istediğini yaz... örn: İngiltere 2026 futbol tasarımı"
              className="bg-slate-950/60 border-slate-700/60 min-h-[120px] sm:min-h-[140px] text-sm leading-relaxed resize-none"
              disabled={generating}
            />

            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <Button
                onClick={handleRandom}
                disabled={askingIdea || generating}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
              >
                {askingIdea ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lightbulb className="h-3.5 w-3.5" />
                )}
                Rastgele Fikir
              </Button>
              <Button
                onClick={handleEnhance}
                disabled={enhancing || generating || !prompt.trim()}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
              >
                {enhancing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Promptu Geliştir
              </Button>
              {hasAnySelection && (
                <button
                  onClick={clearAll}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors sm:ml-auto self-center"
                >
                  Seçimleri temizle
                </button>
              )}
            </div>

            {previewPrompt && (
              <details
                open
                className="mt-3 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] overflow-hidden"
              >
                <summary className="cursor-pointer select-none px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-fuchsia-300 hover:text-fuchsia-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3" /> Geliştirilmiş POD Prompt
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </summary>
                <div className="px-3 pb-3">
                  <pre className="text-[10.5px] leading-relaxed text-slate-300 whitespace-pre-wrap font-mono bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 max-h-44 overflow-y-auto scrollbar-thin">
                    {previewPrompt}
                  </pre>
                </div>
              </details>
            )}
          </div>

          {/* Style Mixer */}
          <OptionGroup
            label="Stil"
            hint={
              selectedStyles.length === 2
                ? "Karışım modu — 2 stilin füzyonu üretilecek"
                : selectedStyles.length === 1
                  ? "1 daha eklersen stil karışımı olur"
                  : "1 veya 2 stil seç"
            }
            icon={<Layers className="h-3.5 w-3.5 text-fuchsia-400" />}
            badgeText={
              selectedStyles.length > 0 ? `${selectedStyles.length}/2` : undefined
            }
            onClear={
              selectedStyles.length > 0 ? () => setSelectedStyles([]) : undefined
            }
          >
            {STYLES.map((s) => {
              const active = selectedStyles.includes(s);
              return (
                <Chip
                  key={s}
                  label={s}
                  active={active}
                  disabled={generating}
                  onClick={() => toggleStyle(s)}
                />
              );
            })}
          </OptionGroup>

          <OptionGroup
            label="Renk Paleti"
            onClear={color ? () => setColor("") : undefined}
          >
            {COLORS.map((c) => (
              <Chip
                key={c}
                label={c}
                active={color === c}
                disabled={generating}
                onClick={() => setColor(color === c ? "" : c)}
              />
            ))}
          </OptionGroup>

          <OptionGroup
            label="Tasarım Tipi"
            onClear={type ? () => setType("") : undefined}
          >
            {TYPES.map((t) => (
              <Chip
                key={t}
                label={t}
                active={type === t}
                disabled={generating}
                onClick={() => setType(type === t ? "" : t)}
              />
            ))}
          </OptionGroup>

          <OptionGroup label="Yerleşim">
            {PLACEMENTS.map((p) => (
              <Chip
                key={p}
                label={p}
                active={placement === p}
                disabled={generating}
                onClick={() => setPlacement(p)}
              />
            ))}
          </OptionGroup>

          {/* Generate */}
          <Button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            size="lg"
            className="w-full !bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 !shadow-fuchsia-500/30 hover:!shadow-fuchsia-500/50 text-base h-14"
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Tasarım Üretiliyor… (~30s)
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Tasarım Oluştur
              </>
            )}
          </Button>

          <div className="rounded-xl border border-slate-800/50 bg-slate-950/30 p-3 flex gap-2.5 text-[11px] text-slate-500 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 text-slate-600 mt-0.5" />
            <span>
              POD Engine: konseptin önce zenginleştirilir, ardından stil/renk/yerleşim
              moderatörleri eklenip <span className="text-slate-400">anti-mockup</span>{" "}
              talimatları ile gpt-image-1&apos;e gönderilir.{" "}
              <span className="text-slate-400">Çıktı transparan PNG, 1024×1024.</span>
            </span>
          </div>
        </div>

        {/* RIGHT — Result */}
        <div className="space-y-4">
          <ResultPanel
            result={result}
            generating={generating}
            onDownload={handleDownload}
            onCopy={handleCopyPrompt}
            copied={copied}
          />
        </div>
      </div>

      {/* History */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-slate-400" />
            Önceki Tasarımlar
            {mounted && history.length > 0 && (
              <Badge variant="secondary">{history.length}</Badge>
            )}
          </h2>
          {mounted && history.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Tüm geçmiş silinsin mi?")) {
                  persistHistory([]);
                  toast.success("Geçmiş temizlendi");
                }
              }}
              className="text-[11px] text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Tümünü sil
            </button>
          )}
        </div>

        {!mounted ? null : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
            <div className="h-12 w-12 mx-auto rounded-xl bg-fuchsia-500/10 ring-1 ring-fuchsia-500/30 flex items-center justify-center mb-3">
              <Sparkles className="h-5 w-5 text-fuchsia-400" />
            </div>
            <p className="text-sm font-semibold text-slate-300 mb-0.5">
              Henüz tasarım üretmedin
            </p>
            <p className="text-xs text-slate-500">
              Üstten ilk fikrini yaz, AI tasarımını üretsin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {history.map((h) => (
              <HistoryCard
                key={h.id}
                item={h}
                isActive={result?.id === h.id}
                onSelect={() => setResult(h)}
                onDelete={() => handleDeleteHistoryItem(h.id)}
                onDownload={() => handleDownload(h)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── REUSABLE COMPONENTS ────────────────────────────────────────────────────
function OptionGroup({
  label,
  hint,
  badgeText,
  icon,
  onClear,
  children,
}: {
  label: string;
  hint?: string;
  badgeText?: string;
  icon?: React.ReactNode;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          {badgeText && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-md bg-fuchsia-500/15 text-fuchsia-300 font-bold">
              {badgeText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hint && (
            <span className="text-[10.5px] text-slate-500 hidden sm:inline">
              {hint}
            </span>
          )}
          {onClear && (
            <button
              onClick={onClear}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Temizle
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border disabled:opacity-50",
        active
          ? "bg-gradient-to-br from-fuchsia-500/20 to-pink-500/15 border-fuchsia-500/40 text-fuchsia-200 shadow-sm"
          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
      )}
    >
      {label}
    </button>
  );
}

function ResultPanel({
  result,
  generating,
  onDownload,
  onCopy,
  copied,
}: {
  result: GeneratedDesign | null;
  generating: boolean;
  onDownload: (item: GeneratedDesign) => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  return (
    <div className="lg:sticky lg:top-6 space-y-4">
      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur overflow-hidden shadow-elev-2">
        <div className="relative aspect-square checkerboard">
          {generating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm z-10 gap-3">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-fuchsia-500/20 border-t-fuchsia-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-fuchsia-400 animate-pulse" />
                </div>
              </div>
              <p className="text-sm font-semibold text-fuchsia-300">
                POD Engine çalışıyor…
              </p>
              <ul className="text-[10.5px] text-slate-400 space-y-1 text-center">
                <li className="flex items-center gap-1.5 justify-center">
                  <Check className="h-3 w-3 text-emerald-400" />
                  Concept enhancer
                </li>
                <li className="flex items-center gap-1.5 justify-center">
                  <Check className="h-3 w-3 text-emerald-400" />
                  POD prompt engine
                </li>
                <li className="flex items-center gap-1.5 justify-center text-fuchsia-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Image generation (~30s)
                </li>
              </ul>
            </div>
          )}

          {!generating && !result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 gap-3">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-fuchsia-500/15 to-pink-500/10 ring-1 ring-fuchsia-500/25 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-fuchsia-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-1">
                  Tasarımın burada görünecek
                </p>
                <p className="text-xs text-slate-500 max-w-xs">
                  Bir preset seç veya fikrini yaz, stil & renk seç ve &quot;Tasarım Oluştur&quot;a tıkla.
                </p>
              </div>
            </div>
          )}

          {!generating && result && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.imageDataUrl}
                alt={result.prompt}
                className="absolute inset-0 w-full h-full object-contain p-3"
              />
            </>
          )}
        </div>

        {!generating && result && (
          <div className="p-4 border-t border-slate-800/60 space-y-3">
            <p className="font-semibold text-slate-100 text-sm">
              {result.prompt}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {result.styles?.map((s) => (
                <Badge key={s} variant="violet">{s}</Badge>
              ))}
              {result.color && <Badge variant="info">{result.color}</Badge>}
              {result.type && <Badge variant="secondary">{result.type}</Badge>}
              {result.placement && (
                <Badge variant="secondary">{result.placement}</Badge>
              )}
              {result.preset && (
                <Badge variant="warning">Preset: {result.preset}</Badge>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => onDownload(result)}
                size="sm"
                variant="success"
                className="flex-1"
              >
                <Download className="h-3.5 w-3.5" />
                PNG İndir
              </Button>
              <Button
                onClick={() => onCopy(result.englishPrompt)}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Promptu Kopyala
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {!generating && result && (
        <>
          {result.concept && (
            <details className="rounded-2xl border border-slate-800/70 bg-slate-900/30 backdrop-blur overflow-hidden">
              <summary className="cursor-pointer select-none p-4 text-xs uppercase tracking-wider font-bold text-slate-400 hover:text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-fuchsia-400" />
                  Concept Enhancer Çıktısı
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </summary>
              <div className="p-4 pt-0">
                <p className="text-xs leading-relaxed text-slate-300">
                  {result.concept}
                </p>
              </div>
            </details>
          )}

          <details className="rounded-2xl border border-slate-800/70 bg-slate-900/30 backdrop-blur overflow-hidden">
            <summary className="cursor-pointer select-none p-4 text-xs uppercase tracking-wider font-bold text-slate-400 hover:text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-fuchsia-400" />
                Final POD Prompt (gpt-image-1&apos;e giden)
              </span>
              <span className="text-[10px] text-slate-600 normal-case tracking-normal font-normal">
                {result.englishPrompt.length} char
              </span>
            </summary>
            <div className="p-4 pt-0">
              <pre className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap font-mono bg-slate-950/60 border border-slate-800 rounded-lg p-3 max-h-56 overflow-y-auto scrollbar-thin">
                {result.englishPrompt}
              </pre>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function HistoryCard({
  item,
  isActive,
  onSelect,
  onDelete,
  onDownload,
}: {
  item: GeneratedDesign;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-gradient-to-br from-slate-900/60 to-slate-900/30 backdrop-blur overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-elev-3",
        isActive
          ? "border-fuchsia-500/40 ring-1 ring-fuchsia-500/30"
          : "border-slate-800/70 hover:border-slate-700"
      )}
    >
      <button
        onClick={onSelect}
        className="block w-full aspect-square checkerboard relative"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageDataUrl}
          alt={item.prompt}
          className="absolute inset-0 w-full h-full object-contain p-2"
        />
      </button>

      <div className="p-2.5 space-y-1.5">
        <p className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2">
          {item.prompt}
        </p>

        <div className="flex items-center gap-1 pt-0.5">
          <button
            onClick={onDownload}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800/60 hover:bg-emerald-500/20 hover:text-emerald-300 text-[11px] font-semibold text-slate-300 transition-colors"
          >
            <Download className="h-3 w-3" />
            PNG
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1.5 rounded-lg bg-slate-800/60 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors"
            aria-label="Sil"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
