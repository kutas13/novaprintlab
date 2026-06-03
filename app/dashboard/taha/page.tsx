"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Image as ImageIcon,
  Search,
  Clock,
  CheckCircle2,
  Layers,
  Hourglass,
  FileEdit,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TahaDialog } from "@/components/taha-dialog";
import { MockupDownloadButton } from "@/components/mockup-download-button";
import { useDesignStore } from "@/lib/store";
import type { Design } from "@/lib/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

type TabKey = "queue" | "wip" | "drafts" | "all";

const TABS: { key: TabKey; label: string; description: string }[] = [
  { key: "queue", label: "Bekleyen", description: "Mockup yapılacak" },
  { key: "wip", label: "Mockup Yüklendi", description: "Yusuf'a gönderilmemiş" },
  { key: "drafts", label: "Taslakta", description: "Yusuf fiyatlıyor" },
  { key: "all", label: "Tümü", description: "Atölyenin tüm işleri" },
];

export default function TahaPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.loading);

  const [active, setActive] = useState<Design | null>(null);
  const [tab, setTab] = useState<TabKey>("queue");
  const [search, setSearch] = useState("");

  // Build groups
  const groups = useMemo(() => {
    const queue = designs.filter(
      (d) => d.status === "Mockup ve Yayınlama Bekliyor" && d.mockups.length === 0
    );
    const wip = designs.filter(
      (d) => d.status === "Mockup ve Yayınlama Bekliyor" && d.mockups.length > 0
    );
    const drafts = designs.filter((d) => d.status === "Taslak");
    return { queue, wip, drafts };
  }, [designs]);

  const todayDoneCount = useMemo(() => {
    if (!mounted) return 0;
    const today = new Date().toDateString();
    return [...groups.wip, ...groups.drafts].filter(
      (d) => new Date(d.createdAt).toDateString() === today
    ).length;
  }, [groups, mounted]);

  const list: Design[] = useMemo(() => {
    let base: Design[];
    if (tab === "queue") base = groups.queue;
    else if (tab === "wip") base = groups.wip;
    else if (tab === "drafts") base = groups.drafts;
    else
      base = designs.filter(
        (d) =>
          d.status === "Mockup ve Yayınlama Bekliyor" || d.status === "Taslak"
      );
    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.sku || "").toLowerCase().includes(q)
    );
  }, [tab, groups, designs, search]);

  const counts = {
    queue: groups.queue.length,
    wip: groups.wip.length,
    drafts: groups.drafts.length,
    all:
      groups.queue.length +
      groups.wip.length +
      groups.drafts.length,
  };

  return (
    <div>
      <PageHeader
        title="Mockup Atölyesi"
        description="Kerim SEO'yu bitirir bitirmez tasarım buraya düşer. AI Mockup Stüdyosunda mockupları üret, onayla — taslaklara otomatik düşsün."
        icon={<ImageIcon className="h-5 w-5" />}
        accent="from-amber-500 to-orange-500"
      >
        <Badge variant="info" className="gap-1.5">
          <Hourglass className="h-3 w-3" />
          {counts.queue} bekleyen
        </Badge>
        <Link
          href="/dashboard/sablon-mockup"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Mockup Stüdyosu
        </Link>
      </PageHeader>

      {/* Workflow stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7">
        <WorkflowCard
          label="Sırada bekliyor"
          value={counts.queue}
          icon={Hourglass}
          accent="amber"
          active={tab === "queue"}
          onClick={() => setTab("queue")}
        />
        <WorkflowCard
          label="Mockup yüklendi"
          value={counts.wip}
          icon={Layers}
          accent="blue"
          active={tab === "wip"}
          onClick={() => setTab("wip")}
        />
        <WorkflowCard
          label="Taslakta"
          value={counts.drafts}
          icon={FileEdit}
          accent="violet"
          active={tab === "drafts"}
          onClick={() => setTab("drafts")}
        />
        <WorkflowCard
          label="Bugün tamamlanan"
          value={todayDoneCount}
          icon={CheckCircle2}
          accent="emerald"
        />
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col-reverse lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800 overflow-x-auto scrollbar-thin">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2",
                  active
                    ? "bg-gradient-to-br from-amber-500/15 to-orange-500/10 text-amber-300 ring-1 ring-amber-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "tabular-nums text-[10px] px-1.5 py-0.5 rounded-md",
                    active
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-slate-800 text-slate-500"
                  )}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tasarım adı / SKU ara…"
            className="!h-9 pl-8 !text-xs w-full lg:w-64"
          />
        </div>
      </div>

      {/* Tab description */}
      {mounted && (
        <p className="text-xs text-slate-500 mb-5 pl-1">
          {TABS.find((t) => t.key === tab)?.description} • {list.length} sonuç
        </p>
      )}

      {mounted && loading && list.length === 0 && <SkeletonGrid />}

      {mounted && !loading && list.length === 0 && (
        <EmptyState tab={tab} search={search} />
      )}

      {mounted && list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {list.map((d) => (
            <TahaWorkflowCard
              key={d.id}
              design={d}
              onClick={() => setActive(d)}
            />
          ))}
        </div>
      )}

      {active && (
        <TahaDialog
          key={active.id}
          design={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function WorkflowCard({
  label,
  value,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "amber" | "blue" | "violet" | "emerald";
  active?: boolean;
  onClick?: () => void;
}) {
  const map = {
    amber: {
      bg: "bg-amber-500/10",
      ring: "ring-amber-500/25",
      text: "text-amber-300",
      activeBorder: "border-amber-500/40",
      activeBg: "from-amber-500/[0.08] to-orange-500/[0.04]",
    },
    blue: {
      bg: "bg-blue-500/10",
      ring: "ring-blue-500/25",
      text: "text-blue-300",
      activeBorder: "border-blue-500/40",
      activeBg: "from-blue-500/[0.08] to-cyan-500/[0.04]",
    },
    violet: {
      bg: "bg-violet-500/10",
      ring: "ring-violet-500/25",
      text: "text-violet-300",
      activeBorder: "border-violet-500/40",
      activeBg: "from-violet-500/[0.08] to-fuchsia-500/[0.04]",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      ring: "ring-emerald-500/25",
      text: "text-emerald-300",
      activeBorder: "border-emerald-500/40",
      activeBg: "from-emerald-500/[0.08] to-teal-500/[0.04]",
    },
  };
  const c = map[accent];

  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      onClick={onClick}
      className={cn(
        "text-left rounded-2xl border bg-slate-900/40 p-3.5 backdrop-blur shadow-elev-1 transition-all",
        onClick && "hover:border-slate-700 hover:bg-slate-900/60 cursor-pointer",
        active
          ? cn("bg-gradient-to-br", c.activeBg, c.activeBorder)
          : "border-slate-800/70"
      )}
    >
      <span
        className={cn(
          "h-8 w-8 rounded-lg ring-1 flex items-center justify-center mb-2",
          c.bg,
          c.ring
        )}
      >
        <Icon className={cn("h-4 w-4", c.text)} />
      </span>
      <div className="text-2xl font-bold text-white leading-none tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-slate-500 mt-1.5 font-medium">{label}</div>
    </Comp>
  );
}

function TahaWorkflowCard({
  design,
  onClick,
}: {
  design: Design;
  onClick: () => void;
}) {
  const isDraft = design.status === "Taslak";
  const hasMockup = design.mockups.length > 0;

  return (
    // We use a div + role="button" instead of a real <button> so we can
    // nest the ZIP-download button inside without HTML violating the
    // "no interactive elements inside an interactive element" rule.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-900/70 to-slate-900/30 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:shadow-elev-3 text-left flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
    >
      <div className="relative aspect-[4/3] checkerboard overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hasMockup ? design.mockups[0].url : design.originalImageUrl}
          alt={design.name}
          loading="lazy"
          className={cn(
            "absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-105",
            hasMockup ? "object-cover" : "object-contain p-3"
          )}
        />

        {/* Step pill */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          {isDraft ? (
            <Badge variant="violet" className="gap-1">
              <FileEdit className="h-3 w-3" /> Taslak
            </Badge>
          ) : hasMockup ? (
            <Badge variant="info" className="gap-1">
              <Layers className="h-3 w-3" /> Mockup hazır
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1">
              <Hourglass className="h-3 w-3" /> Bekliyor
            </Badge>
          )}
        </div>

        {/* Mockup count + ZIP download (only when mockups are present) */}
        {hasMockup && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm text-[10px] font-bold text-slate-200">
              {design.mockups.length} mockup
            </span>
            {/* ZIP download — wrapped in a span so the click never bubbles
                into the parent card's onClick (which opens the dialog). */}
            <span
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <MockupDownloadButton design={design} variant="icon" />
            </span>
          </div>
        )}

        {/* Tag chips bottom */}
        {design.seo?.tags && design.seo.tags.filter((t) => t.trim()).length > 0 && (
          <div className="absolute inset-x-2 bottom-2 flex flex-wrap gap-1 max-h-14 overflow-hidden">
            {design.seo.tags
              .filter((t) => t.trim())
              .slice(0, 3)
              .map((t, i) => (
                <span
                  key={i}
                  className="text-[9px] font-medium text-slate-200 bg-slate-950/80 backdrop-blur-sm rounded-md px-1.5 py-0.5 ring-1 ring-slate-700/40"
                >
                  #{t}
                </span>
              ))}
            {design.seo.tags.filter((t) => t.trim()).length > 3 && (
              <span className="text-[9px] font-medium text-slate-400 bg-slate-950/80 backdrop-blur-sm rounded-md px-1.5 py-0.5 ring-1 ring-slate-700/40">
                +{design.seo.tags.filter((t) => t.trim()).length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-3.5 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h3 className="font-semibold text-sm text-white leading-snug line-clamp-2 group-hover:text-amber-200 transition-colors">
            {design.name}
          </h3>
          {design.sku && (
            <span className="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-800/80 rounded px-1.5 py-0.5">
              {design.sku}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="h-3 w-3" />
            {format(new Date(design.createdAt), "d MMM • HH:mm", { locale: tr })}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-400 opacity-70 group-hover:opacity-100 transition-opacity">
            Aç
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab, search }: { tab: TabKey; search: string }) {
  if (search) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-slate-800/60 flex items-center justify-center mb-3">
          <Search className="h-5 w-5 text-slate-500" />
        </div>
        <p className="text-sm font-semibold text-slate-300 mb-1">
          &quot;{search}&quot; için sonuç yok
        </p>
        <p className="text-xs text-slate-500">Aramayı temizle ya da farklı bir terim dene.</p>
      </div>
    );
  }

  const config: Record<TabKey, { icon: typeof Hourglass; title: string; desc: string }> = {
    queue: {
      icon: Hourglass,
      title: "Mockup bekleyen iş yok",
      desc: "Kerim SEO'yu onayladığında burada görünecek.",
    },
    wip: {
      icon: Layers,
      title: "Mockup yüklenmiş iş yok",
      desc: "Sıradaki tasarımı aç, mockup'ları yükle ve Yusuf'a gönder.",
    },
    drafts: {
      icon: FileEdit,
      title: "Henüz taslak yok",
      desc: "Yusuf'a gönderdiğin mockuplar burada listelenecek.",
    },
    all: {
      icon: ImageIcon,
      title: "Atölye boş",
      desc: "Henüz bu durumda iş yok.",
    },
  };

  const c = config[tab];
  const Icon = c.icon;

  return (
    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-14 text-center">
      <div className="h-14 w-14 mx-auto rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-amber-300" />
      </div>
      <p className="text-base font-semibold text-slate-200 mb-1">{c.title}</p>
      <p className="text-sm text-slate-500">{c.desc}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] rounded-2xl border border-slate-800 bg-slate-900/30 animate-pulse"
        />
      ))}
    </div>
  );
}
