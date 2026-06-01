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
  Wallet,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  group: "main" | "team" | "admin";
};

const NAV: NavItem[] = [
  {
    label: "Genel Takvim",
    href: "/dashboard",
    icon: CalendarDays,
    accent: "from-sky-500 to-blue-600",
    group: "main",
  },
  {
    label: "Siparişler",
    href: "/dashboard/siparisler",
    icon: ShoppingBag,
    accent: "from-cyan-500 to-sky-600",
    group: "main",
  },
  {
    label: "AI Tasarım Stüdyosu",
    href: "/dashboard/olustur",
    icon: Wand2,
    accent: "from-fuchsia-500 to-pink-500",
    group: "main",
  },
  {
    label: "Yusuf — Tasarım",
    href: "/dashboard/yusuf",
    icon: Upload,
    accent: "from-emerald-500 to-teal-500",
    group: "team",
  },
  {
    label: "Kerim — SEO",
    href: "/dashboard/kerim",
    icon: Sparkles,
    accent: "from-violet-500 to-fuchsia-500",
    group: "team",
  },
  {
    label: "Taha — Mockup",
    href: "/dashboard/taha",
    icon: ImageIcon,
    accent: "from-amber-500 to-orange-500",
    group: "team",
  },
  {
    label: "Taslaklar",
    href: "/dashboard/taslaklar",
    icon: FileEdit,
    accent: "from-pink-500 to-rose-500",
    group: "admin",
  },
  {
    label: "Aktif Ürünler",
    href: "/dashboard/urunler",
    icon: Package,
    accent: "from-rose-500 to-red-500",
    group: "admin",
  },
  {
    label: "Giderler",
    href: "/dashboard/giderler",
    icon: Wallet,
    accent: "from-yellow-500 to-amber-500",
    group: "admin",
  },
];

const GROUP_LABEL: Record<NavItem["group"], string> = {
  main: "Genel",
  team: "Ekip",
  admin: "Yönetim",
};

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    toast.success("Çıkış yapıldı.");
    window.location.replace("/login");
  };

  const groups = ["main", "team", "admin"] as const;

  return (
    <aside className="hidden lg:flex w-72 shrink-0 h-screen sticky top-0 flex-col border-r border-slate-800/60 bg-slate-950/60 backdrop-blur-xl">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800/50">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/10 transition-transform group-hover:scale-105">
            <Palette className="h-5 w-5 text-white" />
            <span className="absolute -inset-px rounded-2xl bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
          </div>
          <div className="min-w-0">
            <p className="font-bold tracking-tight text-base leading-none">
              <span className="text-gradient">NovaPrintLab</span>
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em] mt-1">
              Etsy POD Üssü
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto scrollbar-thin">
        {groups.map((g) => {
          const items = NAV.filter((n) => n.group === g);
          return (
            <div key={g}>
              <p className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                {GROUP_LABEL[g]}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
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
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all relative group/item",
                        active
                          ? "bg-gradient-to-r from-slate-800/80 to-slate-800/40 text-white shadow-elev-1"
                          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-100"
                      )}
                    >
                      <span
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center transition-all shrink-0",
                          active
                            ? `bg-gradient-to-br ${item.accent} text-white shadow-md`
                            : "bg-slate-800/60 text-slate-400 group-hover/item:bg-slate-800 group-hover/item:text-slate-100"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-medium truncate">{item.label}</span>
                      {active && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.7)]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800/60 space-y-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors group/logout"
        >
          <span className="h-8 w-8 rounded-lg bg-slate-800/60 flex items-center justify-center group-hover/logout:bg-red-500/15 transition-colors">
            <LogOut className="h-4 w-4" />
          </span>
          <span className="font-medium">Çıkış Yap</span>
        </button>
        <p className="px-3 text-[10px] text-slate-600 tracking-wider">
          © {new Date().getFullYear()} NovaPrintLab • v1.0
        </p>
      </div>
    </aside>
  );
}
