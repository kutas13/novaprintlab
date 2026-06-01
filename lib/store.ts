"use client";

import { create } from "zustand";
import { publicUrl, supabase } from "./supabase";
import { uploadImage, removeImage } from "./storage";
import {
  Design,
  DesignRow,
  DesignStatus,
  PricingData,
  SeoData,
  rowToDesign,
} from "./types";
import { formatDateKey } from "./utils";

interface DesignState {
  designs: Design[];
  loading: boolean;
  uploading: boolean;
  initialized: boolean;
  dailyTarget: number;
  setDailyTarget: (n: number) => void;

  initialize: () => Promise<void>;
  refresh: () => Promise<void>;

  addDesign: (
    name: string,
    file: File,
    sku?: string,
    initialStatus?: DesignStatus
  ) => Promise<Design | null>;
  updateSeo: (id: string, seo: SeoData) => Promise<void>;
  updateSku: (id: string, sku: string) => Promise<void>;
  updatePricing: (id: string, pricing: PricingData) => Promise<void>;
  addMockups: (id: string, files: File[]) => Promise<void>;
  removeMockup: (id: string, path: string) => Promise<void>;
  saveAsDraft: (id: string) => Promise<void>;
  publishDesign: (id: string) => Promise<void>;
  setStatus: (id: string, status: DesignStatus) => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;

  getByStatus: (status: DesignStatus) => Design[];
  getPublishedCountByDay: () => Record<string, number>;
}

function rowsToDesigns(rows: DesignRow[] | null | undefined): Design[] {
  return (rows ?? []).map((r) => rowToDesign(r, publicUrl));
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

export const useDesignStore = create<DesignState>()((set, get) => ({
  designs: [],
  loading: false,
  uploading: false,
  initialized: false,
  dailyTarget: 10,

  setDailyTarget: (n) => set({ dailyTarget: Math.max(1, n) }),

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, initialized: true });

    const { data, error } = await supabase
      .from("designs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[supabase] designs load failed:", error);
      set({ loading: false });
      return;
    }

    set({ designs: rowsToDesigns(data as DesignRow[]), loading: false });

    if (realtimeChannel) return;
    realtimeChannel = supabase
      .channel("designs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "designs" },
        (payload) => {
          const event = payload.eventType;
          if (event === "INSERT") {
            const row = payload.new as DesignRow;
            set((s) => {
              if (s.designs.some((d) => d.id === row.id)) return s;
              return {
                designs: [rowToDesign(row, publicUrl), ...s.designs],
              };
            });
          } else if (event === "UPDATE") {
            const row = payload.new as DesignRow;
            set((s) => ({
              designs: s.designs.map((d) => {
                if (d.id !== row.id) return d;
                const next = rowToDesign(row, publicUrl);
                // Defensive merge: realtime payloads occasionally drop
                // unchanged columns (the SEO blob disappearing after a
                // pricing update was caused by this). Preserve any rich
                // field the realtime event left null/empty but we already
                // hold locally. Merge SEO at field-level so we don't lose
                // attributes / description when only title arrives etc.
                const mergedSeo =
                  next.seo || d.seo
                    ? {
                        title: next.seo?.title || d.seo?.title || "",
                        description:
                          next.seo?.description || d.seo?.description || "",
                        tags: next.seo?.tags?.length
                          ? next.seo.tags
                          : (d.seo?.tags ?? []),
                        attributes:
                          next.seo?.attributes ?? d.seo?.attributes,
                      }
                    : undefined;
                return {
                  ...next,
                  seo: mergedSeo,
                  pricing: next.pricing ?? d.pricing,
                  mockups:
                    next.mockups.length > 0
                      ? next.mockups
                      : row.mockup_image_paths !== undefined &&
                          row.mockup_image_paths !== null
                        ? next.mockups
                        : d.mockups,
                  sku: next.sku ?? d.sku,
                };
              }),
            }));
          } else if (event === "DELETE") {
            const oldRow = payload.old as Partial<DesignRow>;
            if (!oldRow.id) return;
            set((s) => ({ designs: s.designs.filter((d) => d.id !== oldRow.id) }));
          }
        }
      )
      .subscribe();
  },

  refresh: async () => {
    const { data, error } = await supabase
      .from("designs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return;
    set({ designs: rowsToDesigns(data as DesignRow[]) });
  },

  addDesign: async (name, file, sku, initialStatus) => {
    set({ uploading: true });
    let uploadedPath: string | null = null;
    try {
      uploadedPath = await uploadImage(file, "originals");
      const payload: Record<string, unknown> = {
        name: name.trim() || "Untitled Design",
        status: (initialStatus ?? "SEO Bekliyor") as DesignStatus,
        original_image_path: uploadedPath,
      };
      const trimmedSku = sku?.trim();
      if (trimmedSku) payload.sku = trimmedSku;

      const { data, error } = await supabase
        .from("designs")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      const design = rowToDesign(data as DesignRow, publicUrl);
      set((s) => {
        if (s.designs.some((d) => d.id === design.id)) return s;
        return { designs: [design, ...s.designs] };
      });
      return design;
    } catch (e) {
      console.error("[addDesign]", e);
      if (uploadedPath) await removeImage(uploadedPath);
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : String(e);
      throw new Error(message);
    } finally {
      set({ uploading: false });
    }
  },

  updateSeo: async (id, seo) => {
    const fullPatch = {
      seo_title: seo.title,
      seo_description: seo.description,
      seo_tags: seo.tags,
      seo_attributes: seo.attributes ?? null,
      status: "Mockup ve Yayınlama Bekliyor" as DesignStatus,
    };
    let attributesPersisted = true;
    let { error } = await supabase.from("designs").update(fullPatch).eq("id", id);
    if (
      error &&
      // Postgres "undefined_column" - the seo_attributes migration hasn't
      // been applied to this Supabase project yet. Fall back to saving
      // everything else so the workflow isn't blocked.
      (error.code === "42703" ||
        /seo_attributes/i.test(error.message || ""))
    ) {
      attributesPersisted = false;
      const fallback = {
        seo_title: seo.title,
        seo_description: seo.description,
        seo_tags: seo.tags,
        status: "Mockup ve Yayınlama Bekliyor" as DesignStatus,
      };
      const retry = await supabase
        .from("designs")
        .update(fallback)
        .eq("id", id);
      error = retry.error;
    }
    if (error) throw error;
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === id
          ? {
              ...d,
              status: "Mockup ve Yayınlama Bekliyor",
              seo: {
                title: seo.title,
                description: seo.description,
                tags: seo.tags,
                attributes: attributesPersisted ? seo.attributes : undefined,
              },
            }
          : d
      ),
    }));
    if (!attributesPersisted && seo.attributes) {
      const err = new Error(
        "SEO kaydedildi ama Etsy özellikleri DB'ye yazılamadı. " +
          "Supabase'de 20260524_seo_attributes.sql migration'ını çalıştır."
      );
      (err as Error & { code?: string }).code = "ATTRIBUTES_NOT_PERSISTED";
      throw err;
    }
  },

  updateSku: async (id, sku) => {
    const value = sku.trim() || null;
    const { error } = await supabase
      .from("designs")
      .update({ sku: value })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === id ? { ...d, sku: value ?? undefined } : d
      ),
    }));
  },

  updatePricing: async (id, pricing) => {
    const patch = {
      pricing_printify_cost: pricing.printifyCost,
      pricing_shipping_cost: pricing.shippingCost,
      pricing_target_profit: pricing.targetProfit,
      pricing_final_price: pricing.finalPrice,
    };
    const { error } = await supabase
      .from("designs")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    // Optimistic local update — only the pricing fields, never touch SEO /
    // mockups / status. Avoids accidentally clearing other columns if a
    // realtime payload arrives without them.
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === id ? { ...d, pricing: { ...pricing } } : d
      ),
    }));
  },

  addMockups: async (id, files) => {
    if (files.length === 0) return;
    set({ uploading: true });
    try {
      const uploaded = await Promise.all(
        files.map((f) => uploadImage(f, "mockups"))
      );
      const existing = get().designs.find((d) => d.id === id);
      const currentPaths = existing?.mockups.map((m) => m.path) ?? [];
      const nextPaths = [...currentPaths, ...uploaded];
      const { error } = await supabase
        .from("designs")
        .update({ mockup_image_paths: nextPaths })
        .eq("id", id);
      if (error) {
        await Promise.all(uploaded.map((p) => removeImage(p)));
        throw error;
      }
      set((s) => ({
        designs: s.designs.map((d) =>
          d.id === id
            ? {
                ...d,
                mockups: nextPaths.map((p) => ({ path: p, url: publicUrl(p) })),
              }
            : d
        ),
      }));
    } catch (e) {
      console.error("[addMockups]", e);
      throw e;
    } finally {
      set({ uploading: false });
    }
  },

  removeMockup: async (id, path) => {
    const existing = get().designs.find((d) => d.id === id);
    if (!existing) return;
    const nextPaths = existing.mockups
      .map((m) => m.path)
      .filter((p) => p !== path);
    const { error } = await supabase
      .from("designs")
      .update({ mockup_image_paths: nextPaths })
      .eq("id", id);
    if (error) throw error;
    await removeImage(path);
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === id
          ? {
              ...d,
              mockups: nextPaths.map((p) => ({ path: p, url: publicUrl(p) })),
            }
          : d
      ),
    }));
  },

  saveAsDraft: async (id) => {
    const { error } = await supabase
      .from("designs")
      .update({
        status: "Taslak" as DesignStatus,
        published_at: null,
      })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === id ? { ...d, status: "Taslak", publishedAt: undefined } : d
      ),
    }));
  },

  publishDesign: async (id) => {
    const publishedAt = new Date().toISOString();
    const { error } = await supabase
      .from("designs")
      .update({
        status: "Aktif Mağaza" as DesignStatus,
        published_at: publishedAt,
      })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === id ? { ...d, status: "Aktif Mağaza", publishedAt } : d
      ),
    }));
  },

  setStatus: async (id, status) => {
    const { error } = await supabase
      .from("designs")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === id ? { ...d, status } : d
      ),
    }));
  },

  deleteDesign: async (id) => {
    const existing = get().designs.find((d) => d.id === id);
    const { error } = await supabase.from("designs").delete().eq("id", id);
    if (error) throw error;
    if (existing?.originalImagePath) await removeImage(existing.originalImagePath);
    if (existing?.mockups?.length) {
      await Promise.all(existing.mockups.map((m) => removeImage(m.path)));
    }
    set((s) => ({ designs: s.designs.filter((d) => d.id !== id) }));
  },

  getByStatus: (status) => get().designs.filter((d) => d.status === status),

  getPublishedCountByDay: () => {
    const counts: Record<string, number> = {};
    for (const d of get().designs) {
      if (d.publishedAt) {
        const key = formatDateKey(new Date(d.publishedAt));
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  },
}));
