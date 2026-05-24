import { Badge } from "@/components/ui/badge";
import { DesignStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: DesignStatus }) {
  if (status === "SEO Bekliyor") {
    return <Badge variant="warning">⏳ SEO Bekliyor</Badge>;
  }
  if (status === "Mockup ve Yayınlama Bekliyor") {
    return <Badge variant="info">🎨 Mockup Bekliyor</Badge>;
  }
  if (status === "Taslak") {
    return <Badge variant="violet">📝 Taslak</Badge>;
  }
  return <Badge variant="success">✅ Aktif Mağaza</Badge>;
}
