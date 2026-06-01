"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock, Mail, Palette, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HIGHLIGHTS = [
  "Yusuf → Kerim → Taha hattını tek panelden takip et",
  "Yapay zekâ destekli Etsy SEO ve açıklama önerileri",
  "Sipariş, taslak ve gider yönetimi entegre",
];

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
    </div>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const fromPath = params.get("from") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Giriş başarısız.");
        setLoading(false);
        return;
      }
      window.location.replace(fromPath);
    } catch {
      toast.error("Sunucuya ulaşılamadı.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-stretch bg-gradient-to-br from-slate-950 via-slate-950 to-zinc-950 relative overflow-hidden">
      {/* Background orbs (>= sm only) */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-500/15 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/8 blur-[160px]" />
      </div>

      {/* Left brand panel */}
      <div className="hidden lg:flex flex-1 relative items-center justify-center p-12 z-10">
        <div className="max-w-md animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 text-xs text-slate-300 font-medium mb-8">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            AI destekli Etsy POD üssü
          </div>

          <h1 className="text-5xl xl:text-6xl font-bold tracking-tight leading-[1.05] mb-6 text-white">
            Mağazanı tek panelden
            <br />
            <span className="text-gradient">akıllıca yönet</span>
          </h1>

          <p className="text-lg text-slate-400 leading-relaxed mb-10">
            Tasarımdan satışa kadar tüm iş akışı NovaPrintLab&apos;da.
          </p>

          <div className="space-y-3.5">
            {HIGHLIGHTS.map((h, i) => (
              <div
                key={i}
                className="flex items-center gap-3 animate-slide-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 ring-1 ring-blue-500/30 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                </div>
                <span className="text-slate-200">{h}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-12 relative z-10">
        <div className="w-full max-w-md animate-slide-up">
          {/* Mobile brand */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-blue-500/30 ring-1 ring-white/10">
              <Palette className="h-8 w-8 text-white" />
            </div>
            <div className="text-center">
              <p className="font-bold text-xl text-gradient">NovaPrintLab</p>
              <p className="text-xs text-slate-500 uppercase tracking-[0.18em] mt-1">Etsy POD Üssü</p>
            </div>
          </div>

          {/* Card */}
          <div className="rounded-2xl bg-slate-900/80 sm:glass-strong border border-slate-800 shadow-elev-3 p-7 sm:p-9">
            <div className="mb-7">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                Tekrar hoş geldin
              </h2>
              <p className="text-slate-400 text-sm">
                Devam etmek için ekip bilgilerinle giriş yap.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 text-sm font-semibold">
                  E-posta
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="esatis1313@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300 text-sm font-semibold">
                  Şifre
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="w-full mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Giriş yapılıyor…
                  </>
                ) : (
                  <>
                    Giriş Yap
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-xs text-slate-500 text-center mt-7 pt-5 border-t border-slate-800">
              Yalnızca ekip üyeleri için • © {new Date().getFullYear()} NovaPrintLab
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
