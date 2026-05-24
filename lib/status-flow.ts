import type { DesignStatus } from "./types";

export interface StatusFlowInfo {
  /** The status this one should fall back to. null = first stage, no fallback. */
  previous: DesignStatus | null;
  /** Friendly label of the previous stage, shown in confirms / buttons. */
  previousLabel?: string;
  /** When true, going back also clears published_at (rolls calendar). */
  clearsPublished?: boolean;
}

const FLOW: Record<DesignStatus, StatusFlowInfo> = {
  "SEO Bekliyor": { previous: null },
  "Mockup ve Yayınlama Bekliyor": {
    previous: "SEO Bekliyor",
    previousLabel: "SEO Bekliyor (Kerim)",
  },
  Taslak: {
    previous: "Mockup ve Yayınlama Bekliyor",
    previousLabel: "Mockup Bekliyor (Taha)",
  },
  "Aktif Mağaza": {
    previous: "Taslak",
    previousLabel: "Taslaklar",
    clearsPublished: true,
  },
};

export function getStatusFlow(status: DesignStatus): StatusFlowInfo {
  return FLOW[status];
}
