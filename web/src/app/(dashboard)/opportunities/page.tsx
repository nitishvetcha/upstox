export const dynamic = "force-dynamic";

// Defect fixed (Phase 29): page was HTTP-fetching itself at localhost:3000 which fails when
// the dev server runs on a different port. Now calls engines directly as a server component.
import { getSnapshot } from "@/lib/services/market";
import { INDICES, INSTRUMENTS } from "@/lib/services/instrumentRegistry";
import { evaluateOptionsOpportunity, validateSpreadIntegrity } from "@/lib/engine/opportunityEngine";
import { scanStocks } from "@/lib/engine/stockOpportunityEngine";
import { POSITIONAL_RETIRED_NOTE } from "@/lib/engine/positionalTrend";
import { scanLongTerm, type LongTermOpportunity } from "@/lib/engine/longTermEngine";
import { listOpportunityRecords } from "@/lib/services/opportunityTrackingStore";
import type { ContractOpportunity, OpportunityGrade, OptionsOpportunityResult, RejectedContract } from "@/lib/engine/opportunityEngine";
import type { StockOpportunity, SectorBreadthSummary } from "@/lib/engine/stockOpportunityEngine";
import type { OpportunityRecord } from "@/lib/services/opportunityTrackingStore";

import { SavePickButton } from "@/components/SavePickButton";
import { AutoRefreshControl } from "@/components/AutoRefreshControl";
import { CopyOrderSlipButton } from "@/components/CopyOrderSlipButton";
import { OptionPayoffVisualizer } from "@/components/OptionPayoffVisualizer";
import { PositionSizeCalculator } from "@/components/PositionSizeCalculator";
import { summarizeSources } from "@/lib/provenanceDisplay";
import { pickFromStock, pickFromContract } from "@/lib/savedPickMapping";
import { selectBestRecommendation, type RecommendationCandidate } from "@/lib/bestRecommendation";
// ── Decision funnel: real engine counts only. Rejections are reported as one total; the engines do not split them into data-quality, strategy and risk categories. ──

interface StockScanCounts {
  stocksScanned: number;
  stocksAvailable: number;
  stocksRejected: number;
  topOpportunities: unknown[];
  noOpportunityReason?: string | null;
}

function DecisionFunnel({ options, stockScans }: {
  options: OptionsOpportunityResult[];
  stockScans: { label: string; result: StockScanCounts }[];
}) {
  const optionCandidates = options.reduce((n, o) => n + o.topOpportunities.length, 0);
  const stockCandidates = stockScans.reduce((n, s) => n + s.result.topOpportunities.length, 0);
  const noTrade = options.filter((o) => o.topOpportunities.length === 0).length
    + stockScans.filter((s) => s.result.topOpportunities.length === 0).length;
  const evaluated = options.reduce((n, o) => n + o.contractsEvaluated, 0);
  const contractRejected = options.reduce((n, o) => n + o.contractsRejected, 0);
  const stocksScanned = stockScans.reduce((n, s) => n + s.result.stocksScanned, 0);
  const stocksRejected = stockScans.reduce((n, s) => n + s.result.stocksRejected, 0);
  const cell = (label: string, value: number) => (
    <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2">
      <div className="text-lg font-semibold text-zinc-100">{value}</div>
      <div className="text-[11px] text-zinc-400">{label}</div>
    </div>
  );
  return (
    <section aria-label="Decision funnel" className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-200">Decision Funnel</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cell("Stocks scanned", stocksScanned)}
        {cell("Contracts evaluated", evaluated)}
        {cell("Candidates generated", optionCandidates + stockCandidates)}
        {cell("Rejected (contracts + stocks)", contractRejected + stocksRejected)}
      </div>
      <p className="text-xs text-zinc-500">
        Candidates shown (watch-only and rejected grades included): {optionCandidates + stockCandidates} · NO TRADE outcomes: {noTrade} of {options.length + stockScans.length} engine runs.
        Rejections are not yet split into data-quality, strategy and risk categories; the rejected totals above are the engines&apos; own counts.
      </p>
      <ul className="space-y-0.5 text-xs text-zinc-400">
        {options.map((o) => (
          <li key={o.underlying}>
            {o.underlying}: {o.contractsEvaluated} evaluated, {o.contractsRejected} rejected, {o.topOpportunities.length} candidate{o.topOpportunities.length === 1 ? "" : "s"}
            {o.topOpportunities.length === 0 && o.noOpportunityReason ? ` — NO TRADE: ${o.noOpportunityReason}` : ""}
          </li>
        ))}
        {stockScans.map((s) => (
          <li key={s.label}>
            {s.label}: {s.result.stocksScanned} scanned, {s.result.stocksAvailable} with data, {s.result.stocksRejected} rejected, {s.result.topOpportunities.length} candidate{s.result.topOpportunities.length === 1 ? "" : "s"}
            {s.result.topOpportunities.length === 0 && s.result.noOpportunityReason ? ` — NO TRADE: ${s.result.noOpportunityReason}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const now = new Date();
    const [snaps, intradayResult, swingResult, ltResult] = await Promise.all([
      Promise.allSettled(INDICES.map((i) => getSnapshot(i))),
      scanStocks("intraday", now),
      scanStocks("swing", now),
      scanLongTerm(),
    ]);
    const indexOptions = snaps.flatMap((r, k) =>
      r.status === "fulfilled" ? [evaluateOptionsOpportunity(r.value, INSTRUMENTS[INDICES[k]].symbol, now)] : [],
    );
    const failedIndices = snaps.flatMap((r, k) =>
      r.status === "rejected" ? [`${INSTRUMENTS[INDICES[k]].symbol}: ${(r.reason as Error)?.message ?? "failed"}`] : [],
    );
    return { indexOptions, failedIndices, intradayResult, swingResult, ltResult, now };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number | null | undefined, prefix = "₹") =>
  n == null ? "—" : `${prefix}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtPct = (n: number | null | undefined) => n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const daysTo = (expiry: string | null, now: Date) =>
  expiry ? Math.ceil((new Date(expiry).getTime() - now.getTime()) / 86_400_000) : null;

// Color a data-quality status string: LIVE=green, bounded/verified=teal, aging/stale=amber, mismatch=red, unavailable/unverified=grey
const dqColor = (v: string) =>
  v === "LIVE" ? "text-emerald-400"
  : v.includes("VERIFIED") || v.includes("BOUNDED") ? "text-teal-400"
  : v.includes("AGING") ? "text-amber-300"
  : v.includes("STALE") ? "text-amber-400"
  : v.includes("MISMATCH") ? "text-red-400"
  : v.includes("UNAVAILABLE") || v.includes("UNVERIFIED") || v.includes("MOCK") ? "text-zinc-500"
  : "text-zinc-300";

const SETUP_TEXT: Record<string, string> = {
  BREAKOUT: "Breakout — new 20d high",
  BREAKDOWN: "Breakdown — below yesterday's low",
  ORB_BREAKOUT: "Opening Range Breakout (15m ORB)",
  ORB_BREAKDOWN: "Opening Range Breakdown (15m ORB)",
  HOD_CONTINUATION: "Holding near today's high",
  LOD_CONTINUATION: "Holding near today's low",
  MOMENTUM_LONG: "Strong upward move",
  MOMENTUM_SHORT: "Strong downward move",
  MOMENTUM: "Uptrend, holding near highs",
  TREND_CONTINUATION_LONG: "Uptrend — pulled back to 20d avg",
  TREND_CONTINUATION_SHORT: "Downtrend continuing",
  WEAK: "Weak setup",
};

// ── Design tokens ─────────────────────────────────────────────────────────────

const tw = {
  card: "rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-zinc-200",
  cardLong: "rounded-xl border border-green-800/60 bg-green-950/30 p-4 text-zinc-200",
  cardShort: "rounded-xl border border-red-800/60 bg-red-950/30 p-4 text-zinc-200",
  cardWarn: "rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-zinc-200",
  sectionHead: "text-base font-bold tracking-wide text-zinc-100 uppercase",
  subHead: "text-sm font-semibold text-zinc-300",
  label: "text-[11px] text-zinc-500 uppercase tracking-wide",
  mono: "font-mono text-zinc-100 text-xs",
  pill: (color: "green" | "red" | "amber" | "zinc" | "sky" | "purple" | "teal") => ({
    green: "inline-flex items-center rounded-full border border-green-600/60 bg-green-900/40 px-2 py-0.5 text-[11px] font-bold text-green-300",
    red: "inline-flex items-center rounded-full border border-red-600/60 bg-red-900/40 px-2 py-0.5 text-[11px] font-bold text-red-300",
    amber: "inline-flex items-center rounded-full border border-amber-600/40 bg-amber-900/30 px-2 py-0.5 text-[11px] font-bold text-amber-300",
    zinc: "inline-flex items-center rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300",
    sky: "inline-flex items-center rounded-full border border-sky-600/40 bg-sky-900/30 px-2 py-0.5 text-[11px] font-bold text-sky-300",
    purple: "inline-flex items-center rounded-full border border-purple-600/40 bg-purple-900/30 px-2 py-0.5 text-[11px] font-bold text-purple-300",
    teal: "inline-flex items-center rounded-full border border-teal-600/40 bg-teal-900/30 px-2 py-0.5 text-[11px] font-bold text-teal-300",
  }[color]),
};

// ── Shared atoms ──────────────────────────────────────────────────────────────

function SafetyNotice() {
  return (
    <div className="flex gap-3 rounded-xl border border-fuchsia-700/50 bg-fuchsia-900/20 px-4 py-3 text-sm text-fuchsia-100">
      <span aria-hidden className="font-bold text-fuchsia-300">!</span><p><span className="font-semibold">Paper research · manual review only.</span> No automatic broker orders. Engine grades are analytical labels, not trade approvals.</p>
    </div>
  );
}

interface BestDisplay {
  label: string;
  strategy: string;
  horizon: string;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  grossRr: number;
  netRr: number | null;
  dataAgeSeconds: number | null;
  invalidation: string;
  executablePrice: string;
}

function BestAvailableNow({ candidates }: { candidates: RecommendationCandidate<BestDisplay>[] }) {
  const best = selectBestRecommendation(candidates);
  if (best.status === "NO_TRADE") {
    return (
      <section aria-label="Best available now" className="rounded-2xl border border-amber-700/60 bg-amber-950/30 p-5 sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Best Available Now</div>
        <div className="mt-2 text-2xl font-bold text-amber-200">NO TRADE</div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-100/80">{best.reason}</p>
        <p className="mt-3 text-xs text-zinc-400">{best.watchOnlyCount} candidate(s) retained for monitoring only.</p>
      </section>
    );
  }
  const { candidate } = best;
  const item = candidate.item;
  const age = item.dataAgeSeconds == null ? "Unavailable" : `${Math.round(item.dataAgeSeconds)}s`;
  return (
    <section aria-label="Best available now" className="rounded-2xl border border-emerald-700/60 bg-emerald-950/25 p-5 shadow-xl shadow-emerald-950/10 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Best Available Now · manual review</div>
          <h2 className="mt-2 text-2xl font-bold text-zinc-100">{item.label}</h2>
          <p className="mt-1 text-sm text-zinc-300">{candidate.engine} · {item.strategy} · {item.horizon}</p>
        </div>
        <div className="flex gap-2"><GradeChip grade={candidate.grade} /><span className={tw.pill("teal")}>score {candidate.score}</span></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Cell label="Executable entry" value={item.executablePrice} />
        <Cell label="Plan entry" value={fmt(item.entry)} />
        <Cell label="Stop" value={fmt(item.stop)} />
        <Cell label="Target 1" value={fmt(item.target1)} />
        <Cell label="Target 2" value={fmt(item.target2)} />
        <Cell label="Gross R:R" value={`${item.grossRr.toFixed(2)}x`} />
        <Cell label="Net R:R after costs" value={item.netRr == null ? "Unavailable" : `${item.netRr.toFixed(2)}x`} />
        <Cell label="Data age" value={age} tone={item.dataAgeSeconds != null && item.dataAgeSeconds <= 60 ? "text-emerald-300" : "text-amber-300"} />
      </div>
      <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300"><span className="font-semibold text-zinc-100">Invalidation:</span> {item.invalidation}</p>
      <p className="mt-2 text-xs text-zinc-400">Selection is grade-first across active engines. Grade C and REJECT are never promoted. No order is placed.</p>
    </section>
  );
}

function EngineGovernanceBanner() {
  const engines = [
    { name: "Index Options", status: "ACTIVE SCREENING", tone: "border-emerald-700/60 bg-emerald-950/30 text-emerald-300", desc: "Tactical Greeks screening with structural invalidation stops & live execution quotes." },
    { name: "Intraday Stocks", status: "PAPER EVALUATION", tone: "border-sky-700/60 bg-sky-950/30 text-sky-300", desc: "1.5% max-risk structural stops, real volume/VWAP validation. Forward paper tracking." },
    { name: "Long-Term Bluechips", status: "FUNDAMENTAL RESEARCH", tone: "border-teal-700/60 bg-teal-950/30 text-teal-300", desc: "Quality balance sheet screener (ROCE > 15%, ROE > 15%, low D/E, moat analysis)." },
    { name: "Strategy 11.4", status: "FROZEN BENCHMARK", tone: "border-zinc-700 bg-zinc-900 text-zinc-400", desc: "SHA-256 byte-for-byte immutable historical baseline; not the unified pick engine." },
    { name: "Swing Stocks", status: "RETIRED · WATCH ONLY", tone: "border-red-800/60 bg-red-950/30 text-red-300", desc: "Retired following negative 5y backtest. Retained for observational diagnostics only." },
  ];

  return (
    <section aria-label="Strategy governance" className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">System Architecture</span>
          <h2 className="text-sm font-semibold text-zinc-200">Engine Governance &amp; Actionability Tiers</h2>
        </div>
        <span className="text-xs text-zinc-400">Transparent engine status across all asset classes</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5 text-xs">
        {engines.map((e) => (
          <div key={e.name} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-semibold text-zinc-200">{e.name}</span>
              </div>
              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold border ${e.tone}`}>{e.status}</span>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{e.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GradeChip({ grade }: { grade: OpportunityGrade | undefined }) {
  if (!grade) return null;
  const cls =
    grade === "A+" || grade === "A" ? tw.pill("green")
    : grade === "B" ? tw.pill("sky")
    : grade === "C" ? tw.pill("amber")
    : tw.pill("zinc") + " line-through opacity-60";
  return <span className={cls}>grade {grade}</span>;
}

function Cell({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded bg-zinc-950/50 px-2 py-1.5 text-center">
      <div className={`font-mono text-sm font-semibold ${tone ?? "text-zinc-100"}`}>{value}</div>
      <div className="mt-1 text-xs text-zinc-400">{label}</div>
      {sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

function Kv({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-zinc-950/40 px-2 py-1">
      <span className="shrink-0 text-[11px] text-zinc-500">{label}</span>
      <span className={`${mono ? "font-mono text-xs text-zinc-200" : "text-xs text-zinc-200"} text-right`} style={{ overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

function KvWrap({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-zinc-950/40 px-2 py-1">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-[11px] text-zinc-300 leading-snug" style={{ overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function KvGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{title}</div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">{children}</div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ id, title, count, tone, children }: {
  id: string; title: string; count?: number; tone?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className={`${tw.sectionHead} ${tone ?? "text-zinc-100"}`}>{title}</h2>
        {count != null && <span className="font-mono text-xs text-zinc-500">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function SubSection({ title, tone, children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className={`mb-2 ${tw.subHead} ${tone ?? ""}`}>{title}</h3>
      {children}
    </div>
  );
}

function Empty({ msg, reason }: { msg: string; reason?: string | null }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-sm text-zinc-500">{msg}</p>
      {reason && <p className="mt-1 text-xs text-zinc-600">{reason}</p>}
    </div>
  );
}

// ── Sector Breadth Matrix Widget ─────────────────────────────────────────────

function SectorMatrixWidget({ matrix }: { matrix?: SectorBreadthSummary[] }) {
  if (!matrix || matrix.length === 0) return null;
  return (
    <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
          <span className="text-teal-400">🏛</span> Sector Breadth Flow Matrix
        </span>
        <span className="text-[10px] text-zinc-500 font-mono">Top Liquid Sectors</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
        {matrix.map((s) => {
          const isBull = s.trend === "BULLISH";
          const isBear = s.trend === "BEARISH";
          const borderTone = isBull
            ? "border-green-800/50 bg-green-950/30 text-green-300"
            : isBear
            ? "border-red-800/50 bg-red-950/30 text-red-300"
            : "border-zinc-800 bg-zinc-900/40 text-zinc-400";
          return (
            <div key={s.sector} className={`rounded border p-1.5 text-center ${borderTone}`}>
              <div className="font-bold text-[11px] text-zinc-200">{s.sector}</div>
              <div className="font-mono text-[11px] font-semibold mt-0.5">
                {s.avgChangePercent >= 0 ? "+" : ""}{s.avgChangePercent.toFixed(1)}%
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5 font-mono">
                {s.advances}↑ {s.declines}↓ ({s.total})
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stock cards ───────────────────────────────────────────────────────────────

function StockCard({ stock, rank, horizon = "INTRADAY" }: { stock: StockOpportunity; rank?: number; horizon?: "INTRADAY" | "SWING" }) {
  const long = stock.direction === "BULLISH";
  const setup = SETUP_TEXT[stock.setup] ?? stock.setup;
  return (
    <article className={long ? tw.cardLong : tw.cardShort}>
      <div className="mb-1 text-[10px] font-bold tracking-widest text-fuchsia-300">
        PAPER RESEARCH — MANUAL REVIEW ONLY. NO AUTOMATIC BROKER ORDERS.
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-bold text-zinc-100 text-base">{rank != null ? `#${rank} ` : ""}{stock.symbol}</span>
          {stock.name && stock.name !== stock.symbol && (
            <span className="ml-2 text-xs text-zinc-400">{stock.name}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className={tw.pill("zinc")}>{horizon === "INTRADAY" ? "INTRADAY (Exit by 15:15 IST)" : "SWING (2–5 Days)"}</span>
          <span className={long ? tw.pill("green") : tw.pill("red")}>{long ? "LONG" : "SHORT"}</span>
          {stock.rvol != null && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${
              stock.rvol >= 1.5
                ? "bg-emerald-950/70 border-emerald-700/50 text-emerald-300"
                : stock.rvol < 0.6
                ? "bg-amber-950/40 border-amber-800/40 text-amber-300"
                : "bg-zinc-800/80 border-zinc-700 text-zinc-300"
            }`}>
              RVOL {stock.rvol}x
            </span>
          )}
          <GradeChip grade={stock.grade} />
          {stock.sectorAlignment === "ALIGNED" && (
            <span className={tw.pill("green")}>SECTOR ALIGNED</span>
          )}
          {stock.sectorAlignment === "OPPOSED" && (
            <span className={tw.pill("amber")}>SECTOR DRAG</span>
          )}
          {stock.freshness !== "LIVE" && <span className={tw.pill("amber")}>{stock.freshness}</span>}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">{setup} · LTP {fmt(stock.ltp)}{stock.changePercent != null ? ` (${fmtPct(stock.changePercent)})` : ""}</p>

      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <Cell label="Entry" value={fmt(stock.entry)} sub="Buy Price" />
        <Cell label="Stop Loss" value={fmt(stock.stop)} tone="text-red-300" sub="Safety Exit" />
        <Cell label="Target 1" value={fmt(stock.target1)} tone="text-green-300" sub="1st Profit Goal" />
        <Cell label="Target 2" value={fmt(stock.target2)} tone="text-green-300" sub="Runner Goal" />
        <Cell label="R:R" value={`${stock.rr}x`} tone={stock.rr >= 1.5 ? "text-green-300" : "text-zinc-100"} sub="Profit Multiple" />
        <Cell label="Score" value={`${stock.opportunityScore}/100`} sub="Setup Edge" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
        <Kv label="Direction" value={long ? "LONG (bullish)" : "SHORT (bearish)"} />
        <Kv label="Entry range" value={`${fmt(stock.entryLow)} – ${fmt(stock.entryHigh)}`} />
        {stock.confidence != null && <Kv label="Signal agreement" value={`${stock.confidence}/100`} />}
        {stock.vwap != null && <Kv label="Intraday VWAP" value={`${fmt(stock.vwap)} (${(stock.vwapDistancePct ?? 0) >= 0 ? "+" : ""}${stock.vwapDistancePct}%)`} />}
        {stock.rvol != null && <Kv label="Relative Vol (RVOL)" value={`${stock.rvol}x avg (${stock.rvol >= 1.5 ? "Surge" : stock.rvol >= 1.0 ? "Normal" : "Subdued"})`} />}
        {stock.atr != null && <Kv label="14D Daily ATR" value={fmt(stock.atr)} />}
        {stock.orbHigh != null && stock.orbLow != null && (
          <Kv label="15m Opening Range" value={`${fmt(stock.orbLow)} – ${fmt(stock.orbHigh)}`} />
        )}
        {stock.sector != null && (
          <Kv
            label="Sector Flow"
            value={
              stock.sectorAlignment === "ALIGNED"
                ? `${stock.sector} (${stock.sectorTrend} ✓)`
                : stock.sectorAlignment === "OPPOSED"
                ? `${stock.sector} (${stock.sectorTrend} ⚠)`
                : stock.sector
            }
          />
        )}
        {stock.relativeStrength != null && <Kv label="vs NIFTY" value={fmtPct(stock.relativeStrength)} />}
        {stock.rangePosition != null && <Kv label="Day range pos." value={`${(stock.rangePosition * 100).toFixed(0)}/100`} />}
        {stock.volume != null && <Kv label="Volume" value={`${(stock.volume / 1000).toFixed(0)}K`} />}
        <Kv label="Data freshness" value={stock.freshness} />
        <Kv label="Source" value={stock.source ?? "UNAVAILABLE"} />
        <Kv label="Session date" value={stock.sessionDate ?? "—"} />
        <Kv label="Exchange LTT" value={stock.exchangeTimestamp
          ? new Date(stock.exchangeTimestamp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST"
          : "—"} />
        <Kv label="Data age" value={stock.dataAgeSeconds != null ? `${stock.dataAgeSeconds}s` : "—"} />
        <Kv label="Fetched at" value={stock.fetchedAt
          ? new Date(stock.fetchedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST"
          : "—"} />
      </div>

      {/* Trade Execution & Trailing Stop Plan */}
      <div className="mt-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-xs">
        <div className="font-semibold text-zinc-300 mb-1 flex items-center justify-between">
          <span>Trade Management &amp; Trailing Plan</span>
          <span className="text-[10px] text-zinc-500 font-mono">1.5% Capped Risk · 2-Tier Exit</span>
        </div>
        <div className="space-y-1 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-amber-400">SL (Capped)</span>
            <span>Structural stop at <strong className="text-zinc-200">{fmt(stock.stop)}</strong> (capped to max 1.5% capital risk, avoids distant session-low stops)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-emerald-400">T1 (50%)</span>
            <span>Exit 50% at <strong className="text-zinc-200">{fmt(stock.target1)}</strong> and trail Stop to Breakeven (<strong className="text-zinc-200">{fmt(stock.entry)}</strong>)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-teal-400">T2 (50%)</span>
            <span>Hold runner position to <strong className="text-zinc-200">{fmt(stock.target2)}</strong>, trailing stop below prior bar low</span>
          </div>
        </div>
      </div>

      {/* Position Sizing Calculator */}
      <PositionSizeCalculator
        type="STOCK"
        entry={stock.entry}
        stop={stock.stop}
        target1={stock.target1}
        target2={stock.target2}
        lotSize={1}
        unitPrice={stock.entry}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <SavePickButton pick={pickFromStock(stock)} />
        <CopyOrderSlipButton slipText={`ORDER: LIMIT ONLY | BUY ${stock.symbol} | LIMIT PRICE: ₹${stock.entry} (Entry Range: ₹${stock.entryLow} - ₹${stock.entryHigh}) | SL: ₹${stock.stop} | T1: ₹${stock.target1} | T2: ₹${stock.target2} | R:R: ${stock.rr}x | TIME-EXIT: Close before 3:15 PM IST`} />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Signals, reasons &amp; invalidation</summary>
        <div className="mt-1 space-y-0.5">
          {stock.reasons.map((r, i) => <p key={i} className="text-xs text-zinc-400">• {r}</p>)}
          <p className="mt-1 text-xs text-amber-300">⛔ Invalidation: {stock.invalidation}</p>
          {stock.gradeReasons?.map((r, i) => <p key={i} className="text-xs text-red-400">⛔ {r}</p>)}
        </div>
      </details>
    </article>
  );
}

// ── Long-term stock card (Multi-month fundamental investment) ──────────────────

function LongTermStockCard({ stock, rank }: { stock: LongTermOpportunity; rank: number }) {
  const isAccumulate = stock.rating === "ACCUMULATE";
  const score = stock.fundamentalScore ?? 0;

  return (
    <article className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-4 transition-all hover:border-zinc-500 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-100 text-base">#{rank} {stock.symbol}</span>
            <span className="text-xs text-zinc-400 font-medium">{stock.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Reference Price: <strong className="text-zinc-300 font-mono">₹{stock.ltpRef ?? "—"}</strong></span>
            <span>·</span>
            <span>Zone: <strong className="text-emerald-400 font-mono">{stock.accumulationZone ?? "Dips"}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
            LONG-TERM (MONTHS+)
          </span>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
              isAccumulate
                ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                : "bg-sky-950 text-sky-400 border-sky-800"
            }`}
          >
            {stock.rating}
          </span>
          <span className="rounded bg-teal-950/70 border border-teal-800 px-2 py-0.5 text-[10px] font-bold text-teal-300 font-mono">
            {score}/100 SCORE
          </span>
          <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
            {stock.technicalTrend}
          </span>
        </div>
      </div>

      {/* Fundamental Ratios Matrix */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 text-[11px]">
        <div className="rounded bg-zinc-950/80 p-2 border border-zinc-800" title="Return on Capital Employed: How efficiently company generates profits from capital">
          <div className="text-zinc-500 text-[10px]">ROCE (Efficiency)</div>
          <div className="mt-0.5 font-mono font-bold text-emerald-400">{stock.roce ?? "—"}%</div>
          <div className="text-[9px] text-zinc-400">Profit on Capital</div>
        </div>
        <div className="rounded bg-zinc-950/80 p-2 border border-zinc-800" title="Return on Equity: Profit generated on shareholders equity">
          <div className="text-zinc-500 text-[10px]">ROE (Equity Return)</div>
          <div className="mt-0.5 font-mono font-bold text-emerald-400">{stock.roe ?? "—"}%</div>
          <div className="text-[9px] text-zinc-400">Shareholder Return</div>
        </div>
        <div className="rounded bg-zinc-950/80 p-2 border border-zinc-800" title="Debt to Equity: Lower is safer. <0.5 means very safe balance sheet">
          <div className="text-zinc-500 text-[10px]">Debt/Equity</div>
          <div className="mt-0.5 font-mono font-bold text-zinc-200">
            {stock.debtToEquity === 0 ? "0.0 (Zero)" : stock.debtToEquity ?? "—"}
          </div>
          <div className="text-[9px] text-zinc-400">{stock.debtToEquity === 0 ? "Debt-Free" : "Low Leverage"}</div>
        </div>
        <div className="rounded bg-zinc-950/80 p-2 border border-zinc-800" title="Operating Margin: Core business profitability margin">
          <div className="text-zinc-500 text-[10px]">Op. Margin</div>
          <div className="mt-0.5 font-mono font-bold text-sky-300">{stock.operatingMargin ?? "—"}%</div>
          <div className="text-[9px] text-zinc-400">Core Profitability</div>
        </div>
        <div className="rounded bg-zinc-950/80 p-2 border border-zinc-800" title="Price to Earnings ratio: Market valuation multiple">
          <div className="text-zinc-500 text-[10px]">P/E (Valuation)</div>
          <div className="mt-0.5 font-mono font-bold text-zinc-300">{stock.pe ?? "—"}x</div>
          <div className="text-[9px] text-zinc-400">Valuation Multiple</div>
        </div>
        <div className="rounded bg-zinc-950/80 p-2 border border-zinc-800" title="Year-over-Year revenue/sales growth rate">
          <div className="text-zinc-500 text-[10px]">Sales Growth</div>
          <div className="mt-0.5 font-mono font-bold text-emerald-400">+{stock.revenueGrowthYoy ?? "—"}%</div>
          <div className="text-[9px] text-zinc-400">Yearly Revenue</div>
        </div>
      </div>

      {/* Investment Thesis & Moat */}
      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 text-xs">
        <div className="font-semibold text-zinc-300 text-[11px] mb-1">Fundamental Moat &amp; Thesis:</div>
        <p className="text-zinc-400 leading-relaxed text-[11px]">{stock.thesis}</p>
      </div>

      {/* Risk Factors */}
      {stock.riskFactors.length > 0 && (
        <div className="mt-2 text-[11px] text-zinc-500">
          <span className="font-semibold text-zinc-400">Monitor: </span>
          {stock.riskFactors.join(" · ")}
        </div>
      )}

      {/* Save Pick Button */}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5">
        <span className="text-[10px] text-zinc-500 font-mono">
          Long-Term Strategy · Evaluated on Audited Annual Reports
        </span>
        <SavePickButton
          pick={{
            instrument: stock.symbol,
            instrumentType: "STOCK",
            direction: "LONG",
            entry: stock.ltpRef ?? null,
            stopLoss: stock.ltpRef ? Math.round(stock.ltpRef * 0.85) : null,
            targets: stock.ltpRef ? [Math.round(stock.ltpRef * 1.3), Math.round(stock.ltpRef * 1.6)] : [],
            source: "RESEARCH",
            note: `Long-term accumulation setup (${stock.rating}). Fundamental Score: ${score}/100. ROCE: ${stock.roce}%, ROE: ${stock.roe}%.`,
          }}
        />
      </div>
    </article>
  );
}

// ── Options recommendation card ───────────────────────────────────────────────

function OptionRecCard({ contract, snapshotSource, lotSize, rank, daysLeft }: {
  contract: ContractOpportunity;
  snapshotSource: string;
  lotSize: number | null | undefined;
  rank: number;
  daysLeft: number | null;
}) {
  const isMultiLeg = contract.strategyType === "BEAR_PUT_SPREAD" || contract.strategyType === "BULL_CALL_SPREAD" || Boolean(contract.isMultiLeg) || ((contract.legs?.length ?? 0) > 1);
  const isBullishSpread = contract.strategyType === "BULL_CALL_SPREAD";
  const isBearishSpread = contract.strategyType === "BEAR_PUT_SPREAD";
  const isCall = contract.optionType === "CE";
  const isBullish = isBullishSpread || (!isBearishSpread && isCall);
  const grade = contract.grade as OpportunityGrade;
  const actionable = grade !== "REJECT" && grade !== "C";

  const longLeg = contract.legs?.find((l) => l.side === "BUY");
  const shortLeg = contract.legs?.find((l) => l.side === "SELL");

  const spreadIntegrity = validateSpreadIntegrity(contract);
  if (isMultiLeg && !spreadIntegrity.isValid) {
    return (
      <article className={tw.card}>
        <div className="mb-1 text-[10px] font-bold tracking-widest text-fuchsia-300">
          PAPER RESEARCH — MANUAL REVIEW ONLY. NO AUTOMATIC BROKER ORDERS.
        </div>
        <div className="p-2 text-xs text-red-400">
          ⚠ Data integrity error: Invalid or inconsistent multi-leg spread pricing/legs ({spreadIntegrity.error}). Opportunity #{rank} suppressed from active display.
        </div>
      </article>
    );
  }

  const stratLabel = isMultiLeg
    ? (isBullishSpread ? "BULL CALL SPREAD" : "BEAR PUT SPREAD")
    : (isCall ? "LONG CALL" : "LONG PUT");

  // Strictly fail-closed: NO fallback to contract.entry for multi-leg spreads
  const effectiveCapitalUnit = isMultiLeg ? contract.netDebit! : contract.ltp;
  const displayNetDebit = isMultiLeg ? contract.netDebit! : null;

  return (
    <article className={actionable ? (isBullish ? tw.cardLong : tw.cardShort) : tw.card}>
      <div className="mb-1 text-[10px] font-bold tracking-widest text-fuchsia-300">
        PAPER RESEARCH — MANUAL REVIEW ONLY. NO AUTOMATIC BROKER ORDERS.
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-bold text-zinc-100 text-base">
            {isMultiLeg && longLeg && shortLeg ? (
              <>#{rank} {contract.underlying} {longLeg.strike}/{shortLeg.strike} {contract.optionType} Spread</>
            ) : (
              <>#{rank} {contract.underlying} {contract.strike} {contract.optionType}</>
            )}
          </span>
          <span className="ml-2 text-xs text-zinc-500">expiry {contract.expiry ?? "—"}{daysLeft != null ? ` (${daysLeft}d)` : ""}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className={tw.pill("zinc")}>INTRADAY (2–4h)</span>
          <span className={actionable ? (isBullish ? tw.pill("green") : tw.pill("red")) : tw.pill("zinc")}>{stratLabel}</span>
          <GradeChip grade={grade} />
          {contract.contractPriceQuality === "CONTRACT_PRICE_LIVE" && <span className={tw.pill("sky")}>LIVE price</span>}
          {contract.contractPriceQuality !== "CONTRACT_PRICE_LIVE" && (
            <span className={tw.pill("amber")}>{contract.contractPriceQuality?.replace("CONTRACT_PRICE_", "") ?? "PRICE?"}</span>
          )}
          {contract.isZeroDte && <span className={tw.pill("amber")}>0-DTE</span>}
          {contract.afternoonThetaGuard && <span className={tw.pill("red")}>THETA GUARD</span>}
        </div>
      </div>
      {isMultiLeg && longLeg && shortLeg ? (
        <p className="mt-0.5 text-xs text-zinc-500">
          Long {longLeg.strike} ({longLeg.instrumentKey ?? "—"}) · Short {shortLeg.strike} ({shortLeg.instrumentKey ?? "—"}) · Net Debit {fmt(displayNetDebit)}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-zinc-500">
          {contract.instrumentKey ?? "—"} · LTP {fmt(contract.ltp)} · V3 indep. {fmt(contract.independentQuoteLtp)}
          {contract.ltpDiscrepancy != null ? ` (Δ${fmt(r2(contract.ltpDiscrepancy), "₹")})` : ""}
        </p>
      )}

      <div className="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">A · Trade setup</div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        <Cell label={isMultiLeg ? "Net Debit" : "Entry premium"} value={fmt(isMultiLeg ? displayNetDebit : contract.entry)} sub="Buy Price" />
        <Cell label="Stop Loss" value={fmt(contract.stop)} tone="text-red-300" sub="Safety Cutoff" />
        <Cell label="Target 1" value={fmt(contract.target1)} tone="text-green-300" sub="1st Profit Goal" />
        <Cell label="Target 2" value={fmt(contract.target2)} tone="text-green-300" sub="Runner Goal" />
        <Cell label="R:R" value={`${contract.rr}x`} tone={contract.rr >= 1.5 ? "text-green-300" : "text-zinc-100"} sub="Profit Multiple" />
      </div>

      <KvGroup title="B · Risk &amp; capital">
        <Kv label="Entry range" value={`${fmt(contract.entryLow)} – ${fmt(contract.entryHigh)}`} />
        <Kv label="Max loss (1 lot)" value={fmt(contract.maxLoss)} />
        <Kv label="Breakeven" value={fmt(contract.breakeven)} />
        <Kv
          label={isCall ? "Call Writer Wall (Res)" : "Put Writer Wall (Sup)"}
          value={
            (isCall ? contract.resistance : contract.support) != null
              ? `₹${isCall ? contract.resistance : contract.support} (${Math.round(contract.srRoom)} pts room)`
              : "—"
          }
        />
        <Kv label="Lot size" value={lotSize != null ? `${lotSize} units` : "—"} />
        <Kv label="Capital (1 lot)" value={lotSize != null ? fmt(r2(effectiveCapitalUnit * lotSize)) : "—"} />
      </KvGroup>

      {isMultiLeg && longLeg && shortLeg ? (
        <KvGroup title="C · Spread liquidity &amp; legs">
          <Kv label="Long leg" value={`${longLeg.strike} ${contract.optionType} · LTP ${fmt(longLeg.ltp)} · Bid/Ask ${fmt(longLeg.bid)} / ${fmt(longLeg.ask)}`} />
          <Kv label="Short leg" value={`${shortLeg.strike} ${contract.optionType} · LTP ${fmt(shortLeg.ltp)} · Bid/Ask ${fmt(shortLeg.bid)} / ${fmt(shortLeg.ask)}`} />
          <Kv label="Spread width" value={`₹${Math.abs(longLeg.strike - shortLeg.strike)}`} />
          <Kv label="Net spread debit" value={fmt(displayNetDebit)} />
        </KvGroup>
      ) : (
        <KvGroup title="C · Contract liquidity">
          <Kv label="OI" value={contract.oi.toLocaleString("en-IN")} />
          <Kv label="Volume" value={contract.volume.toLocaleString("en-IN")} />
          <Kv label="Bid / Ask" value={`${fmt(contract.bid)} / ${fmt(contract.ask)}`} />
          <Kv label="Spread" value={contract.spreadPct != null ? `${contract.spreadPct.toFixed(2)}%` : "—"} />
        </KvGroup>
      )}

      <KvGroup title="D · Model &amp; data quality">
        <Kv label="IV" value={contract.iv != null ? `${contract.iv.toFixed(1)}%` : "—"} />
        <KvWrap label="IV provenance" value={contract.ivProvenance ?? "UNAVAILABLE"} />
        <Kv label="Delta (Δ)" value={contract.delta != null ? contract.delta.toFixed(3) : "—"} />
        <KvWrap label="Greeks provenance" value={contract.greeksProvenance ?? "UNAVAILABLE"} />
        <Kv label="Exchange LTT" value={contract.lastTradeTime ? new Date(contract.lastTradeTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST" : "—"} />
        <KvWrap label="Analytics provenance" value={contract.analyticsProvenance ?? "UNAVAILABLE"} />
      </KvGroup>

      <KvGroup title="E · Recommendation quality">
        <Kv label="Score" value={`${contract.opportunityScore}/100`} />
        <Kv label="Signal agreement" value={`${contract.confidence}/100 (${contract.signalAgreement}/${contract.signalAgreementOf})`} />
        <Kv
          label="Price consistent"
          value={
            contract.ltpConsistent === true
              ? (isMultiLeg ? "YES ✓ (Long leg)" : "YES ✓")
              : contract.ltpConsistent === false
              ? (isMultiLeg ? "NO ✗ (Long leg)" : "NO ✗")
              : "—"
          }
        />
      </KvGroup>

      {/* Option Payoff & Greeks Visualizer */}
      <OptionPayoffVisualizer
        strategyType={contract.strategyType ?? (isCall ? "LONG_CALL" : "LONG_PUT")}
        underlying={contract.underlying}
        strike={contract.strike}
        entry={contract.entry}
        stop={contract.stop}
        target1={contract.target1}
        target2={contract.target2}
        breakeven={contract.breakeven}
        maxLoss={contract.maxLoss}
        maxProfit={contract.maxProfit}
        lotSize={lotSize}
        delta={contract.delta}
        theta={contract.theta}
        gamma={contract.gamma}
        vega={contract.vega}
        iv={contract.iv}
      />

      {/* Trailing Stop & Partial Profit Taking Plan */}
      <div className="mt-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-xs">
        <div className="font-semibold text-zinc-300 mb-1 flex items-center justify-between">
          <span>Option Execution &amp; Trailing Plan</span>
          <span className="text-[10px] text-zinc-500 font-mono">Structural SL · 2-Tier Exit</span>
        </div>
        <div className="space-y-1 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-amber-400">SL (Structural)</span>
            <span>Invalidation at <strong className="text-zinc-200">{fmt(contract.stop)}</strong> (bounded delta-scaled risk, not a blind 50% haircut)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-emerald-400">T1 (50%)</span>
            <span>Book 50% at <strong className="text-zinc-200">{fmt(contract.target1)}</strong> and move SL to Entry (<strong className="text-zinc-200">{fmt(contract.entry)}</strong>) for a risk-free trade</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-teal-400">T2 (50%)</span>
            <span>Ride momentum to <strong className="text-zinc-200">{fmt(contract.target2)}</strong>; exit before 15:15 IST (no overnight theta decay)</span>
          </div>
          {contract.isZeroDte && (
            <div className="flex items-center gap-1.5 text-amber-300">
              <span className="rounded bg-amber-900/40 px-1 py-0.5 font-mono text-[10px] text-amber-300">0-DTE Mandatory</span>
              <span>Same-day expiry: Exit all positions before <strong className="text-zinc-100">15:15 IST</strong> to eliminate zero-loss settlement risk</span>
            </div>
          )}
        </div>
      </div>

      {/* Position Sizing Calculator */}
      <PositionSizeCalculator
        type="OPTION"
        entry={contract.entry}
        stop={contract.stop}
        target1={contract.target1}
        target2={contract.target2}
        lotSize={lotSize}
        unitPrice={isMultiLeg ? contract.netDebit : contract.ltp}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {isMultiLeg ? (
          <div className="text-xs text-zinc-500 italic">Saved picks are currently supported for single-leg contracts only.</div>
        ) : (
          <SavePickButton pick={pickFromContract({ ...contract, snapshotSource })} />
        )}
        <CopyOrderSlipButton
          slipText={
            isMultiLeg
              ? `ORDER: LIMIT ONLY (DO NOT USE MARKET ORDER) | ${stratLabel} ${contract.underlying} ${contract.expiry} | Net Debit: ₹${effectiveCapitalUnit} | SL: ₹${contract.stop} | T1: ₹${contract.target1} | T2: ₹${contract.target2} | Lot: ${lotSize ?? 65} | ⏱️ TIME-STOP: Exit after 45-60m if stagnant (Theta Guard)`
              : `ORDER: LIMIT ONLY (NO MARKET ORDER) | BUY ${contract.underlying} ${contract.strike} ${contract.optionType} | LIMIT PRICE: ₹${contract.entry} (Entry Range: ₹${contract.entryLow} - ₹${contract.entryHigh}) | SL: ₹${contract.stop} | T1: ₹${contract.target1} | T2: ₹${contract.target2} | Lot: ${lotSize ?? 65} | ⏱️ TIME-STOP: Exit after 45-60m if T1 not reached (Theta Guard)`
          }
        />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Signals, reasons &amp; invalidation</summary>
        <div className="mt-1 space-y-0.5">
          {contract.reasons.map((r, i) => <p key={i} className="text-xs text-zinc-400">• {r}</p>)}
          <p className="mt-1 text-xs text-amber-300">⛔ Invalidation: {contract.invalidation}</p>
          {(contract.gradeReasons?.length ?? 0) > 0 && (
            <div className="mt-1 space-y-0.5">
              {contract.gradeReasons?.map((r, i) => <p key={i} className="text-xs text-red-400">⛔ {r}</p>)}
            </div>
          )}
        </div>
      </details>

      {!actionable && (
        <div className="mt-2 rounded bg-zinc-950/50 px-2 py-1.5 text-xs text-amber-300">
          ⚠ Grade {grade}: {grade === "C" ? "Watch-only — wide spread or below actionability threshold" : "Rejected — does not meet mandatory quality gates"}
        </div>
      )}
    </article>
  );
}

// ── News diagnostic panel ─────────────────────────────────────────────────────

function NewsPanel({ nd }: { nd: NonNullable<OptionsOpportunityResult["newsDiagnostic"]> }) {
  const fColor =
    nd.freshness === "LIVE" ? "text-emerald-400"
    : nd.freshness === "AGING" ? "text-amber-300"
    : nd.freshness === "STALE" ? "text-amber-400"
    : "text-zinc-500";
  const sColor = nd.overall === "BULLISH" ? "text-green-400" : nd.overall === "BEARISH" ? "text-red-400" : "text-zinc-400";
  const riskColor = nd.eventRiskLevel === "EXTREME" ? "text-red-400" : nd.eventRiskLevel === "HIGH" ? "text-red-300" : nd.eventRiskLevel === "MEDIUM" ? "text-amber-300" : "text-zinc-500";
  return (
    <details className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2 text-[11px]">
      <summary className="cursor-pointer font-semibold text-zinc-400 hover:text-zinc-200">
        News diagnostics
        {" · "}<span className={fColor}>{nd.freshness}</span>
        {" · "}<span className={sColor}>{nd.overall}</span>
        {nd.factorAvailable ? <span className="text-zinc-500"> · {nd.factorScore.toFixed(1)}/10 pts contributed</span> : <span className="text-zinc-600"> · not included in score</span>}
        {nd.eventRiskLevel !== "NONE" && <span className={riskColor}> · {nd.eventRiskLevel} event risk −{nd.eventRiskPenalty} pts</span>}
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Provider status</div><div className="mt-0.5 font-mono text-zinc-300">{nd.providerStatus}</div></div>
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Freshness</div><div className={`mt-0.5 font-mono ${fColor}`}>{nd.freshness}</div></div>
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Newest article</div><div className="mt-0.5 font-mono text-zinc-300">{nd.newestArticleAt ? new Date(nd.newestArticleAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST" : "—"}</div></div>
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Sentiment</div><div className={`mt-0.5 font-mono ${sColor}`}>{nd.overall} ({nd.score >= 0 ? "+" : ""}{nd.score.toFixed(2)}, {Math.round(nd.confidence * 100)}% conf)</div></div>
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Articles</div><div className="mt-0.5 font-mono text-zinc-300">{nd.articleCount} relevant of {nd.uniqueCount} unique ({nd.fetchedCount} fetched) · {nd.bullishCount}↑ {nd.bearishCount}↓</div></div>
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Factor in score</div><div className={`mt-0.5 font-mono ${nd.factorAvailable ? "text-emerald-400" : "text-zinc-500"}`}>{nd.factorAvailable ? `YES — ${nd.factorScore.toFixed(1)}/10 pts` : "NO — excluded"}</div></div>
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Conflicts market</div><div className={`mt-0.5 font-mono ${nd.newsConflictsWithMarket ? "text-amber-300" : "text-zinc-500"}`}>{nd.newsConflictsWithMarket ? "YES — news opposes market direction" : "NO"}</div></div>
        <div className="rounded bg-zinc-900 px-1.5 py-1"><div className="text-zinc-500">Event risk level</div><div className={`mt-0.5 font-mono ${riskColor}`}>{nd.eventRiskLevel}{nd.eventRiskPenalty > 0 ? ` (−${nd.eventRiskPenalty} pts)` : ""}</div></div>
        {nd.eventRiskReason && <div className="col-span-2 rounded bg-zinc-900 px-1.5 py-1 sm:col-span-3"><div className="text-zinc-500">Event risk reason</div><div className="mt-0.5 text-amber-300">{nd.eventRiskReason}</div></div>}
        {nd.unavailableReason && <div className="col-span-2 rounded bg-zinc-900 px-1.5 py-1 sm:col-span-3"><div className="text-zinc-500">Unavailable reason</div><div className="mt-0.5 text-zinc-500">{nd.unavailableReason}</div></div>}
      </div>
      {nd.doubleCountingNote && (
        <p className="mt-1.5 rounded bg-amber-950/30 px-2 py-1 text-amber-400/80">⚠ Double-counting note: {nd.doubleCountingNote}</p>
      )}
      <p className="mt-1 text-zinc-600">
        Stock engine: news NOT consumed (single batch-quote call, no news API). Options engine: news consumed via RSS + NewsAPI (NewsAPI free plan has ~24h delay; RSS is real-time).
        LIVE provider ≠ LIVE factor — the factor is excluded when news source ≠ market data source.
      </p>
    </details>
  );
}

// ── Options index section ─────────────────────────────────────────────────────

function OptionsIndexSection({ result, now }: { result: OptionsOpportunityResult; now: Date }) {
  const calls = result.topOpportunities.filter((c) => c.optionType === "CE");
  const puts = result.topOpportunities.filter((c) => c.optionType === "PE");
  const rec = result.recommendedStrategy;
  const eligibility = result.candidateEligibility;

  const statusColor =
    rec === "LONG_CALL" || rec === "BULL_CALL_SPREAD" ? "text-green-400"
    : rec === "LONG_PUT" || rec === "BEAR_PUT_SPREAD" ? "text-red-400"
    : "text-amber-300";

  const counts = result.contractPriceDiagnostics ?? {
    requestedKeys: 0, coveredKeys: 0, liveKeys: 0, agingKeys: 0,
    staleKeys: 0, unavailableKeys: 0, mismatchedKeys: 0, eligibleKeys: 0,
  };

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
      {/* Index header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-lg text-zinc-100">{result.underlying}</h3>
        <div className="flex flex-wrap gap-1.5">
          <span className={`${tw.pill("zinc")} ${statusColor} !border-current`}>
            {rec === "NO_TRADE" ? "NO TRADE" : rec.replace("_", " ")}
          </span>
          {rec !== "NO_TRADE" && eligibility === "ACTIONABLE_CANDIDATE_PRESENT" && (
            <span className={tw.pill("sky")}>CANDIDATE PRESENT</span>
          )}
          {rec === "BULL_CALL_SPREAD" || rec === "BEAR_PUT_SPREAD" ? (
            <span className={tw.pill("purple")} title="Dynamic Volatility Switcher: Elevated IV triggers debit spread preference to avoid IV crush">
              HIGH IV SPREAD MODE
            </span>
          ) : rec === "LONG_CALL" || rec === "LONG_PUT" ? (
            <span className={tw.pill("teal")} title="Dynamic Volatility Switcher: Low-to-moderate IV favors directional naked options">
              LOW IV NAKED MODE
            </span>
          ) : null}
          {result.isZeroDte && (
            <span className={tw.pill("amber")} title="0-DTE Expiry Day: Strict ATM/ITM selection and aggressive theta management enforced">
              0-DTE EXPIRY DAY
            </span>
          )}
          {result.afternoonThetaGuard && (
            <span className={tw.pill("red")} title="Afternoon Theta Guard: Rapid time decay active post-12:00 IST">
              THETA GUARD ACTIVE
            </span>
          )}
          {result.eventRiskPenalty > 0 && (
            <span className={tw.pill("amber")} title={result.eventRiskReason ? `Event risk: ${result.eventRiskReason}` : "Score deducted for elevated event risk (MEDIUM −5 / HIGH −12 / EXTREME −20)"}>
              −{result.eventRiskPenalty} pts event risk{result.eventRiskReason ? ` · ${result.eventRiskReason}` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Market context */}
      <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4 mb-3">
        <Kv label="Direction" value={result.marketDirection} />
        <Kv label="Regime" value={result.marketRegime} />
        <Kv label="Spot" value={fmt(result.spot)} />
        <Kv label="ATM" value={fmt(result.atmStrike)} />
        <Kv
          label="Support"
          value={
            result.support != null
              ? `${fmt(result.support)}${result.spot != null ? ` (${result.spot >= result.support ? `-${Math.round(result.spot - result.support)}` : `+${Math.round(result.support - result.spot)}`} pts)` : ""}`
              : "—"
          }
        />
        <Kv
          label="Resistance"
          value={
            result.resistance != null
              ? `${fmt(result.resistance)}${result.spot != null ? ` (${result.resistance >= result.spot ? `+${Math.round(result.resistance - result.spot)}` : `-${Math.round(result.spot - result.resistance)}`} pts)` : ""}`
              : "—"
          }
        />
        {result.pcrOi != null && <Kv label="PCR OI" value={result.pcrOi.toFixed(3)} />}
        {result.lotSize != null && <Kv label="Lot size" value={`${result.lotSize} units`} />}
      </div>

      {/* Data quality row */}
      <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
        <p className="text-[11px] font-semibold text-zinc-400 mb-1.5">Data quality</p>
        <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-3">
          {Object.entries(result.dataQuality).map(([k, v]) => {
            const label = k === "market" ? "Underlying market" : k === "optionChain" ? "Option chain" : k;
            const cls = dqColor(v);
            return (
              <div key={k} className="rounded bg-zinc-900 px-1.5 py-1">
                <div className="text-zinc-500">{label}</div>
                <div className={`mt-0.5 font-mono text-[11px] ${cls}`}>{v}</div>
              </div>
            );
          })}
          <div className="rounded bg-zinc-900 px-1.5 py-1">
            <div className="text-zinc-500">Full-chain analytics</div>
            <div className={`mt-0.5 font-mono text-[11px] ${result.chainAnalyticsQuality === "CHAIN_ANALYTICS_VERIFIED_BOUNDED" ? "text-teal-400" : "text-amber-300"}`}>
              {result.chainAnalyticsQuality ?? "CHAIN_ANALYTICS_UNVERIFIED"}
            </div>
          </div>
          <div className="rounded bg-zinc-900 px-1.5 py-1">
            <div className="text-zinc-500">Individual contract prices</div>
            <div className={`mt-0.5 font-mono text-[11px] ${result.optionPriceQuality === "CONTRACT_PRICE_LIVE" ? "text-emerald-400" : result.optionPriceQuality === "CONTRACT_PRICE_UNAVAILABLE" ? "text-zinc-500" : "text-amber-300"}`}>
              {result.optionPriceQuality ?? "CONTRACT_PRICE_UNAVAILABLE"}
            </div>
          </div>
          <div className="rounded bg-zinc-900 px-1.5 py-1">
            <div className="text-zinc-500">Candidate eligibility</div>
            <div className={`mt-0.5 font-mono text-[11px] ${eligibility === "ACTIONABLE_CANDIDATE_PRESENT" ? "text-sky-400" : "text-zinc-500"}`}>
              {eligibility ?? "NO_CANDIDATES"}
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-600">
          Coverage: {counts.coveredKeys}/{counts.requestedKeys} · {counts.liveKeys} LIVE · {counts.agingKeys} AGING · {counts.staleKeys} STALE · {counts.unavailableKeys} UNAVAILABLE · {counts.mismatchedKeys} MISMATCHED
          {" · "}contractsEvaluated: {result.contractsEvaluated} · contractsRejected: {result.contractsRejected}
        </p>
        <p className="mt-0.5 text-[10px] text-zinc-600">
          OI/volume are bounded REST analytics, not an atomic or exchange-synchronised snapshot. Option chain source STALE = /v2/option/chain carries no LTT (provider limitation); per-contract V3 LTT verified independently.
        </p>
        <p className="mt-0.5 text-[10px] text-amber-500/70">
          Options Data Audit INSUFFICIENT status is a separate collection process (≥5 live sessions needed). It does not mean this candidate failed live eligibility.
        </p>
      </div>

      {/* News diagnostics */}
      {result.newsDiagnostic && <NewsPanel nd={result.newsDiagnostic} />}

      {/* NO TRADE notice */}
      {rec === "NO_TRADE" && result.noOpportunityReason && (
        <div className="mb-3 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
          <span className="font-semibold">NO TRADE — </span>{result.noOpportunityReason}
        </div>
      )}

      {/* LONG CALL candidates */}
      {calls.length > 0 && (
        <SubSection title={`LONG CALL (CE) — ${calls.length} candidate${calls.length > 1 ? "s" : ""}`} tone="text-green-400">
          <div className="grid gap-3 md:grid-cols-2">
            {calls.map((c, i) => (
              <OptionRecCard
                key={`${c.instrumentKey ?? c.underlying}-${c.expiry ?? ""}-${c.strike}-${c.optionType}-${c.strategyType}-${i}`}
                contract={c}
                snapshotSource={result.source}
                lotSize={result.lotSize}
                rank={i + 1}
                daysLeft={daysTo(c.expiry, now)}
              />
            ))}
          </div>
        </SubSection>
      )}

      {/* LONG PUT candidates */}
      {puts.length > 0 && (
        <SubSection title={`LONG PUT (PE) — ${puts.length} candidate${puts.length > 1 ? "s" : ""}`} tone="text-red-400">
          <div className="grid gap-3 md:grid-cols-2">
            {puts.map((c, i) => (
              <OptionRecCard
                key={`${c.instrumentKey ?? c.underlying}-${c.expiry ?? ""}-${c.strike}-${c.optionType}-${c.strategyType}-${i}`}
                contract={c}
                snapshotSource={result.source}
                lotSize={result.lotSize}
                rank={i + 1}
                daysLeft={daysTo(c.expiry, now)}
              />
            ))}
          </div>
        </SubSection>
      )}

      {calls.length === 0 && puts.length === 0 && rec === "NO_TRADE" && (
        <Empty msg="No candidates passed quality gates for this index." reason={result.noOpportunityReason} />
      )}
    </div>
  );
}

// ── Rejected options section ──────────────────────────────────────────────────

function RejectedOptionRow({ item }: { item: RejectedContract }) {
  return (
    <div className="flex items-center justify-between rounded bg-zinc-950/60 px-2 py-1.5 text-xs">
      <span className="font-mono text-zinc-400">{item.strike} {item.optionType}</span>
      <span className="text-red-400 text-[11px]">{item.reason}</span>
    </div>
  );
}

// ── Outcomes ──────────────────────────────────────────────────────────────────

const outcomeIcon: Record<string, string> = {
  OPEN: "●", TARGET1_HIT: "T1", TARGET2_HIT: "T2", STOP_HIT: "SL", EXPIRED: "EX", INVALIDATED: "IV",
};

function OutcomeRow({ r }: { r: OpportunityRecord }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="w-7 text-center text-xs font-bold text-zinc-500">{outcomeIcon[r.outcome] ?? "?"}</span>
        <div>
          <span className="font-medium text-zinc-200">{r.underlying}</span>
          {r.strike && <span className="ml-1.5 text-xs text-zinc-500">{r.strike} {r.optionType}</span>}
          {r.symbol && <span className="ml-1.5 text-xs text-zinc-500">{r.symbol}</span>}
        </div>
        {r.grade && <GradeChip grade={r.grade as OpportunityGrade} />}
      </div>
      <div className="text-right text-xs text-zinc-400">
        <div>R:R {r.rr}</div>
        <div>{new Date(r.trackedAt).toLocaleDateString("en-IN")}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function OpportunitiesPage() {
  const result = await loadData();
  const outcomes: OpportunityRecord[] = listOpportunityRecords().slice(0, 5);

  if ("error" in result) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-2xl font-bold text-zinc-100">Opportunities</h1>
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 text-red-300">
          Failed to load: {result.error}
        </div>
      </div>
    );
  }

  const { indexOptions: rawIndexOptions, failedIndices, intradayResult, swingResult, ltResult, now } = result;
  // Primary indices sort first; others follow in declaration order
  const isPrimary = (o: OptionsOpportunityResult) => o.underlying === "NIFTY" || o.underlying === "BANKNIFTY";
  const indexOptions = [...rawIndexOptions].sort((a, b) => (isPrimary(a) ? 0 : 1) - (isPrimary(b) ? 0 : 1));

  // REJECT candidates remain available in the diagnostics section, but must never be
  // presented in the primary recommendation lanes.
  const actionableStocks = (stocks: StockOpportunity[]) => stocks.filter((s) => s.grade !== "REJECT");
  const intradayEligible = actionableStocks(intradayResult.topOpportunities);
  const swingEligible = actionableStocks(swingResult.topOpportunities);
  const intradayLong = intradayEligible.filter((s) => s.direction === "BULLISH");
  const intradayShort = intradayEligible.filter((s) => s.direction === "BEARISH");
  const swingLong = swingEligible.filter((s) => s.direction === "BULLISH");
  const swingShort = swingEligible.filter((s) => s.direction === "BEARISH");

  const recommendationCandidates: RecommendationCandidate<BestDisplay>[] = [
    ...indexOptions.flatMap((result) => result.topOpportunities.map((item) => {
      const tradeAt = item.lastTradeTime ? Date.parse(item.lastTradeTime) : NaN;
      return {
        engine: "OPTIONS" as const,
        grade: item.grade,
        score: item.opportunityScore,
        netRewardToRisk: item.estimatedValues?.netRewardToRisk ?? null,
        item: {
          label: `${item.underlying} ${item.strike} ${item.optionType}`,
          strategy: item.strategyType,
          horizon: item.expiry ? `Expires ${item.expiry}` : "Intraday options",
          entry: item.entry, stop: item.stop, target1: item.target1, target2: item.target2,
          grossRr: item.rr,
          netRr: item.estimatedValues?.netRewardToRisk ?? null,
          dataAgeSeconds: Number.isFinite(tradeAt) ? Math.max(0, (now.getTime() - tradeAt) / 1000) : null,
          invalidation: item.invalidation,
          executablePrice: item.executablePricing ? fmt(item.executablePricing.entryPrice) : "Unavailable",
        },
      };
    })),
    ...intradayResult.topOpportunities.map((item) => ({
      engine: "STOCK_INTRADAY" as const,
      grade: item.grade,
      score: item.opportunityScore,
      netRewardToRisk: null,
      item: {
        label: item.symbol, strategy: item.setup, horizon: "Intraday · exit by session close",
        entry: item.entry, stop: item.stop, target1: item.target1, target2: item.target2,
        grossRr: item.rr, netRr: null, dataAgeSeconds: item.dataAgeSeconds ?? null,
        invalidation: item.invalidation,
        executablePrice: "Unavailable — use live bid/ask before manual entry",
      },
    })),
  ];


  const scannedAt = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  return (
    <div className="mx-auto max-w-[90rem] space-y-8">

      {/* Header */}
      <div className="app-surface flex flex-wrap items-end justify-between gap-4 rounded-2xl p-5 sm:p-6">
        <div>
          <p className="app-kicker">Unified recommendation review</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-100 sm:text-3xl">Opportunities</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Opportunity Engine v20.2 · read-only · no real orders · scanned {scannedAt} IST
          </p>
          {/* G5: one data-source label for everything on this page. MOCK, MIXED, UNAVAILABLE and LIVE are shown as they are. */}
          <p className="mt-1 text-xs font-mono text-zinc-400">
            Data source (options): {summarizeSources(indexOptions.map((o) => o.source))} · stock scans: {summarizeSources([intradayResult.source, swingResult.source])}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefreshControl />
          <nav className="flex flex-wrap gap-2 text-xs" aria-label="Jump to section">
            {[["#sec-stocks", "Stocks"], ["#sec-options", "Options"], ["#sec-rejected", "Rejected"]].map(([href, label]) => (
              <a key={href} href={href} className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-zinc-300 hover:bg-zinc-700">{label}</a>
            ))}
          </nav>
        </div>
      </div>

      <SafetyNotice />

      <BestAvailableNow candidates={recommendationCandidates} />

      <EngineGovernanceBanner />

      <DecisionFunnel
        options={indexOptions}
        stockScans={[
          { label: "Intraday stocks", result: intradayResult },
          { label: "Swing stocks", result: swingResult },
        ]}
      />

      {failedIndices.map((f) => (
        <p key={f} className="text-xs text-red-400">Could not load {f}</p>
      ))}

      {/* ── A. STOCK RECOMMENDATIONS ───────────────────────────────────── */}
      <Section id="sec-stocks" title="A. Stock Recommendations" tone="text-zinc-100">

        <SubSection title="Intraday Stocks" tone="text-zinc-300">
          <p className="mb-2 text-xs text-zinc-500">
            {intradayResult.stocksScanned} scanned ({intradayResult.universe}) · {intradayResult.stocksAvailable} with data · {intradayEligible.length} eligible · {intradayResult.topOpportunities.length - intradayEligible.length} rejected in top results · freshness: {intradayResult.freshness}
          </p>
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={tw.pill("green")}>LIVE SCANNER</span>
              <span className={tw.pill("sky")}>PAPER TRACKING</span>
              <span className="font-semibold text-zinc-200">Strategy v1 — Intraday Momentum</span>
            </div>
            <p className="text-zinc-300">
              Live multi-factor scanning: 20-day high/low breakout, relative strength vs NIFTY index, day range position, and volume expansion.
            </p>
            <p className="mt-1 text-zinc-500 text-[11px]">
              Forward paper evaluation active (<strong className="text-zinc-400">intraday-eval-1</strong>) · Manual review only · Historical replay reference: <span className="font-mono text-zinc-400">PF 0.69 / negative after trading costs</span>.
            </p>
          </div>

          <SectorMatrixWidget matrix={intradayResult.sectorMatrix} />

          {intradayLong.length > 0 || intradayShort.length > 0 ? (
            <>
              {intradayLong.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-green-400">LONG — {intradayLong.length} stock{intradayLong.length > 1 ? "s" : ""}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {intradayLong.map((s, i) => <StockCard key={`${s.symbol}-${i}`} stock={s} rank={i + 1} horizon="INTRADAY" />)}
                  </div>
                </div>
              )}
              {intradayShort.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-red-400">SHORT — {intradayShort.length} stock{intradayShort.length > 1 ? "s" : ""}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {intradayShort.map((s, i) => <StockCard key={`${s.symbol}-${i}`} stock={s} rank={i + 1} horizon="INTRADAY" />)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Empty msg="No eligible intraday stock candidates right now." reason={intradayResult.noOpportunityReason ?? (intradayResult.topOpportunities.length > 0 ? "The highest-scoring candidates failed mandatory grade or data-quality gates. See Rejected & No-Trade Details." : null)} />
          )}
        </SubSection>

        <SubSection title="Swing Stocks" tone="text-zinc-300">
          {swingLong.length > 0 || swingShort.length > 0 ? (
            <>
              {swingLong.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-green-400">LONG — {swingLong.length} stock{swingLong.length > 1 ? "s" : ""}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {swingLong.map((s, i) => <StockCard key={`${s.symbol}-${i}`} stock={s} rank={i + 1} horizon="SWING" />)}
                  </div>
                </div>
              )}
              {swingShort.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-red-400">SHORT — {swingShort.length} stock{swingShort.length > 1 ? "s" : ""}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {swingShort.map((s, i) => <StockCard key={`${s.symbol}-${i}`} stock={s} rank={i + 1} horizon="SWING" />)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Empty msg="No eligible swing stock candidates right now." reason={swingResult.noOpportunityReason ?? (swingResult.topOpportunities.length > 0 ? "The highest-scoring candidates are observation-only or rejected. See Rejected & No-Trade Details." : null)} />
          )}
        </SubSection>

        <SubSection title="Positional Stocks (retired)" tone="text-zinc-300">
          <p className="mb-2 rounded bg-red-900/20 border border-red-700/30 px-2 py-1.5 text-xs text-red-300">
            {POSITIONAL_RETIRED_NOTE}
          </p>
        </SubSection>

        <SubSection title="Long-Term Stocks (hold months+)" tone="text-zinc-300">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs">
            <span className="text-emerald-300 font-medium">
              Daily Fundamental Scoring · Moat, Capital Efficiency (ROCE/ROE) &amp; Solvency · Cached 24h (Static across 15-min Intraday Refreshes)
            </span>
            <span className="font-mono text-zinc-400 text-[11px]">
              Universe: {ltResult.universe}
            </span>
          </div>

          {ltResult.topOpportunities.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {ltResult.topOpportunities.map((stock, i) => (
                <LongTermStockCard key={stock.symbol} stock={stock} rank={i + 1} />
              ))}
            </div>
          ) : (
            <Empty
              msg={ltResult.fundamentalDataAvailable
                ? ltResult.dataAvailabilityMessage
                : "Not available: long-term picks need company fundamentals (profit, debt, growth), not connected yet."}
              reason={ltResult.fundamentalDataAvailable ? null : ltResult.dataAvailabilityMessage}
            />
          )}
        </SubSection>
      </Section>

      {/* ── B. OPTIONS RECOMMENDATIONS ────────────────────────────────── */}
      <Section id="sec-options" title="B. Options Recommendations" tone="text-zinc-100">
        <SafetyNotice />
        <div className="mt-2 mb-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={tw.pill("zinc")}>HOLDING HORIZON: INTRADAY TACTICAL</span>
            <span className="font-semibold text-zinc-200">2–4 Hour Horizon (Exit before 15:15 IST)</span>
          </div>
          <p className="text-zinc-400">
            Option targets and stops are calibrated to intraday delta expansion and expected session moves. They are <strong>NOT overnight expiry holds</strong>. Exit on Target/Stop hit or square off before the close of the trading session.
          </p>
        </div>
        <p className="mt-1 mb-4 text-xs text-zinc-500">
          Separated by index · CE = LONG CALL (bullish) · PE = LONG PUT (bearish) ·
          Grade A/B = strong/tradable · C = watch-only · REJECT = failed gates ·
          R:R, entry, stop, targets are engine outputs — not recomputed here.
        </p>
        <div className="space-y-6">
          {indexOptions.map((o) => (
            <OptionsIndexSection key={o.underlying} result={o} now={now} />
          ))}
          {indexOptions.length === 0 && (
            <Empty msg="No index options data loaded." />
          )}
        </div>
      </Section>

      {/* ── C. REJECTED / NO TRADE ────────────────────────────────────── */}
      <Section id="sec-rejected" title="C. Rejected &amp; No-Trade Details" tone="text-zinc-100">
        <p className="mb-4 text-xs text-zinc-500">
          Exact rejection reasons per contract and per index. Rejected contracts are excluded from recommendation sections above.
        </p>

        {indexOptions.map((o) => {
          const rej = o.rejectedContracts;
          if (rej.length === 0 && o.recommendedStrategy !== "NO_TRADE") return null;
          return (
            <div key={o.underlying} className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h3 className="font-bold text-zinc-200">{o.underlying}</h3>
                {o.recommendedStrategy === "NO_TRADE" && (
                  <span className={tw.pill("amber")}>NO TRADE</span>
                )}
                <span className="text-xs text-zinc-500">{rej.length} contract{rej.length !== 1 ? "s" : ""} rejected</span>
              </div>
              {o.noOpportunityReason && (
                <p className="mb-2 text-xs text-amber-300">Reason: {o.noOpportunityReason}</p>
              )}
              {rej.length > 0 && (
                <div className="space-y-1" data-testid="candidate-rejection-reasons">
                  {rej.map((item, idx) => <RejectedOptionRow key={`${item.strike}-${item.optionType}-${idx}`} item={item} />)}
                </div>
              )}
            </div>
          );
        })}

        {/* Rejected stocks (grade reasons) */}
        {(() => {
          const rejStocks = [
            ...intradayResult.topOpportunities.filter((s) => s.grade === "REJECT"),
            ...swingResult.topOpportunities.filter((s) => s.grade === "REJECT"),
          ];
          if (rejStocks.length === 0) return null;
          return (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h3 className="font-bold text-zinc-200 mb-3">Stocks — REJECT grade ({rejStocks.length})</h3>
              <div className="space-y-1">
                {rejStocks.map((s, idx) => (
                  <div key={`${s.symbol}-${idx}`} className="flex items-start gap-3 rounded bg-zinc-950/50 px-2 py-1.5 text-xs">
                    <span className="font-mono text-zinc-400 w-20 shrink-0">{s.symbol}</span>
                    <span className="text-red-400">{s.gradeReasons?.join(" · ") ?? "REJECT"}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Section>

      {/* Recent tracked outcomes */}
      {outcomes.length > 0 && (
        <Section id="sec-tracked" title="Recent Tracked Outcomes">
          <div className="space-y-2">
            {outcomes.map((r) => <OutcomeRow key={r.id} r={r} />)}
          </div>
        </Section>
      )}

      {/* Glossary */}
      <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-zinc-300">Glossary</summary>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs text-zinc-400 sm:grid-cols-[12rem_1fr]">
          <dt className="font-semibold text-zinc-300">LONG (stock)</dt><dd>Expect the stock to rise. Buy now, sell higher.</dd>
          <dt className="font-semibold text-zinc-300">SHORT (stock)</dt><dd>Expect the stock to fall. Intraday only for stocks.</dd>
          <dt className="font-semibold text-zinc-300">LONG CALL / CE</dt><dd>Buy a call option. Gains when the index goes UP. Grade A = strongest engine case for the trade.</dd>
          <dt className="font-semibold text-zinc-300">LONG PUT / PE</dt><dd>Buy a put option. Gains when the index goes DOWN.</dd>
          <dt className="font-semibold text-zinc-300">Entry / Stop / T1 / T2</dt><dd>Entry price / stop-loss / target 1 / target 2 (from engine — not adjusted here).</dd>
          <dt className="font-semibold text-zinc-300">R:R</dt><dd>Reward vs risk. 2x = aim to make ₹2 per ₹1 risked.</dd>
          <dt className="font-semibold text-zinc-300">Grade A+ / A</dt><dd>Strong signal. Passes all data quality and pricing gates.</dd>
          <dt className="font-semibold text-zinc-300">Grade B</dt><dd>Tradable signal. Meets minimum thresholds.</dd>
          <dt className="font-semibold text-zinc-300">Grade C</dt><dd>Watch-only. Usually wide spread or borderline score.</dd>
          <dt className="font-semibold text-zinc-300">REJECT</dt><dd>Failed a mandatory gate (mismatch, stale price, low OI, etc.).</dd>
          <dt className="font-semibold text-zinc-300">IV provenance</dt><dd>INDEPENDENTLY_DERIVED = computed fresh from V3 LTP via Black-Scholes. VENDOR_REPORTED = unverified chain value.</dd>
          <dt className="font-semibold text-zinc-300">Exchange LTT</dt><dd>Last trade time reported by the exchange for that specific contract.</dd>
          <dt className="font-semibold text-zinc-300">Options Data Audit</dt><dd>A separate 5-session collection process. INSUFFICIENT = not enough sessions yet — it does NOT mean the live candidate failed today.</dd>
        </dl>
      </details>
    </div>
  );
}
