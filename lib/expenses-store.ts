"use client";

import { create } from "zustand";
import { supabase } from "./supabase";
import { Expense, ExpenseRow, rowToExpense } from "./types";

export interface NewExpenseInput {
  name: string;
  amount: number;
  currency: "USD" | "TRY";
  isSubscription: boolean;
  subscriptionDay?: number;
  cardLast4?: string;
  cardOwner: "Yusuf" | "Kerim" | "Taha";
  expenseDate: string;
  notes?: string;
}

interface ExpensesState {
  expenses: Expense[];
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  addExpense: (input: NewExpenseInput) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function sortByDate(list: Expense[]): Expense[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.expenseDate).getTime();
    const tb = new Date(b.expenseDate).getTime();
    if (ta !== tb) return tb - ta;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export const useExpensesStore = create<ExpensesState>()((set, get) => ({
  expenses: [],
  loading: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, initialized: true });

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });

    if (error) {
      console.error("[supabase] expenses load failed:", error);
      set({ loading: false });
      return;
    }

    set({
      expenses: sortByDate(((data as ExpenseRow[]) ?? []).map(rowToExpense)),
      loading: false,
    });

    if (realtimeChannel) return;
    realtimeChannel = supabase
      .channel("expenses-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        (payload) => {
          const event = payload.eventType;
          if (event === "INSERT") {
            const row = payload.new as ExpenseRow;
            set((s) => {
              if (s.expenses.some((e) => e.id === row.id)) return s;
              return {
                expenses: sortByDate([rowToExpense(row), ...s.expenses]),
              };
            });
          } else if (event === "UPDATE") {
            const row = payload.new as ExpenseRow;
            set((s) => ({
              expenses: sortByDate(
                s.expenses.map((e) => (e.id === row.id ? rowToExpense(row) : e))
              ),
            }));
          } else if (event === "DELETE") {
            const oldRow = payload.old as Partial<ExpenseRow>;
            if (!oldRow.id) return;
            set((s) => ({
              expenses: s.expenses.filter((e) => e.id !== oldRow.id),
            }));
          }
        }
      )
      .subscribe();
  },

  refresh: async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });
    if (error) return;
    set({
      expenses: sortByDate(((data as ExpenseRow[]) ?? []).map(rowToExpense)),
    });
  },

  addExpense: async (input) => {
    const payload = {
      name: input.name.trim(),
      amount: input.amount,
      currency: input.currency,
      is_subscription: input.isSubscription,
      subscription_day: input.isSubscription
        ? (input.subscriptionDay ?? null)
        : null,
      card_last4: input.cardLast4?.trim() || null,
      card_owner: input.cardOwner,
      expense_date: input.expenseDate,
      notes: input.notes?.trim() || null,
    };
    const { data, error } = await supabase
      .from("expenses")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    const expense = rowToExpense(data as ExpenseRow);
    set((s) => {
      if (s.expenses.some((e) => e.id === expense.id)) return s;
      return { expenses: sortByDate([expense, ...s.expenses]) };
    });
    return expense;
  },

  deleteExpense: async (id) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },
}));
