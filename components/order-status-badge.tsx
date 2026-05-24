import { Badge } from "@/components/ui/badge";
import { OrderStatus } from "@/lib/types";

const MAP: Record<
  OrderStatus,
  { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
> = {
  paid: { label: "💳 Ödendi", variant: "warning" },
  processing: { label: "🛠 İşleniyor", variant: "info" },
  shipped: { label: "🚚 Kargoda", variant: "violet" },
  completed: { label: "✅ Tamamlandı", variant: "success" },
  canceled: { label: "✖ İptal", variant: "destructive" },
  refunded: { label: "↩ İade", variant: "outline" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const v = MAP[status] ?? MAP.paid;
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

export const ORDER_STATUS_OPTIONS: { id: OrderStatus | "all"; label: string }[] =
  [
    { id: "all", label: "Tümü" },
    { id: "paid", label: "Ödendi" },
    { id: "processing", label: "İşleniyor" },
    { id: "shipped", label: "Kargoda" },
    { id: "completed", label: "Tamamlandı" },
    { id: "canceled", label: "İptal" },
    { id: "refunded", label: "İade" },
  ];
