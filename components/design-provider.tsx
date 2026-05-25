"use client";

import { useEffect } from "react";
import { useDesignStore } from "@/lib/store";
import { useOrdersStore } from "@/lib/orders-store";
import { useExpensesStore } from "@/lib/expenses-store";

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const initDesigns = useDesignStore((s) => s.initialize);
  const initOrders = useOrdersStore((s) => s.initialize);
  const initExpenses = useExpensesStore((s) => s.initialize);
  useEffect(() => {
    initDesigns();
    initOrders();
    initExpenses();
  }, [initDesigns, initOrders, initExpenses]);
  return <>{children}</>;
}
