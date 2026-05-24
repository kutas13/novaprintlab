"use client";

import { create } from "zustand";
import { supabase } from "./supabase";
import { Order, OrderRow, OrderStatus, rowToOrder } from "./types";

interface OrdersState {
  orders: Order[];
  loading: boolean;
  initialized: boolean;
  syncing: boolean;

  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  syncFromEtsy: () => Promise<{ ok: boolean; inserted?: number; error?: string }>;
  updateStatus: (id: string, status: OrderStatus) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
}

function sortByDateDesc(list: Order[]): Order[] {
  return [...list].sort((a, b) => {
    const ta = a.orderDate ? new Date(a.orderDate).getTime() : 0;
    const tb = b.orderDate ? new Date(b.orderDate).getTime() : 0;
    return tb - ta;
  });
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

export const useOrdersStore = create<OrdersState>()((set, get) => ({
  orders: [],
  loading: false,
  initialized: false,
  syncing: false,

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, initialized: true });

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("order_date", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("[supabase] orders load failed:", error);
      set({ loading: false });
      return;
    }

    set({
      orders: ((data as OrderRow[]) ?? []).map(rowToOrder),
      loading: false,
    });

    if (realtimeChannel) return;
    realtimeChannel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const event = payload.eventType;
          if (event === "INSERT") {
            const row = payload.new as OrderRow;
            set((s) => {
              if (s.orders.some((o) => o.id === row.id)) return s;
              return { orders: sortByDateDesc([rowToOrder(row), ...s.orders]) };
            });
          } else if (event === "UPDATE") {
            const row = payload.new as OrderRow;
            set((s) => ({
              orders: sortByDateDesc(
                s.orders.map((o) => (o.id === row.id ? rowToOrder(row) : o))
              ),
            }));
          } else if (event === "DELETE") {
            const oldRow = payload.old as Partial<OrderRow>;
            if (!oldRow.id) return;
            set((s) => ({ orders: s.orders.filter((o) => o.id !== oldRow.id) }));
          }
        }
      )
      .subscribe();
  },

  refresh: async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("order_date", { ascending: false, nullsFirst: false });
    if (error) return;
    set({ orders: ((data as OrderRow[]) ?? []).map(rowToOrder) });
  },

  syncFromEtsy: async () => {
    set({ syncing: true });
    try {
      const res = await fetch("/api/etsy/sync", { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        inserted?: number;
        error?: string;
      };
      if (json.ok) {
        await get().refresh();
      }
      return json;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Sync failed" };
    } finally {
      set({ syncing: false });
    }
  },

  updateStatus: async (id, status) => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const next = rowToOrder(data as OrderRow);
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? next : o)) }));
  },

  deleteOrder: async (id) => {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) throw error;
    set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }));
  },
}));
