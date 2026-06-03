"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Upload,
  Trash2,
  Download,
  Sparkles,
  Loader2,
  Plus,
  X,
  Image as ImageIcon,
  Package,
  Layers,
  Wand2,
  Save,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDesignStore } from "@/lib/store";
import { idbGet, idbSet, idbDel } from "@/lib/idb-kv";
import {
  DEFAULT_PRINT_AREA,
  downscaleImage,
  renderTemplateMockup,
  FOLDER_COLORS,
  type MockupTemplate,
  type PrintArea,
  type TemplateFolder,
} from "@/lib/template-mockup";
import {
  FolderPlus,
  Folder as FolderIcon,
  FolderOpen,
  MoreVertical,
  Pencil,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// ŞABLON MOCKUP — AI-FREE MOCKUP STUDIO
//
// User flow:
//   1. Upload one or more "blank product" photos (their own t-shirt photos,
//      Etsy reference shots, anything). These get stored locally in
//      IndexedDB and become reusable templates.
//   2. For each template, mark the print area with a draggable / resizable
//      rectangle.
//   3. Pick a design (from the store or an upload).
//   4. Pick which templates to use, click "Mockup Üret" — every selected
//      template gets the design composited onto its print area via Canvas.
//   5. Download single / ZIP / push to drafts.
//
// No AI. No API calls. No quotas. Outputs come from the user's browser via
// the HTML5 Canvas API.
// ────────────────────────────────────────────────────────────────────────────

const TEMPLATES_KEY = "novaprintlab.templates.v1";
const FOLDERS_KEY = "novaprintlab.folders.v1";
const EDITING_KEY = "novaprintlab.editingTemplateId.v1";
const ACTIVE_FOLDER_KEY = "novaprintlab.activeFolderId.v1";

/** Sentinel folder IDs used by the filter chips. They never appear on
 *  templates themselves — only as the page's `activeFolderId` state.    */
const FOLDER_ALL = "__all__";
const FOLDER_UNCATEGORIZED = "__uncategorized__";

type DesignSource =
  | { type: "store"; id: string; imageUrl: string; prompt?: string }
  | { type: "ai"; id: string; imageDataUrl: string; prompt: string }
  | { type: "upload"; id: string; imageDataUrl: string; name: string };

interface MockupResult {
  id: string;
  templateId: string;
  templateLabel: string;
  imageDataUrl: string;
  createdAt: number;
  /** Design these mockups were generated for. Required so the
   *  "Onayla & Taslağa Gönder" button knows which design row to attach
   *  the mockup to. `null` means the user picked an upload (no Supabase
   *  design row exists) — in that case the approve button is hidden. */
  designId: string | null;
  /** Cached label for filenames & toasts. */
  designName: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "mockup";

/** Decode a `data:image/jpeg;base64,...` URL into a Blob without going
 *  through `fetch()` — saves a round trip and works in any context.   */
function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Geçersiz data URL");
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function TemplateMockupPage() {
  const designs = useDesignStore((s) => s.designs);
  const initStore = useDesignStore((s) => s.initialize);
  const addMockupsToDesign = useDesignStore((s) => s.addMockups);
  const saveAsDraft = useDesignStore((s) => s.saveAsDraft);

  useEffect(() => {
    initStore().catch(() => {});
  }, [initStore]);

  // ─── DESIGN SELECTION ────────────────────────────────────────────────
  // Mağaza listesi: sadece HENÜZ MOCKUP YAPILMAMIŞ tasarımları göster.
  // Mockup'ı zaten olan tasarımları burada listelemek anlamsız — kullanıcı
  // ikinci kez aynı tasarım için mockup üretmek istemez ve listeyi şişirip
  // zor seçim yapmak istemez. Mockup'ı olanlar Taha sayfası ve Taslaklar
  // sayfasında zaten görünür.
  const storeDesigns: DesignSource[] = useMemo(
    () =>
      designs
        .filter((d) => d.originalImageUrl && d.mockups.length === 0)
        .map((d) => ({
          type: "store" as const,
          id: d.id,
          imageUrl: d.originalImageUrl,
          prompt: d.name,
        })),
    [designs]
  );

  const [uploadedDesigns, setUploadedDesigns] = useState<DesignSource[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<DesignSource | null>(
    null
  );
  const [designTab, setDesignTab] = useState<"store" | "upload">("store");
  const designFileRef = useRef<HTMLInputElement>(null);

  const handleDesignUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: DesignSource[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: PNG/JPG olmalı.`);
        continue;
      }
      try {
        const dataUrl = await downscaleImage(file, 2000, 0.95);
        next.push({
          type: "upload",
          id: Math.random().toString(36).slice(2, 10),
          imageDataUrl: dataUrl,
          name: file.name,
        });
      } catch (e) {
        toast.error(`${file.name} okunamadı: ${(e as Error).message}`);
      }
    }
    setUploadedDesigns((prev) => [...next, ...prev]);
    if (next[0]) setSelectedDesign(next[0]);
  };

  // ─── TEMPLATE LIBRARY ────────────────────────────────────────────────
  const [templates, setTemplates] = useState<MockupTemplate[]>([]);
  const [folders, setFolders] = useState<TemplateFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>(FOLDER_ALL);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(
    new Set()
  );
  const [editingTemplate, setEditingTemplate] = useState<MockupTemplate | null>(
    null
  );
  const templateFileRef = useRef<HTMLInputElement>(null);

  // ─── LOAD ALL PERSISTED STATE ON MOUNT ───────────────────────────────
  // Templates + folders + the editor's open template + the active folder
  // chip all live in IndexedDB so the workspace survives a page refresh
  // or a navigation away-and-back. Previously the editor was killed on
  // every nav, which is exactly the bug the user reported.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [stored, storedFolders, storedEditingId, storedActiveFolder] =
          await Promise.all([
            idbGet<MockupTemplate[]>(TEMPLATES_KEY),
            idbGet<TemplateFolder[]>(FOLDERS_KEY),
            idbGet<string>(EDITING_KEY),
            idbGet<string>(ACTIVE_FOLDER_KEY),
          ]);
        if (!alive) return;

        // Migration: templates persisted before we added `rotation`,
        // `fabricShading`, `folderId` won't have those fields. Backfill
        // with safe defaults so the renderer doesn't read `undefined`.
        const migrated = (stored ?? []).map((t) => ({
          ...t,
          folderId: t.folderId ?? null,
          printArea: {
            x: t.printArea?.x ?? 0.32,
            y: t.printArea?.y ?? 0.26,
            w: t.printArea?.w ?? 0.36,
            h: t.printArea?.h ?? 0.33,
            rotation: t.printArea?.rotation ?? 0,
          },
          fabricShading: t.fabricShading ?? true,
          blendStrength: t.blendStrength ?? 0.85,
        }));
        setTemplates(migrated);
        setFolders(storedFolders ?? []);

        // Restore the editor's open template if it still exists. Without
        // this, the user loses their print-area panel every time they
        // navigate away (Yusuf reported "yatay dikey ayarlama yeri gidiyor
        // gelmiyor").
        if (storedEditingId) {
          const found = migrated.find((t) => t.id === storedEditingId);
          if (found) setEditingTemplate(found);
        }

        // Restore last active folder chip if it still exists. Fall back
        // to "Tümü" if the user deleted the folder while we were gone.
        if (
          storedActiveFolder &&
          (storedActiveFolder === FOLDER_ALL ||
            storedActiveFolder === FOLDER_UNCATEGORIZED ||
            (storedFolders ?? []).some((f) => f.id === storedActiveFolder))
        ) {
          setActiveFolderId(storedActiveFolder);
        }

        // NOTE: We intentionally DO NOT auto-select all templates here.
        // The user complained that the auto-selection forced them to
        // un-tick every template before generating with just one. Start
        // empty; let the user pick.
      } catch (e) {
        console.error("[templates] load failed:", e);
      } finally {
        if (alive) setLoadingTemplates(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist templates whenever they change
  useEffect(() => {
    if (loadingTemplates) return;
    void idbSet(TEMPLATES_KEY, templates);
  }, [templates, loadingTemplates]);

  // Persist folders
  useEffect(() => {
    if (loadingTemplates) return;
    void idbSet(FOLDERS_KEY, folders);
  }, [folders, loadingTemplates]);

  // Persist which template is currently being edited
  useEffect(() => {
    if (loadingTemplates) return;
    if (editingTemplate) {
      void idbSet(EDITING_KEY, editingTemplate.id);
    } else {
      void idbDel(EDITING_KEY);
    }
  }, [editingTemplate?.id, loadingTemplates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the active folder chip
  useEffect(() => {
    if (loadingTemplates) return;
    void idbSet(ACTIVE_FOLDER_KEY, activeFolderId);
  }, [activeFolderId, loadingTemplates]);

  // ─── FOLDER ACTIONS ──────────────────────────────────────────────────
  const createFolder = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Aynı isimde bir klasör zaten var.");
      return false;
    }
    const id = Math.random().toString(36).slice(2, 10);
    const color = FOLDER_COLORS[folders.length % FOLDER_COLORS.length];
    const next: TemplateFolder = {
      id,
      name: trimmed.slice(0, 40),
      color,
      createdAt: Date.now(),
    };
    setFolders((prev) => [...prev, next]);
    setActiveFolderId(id);
    toast.success(`'${next.name}' klasörü oluşturuldu`);
    return true;
  };

  const renameFolder = (id: string, name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setFolders((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, name: trimmed.slice(0, 40) } : x
      )
    );
    return true;
  };

  const deleteFolder = (id: string) => {
    const f = folders.find((x) => x.id === id);
    if (!f) return;
    const count = templates.filter((t) => t.folderId === id).length;
    const msg = count
      ? `'${f.name}' klasörünü sil? İçindeki ${count} şablon "Klasörsüz"e taşınacak.`
      : `'${f.name}' klasörünü sil?`;
    if (!confirm(msg)) return;
    setFolders((prev) => prev.filter((x) => x.id !== id));
    setTemplates((prev) =>
      prev.map((t) => (t.folderId === id ? { ...t, folderId: null } : t))
    );
    if (activeFolderId === id) setActiveFolderId(FOLDER_ALL);
  };

  /** Move a SET of templates to a target folder. Used by drag-drop where
   *  the user may have selected multiple templates and dragged any one
   *  of them onto a chip. Empty set = no-op. */
  const moveTemplatesTo = (ids: string[], folderId: string | null) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setTemplates((prev) =>
      prev.map((t) => (idSet.has(t.id) ? { ...t, folderId } : t))
    );
    const folderName =
      folderId === null
        ? "Klasörsüz"
        : folders.find((f) => f.id === folderId)?.name || "klasör";
    toast.success(
      `${ids.length} şablon '${folderName}' klasörüne taşındı`
    );
  };

  const moveTemplate = (templateId: string, folderId: string | null) => {
    moveTemplatesTo([templateId], folderId);
  };

  const handleTemplateUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: MockupTemplate[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: PNG/JPG olmalı.`);
        continue;
      }
      try {
        const dataUrl = await downscaleImage(file, 1800, 0.9);
        const tpl: MockupTemplate = {
          id: Math.random().toString(36).slice(2, 10),
          label: file.name.replace(/\.[^.]+$/, "").slice(0, 60),
          imageDataUrl: dataUrl,
          printArea: { ...DEFAULT_PRINT_AREA },
          blendStrength: 0.85,
          fabricShading: true,
          createdAt: Date.now(),
        };
        added.push(tpl);
      } catch (e) {
        toast.error(`${file.name} işlenemedi: ${(e as Error).message}`);
      }
    }
    if (added.length > 0) {
      // Auto-assign newly uploaded templates to the active folder so the
      // user doesn't have to manually file every blank they upload while
      // a folder is open.
      const targetFolderId =
        activeFolderId !== FOLDER_ALL && activeFolderId !== FOLDER_UNCATEGORIZED
          ? activeFolderId
          : null;
      const tagged = added.map((t) => ({ ...t, folderId: targetFolderId }));
      setTemplates((prev) => [...tagged, ...prev]);
      // NOTE: do NOT auto-select; the user wants to pick which templates
      // to include in each generation run themselves.
      toast.success(`${tagged.length} şablon eklendi`);
      // Auto-open editor for the first new template so the user can mark
      // the print area immediately. Otherwise the default area lands in
      // the middle of the photo which might or might not be the chest.
      if (tagged[0]) setEditingTemplate(tagged[0]);
    }
  };

  const updateTemplate = (id: string, patch: Partial<MockupTemplate>) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
    if (editingTemplate?.id === id) {
      setEditingTemplate({ ...editingTemplate, ...patch });
    }
  };

  const deleteTemplate = (id: string) => {
    if (!confirm("Bu şablonu sil?")) return;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (editingTemplate?.id === id) setEditingTemplate(null);
  };

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── MOCKUP GENERATION ───────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<MockupResult[]>([]);

  const handleGenerate = async () => {
    if (!selectedDesign) {
      toast.error("Önce bir tasarım seç.");
      return;
    }
    const picked = templates.filter((t) => selectedTemplateIds.has(t.id));
    if (picked.length === 0) {
      toast.error("En az 1 şablon seç (veya yükle).");
      return;
    }
    setGenerating(true);
    // NOTE: We intentionally DON'T clear previous results here. Each
    // generation run appends to the existing list — the user wants to
    // build up a pile of mockups across multiple designs and only
    // approve/discard them one-by-one. The "Sıfırla" button is the
    // explicit way to clear.
    const designSrc =
      selectedDesign.type === "store"
        ? selectedDesign.imageUrl
        : selectedDesign.imageDataUrl;

    // Resolve a human-readable design name + the Supabase design row id
    // (if any) so the approve button later can attach mockups to the
    // right design row.
    const designName =
      selectedDesign.type === "store"
        ? selectedDesign.prompt ?? "tasarim"
        : selectedDesign.type === "upload"
        ? selectedDesign.name
        : selectedDesign.prompt;
    const linkedDesignId =
      selectedDesign.type === "store" ? selectedDesign.id : null;

    const collected: MockupResult[] = [];
    const errors: string[] = [];

    for (const tpl of picked) {
      try {
        const dataUrl = await renderTemplateMockup(tpl, designSrc, 1500);
        const item: MockupResult = {
          id: Math.random().toString(36).slice(2, 10),
          templateId: tpl.id,
          templateLabel: tpl.label,
          imageDataUrl: dataUrl,
          createdAt: Date.now(),
          designId: linkedDesignId,
          designName,
        };
        collected.push(item);
        setResults((prev) => [...prev, item]); // Stream into UI as they finish
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
        errors.push(`${tpl.label}: ${msg}`);
        console.error(`[template-mockup] ${tpl.label} failed:`, e);
      }
    }
    setGenerating(false);
    if (collected.length === 0) {
      toast.error("Mockup üretilemedi: " + errors.join(", "));
    } else if (errors.length > 0) {
      toast.success(
        `${collected.length} mockup üretildi (${errors.length} başarısız)`
      );
    } else {
      toast.success(`${collected.length} mockup üretildi · $0 maliyet`);
    }
  };

  // ─── APPROVE → SEND TO DRAFTS ────────────────────────────────────────
  /** Map of mockup result id → "approving" so we can disable/spinner the
   *  individual button while the upload + status update is in flight. */
  const [approving, setApproving] = useState<Record<string, boolean>>({});

  const approveAndSendToDrafts = async (item: MockupResult) => {
    if (!item.designId) {
      toast.error(
        "Bu mockup bir mağaza tasarımına bağlı değil — önce tasarımı yükle (Yusuf sayfası) veya AI Stüdyo'da onaylat."
      );
      return;
    }
    if (approving[item.id]) return;
    setApproving((m) => ({ ...m, [item.id]: true }));
    try {
      // Convert the data URL → File so addMockups() (which expects File[]
      // for Supabase storage upload) can ingest it.
      const blob = dataUrlToBlob(item.imageDataUrl);
      const filename = `${slug(item.designName)}-${slug(item.templateLabel)}-${
        item.id
      }.jpg`;
      const file = new File([blob], filename, { type: "image/jpeg" });

      await addMockupsToDesign(item.designId, [file]);
      // Move design into the Taslaklar bucket so Yusuf can price & publish.
      await saveAsDraft(item.designId);

      // Pop it out of the local results list — that's the user's signal
      // the mockup is now safely upstream.
      setResults((prev) => prev.filter((r) => r.id !== item.id));
      toast.success(
        `'${item.designName}' taslağa gönderildi (${item.templateLabel})`
      );
    } catch (e) {
      console.error("[approveAndSendToDrafts]", e);
      toast.error("Taslağa gönderilemedi. Tekrar dene.");
    } finally {
      setApproving((m) => {
        const next = { ...m };
        delete next[item.id];
        return next;
      });
    }
  };

  const downloadOne = (item: MockupResult) => {
    const link = document.createElement("a");
    link.href = item.imageDataUrl;
    link.download = `${slug(item.templateLabel)}-${item.id}.jpg`;
    link.click();
  };

  const downloadAllZip = async () => {
    if (results.length === 0) return;
    // Lazy-load jszip — it's already in the bundle from the AI mockup page
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    results.forEach((r) => {
      const m = r.imageDataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (m) {
        zip.file(`${slug(r.templateLabel)}-${r.id}.jpg`, m[1], {
          base64: true,
        });
      }
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sablon-mockup-${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${results.length} mockup ZIP'lendi`);
  };

  const clearAll = () => {
    if (!confirm("Tüm şablonları sil?")) return;
    setTemplates([]);
    setSelectedTemplateIds(new Set());
    void idbDel(TEMPLATES_KEY);
  };

  // ─── DRAG-DROP STATE ─────────────────────────────────────────────────
  // When the user starts dragging a template card, we figure out which
  // ids should be picked up: if the dragged template is one of the
  // currently selected ones, we drag the WHOLE selection (so toplu
  // taşıma works); otherwise we drag just the single template the user
  // grabbed. The active "drop-target chip" id is tracked so we can
  // visually highlight the chip the cursor is over.
  const [draggingIds, setDraggingIds] = useState<string[] | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(
    null
  );

  const handleDragStart = (templateId: string) => {
    if (selectedTemplateIds.has(templateId) && selectedTemplateIds.size > 1) {
      setDraggingIds(Array.from(selectedTemplateIds));
    } else {
      setDraggingIds([templateId]);
    }
  };
  const handleDragEnd = () => {
    setDraggingIds(null);
    setDropTargetFolderId(null);
  };
  const handleDropToFolder = (folderId: string | null) => {
    if (!draggingIds) return;
    moveTemplatesTo(draggingIds, folderId);
    handleDragEnd();
  };

  // ─── DERIVED LISTS ───────────────────────────────────────────────────
  // Visible templates = those in the active folder filter.
  const visibleTemplates = useMemo(() => {
    if (activeFolderId === FOLDER_ALL) return templates;
    if (activeFolderId === FOLDER_UNCATEGORIZED)
      return templates.filter((t) => !t.folderId);
    return templates.filter((t) => t.folderId === activeFolderId);
  }, [templates, activeFolderId]);

  // Counts per folder for the chip badges
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [FOLDER_ALL]: templates.length,
      [FOLDER_UNCATEGORIZED]: templates.filter((t) => !t.folderId).length,
    };
    folders.forEach((f) => {
      counts[f.id] = templates.filter((t) => t.folderId === f.id).length;
    });
    return counts;
  }, [templates, folders]);

  // "Select all visible" — only toggles templates the user can actually see
  const allVisibleSelected =
    visibleTemplates.length > 0 &&
    visibleTemplates.every((t) => selectedTemplateIds.has(t.id));

  const toggleSelectAllVisible = () => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleTemplates.forEach((t) => next.delete(t.id));
      } else {
        visibleTemplates.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  // ─── RENDER ──────────────────────────────────────────────────────────
  const totalRenders = selectedTemplateIds.size;

  return (
    <div className="p-4 sm:p-6 space-y-5 pb-32">
      {/* ─── HERO — gradient banner + live stats ───────────────────── */}
      <Hero
        templateCount={templates.length}
        folderCount={folders.length}
        designCount={storeDesigns.length + uploadedDesigns.length}
        renderCount={results.length}
        selectedTemplateCount={selectedTemplateIds.size}
        hasSelectedDesign={!!selectedDesign}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5">
        {/* ─── LEFT PANEL ─── */}
        <div className="space-y-4">
          {/* 1) Design picker */}
          <Section
            title="1. Tasarım Seç"
            icon={<Wand2 className="h-4 w-4 text-fuchsia-400" />}
          >
            <div className="flex gap-1 p-0.5 bg-slate-950/60 rounded-lg mb-3">
              <TabBtn
                active={designTab === "store"}
                onClick={() => setDesignTab("store")}
                label="Mağaza"
                count={storeDesigns.length}
              />
              <TabBtn
                active={designTab === "upload"}
                onClick={() => setDesignTab("upload")}
                label="Yükle"
                count={uploadedDesigns.length}
              />
            </div>

            {designTab === "store" ? (
              <DesignGrid
                designs={storeDesigns}
                selectedId={selectedDesign?.id || null}
                onSelect={setSelectedDesign}
                empty="Henüz mağaza tasarımı yok"
              />
            ) : (
              <div className="space-y-2">
                <input
                  type="file"
                  ref={designFileRef}
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={(e) => handleDesignUpload(e.target.files)}
                />
                <button
                  onClick={() => designFileRef.current?.click()}
                  className="w-full h-20 rounded-xl border-2 border-dashed border-slate-700/70 hover:border-fuchsia-500/50 bg-slate-900/40 text-slate-300 hover:text-fuchsia-200 transition-all flex flex-col items-center justify-center gap-1"
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-xs font-semibold">
                    PNG / JPG yükle
                  </span>
                </button>
                <DesignGrid
                  designs={uploadedDesigns}
                  selectedId={selectedDesign?.id || null}
                  onSelect={setSelectedDesign}
                  empty="Henüz tasarım yüklenmedi"
                />
              </div>
            )}
          </Section>

          {/* 2) Template library */}
          <Section
            title="2. Şablonlarım"
            icon={<Package className="h-4 w-4 text-emerald-400" />}
            rightSlot={
              templates.length > 0 ? (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-slate-500 hover:text-rose-300"
                >
                  Hepsini sil
                </button>
              ) : null
            }
          >
            {/* ─── FOLDER CHIPS ─── */}
            <FolderChips
              folders={folders}
              counts={folderCounts}
              activeFolderId={activeFolderId}
              onSelect={setActiveFolderId}
              onRename={renameFolder}
              onDelete={deleteFolder}
              onCreate={createFolder}
              dragging={draggingIds !== null}
              draggingCount={draggingIds?.length || 0}
              dropTargetFolderId={dropTargetFolderId}
              onDropTargetChange={setDropTargetFolderId}
              onDrop={handleDropToFolder}
            />

            <input
              type="file"
              ref={templateFileRef}
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                handleTemplateUpload(e.target.files);
                if (templateFileRef.current) templateFileRef.current.value = "";
              }}
            />
            <button
              onClick={() => templateFileRef.current?.click()}
              className="w-full h-20 rounded-xl border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/5 text-emerald-200 hover:text-emerald-100 transition-all flex flex-col items-center justify-center gap-1 mb-3"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-semibold">
                {activeFolderId !== FOLDER_ALL &&
                activeFolderId !== FOLDER_UNCATEGORIZED
                  ? `'${folders.find((f) => f.id === activeFolderId)?.name}' klasörüne yükle`
                  : "Blank Ürün Fotoğrafı Yükle"}
              </span>
              <span className="text-[10px] text-slate-500">
                T-shirt, hoodie, sweatshirt — herhangi bir blank ürün PNG/JPG
              </span>
            </button>

            {/* Select-all toggle (only shown when there's something to act on) */}
            {visibleTemplates.length > 0 && (
              <div className="flex items-center justify-between mb-2 px-1">
                <button
                  onClick={toggleSelectAllVisible}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:text-emerald-200"
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center transition",
                      allVisibleSelected
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-slate-600 bg-slate-900"
                    )}
                  >
                    {allVisibleSelected && (
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    )}
                  </span>
                  {allVisibleSelected
                    ? "Seçimi kaldır"
                    : "Görünenleri seç"}
                </button>
                <span className="text-[10px] text-slate-500">
                  {selectedTemplateIds.size} / {visibleTemplates.length} seçili
                </span>
              </div>
            )}

            {loadingTemplates ? (
              <div className="text-center text-xs text-slate-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Şablonlar yükleniyor…
              </div>
            ) : visibleTemplates.length === 0 ? (
              <div className="text-center py-6 px-3 rounded-xl bg-slate-950/40 border border-slate-800/50">
                <Package className="h-8 w-8 mx-auto mb-2 text-slate-700" />
                <p className="text-xs text-slate-400 mb-1">
                  {templates.length === 0
                    ? "Henüz şablon eklenmemiş"
                    : "Bu klasör boş"}
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {templates.length === 0
                    ? "Yukarıdaki butona basıp Etsy'de bulduğun veya kendi çektiğin blank ürün fotoğraflarını yükle. Her şablon bir kere yüklenir, sürekli kullanılır."
                    : "Bu klasöre şablon ekle veya başka bir klasör seç."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {visibleTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    tpl={tpl}
                    isSelected={selectedTemplateIds.has(tpl.id)}
                    isEditing={editingTemplate?.id === tpl.id}
                    isDragging={draggingIds?.includes(tpl.id) || false}
                    folders={folders}
                    // Single tap = both pick this template AND open its
                    // editor on the right. That gives the user the
                    // "tıklayınca sağ tarafta ayarlama gelsin" behavior
                    // they wanted, while still letting them un-tap to
                    // deselect.
                    onToggle={() => {
                      toggleTemplate(tpl.id);
                      setEditingTemplate(tpl);
                    }}
                    onEdit={() => setEditingTemplate(tpl)}
                    onDelete={() => deleteTemplate(tpl.id)}
                    onMove={(folderId) => moveTemplate(tpl.id, folderId)}
                    onDragStart={() => handleDragStart(tpl.id)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            )}

            {visibleTemplates.length > 0 && (
              <p className="text-[10.5px] text-slate-500 mt-3 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />
                Pembe kutu = print bölgesi. Düzenlemek için göz ikonuna, klasör
                taşımak için 3-nokta menüsüne tıkla.
              </p>
            )}
          </Section>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 flex gap-2.5 text-[11px] text-emerald-200/80 leading-relaxed">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>
              <span className="font-bold text-emerald-200">
                Otomatik renk algılama:
              </span>{" "}
              Beyaz tasarımlar koyu kumaşa screen blend, siyah tasarımlar
              açık kumaşa multiply blend ile yerleşir. Hiçbir tasarım
              kararmaz.
            </span>
          </div>
        </div>

        {/* ─── RIGHT PANEL — preview / editor / results ─── */}
        <div className="space-y-4">
          {editingTemplate ? (
            <PrintAreaEditor
              template={editingTemplate}
              onChange={(patch) => updateTemplate(editingTemplate.id, patch)}
              onClose={() => setEditingTemplate(null)}
            />
          ) : null}

          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Üretilen Mockuplar
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {results.length === 0
                    ? "Henüz mockup üretilmedi"
                    : `${results.length} mockup · $0 toplam maliyet`}
                </p>
              </div>
              {results.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResults([])}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Temizle
                  </Button>
                  <Button size="sm" onClick={downloadAllZip}>
                    <Download className="h-3.5 w-3.5" /> ZIP İndir
                  </Button>
                </div>
              )}
            </div>

            {results.length === 0 ? (
              <div className="aspect-video rounded-xl border-2 border-dashed border-slate-800/70 bg-slate-950/40 flex flex-col items-center justify-center text-slate-500 p-6">
                <ImageIcon className="h-10 w-10 mb-2 text-slate-700" />
                <p className="text-sm font-semibold text-slate-400">
                  Tasarım + Şablon seç, "Mockup Üret"e bas
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Üretim anlık (1 saniyeden az). AI yok, beklemek yok.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {results.map((r) => {
                  const isApproving = !!approving[r.id];
                  const canApprove = !!r.designId;
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-slate-800/70 bg-slate-950/60 overflow-hidden group flex flex-col"
                    >
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.imageDataUrl}
                          alt={r.templateLabel}
                          className="w-full aspect-square object-cover"
                        />
                        {isApproving && (
                          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-1.5">
                            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                            <p className="text-[11px] font-semibold text-emerald-200">
                              Taslağa yükleniyor…
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="p-2 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-[11px] text-slate-200 truncate font-semibold"
                              title={r.designName}
                            >
                              {r.designName}
                            </p>
                            <p
                              className="text-[10px] text-slate-500 truncate"
                              title={r.templateLabel}
                            >
                              {r.templateLabel}
                            </p>
                          </div>
                          <button
                            onClick={() => downloadOne(r)}
                            disabled={isApproving}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-200 transition disabled:opacity-40"
                            title="İndir"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          onClick={() => approveAndSendToDrafts(r)}
                          disabled={!canApprove || isApproving}
                          title={
                            !canApprove
                              ? "Yüklenmiş PNG'ler taslağa gönderilemez — önce Yusuf sayfasından mağazaya yükle."
                              : "Bu mockup'u onayla, mağaza tasarımına ekle ve taslaklara gönder"
                          }
                          className={cn(
                            "w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-bold transition-all",
                            !canApprove
                              ? "bg-slate-800/50 text-slate-600 cursor-not-allowed"
                              : isApproving
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:-translate-y-0.5"
                          )}
                        >
                          {isApproving ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Gönderiliyor…
                            </>
                          ) : (
                            <>
                              <Send className="h-3 w-3" />
                              Onayla · Taslağa Gönder
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── STICKY ACTION BAR ─────────────────────────────────────── */}
      <ActionBar
        canGenerate={
          !generating && !!selectedDesign && selectedTemplateIds.size > 0
        }
        generating={generating}
        selectedTemplateCount={selectedTemplateIds.size}
        hasDesign={!!selectedDesign}
        resultCount={results.length}
        onGenerate={handleGenerate}
        onZip={downloadAllZip}
        onClear={() => setResults([])}
      />
    </div>
  );
}

// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────

/** Top-of-page hero banner. Big gradient, headline, and a row of live
 *  stat tiles so the user can see their workspace at a glance — total
 *  templates, folders, selected design, current run, and a "$0" badge
 *  reinforcing the AI-free / no-quota pitch. */
function Hero({
  templateCount,
  folderCount,
  designCount,
  renderCount,
  selectedTemplateCount,
  hasSelectedDesign,
}: {
  templateCount: number;
  folderCount: number;
  designCount: number;
  renderCount: number;
  selectedTemplateCount: number;
  hasSelectedDesign: boolean;
}) {
  // Stage progress (1/2/3) helps users new to the page understand they
  // need to (a) pick a design, (b) pick templates, (c) hit generate.
  const stage = !hasSelectedDesign
    ? 1
    : selectedTemplateCount === 0
    ? 2
    : 3;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-slate-900/40 to-cyan-500/[0.08] backdrop-blur shadow-elev-3">
      {/* Decorative blobs — pure CSS, no images */}
      <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />

      <div className="relative p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-center">
        {/* Left — title + stage stepper */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Mockup Stüdyosu
              </h1>
              <p className="text-[12px] text-emerald-200/80 mt-0.5">
                Kendi blank fotoğraflarınla,{" "}
                <span className="font-bold text-emerald-300">
                  $0 maliyet
                </span>
                , anında mockup. AI yok, kota yok.
              </p>
            </div>
          </div>

          {/* Stage stepper */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <StageStep
              n={1}
              label="Tasarım"
              done={stage > 1}
              active={stage === 1}
            />
            <StageArrow done={stage > 1} />
            <StageStep
              n={2}
              label={`${selectedTemplateCount || ""} Şablon`}
              done={stage > 2}
              active={stage === 2}
            />
            <StageArrow done={stage > 2} />
            <StageStep
              n={3}
              label="Üret"
              done={false}
              active={stage === 3}
            />
          </div>
        </div>

        {/* Right — stat tiles */}
        <div className="grid grid-cols-4 lg:grid-cols-4 gap-2">
          <StatTile icon={Wand2} label="Tasarım" value={designCount} accent="fuchsia" />
          <StatTile icon={Package} label="Şablon" value={templateCount} accent="emerald" />
          <StatTile icon={FolderIcon} label="Klasör" value={folderCount} accent="cyan" />
          <StatTile icon={Sparkles} label="Üretildi" value={renderCount} accent="amber" />
        </div>
      </div>
    </div>
  );
}

function StageStep({
  n,
  label,
  done,
  active,
}: {
  n: number;
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition",
        done
          ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
          : active
          ? "bg-amber-500/20 text-amber-200 border-amber-400/50 shadow-elev-1 ring-2 ring-amber-400/30"
          : "bg-slate-900/60 text-slate-400 border-slate-800"
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-extrabold",
          done
            ? "bg-emerald-500 text-white"
            : active
            ? "bg-amber-400 text-slate-900"
            : "bg-slate-800 text-slate-500"
        )}
      >
        {done ? <CheckCircle2 className="h-3 w-3" /> : n}
      </span>
      {label}
    </div>
  );
}

function StageArrow({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "text-xs transition-colors",
        done ? "text-emerald-300" : "text-slate-700"
      )}
    >
      →
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: "fuchsia" | "emerald" | "cyan" | "amber";
}) {
  const tones: Record<
    string,
    { ring: string; bg: string; text: string; glow: string }
  > = {
    fuchsia: {
      ring: "ring-fuchsia-500/30",
      bg: "bg-fuchsia-500/10",
      text: "text-fuchsia-300",
      glow: "shadow-fuchsia-500/20",
    },
    emerald: {
      ring: "ring-emerald-500/30",
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      glow: "shadow-emerald-500/20",
    },
    cyan: {
      ring: "ring-cyan-500/30",
      bg: "bg-cyan-500/10",
      text: "text-cyan-300",
      glow: "shadow-cyan-500/20",
    },
    amber: {
      ring: "ring-amber-500/30",
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      glow: "shadow-amber-500/20",
    },
  };
  const t = tones[accent];
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-800/60 bg-slate-950/40 backdrop-blur p-2.5 sm:p-3 flex flex-col gap-1.5 shadow-elev-1 transition hover:-translate-y-0.5",
        t.glow
      )}
    >
      <span
        className={cn(
          "h-7 w-7 rounded-lg flex items-center justify-center ring-1",
          t.bg,
          t.ring
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", t.text)} />
      </span>
      <div className="text-xl font-extrabold text-white tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
    </div>
  );
}

/** Bottom sticky bar — primary "Mockup Üret" CTA + secondary actions
 *  (Sıfırla, ZIP). Stays visible no matter how far the user has scrolled
 *  through templates or results so the action is always one click away. */
function ActionBar({
  canGenerate,
  generating,
  selectedTemplateCount,
  hasDesign,
  resultCount,
  onGenerate,
  onZip,
  onClear,
}: {
  canGenerate: boolean;
  generating: boolean;
  selectedTemplateCount: number;
  hasDesign: boolean;
  resultCount: number;
  onGenerate: () => void;
  onZip: () => void;
  onClear: () => void;
}) {
  const blockedReason = !hasDesign
    ? "Tasarım seç"
    : selectedTemplateCount === 0
    ? "Şablon seç"
    : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 pb-3 sm:pb-4">
        <div className="pointer-events-auto rounded-2xl border border-emerald-500/30 bg-slate-950/85 backdrop-blur-xl shadow-2xl shadow-emerald-500/20 p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
          {/* Status pill — what's selected right now */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] font-semibold text-slate-300 min-w-0">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                canGenerate ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              )}
            />
            {generating ? (
              <span>Üretiliyor…</span>
            ) : canGenerate ? (
              <span className="truncate">
                <span className="text-emerald-300">
                  {selectedTemplateCount}
                </span>{" "}
                şablon × 1 tasarım ={" "}
                <span className="text-emerald-300">
                  {selectedTemplateCount}
                </span>{" "}
                mockup
              </span>
            ) : (
              <span className="text-amber-300">
                <AlertCircle className="h-3 w-3 inline -mt-0.5 mr-1" />
                {blockedReason}
              </span>
            )}
          </div>

          {/* Secondary actions — only when there are results to act on */}
          {resultCount > 0 && (
            <>
              <button
                onClick={onClear}
                disabled={generating}
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-800/80 text-[11px] font-semibold text-slate-300 disabled:opacity-40 transition"
                title="Üretilen mockupları sıfırla"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sıfırla
              </button>
              <button
                onClick={onZip}
                disabled={generating}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-[11px] font-semibold text-cyan-200 disabled:opacity-40 transition"
                title="Tüm mockupları ZIP olarak indir"
              >
                <Download className="h-3.5 w-3.5" />
                ZIP ({resultCount})
              </button>
            </>
          )}

          {/* Primary CTA — flex-1 so it grows */}
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 h-11 sm:h-12 px-4 sm:px-6 rounded-xl text-sm font-bold text-white transition-all",
              canGenerate
                ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-lg shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:-translate-y-0.5"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            )}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Üretiliyor…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Mockup Üret
                {selectedTemplateCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-white/15 text-[10px] tabular-nums">
                    ×{selectedTemplateCount}
                  </span>
                )}
                <span className="hidden sm:inline text-[10px] font-semibold bg-white/15 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                  Ücretsiz
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Horizontally-scrolling row of folder chips that sit above the template
 *  grid. Each chip:
 *    • filters the grid to just that folder (single click)
 *    • accepts a drag-drop from a TemplateCard (the dragged template(s)
 *      get moved into the chip's folder)
 *    • exposes a 3-dot menu with Rename + Delete (for real folders only)
 *
 *  Two sentinel chips are always present: "Tümü" (no-op drop = clear
 *  folder) and "Klasörsüz" (drop = clear folder).
 *
 *  Folder creation is INLINE: clicking "+ Klasör" swaps that button with
 *  a tiny pill-shaped input. Enter to confirm, Esc / blur to cancel.
 *  No native prompt() — that's what the user explicitly complained about. */
function FolderChips({
  folders,
  counts,
  activeFolderId,
  onSelect,
  onRename,
  onDelete,
  onCreate,
  dragging,
  draggingCount,
  dropTargetFolderId,
  onDropTargetChange,
  onDrop,
}: {
  folders: TemplateFolder[];
  counts: Record<string, number>;
  activeFolderId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => boolean;
  onDelete: (id: string) => void;
  onCreate: (name: string) => boolean;
  dragging: boolean;
  draggingCount: number;
  dropTargetFolderId: string | null;
  onDropTargetChange: (id: string | null) => void;
  onDrop: (folderId: string | null) => void;
}) {
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Click-outside to close the popover. We attach a single document
  // listener instead of one per chip to keep the DOM lean.
  useEffect(() => {
    if (!menuOpenFor) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-folder-menu]")) setMenuOpenFor(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpenFor]);

  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1 transition-colors",
        "[&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded",
        dragging && "py-1.5"
      )}
    >
      {/* "Tümü" — drop here = clear folder (uncategorize) */}
      <DroppableFolderChip
        active={activeFolderId === FOLDER_ALL}
        label="Tümü"
        count={counts[FOLDER_ALL] || 0}
        onClick={() => onSelect(FOLDER_ALL)}
        color="#94a3b8"
        icon={<Layers className="h-3 w-3" />}
        dropTargetActive={dropTargetFolderId === FOLDER_ALL}
        onDragOver={() => onDropTargetChange(FOLDER_ALL)}
        onDragLeave={() => onDropTargetChange(null)}
        onDrop={() => onDrop(null)}
        canAcceptDrop={dragging}
      />
      <DroppableFolderChip
        active={activeFolderId === FOLDER_UNCATEGORIZED}
        label="Klasörsüz"
        count={counts[FOLDER_UNCATEGORIZED] || 0}
        onClick={() => onSelect(FOLDER_UNCATEGORIZED)}
        color="#64748b"
        icon={<FolderOpen className="h-3 w-3" />}
        dropTargetActive={dropTargetFolderId === FOLDER_UNCATEGORIZED}
        onDragOver={() => onDropTargetChange(FOLDER_UNCATEGORIZED)}
        onDragLeave={() => onDropTargetChange(null)}
        onDrop={() => onDrop(null)}
        canAcceptDrop={dragging}
      />
      {folders.map((f) => {
        const isActive = activeFolderId === f.id;
        const isMenuOpen = menuOpenFor === f.id;
        const isRenaming = renamingId === f.id;
        const isDropTarget = dropTargetFolderId === f.id;

        if (isRenaming) {
          return (
            <InlineFolderInput
              key={f.id}
              initial={f.name}
              color={f.color}
              placeholder="Yeni ad…"
              onSubmit={(name) => {
                if (!name.trim()) {
                  setRenamingId(null);
                  return;
                }
                onRename(f.id, name);
                setRenamingId(null);
              }}
              onCancel={() => setRenamingId(null)}
            />
          );
        }

        return (
          <div key={f.id} className="relative shrink-0" data-folder-menu>
            <DroppableFolderChip
              active={isActive}
              label={f.name}
              count={counts[f.id] || 0}
              onClick={() => onSelect(f.id)}
              color={f.color}
              icon={
                <FolderIcon className="h-3 w-3" fill={f.color} stroke="none" />
              }
              dropTargetActive={isDropTarget}
              onDragOver={() => onDropTargetChange(f.id)}
              onDragLeave={() => onDropTargetChange(null)}
              onDrop={() => onDrop(f.id)}
              canAcceptDrop={dragging}
              trailing={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenFor(isMenuOpen ? null : f.id);
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-slate-700/60"
                  title="Klasör menüsü"
                >
                  <MoreVertical className="h-3 w-3 text-slate-400" />
                </button>
              }
            />
            {isMenuOpen && (
              <div className="absolute top-full left-0 mt-1 z-30 min-w-[150px] rounded-lg border border-slate-700 bg-slate-900 shadow-elev-3 overflow-hidden">
                <button
                  onClick={() => {
                    setMenuOpenFor(null);
                    setRenamingId(f.id);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                >
                  <Pencil className="h-3 w-3" /> Yeniden adlandır
                </button>
                <button
                  onClick={() => {
                    setMenuOpenFor(null);
                    onDelete(f.id);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/10 flex items-center gap-2"
                >
                  <Trash2 className="h-3 w-3" /> Klasörü sil
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Inline "+ Klasör" — either a button or, once tapped, a tiny
          chip-sized input that submits on Enter and cancels on Esc/blur.
          Replaces the native prompt() the user disliked. */}
      {creating ? (
        <InlineFolderInput
          initial=""
          color="#10b981"
          placeholder="Klasör adı…"
          onSubmit={(name) => {
            if (name.trim()) {
              const ok = onCreate(name);
              if (ok) setCreating(false);
            } else {
              setCreating(false);
            }
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-emerald-500/40 hover:border-emerald-400/80 bg-emerald-500/5 hover:bg-emerald-500/10 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 transition"
        >
          <FolderPlus className="h-3 w-3" /> Klasör
        </button>
      )}

      {/* Drag-in-progress hint banner */}
      {dragging && (
        <span className="ml-auto shrink-0 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-full px-2 py-0.5 animate-pulse">
          {draggingCount} şablon sürükleniyor → klasöre bırak
        </span>
      )}
    </div>
  );
}

/** A chip that's both clickable AND a valid HTML5 drop target. We split
 *  this out so the static "Tümü" / "Klasörsüz" chips share the same
 *  drag-aware visual treatment as the user-defined folder chips. */
function DroppableFolderChip({
  active,
  label,
  count,
  onClick,
  color,
  icon,
  trailing,
  dropTargetActive,
  canAcceptDrop,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  dropTargetActive: boolean;
  canAcceptDrop: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onDragOver={(e) => {
        if (!canAcceptDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (!canAcceptDrop) return;
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition border",
        active
          ? "text-white shadow-elev-1"
          : "text-slate-300 hover:text-white border-slate-700 bg-slate-900/40",
        dropTargetActive &&
          "ring-2 ring-amber-400 scale-110 shadow-lg shadow-amber-400/30"
      )}
      style={
        active
          ? {
              backgroundColor: `${color}22`,
              borderColor: `${color}80`,
              color: color,
            }
          : dropTargetActive
          ? {
              backgroundColor: `${color}33`,
              borderColor: color,
            }
          : undefined
      }
    >
      <span style={active || dropTargetActive ? { color } : undefined}>
        {icon}
      </span>
      <span>{label}</span>
      <span className="text-slate-500 font-normal">{count}</span>
      {trailing}
    </button>
  );
}

/** Pill-sized input used both for "create folder" and "rename folder".
 *  Auto-focuses, commits on Enter, cancels on Escape OR on blur with an
 *  empty value (a non-empty blur also commits — feels natural). */
function InlineFolderInput({
  initial,
  color,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string;
  color: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(val);
      }}
      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-slate-900 transition"
      style={{
        borderColor: `${color}80`,
        boxShadow: `0 0 0 2px ${color}33`,
      }}
    >
      <FolderPlus className="h-3 w-3" style={{ color }} />
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          // Empty blur = cancel, non-empty blur = commit (so the user
          // can tab away to confirm)
          if (val.trim()) onSubmit(val);
          else onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        maxLength={40}
        className="bg-transparent text-[11px] font-semibold text-slate-100 placeholder:text-slate-500 outline-none min-w-[100px] max-w-[160px]"
      />
    </form>
  );
}

/** Individual template thumbnail with select, edit, delete, drag-to-folder,
 *  and a folder-picker dropdown. */
function TemplateCard({
  tpl,
  isSelected,
  isEditing,
  isDragging,
  folders,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  tpl: MockupTemplate;
  isSelected: boolean;
  isEditing: boolean;
  isDragging: boolean;
  folders: TemplateFolder[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-tpl-menu]")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const currentFolder = folders.find((f) => f.id === tpl.folderId);

  return (
    <div
      className="relative group"
      data-tpl-menu
      draggable
      onDragStart={(e) => {
        // setData is required for Firefox to fire dragover/drop events.
        e.dataTransfer.setData("text/plain", tpl.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <button
        onClick={onToggle}
        className={cn(
          "w-full aspect-square rounded-lg overflow-hidden border-2 transition-all relative cursor-grab active:cursor-grabbing",
          isSelected
            ? "border-emerald-500 ring-2 ring-emerald-500/40 shadow-elev-1"
            : "border-slate-800 hover:border-slate-600 opacity-60 hover:opacity-100",
          isDragging && "opacity-30 scale-95"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tpl.imageDataUrl}
          alt={tpl.label}
          className="w-full h-full object-cover"
        />
        {/* Print area overlay — rotated to match the slider so the
            gallery thumbnail also previews tilt without having to open
            the editor. */}
        <div
          className="absolute border-2 border-rose-500/80 pointer-events-none"
          style={{
            left: `${tpl.printArea.x * 100}%`,
            top: `${tpl.printArea.y * 100}%`,
            width: `${tpl.printArea.w * 100}%`,
            height: `${tpl.printArea.h * 100}%`,
            transform: `rotate(${tpl.printArea.rotation || 0}deg)`,
            transformOrigin: "center center",
          }}
        />
        {isSelected && (
          <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5">
            <CheckCircle2 className="h-3 w-3 text-white" />
          </div>
        )}
        {currentFolder && (
          <div
            className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider backdrop-blur-sm"
            style={{
              backgroundColor: `${currentFolder.color}cc`,
              color: "white",
            }}
            title={currentFolder.name}
          >
            {currentFolder.name.slice(0, 8)}
          </div>
        )}
      </button>
      <div className="flex items-center justify-between mt-1 gap-0.5">
        <p
          className="text-[10px] text-slate-400 truncate flex-1"
          title={tpl.label}
        >
          {tpl.label}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className={cn(
            "p-0.5 rounded hover:bg-slate-800",
            isEditing && "bg-blue-500/20 text-blue-300"
          )}
          title="Print area düzenle"
        >
          <Eye className="h-3 w-3 text-slate-400 hover:text-blue-300" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="p-0.5 rounded hover:bg-slate-800"
          title="Daha fazla"
        >
          <MoreVertical className="h-3 w-3 text-slate-400 hover:text-slate-200" />
        </button>
      </div>

      {menuOpen && (
        <div className="absolute top-full right-0 mt-1 z-30 min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 shadow-elev-3 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-950/60 border-b border-slate-800">
            Klasöre Taşı
          </div>
          <button
            onClick={() => {
              setMenuOpen(false);
              onMove(null);
            }}
            className={cn(
              "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center gap-2",
              !tpl.folderId ? "text-emerald-200" : "text-slate-300"
            )}
          >
            <FolderOpen className="h-3 w-3" /> Klasörsüz
            {!tpl.folderId && (
              <CheckCircle2 className="h-3 w-3 ml-auto text-emerald-400" />
            )}
          </button>
          {folders.map((f) => {
            const isCurrent = tpl.folderId === f.id;
            return (
              <button
                key={f.id}
                onClick={() => {
                  setMenuOpen(false);
                  onMove(f.id);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center gap-2",
                  isCurrent ? "text-emerald-200" : "text-slate-300"
                )}
              >
                <FolderIcon
                  className="h-3 w-3"
                  fill={f.color}
                  stroke="none"
                />
                {f.name}
                {isCurrent && (
                  <CheckCircle2 className="h-3 w-3 ml-auto text-emerald-400" />
                )}
              </button>
            );
          })}
          <div className="border-t border-slate-800">
            <button
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-rose-300 hover:bg-rose-500/10 flex items-center gap-2"
            >
              <Trash2 className="h-3 w-3" /> Şablonu Sil
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  rightSlot,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/50 backdrop-blur p-4 sm:p-5 shadow-elev-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition",
        active
          ? "bg-slate-800 text-slate-100 shadow-elev-1"
          : "text-slate-400 hover:text-slate-200"
      )}
    >
      {label} <span className="text-slate-500">({count})</span>
    </button>
  );
}

function DesignGrid({
  designs,
  selectedId,
  onSelect,
  empty,
}: {
  designs: DesignSource[];
  selectedId: string | null;
  onSelect: (d: DesignSource) => void;
  empty: string;
}) {
  if (designs.length === 0) {
    return (
      <div className="text-center py-6 px-3 rounded-xl bg-slate-950/40 border border-slate-800/50 text-xs text-slate-500">
        {empty}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1">
      {designs.map((d) => {
        const src = d.type === "store" ? d.imageUrl : d.imageDataUrl;
        const label =
          d.type === "ai"
            ? d.prompt
            : d.type === "store"
            ? d.prompt || "—"
            : d.name;
        const isSelected = selectedId === d.id;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            className={cn(
              "aspect-square rounded-lg overflow-hidden border-2 transition-all relative",
              isSelected
                ? "border-fuchsia-500 ring-2 ring-fuchsia-500/40 shadow-elev-1"
                : "border-slate-800 hover:border-slate-600 opacity-70 hover:opacity-100"
            )}
            title={label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={label}
              className="w-full h-full object-cover"
            />
            {isSelected && (
              <div className="absolute top-1 right-1 bg-fuchsia-500 rounded-full p-0.5">
                <CheckCircle2 className="h-3 w-3 text-white" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── PRINT AREA EDITOR ─────────────────────────────────────────────────────
//
// Visual editor for the print area rectangle. Renders the blank product
// photo + a draggable / resizable rose-colored rectangle on top. The
// rectangle's bounds are stored as 0..1 ratios so the same coords work for
// any output size.
function PrintAreaEditor({
  template,
  onChange,
  onClose,
}: {
  template: MockupTemplate;
  onChange: (patch: Partial<MockupTemplate>) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<
    null | { type: "move" | "resize"; startX: number; startY: number; orig: PrintArea }
  >(null);

  const handlePointerDown = (
    e: React.PointerEvent,
    type: "move" | "resize"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({
      type,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...template.printArea },
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  // Pointer move/up handlers — registered as DOM listeners so we can keep
  // dragging even when the pointer leaves the rectangle.
  useEffect(() => {
    if (!dragging) return;
    const container = containerRef.current;
    if (!container) return;

    const onMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const dx = (e.clientX - dragging.startX) / rect.width;
      const dy = (e.clientY - dragging.startY) / rect.height;
      if (dragging.type === "move") {
        const nx = clamp(dragging.orig.x + dx, 0, 1 - dragging.orig.w);
        const ny = clamp(dragging.orig.y + dy, 0, 1 - dragging.orig.h);
        onChange({
          printArea: { ...dragging.orig, x: nx, y: ny },
        });
      } else {
        const nw = clamp(dragging.orig.w + dx, 0.05, 1 - dragging.orig.x);
        const nh = clamp(dragging.orig.h + dy, 0.05, 1 - dragging.orig.y);
        onChange({
          printArea: { ...dragging.orig, w: nw, h: nh },
        });
      }
    };
    const onUp = () => setDragging(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const setField = (key: "x" | "y" | "w" | "h", value: number) => {
    const v = clamp(value / 100, 0, 1);
    onChange({ printArea: { ...template.printArea, [key]: v } });
  };

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/[0.05] to-slate-900/40 backdrop-blur p-4 sm:p-5 shadow-elev-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-blue-300" />
          <h3 className="text-sm font-bold text-slate-100">
            Print Bölgesi: {template.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-4">
        <div
          ref={containerRef}
          className="relative bg-slate-950 rounded-xl overflow-hidden aspect-square select-none touch-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={template.imageDataUrl}
            alt={template.label}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
          {/* Pink print area box. The CSS `transform: rotate(...)` is
              applied around the box's own center (transform-origin defaults
              to 50% 50%), matching exactly what the renderer does at
              composite time — so what the user sees here is pixel-faithful
              to what comes out of the JPEG.
              `willChange: transform` keeps the rotation buttery smooth
              even while the user is dragging the slider quickly. */}
          <div
            className="absolute border-2 border-rose-400 bg-rose-500/10 cursor-move"
            style={{
              left: `${template.printArea.x * 100}%`,
              top: `${template.printArea.y * 100}%`,
              width: `${template.printArea.w * 100}%`,
              height: `${template.printArea.h * 100}%`,
              transform: `rotate(${template.printArea.rotation || 0}deg)`,
              transformOrigin: "center center",
              willChange: "transform",
              transition: dragging ? "none" : "transform 120ms ease-out",
            }}
            onPointerDown={(e) => handlePointerDown(e, "move")}
          >
            <div className="absolute -top-5 left-0 text-[10px] font-bold uppercase tracking-wider text-rose-300 bg-slate-900/80 px-1.5 py-0.5 rounded whitespace-nowrap">
              Print Bölgesi
              {Math.abs(template.printArea.rotation || 0) > 0.1 && (
                <span className="ml-1 text-rose-200">
                  · {(template.printArea.rotation || 0).toFixed(1)}°
                </span>
              )}
            </div>
            {/* resize handle bottom-right */}
            <div
              className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-rose-500 border-2 border-slate-900 cursor-se-resize shadow-lg hover:scale-110 transition"
              onPointerDown={(e) => handlePointerDown(e, "resize")}
              title="Boyutlandır"
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Pembe kutuyu <span className="text-rose-300">sürükleyerek</span>{" "}
            taşı, sağ alttaki noktayı sürükleyerek boyutlandır. Veya aşağıdan
            yüzde değerlerini gir.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="X (sol)"
              value={template.printArea.x * 100}
              onChange={(v) => setField("x", v)}
            />
            <Field
              label="Y (üst)"
              value={template.printArea.y * 100}
              onChange={(v) => setField("y", v)}
            />
            <Field
              label="Genişlik"
              value={template.printArea.w * 100}
              onChange={(v) => setField("w", v)}
            />
            <Field
              label="Yükseklik"
              value={template.printArea.h * 100}
              onChange={(v) => setField("h", v)}
            />
          </div>

          {/* Rotation — fixes mockups where the shirt is hung slightly tilted */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex justify-between mb-1">
              <span>Eğim / Rotasyon</span>
              <span className="text-rose-300">
                {(template.printArea.rotation || 0).toFixed(1)}°
              </span>
            </label>
            <input
              type="range"
              min={-30}
              max={30}
              step={0.5}
              value={template.printArea.rotation || 0}
              onChange={(e) =>
                onChange({
                  printArea: {
                    ...template.printArea,
                    rotation: parseFloat(e.target.value),
                  },
                })
              }
              className="w-full accent-rose-500"
            />
            <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
              <span>← Sola</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    printArea: { ...template.printArea, rotation: 0 },
                  })
                }
                className="text-slate-400 hover:text-rose-300 underline"
              >
                Sıfırla
              </button>
              <span>Sağa →</span>
            </div>
          </div>

          {/* Multiply blend strength — overall how much the design picks up
              the shirt's color & shadows */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex justify-between mb-1">
              <span>Yapışma Şiddeti</span>
              <span className="text-emerald-300">
                {Math.round(template.blendStrength * 100)}%
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(template.blendStrength * 100)}
              onChange={(e) =>
                onChange({ blendStrength: parseInt(e.target.value) / 100 })
              }
              className="w-full accent-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-0.5">
              Yüksek = tasarım gömleğin rengiyle karışır
            </p>
          </div>

          {/* Fabric shading — stamps the blank's wrinkles/folds onto the
              design so it doesn't look pasted on */}
          <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-emerald-500/40 transition">
            <input
              type="checkbox"
              checked={template.fabricShading ?? true}
              onChange={(e) =>
                onChange({ fabricShading: e.target.checked })
              }
              className="mt-0.5 accent-emerald-500 cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-200">
                Kumaş Kıvrım Takibi
              </p>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                Tişört kırışıksa tasarım da o kıvrımları takip eder. Düz
                tişörtte fark yok.
              </p>
            </div>
          </label>

          <div className="pt-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Şablon Adı
            </label>
            <input
              type="text"
              value={template.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:border-blue-500/60 focus:outline-none"
            />
          </div>

          <Button size="sm" onClick={onClose} className="w-full">
            <Save className="h-3.5 w-3.5" /> Kaydet & Kapat
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={Math.round(value)}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-blue-500/60 focus:outline-none"
        />
        <span className="text-[10px] text-slate-500">%</span>
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
