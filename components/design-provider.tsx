"use client";

import { useEffect } from "react";
import { useDesignStore } from "@/lib/store";

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const initialize = useDesignStore((s) => s.initialize);
  useEffect(() => {
    initialize();
  }, [initialize]);
  return <>{children}</>;
}
