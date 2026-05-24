"use client";

import { useEffect } from "react";
import { useDesignStore } from "@/lib/store";
import { useOrdersStore } from "@/lib/orders-store";

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const initDesigns = useDesignStore((s) => s.initialize);
  const initOrders = useOrdersStore((s) => s.initialize);
  useEffect(() => {
    initDesigns();
    initOrders();
  }, [initDesigns, initOrders]);
  return <>{children}</>;
}
