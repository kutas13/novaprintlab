"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Upload,
  Sparkles,
  Image as ImageIcon,
  LogOut,
  Palette,
  Package,
  FileEdit,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV = [
  {
    label: "Genel Takvim & Arşiv",
    href: "/dashboard",
    icon: CalendarDays,
    accent: "from-blue-500 to-cyan-500",
  },
  {
    label: "Siparişler",
    href: "/dashboard/siparisler",
    icon: ShoppingBag,
    accent: "from-cyan-500 to-blue-600",
  },
  {
    label: "Yusuf — Tasarım Yükle",
    href: "/dashboard/yusuf",
    icon: Upload,
    accent: "from-emerald-500 to-teal-500",
  },
  {
    label: "Kerim — SEO Girişi",
    href: "/dashboard/kerim",
    icon: Sparkles,
    accent: "from-violet-500 to-fuchsia-500",
  },
  {
    label: "Taha — Mockup & Yayınla",
    href: "/dashboard/taha",
    icon: ImageIcon,
    accent: "from-amber-500 to-orange-500",
  },
  {
    label: "Taslaklar",
    href: "/dashboard/taslaklar",
    icon: FileEdit,
    accent: "from-violet-500 to-fuchsia-500",
  },
  {
    label: "Ürünler — Aktif Mağaza",
    href: "/dashboard/urunler",
    icon: Package,
    accent: "from-rose-500 to-pink-500",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    toast.success("Çıkış yapıldı.");
    window.location.replace("/login");
  };

  return (
    <aside className="hidden lg:flex w-72 shrink-0 h-screen sticky top-0 flex-col border-r border-slate-800/60 glass-strong">
      <div className="px-6 py-6 flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/10">
          <Palette className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-bold tracking-tight text-base">
            <span className="text-gradient">NovaPrintLab</span>
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">
            Etsy POD Üssü
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-thin">
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all relative group",
                active
                  ? "bg-slate-800/80 text-white"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              )}
            >
              <span
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center transition-all",
                  active
                    ? `bg-gradient-to-br ${item.accent} text-white shadow-md`
                    : "bg-slate-800/60 text-slate-400 group-hover:text-slate-200"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="font-medium">{item.label}</span>
              {active && (
                <span className="absolute right-2 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <span className="h-8 w-8 rounded-md bg-slate-800/60 flex items-center justify-center">
            <LogOut className="h-4 w-4" />
          </span>
          <span className="font-medium">Çıkış Yap</span>
        </button>
        <p className="px-3 mt-3 text-[10px] text-slate-600">
          © {new Date().getFullYear()} NovaPrintLab • v1.0
        </p>
      </div>
    </aside>
  );
}
