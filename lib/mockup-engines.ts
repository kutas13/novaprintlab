// ────────────────────────────────────────────────────────────────────────────
// MOCKUP ENGINE REGISTRY
//
// Central catalog of every mockup generator the app can dispatch to. The
// mockup page reads this table to render the engine picker; each row also
// describes the endpoint path and the cost shown in the CTA.
//
// All engines accept the SAME request body (see RequestBody type below) and
// return the SAME shape (RenderedMockup) so the frontend can swap engines
// without per-engine special casing in handleGenerate.
// ────────────────────────────────────────────────────────────────────────────

export type EngineId =
  | "openai"
  | "replicate"
  | "fal"
  | "gemini"
  | "recraft";

export interface EngineMeta {
  id: EngineId;
  label: string;
  /** Short hint for the picker card (1 line). */
  blurb: string;
  /** Cost per mockup in USD. Use 0 for free tiers. */
  costUsd: number;
  /** Cost shown as a small pill on the picker card. */
  badge: string;
  /** Tailwind gradient classes for the active state. */
  gradient: string;
  /** Tailwind text/border accent for highlights. */
  accent: string;
  /** API path the page will POST to. */
  endpoint: string;
  /** Whether this engine requires its OWN env key (not just OpenAI's). */
  envKeyName: string | null;
  /** Where the user gets the key, shown in the "API key yok" toast. */
  envKeyHelp: string;
  /** Emoji shown on the picker card. */
  emoji: string;
}

export const ENGINES: Record<EngineId, EngineMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI gpt-image-1",
    blurb: "8 farklı poz · Yapay zekâ image edit · OPENAI_API_KEY gerekli",
    costUsd: 0.015,
    badge: "AI · $0.015+",
    gradient: "from-blue-500/20 to-violet-500/15",
    accent: "blue",
    endpoint: "/api/mockup",
    envKeyName: "OPENAI_API_KEY",
    envKeyHelp: "platform.openai.com/api-keys",
    emoji: "🤖",
  },
  replicate: {
    id: "replicate",
    label: "Replicate FLUX Dev",
    blurb: "img2img · ~$0.012/mockup (en uygun ücretli) · $10 ücretsiz kredi",
    costUsd: 0.012,
    badge: "AI · $0.012",
    gradient: "from-purple-500/20 to-fuchsia-500/15",
    accent: "purple",
    endpoint: "/api/mockup-replicate",
    envKeyName: "REPLICATE_API_TOKEN",
    envKeyHelp: "replicate.com/account/api-tokens",
    emoji: "🚀",
  },
  fal: {
    id: "fal",
    label: "fal.ai FLUX Pro",
    blurb: "En hızlı 2-3 saniye · Kalite OpenAI'dan iyi · ~$0.05/mockup",
    costUsd: 0.05,
    badge: "AI · $0.05",
    gradient: "from-amber-500/20 to-orange-500/15",
    accent: "amber",
    endpoint: "/api/mockup-fal",
    envKeyName: "FAL_API_KEY",
    envKeyHelp: "fal.ai/dashboard/keys",
    emoji: "⚡",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini Image",
    blurb: "Tamamen ÜCRETSİZ · ~100 mockup/gün limit · Beta",
    costUsd: 0,
    badge: "ÜCRETSİZ",
    gradient: "from-emerald-500/20 to-teal-500/15",
    accent: "emerald",
    endpoint: "/api/mockup-gemini",
    envKeyName: "GEMINI_API_KEY",
    envKeyHelp: "aistudio.google.com/apikey",
    emoji: "🎁",
  },
  recraft: {
    id: "recraft",
    label: "Recraft v3 img2img",
    blurb: "Mockup için özel eğitilmiş model · ~25 ücretsiz/gün · $0.04 sonrası",
    costUsd: 0.04,
    badge: "AI · $0.04",
    gradient: "from-rose-500/20 to-pink-500/15",
    accent: "rose",
    endpoint: "/api/mockup-recraft",
    envKeyName: "RECRAFT_API_TOKEN",
    envKeyHelp: "recraft.ai/profile/api",
    emoji: "🎨",
  },
};

export const ENGINE_LIST: EngineMeta[] = [
  ENGINES.gemini,
  ENGINES.recraft,
  ENGINES.replicate,
  ENGINES.openai,
  ENGINES.fal,
];
