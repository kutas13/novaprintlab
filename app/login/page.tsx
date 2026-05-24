"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock, Mail, Palette } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
      // Hard navigation: native browser nav shows the loading indicator
      // immediately and avoids two RSC roundtrips (router.push +
      // router.refresh). On mobile this saves 1-2s of perceived latency
      // while the cookie + middleware roundtrip happens.
      window.location.replace(fromPath);
    } catch {
      toast.error("Sunucuya ulaşılamadı.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950">
      {/* Heavy blur orbs are GPU-killers on mobile — only render on >=sm */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-violet-500/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/10 blur-[160px]" />
      </div>
      <Card className="w-full max-w-md relative z-10 bg-slate-900/90 sm:glass-strong border-slate-800 shadow-2xl shadow-blue-500/10">
        <CardHeader className="space-y-4 text-center pt-8">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-blue-500/30 ring-1 ring-white/10">
            <Palette className="h-8 w-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">
              <span className="text-gradient">NovaPrintLab</span>
            </CardTitle>
            <CardDescription className="mt-2 text-slate-400">
              Etsy POD ekibi için yapay zekâ destekli iş yönetim üssü
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="esatis1313@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 bg-slate-950 border-slate-800"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 bg-slate-950 border-slate-800"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-violet-600 hover:opacity-90 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Giriş yapılıyor…
                </>
              ) : (
                "Giriş Yap"
              )}
            </Button>
          </form>
          <p className="text-xs text-slate-500 text-center mt-6">
            Yalnızca ekip üyeleri için. © {new Date().getFullYear()} NovaPrintLab
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
