"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Upload,
  Sparkles,
  Image as ImageIcon,
  LogOut,
  Package,
  FileEdit,
  ShoppingBag,
  Wallet,
  Menu,
  X,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRIMARY = [
  { label: "Takvim", href: "/dashboard", icon: CalendarDays, accent: "from-sky-500 to-blue-600" },
  { label: "AI Stüdyo", href: "/dashboard/olustur", icon: Wand2, accent: "from-fuchsia-500 to-pink-500" },
  { label: "Yusuf", href: "/dashboard/yusuf", icon: Upload, accent: "from-emerald-500 to-teal-500" },
  { label: "Kerim", href: "/dashboard/kerim", icon: Sparkles, accent: "from-violet-500 to-fuchsia-500" },
];

const SECONDARY = [
  { label: "Siparişler", href: "/dashboard/siparisler", icon: ShoppingBag, accent: "from-cyan-500 to-sky-600" },
  { label: "Taha — Mockup", href: "/dashboard/taha", icon: ImageIcon, accent: "from-amber-500 to-orange-500" },
  { label: "Taslaklar", href: "/dashboard/taslaklar", icon: FileEdit, accent: "from-pink-500 to-rose-500" },
  { label: "Aktif Ürünler", href: "/dashboard/urunler", icon: Package, accent: "from-rose-500 to-red-500" },
  { label: "Giderler", href: "/dashboard/giderler", icon: Wallet, accent: "from-yellow-500 to-amber-500" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    toast.success("Çıkış yapıldı.");
    window.location.replace("/login");
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <>
      {/* Bottom Dock */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-xl safe-bottom">
        <nav className="grid grid-cols-5 px-1">
          {PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-colors",
                  active ? "text-white" : "text-slate-400 active:text-slate-200"
                )}
              >
                <span
                  className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center transition-all",
                    active
                      ? `bg-gradient-to-br ${item.accent} shadow-md`
                      : "bg-transparent"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setSheetOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-colors",
              SECONDARY.some((s) => isActive(s.href))
                ? "text-white"
                : "text-slate-400 active:text-slate-200"
            )}
          >
            <span
              className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center transition-all",
                SECONDARY.some((s) => isActive(s.href))
                  ? "bg-gradient-to-br from-slate-700 to-slate-800 shadow-md"
                  : "bg-transparent"
              )}
            >
              <Menu className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[10px] font-semibold">Daha</span>
          </button>
        </nav>
      </div>

      {/* More Sheet */}
      {sheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="absolute bottom-0 inset-x-0 bg-slate-950 border-t border-slate-800 rounded-t-3xl p-5 pb-8 safe-bottom animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-white">Tüm sayfalar</h3>
              <button
                onClick={() => setSheetOpen(false)}
                className="h-9 w-9 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300 active:bg-slate-700"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {SECONDARY.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center gap-3 p-3.5 rounded-2xl border transition-all",
                      active
                        ? "bg-slate-900 border-slate-700 shadow-elev-2"
                        : "bg-slate-900/40 border-slate-800/60 active:bg-slate-800"
                    )}
                  >
                    <span
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br shrink-0",
                        item.accent
                      )}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </span>
                    <span className="font-semibold text-sm text-slate-100 leading-tight">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>

            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 text-red-400 font-semibold border border-red-500/20 active:bg-red-500/20"
            >
              <LogOut className="h-4 w-4" />
              Çıkış Yap
            </button>
          </div>
        </div>
      )}
    </>
  );
}
