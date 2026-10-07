"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, BookOpen, Bug, CandlestickChart, FlaskConical, Gauge, History, LayoutDashboard, Layers, Newspaper, Settings, ShieldCheck, Table2, Target,
} from "lucide-react";

// Standalone pages (own routes, not [section] views).
const EXTRA = [
  { href: "/recommendation-debug", title: "Recommendation Debug", Icon: Bug },
  { href: "/market-history", title: "Market History", Icon: CandlestickChart },
  { href: "/option-history", title: "Option History", Icon: History },
  { href: "/strategy-evidence", title: "Strategy Evidence", Icon: ShieldCheck },
];
import { SECTIONS } from "@/lib/sections";

const ICONS = {
  "": LayoutDashboard,
  market: Activity,
  "option-chain": Table2,
  strategies: Layers,
  recommendations: Target,
  "paper-trading": BookOpen,
  backtest: FlaskConical,
  performance: BarChart3,
  "walk-forward": Activity,
  news: Newspaper,
  "system-health": Gauge,
  settings: Settings,
} as const;

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-950 p-2 md:w-52 md:flex-col md:border-b-0 md:border-r md:p-3">
      <div className="hidden px-2 pb-4 pt-1 md:block">
        <div className="text-sm font-semibold text-zinc-100">Options Analyzer</div>
        <div className="text-[11px] text-zinc-500">NIFTY · BANK NIFTY</div>
      </div>
      {[...SECTIONS.map(({ slug, title }) => ({ href: `/${slug}`, title, Icon: ICONS[slug as keyof typeof ICONS] })), ...EXTRA].map(({ href, title, Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded px-2 py-1.5 text-sm ${
              active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <Icon size={15} aria-hidden />
            {title}
          </Link>
        );
      })}
    </nav>
  );
}
