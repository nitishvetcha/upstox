"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity, BarChart3, BookOpen, BookmarkCheck, Bug, CandlestickChart, FlaskConical, Gauge, History, LayoutDashboard, Layers, Menu, Microscope, Newspaper, Settings, ShieldCheck, Table2, Target, X,
} from "lucide-react";

// Primary research workflow first; everything else under "More". Each route appears once.
const PRIMARY = [
  { href: "/", title: "Overview", Icon: LayoutDashboard },
  { href: "/opportunities", title: "Opportunities", Icon: Target },
  { href: "/saved-picks", title: "Saved Picks", Icon: BookmarkCheck },
  { href: "/options-audit", title: "Options Data Audit", Icon: ShieldCheck },
  { href: "/options-research", title: "Options Research Lab", Icon: Microscope },
  { href: "/strategy-performance", title: "Strategy Performance", Icon: BarChart3 },
  { href: "/stock-v2", title: "Stock V2 Research", Icon: CandlestickChart },
  { href: "/options-engine", title: "Options Engine (Successor)", Icon: Layers },
  { href: "/system-health", title: "System Health", Icon: Gauge },
];
const EXTRA = [
  { href: "/opportunity-journal", title: "Opportunity Journal", Icon: BookOpen },
  { href: "/recommendation-debug", title: "Recommendation Debug", Icon: Bug },
  { href: "/market-history", title: "Market History", Icon: CandlestickChart },
  { href: "/option-history", title: "Option History", Icon: History },
  { href: "/strategy-evidence", title: "Strategy Evidence (11.4)", Icon: ShieldCheck },
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

const GROUPS: [string, { href: string; title: string; Icon: typeof LayoutDashboard }[]][] = [
  ["", PRIMARY],
  ["More", [...SECTIONS.filter(({ slug }) => slug !== "" && slug !== "system-health").map(({ slug, title }) => ({ href: `/${slug}`, title, Icon: ICONS[slug as keyof typeof ICONS] })), ...EXTRA]],
];

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(path);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close the mobile menu after navigation. Adjusting state during render (not in an effect) avoids a cascading re-render.
  if (path !== menuPath) {
    setMenuPath(path);
    setOpen(false);
  }

  // Escape closes the mobile menu and returns focus to the menu button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggleRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav aria-label="Main navigation" className="shrink-0 border-b border-zinc-800 bg-zinc-950 md:w-52 md:border-b-0 md:border-r md:p-3">
      {/* Mobile bar: brand plus a menu button. Hidden on md and wider, where the sidebar is always shown. */}
      <div className="flex items-center justify-between px-2 py-1.5 md:hidden">
        <span className="text-sm font-semibold text-zinc-100">Options Analyzer</span>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="site-nav-links"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded text-zinc-200 hover:bg-zinc-900"
        >
          {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        </button>
      </div>
      <div id="site-nav-links" className={`${open ? "flex" : "hidden"} flex-col gap-1 p-2 md:flex md:p-0`}>
        <div className="hidden px-2 pb-4 pt-1 md:block">
          <div className="text-sm font-semibold text-zinc-100">Options Analyzer</div>
          <div className="text-[11px] text-zinc-500">Paper research · read-only</div>
        </div>
        {GROUPS.map(([group, items]) => (
          <div key={group} className="contents md:block">
            {group && <div className="hidden px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600 md:block">{group}</div>}
            {items.map(({ href, title, Icon }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[24px] items-center gap-2 rounded px-2 py-2 text-sm md:py-1.5 ${
                    active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <Icon size={15} aria-hidden />
                  {title}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
