import Link from "next/link";
import { Target, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import type { BestRecommendation } from "@/lib/bestRecommendation";
import type { AuthoritativePickDisplay } from "@/lib/services/authoritativeOpportunity";

function fmtPrice(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return `₹${val.toFixed(2)}`;
}

export function AuthoritativeRecommendationHero({
  best,
}: {
  best: BestRecommendation<AuthoritativePickDisplay>;
}) {
  if (best.status === "NO_TRADE") {
    return (
      <section
        aria-label="Authoritative active opportunity"
        className="rounded-2xl border border-amber-700/60 bg-amber-950/25 p-5 sm:p-6 shadow-lg shadow-amber-950/10"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-800/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Authoritative Market Signal · Opportunity Engine v20.2
            </span>
          </div>
          <span className="rounded-md border border-amber-700/50 bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-300">
            Capital Protected
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-amber-100 sm:text-3xl">
              NO ACTIVE TRADE
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-200/90">
              {best.reason}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              {best.watchOnlyCount} candidate(s) currently held in watch-only mode due to strict eligibility or Net R:R &lt; 1.5x gates.
            </p>
          </div>

          <div className="shrink-0">
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-700/60 bg-amber-900/40 px-4 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-850 hover:text-white"
            >
              <Target size={16} aria-hidden />
              Inspect Candidate Funnel
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const { candidate } = best;
  const item = candidate.item;
  const ageDisplay =
    item.dataAgeSeconds == null
      ? "Live feed"
      : `${Math.round(item.dataAgeSeconds)}s ago`;

  const gradeTone =
    candidate.grade === "A+"
      ? "border-emerald-500 bg-emerald-950/80 text-emerald-300"
      : candidate.grade === "A"
      ? "border-emerald-600 bg-emerald-950/60 text-emerald-400"
      : "border-sky-600 bg-sky-950/60 text-sky-300";

  return (
    <section
      aria-label="Authoritative active opportunity"
      className="rounded-2xl border border-emerald-700/60 bg-emerald-950/25 p-5 sm:p-6 shadow-xl shadow-emerald-950/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-800/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Authoritative Top Opportunity · Active Signal
          </span>
          {item.contractRole && (
            <span className="rounded bg-sky-950/80 border border-sky-700/60 px-2 py-0.5 text-[10px] font-bold tracking-wide text-sky-300">
              {item.contractRole} STRIKE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2.5 py-0.5 text-xs font-extrabold ${gradeTone}`}>
            GRADE {candidate.grade}
          </span>
          <span className="rounded-md border border-teal-700/60 bg-teal-950/60 px-2 py-0.5 text-xs font-bold text-teal-300">
            Score {candidate.score}/100
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {item.label}
            </h2>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-xs text-zinc-300">
              {candidate.engine} · {item.strategy}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-300">{item.horizon}</p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link
            href="/opportunities"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-md transition-colors hover:bg-emerald-400"
          >
            <Target size={16} aria-hidden />
            Inspect in Opportunities
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </div>

      {/* Execution & Pricing Grid */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Executable Entry</div>
          <div className="mt-1 font-mono text-sm font-bold text-emerald-300">{item.executablePrice}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Plan Entry</div>
          <div className="mt-1 font-mono text-sm font-semibold text-zinc-200">{fmtPrice(item.entry)}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Stop Loss</div>
          <div className="mt-1 font-mono text-sm font-semibold text-rose-300">{fmtPrice(item.stop)}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Target 1</div>
          <div className="mt-1 font-mono text-sm font-semibold text-emerald-400">{fmtPrice(item.target1)}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Target 2</div>
          <div className="mt-1 font-mono text-sm font-semibold text-emerald-300">{fmtPrice(item.target2)}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Gross R:R</div>
          <div className="mt-1 font-mono text-sm font-semibold text-zinc-200">{item.grossRr.toFixed(2)}x</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Net R:R (Post-Tax)</div>
          <div className="mt-1 font-mono text-sm font-bold text-emerald-400">
            {item.netRr != null ? `${item.netRr.toFixed(2)}x` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Data Freshness</div>
          <div className="mt-1 font-mono text-sm text-zinc-300">{ageDisplay}</div>
        </div>
      </div>

      {/* Invalidation rationale */}
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
        <div>
          <span className="font-semibold text-zinc-100">Structural Invalidation: </span>
          {item.invalidation}
        </div>
      </div>
    </section>
  );
}
