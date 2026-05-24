"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Upload,
  Sparkles,
  Image as ImageIcon,
  LogOut,
  Package,
  FileEdit,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV = [
  { label: "Takvim", href: "/dashboard", icon: CalendarDays },
  { label: "Siparişler", href: "/dashboard/siparisler", icon: ShoppingBag },
  { label: "Yusuf", href: "/dashboard/yusuf", icon: Upload },
  { label: "Kerim", href: "/dashboard/kerim", icon: Sparkles },
  { label: "Taha", href: "/dashboard/taha", icon: ImageIcon },
  { label: "Taslak", href: "/dashboard/taslaklar", icon: FileEdit },
  { label: "Ürünler", href: "/dashboard/urunler", icon: Package },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    toast.success("Çıkış yapıldı.");
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800/80 glass-strong safe-bottom">
      <nav className="grid grid-cols-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-blue-400" : "text-slate-500 active:text-slate-200"
              )}
            >
              <Icon className="h-[16px] w-[16px]" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={logout}
          className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-slate-500 active:text-red-400"
        >
          <LogOut className="h-[16px] w-[16px]" />
          Çıkış
        </button>
      </nav>
    </div>
  );
}
