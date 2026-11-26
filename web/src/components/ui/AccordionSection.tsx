"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface AccordionSectionProps {
  title: string;
  badge?: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function AccordionSection({
  title,
  badge,
  summary,
  defaultOpen = false,
  children,
  className = "",
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <ChevronRight
            size={16}
            className={`shrink-0 text-zinc-400 transition-transform duration-200 ${
              open ? "rotate-90 text-zinc-200" : ""
            }`}
          />
          <span className="text-sm font-semibold text-zinc-100 truncate">{title}</span>
          {badge}
        </div>
        {summary && (
          <div className="flex items-center gap-2 shrink-0 text-xs text-zinc-400">
            {summary}
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-zinc-800/80 p-4">
          {children}
        </div>
      )}
    </section>
  );
}
