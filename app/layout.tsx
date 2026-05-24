import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "NovaPrintLab — Etsy POD Yönetim Üssü",
  description: "Tasarım, mockup ve yapay zeka destekli SEO iş akışı.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster
          theme="dark"
          richColors
          position="top-right"
          toastOptions={{ className: "bg-slate-900 border-slate-700" }}
        />
      </body>
    </html>
  );
}
