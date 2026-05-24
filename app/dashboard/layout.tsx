import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { DesignProvider } from "@/components/design-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DesignProvider>
      <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-zinc-950">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-24 lg:pb-0">
          <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
        <MobileNav />
      </div>
    </DesignProvider>
  );
}
