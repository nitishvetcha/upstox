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
  { href: "/strategy-validation", title: "Strategy Validator", Icon: CandlestickChart },
  { href: "/readiness", title: "Strategy Readiness", Icon: ShieldCheck },
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
    <nav aria-label="Main navigation" className="shrink-0 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl md:sticky md:top-0 md:h-screen md:w-60 md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
      {/* Mobile bar: brand plus a menu button. Hidden on md and wider, where the sidebar is always shown. */}
      <div className="flex items-center justify-between px-2 py-1.5 md:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">OA</span> Options Analyzer</span>
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
      <div id="site-nav-links" className={`${open ? "flex" : "hidden"} max-h-[calc(100vh-3.5rem)] flex-col gap-1 overflow-y-auto p-2 md:flex md:max-h-none md:overflow-visible md:p-0`}>
        <div className="hidden px-2 pb-5 pt-1 md:block">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-xs font-black text-sky-300">OA</span>
            <div><div className="text-sm font-semibold text-zinc-100">Options Analyzer</div><div className="text-xs text-zinc-500">Decision workspace</div></div>
          </div>
          <div className="mt-3 rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-2.5 py-2 text-xs text-emerald-300">Paper research only · no broker orders</div>
        </div>
        {GROUPS.map(([group, items]) => (
          <div key={group} className="contents md:block">
            {group && <div className="hidden px-2 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 md:block">{group}</div>}
            {items.map(({ href, title, Icon }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm ${
                    active ? "border-sky-800/50 bg-sky-950/50 font-semibold text-sky-100 shadow-sm" : "border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/80 hover:text-zinc-100"
                  }`}
                >
                  <Icon size={16} aria-hidden className={active ? "text-sky-400" : "text-zinc-500 group-hover:text-zinc-300"} />
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
