"use client";
// Phase 11.3 — Recommendation Journal UI: table + filters + analytics + detail modal.
import React, { useCallback, useEffect, useState } from "react";
import type { RecommendationJournalEntry } from "@/lib/journalTypes";
import type { JournalAnalytics } from "@/lib/journalOutcome";

// ── Badge ──────────────────────────────────────────────────────────────────────

type Tone = "bull" | "bear" | "warn" | "neutral" | "muted";
function Badge({ children, tone }: { children: React.ReactNode; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    bull: "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
    bear: "bg-red-900/40 text-red-300 border-red-700/40",
    warn: "bg-amber-900/40 text-amber-300 border-amber-700/40",
    neutral: "bg-zinc-800 text-zinc-300 border-zinc-700/40",
    muted: "bg-zinc-900 text-zinc-500 border-zinc-800",
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[tone ?? "neutral"]}`}>
      {children}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "", suffix = ""): string {
  if (n === null || n === undefined) return "—";
  return `${prefix}${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${suffix}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function decisionTone(d: string): Tone {
  if (d === "TRADE") return "bull";
  if (d === "WAIT") return "warn";
  return "muted";
}

function statusTone(s: string): Tone {
  if (s === "TARGET_2_HIT" || s === "TARGET_1_HIT") return "bull";
  if (s === "STOPPED_OUT") return "bear";
  if (s === "MONITORING") return "warn";
  if (s === "EXPIRED") return "neutral";
  return "muted";
}

// ── Filters ────────────────────────────────────────────────────────────────────

interface Filters {
  underlying: "all" | "NIFTY" | "BANKNIFTY";
  decision: "all" | "TRADE" | "WAIT" | "NO_TRADE";
  status: "all" | "MONITORING" | "TARGET_1_HIT" | "TARGET_2_HIT" | "STOPPED_OUT" | "EXPIRED" | "NOT_EXECUTABLE";
  days: 1 | 7 | 30 | 0;
}

function applyFilters(entries: RecommendationJournalEntry[], f: Filters): RecommendationJournalEntry[] {
  return entries.filter((e) => {
    if (f.underlying !== "all" && e.snapshot.underlying !== f.underlying) return false;
    if (f.decision !== "all" && e.snapshot.decision !== f.decision) return false;
    if (f.status !== "all" && e.status !== f.status) return false;
    if (f.days > 0) {
      const cutoff = Date.now() - f.days * 86_400_000;
      if (Date.parse(e.createdAt) < cutoff) return false;
    }
    return true;
  });
}

// ── Detail Modal ───────────────────────────────────────────────────────────────

function DetailModal({ entry, onClose }: { entry: RecommendationJournalEntry; onClose: () => void }) {
  const r = entry.snapshot;
  const ex = r.execution;
  const o = entry.outcome;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-sm text-zinc-200" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-100">Recommendation Detail</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>

        <div className="mb-3 space-y-1 text-xs text-zinc-400">
          <div>{fmtDate(r.generatedAt)} IST</div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={decisionTone(r.decision)}>{r.decision}</Badge>
            <Badge tone={r.direction === "BULLISH" ? "bull" : r.direction === "BEARISH" ? "bear" : "neutral"}>{r.direction}</Badge>
            <Badge tone="neutral">{r.underlying}</Badge>
          </div>
        </div>

        {r.contract && (
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-1 font-mono text-sm font-semibold">{r.contract.displaySymbol ?? r.contract.symbol}</div>
            <div className="text-xs text-zinc-500">{r.contract.instrumentKey ?? "No canonical key"}</div>
          </div>
        )}

        {ex && (
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
            {[["Entry", fmt(ex.entry, "₹")], ["Stop Loss", fmt(ex.stopLoss, "₹")], ["Target 1", fmt(ex.target1, "₹")], ["Target 2", fmt(ex.target2, "₹")], ["Quantity", String(ex.quantity)], ["Lots", String(ex.lots)], ["Capital Required", fmt(ex.capitalRequired, "₹")], ["Planned Risk", fmt(ex.plannedRisk, "₹")], ["R:R T1", `1:${ex.rrTarget1}`], ["R:R T2", `1:${ex.rrTarget2}`]].map(([label, value]) => (
              <div key={label} className="rounded border border-zinc-800 bg-zinc-950 p-2">
                <div className="text-zinc-500">{label}</div>
                <div className="font-mono font-semibold text-zinc-200">{value}</div>
              </div>
            ))}
          </div>
        )}

        {r.decision === "WAIT" && (
          <div className="mb-4 rounded-lg border border-amber-700/30 bg-amber-900/10 p-3 text-xs">
            <div className="mb-1 font-semibold text-amber-300">WAIT — Not Executable</div>
            <div className="text-zinc-400">Regime: {r.market.regime}</div>
            <div className="text-zinc-400">Score: {r.score.total}/100</div>
            {r.blockers.length > 0 && <div className="mt-1 text-zinc-500">Blockers: {r.blockers.join("; ")}</div>}
          </div>
        )}

        {o && o.status !== "NOT_EXECUTABLE" && (
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
            <div className="mb-2 font-semibold text-zinc-200">Outcome</div>
            <div className="grid grid-cols-2 gap-2">
              {[["Status", o.status.replace(/_/g, " ")], ["Exit Price", fmt(o.exitPrice, "₹")], ["P&L", fmt(o.pnl, "₹")], ["R-Multiple", o.rMultiple !== null ? `${o.rMultiple > 0 ? "+" : ""}${o.rMultiple}R` : "—"], ["MFE", fmt(o.mfe, "+₹")], ["MAE", fmt(o.mae, "−₹")], ["Duration", o.durationMinutes !== null ? `${o.durationMinutes} min` : "—"], ["Exit Reason", o.exitReason?.replace(/_/g, " ") ?? "—"]].map(([label, value]) => (
                <div key={label} className="rounded border border-zinc-800 bg-zinc-900 p-2">
                  <div className="text-zinc-500">{label}</div>
                  <div className="font-mono font-semibold text-zinc-200">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-zinc-500">
          <div>Score: {r.score.total}/100 · Confidence: {r.confidence}% · Source: {r.source}</div>
          {entry.paperTradeId && <div className="mt-1">Paper Trade: {entry.paperTradeId}</div>}
        </div>

        {r.whyReasons.length > 0 && (
          <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">
            <div className="mb-1 font-semibold text-zinc-400">Why</div>
            <ul className="space-y-1 text-zinc-500">
              {r.whyReasons.map((reason, i) => <li key={i}>• {reason}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Panel ────────────────────────────────────────────────────────────

function AnalyticsPanel({ analytics }: { analytics: JournalAnalytics }) {
  const a = analytics;
  return (
    <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-300">Journal Summary</h3>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ["TRADE", a.totalTrade],
          ["WAIT", a.totalWait],
          ["NO TRADE", a.totalNoTrade],
          ["Wins", a.wins],
          ["Losses", a.losses],
          ["Win Rate", fmt(a.winRate, "", "%")],
          ["Net P&L", fmt(a.netPnl, "₹")],
          ["Avg R", fmt(a.avgR, "", "R")],
          ["Profit Factor", fmt(a.profitFactor)],
          ["Avg MFE", fmt(a.avgMfe, "+₹")],
          ["Avg MAE", fmt(a.avgMae, "−₹")],
          ["T1 Hit Rate", fmt(a.target1HitRate, "", "%")],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-zinc-800 bg-zinc-950 p-2">
            <div className="text-zinc-500">{label}</div>
            <div className="font-mono font-semibold text-zinc-200">{value}</div>
          </div>
        ))}
      </div>

      {Object.keys(a.byStrategy).length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-zinc-400">By Strategy</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="pb-1 pr-3">Strategy</th>
                  <th className="pb-1 pr-3">Trades</th>
                  <th className="pb-1 pr-3">Wins</th>
                  <th className="pb-1 pr-3">Losses</th>
                  <th className="pb-1 pr-3">Net P&L</th>
                  <th className="pb-1">Avg R</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(a.byStrategy).map(([strat, s]) => (
                  <tr key={strat} className="border-t border-zinc-800/40">
                    <td className="py-1 pr-3 text-zinc-300">{strat}</td>
                    <td className="py-1 pr-3">{s.trades}</td>
                    <td className="py-1 pr-3 text-emerald-400">{s.wins}</td>
                    <td className="py-1 pr-3 text-red-400">{s.losses}</td>
                    <td className={`py-1 pr-3 font-mono ${s.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(s.netPnl, "₹")}</td>
                    <td className="py-1 font-mono">{fmt(s.avgR, "", "R")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Journal Component ─────────────────────────────────────────────────────

export function RecommendationJournal() {
  const [entries, setEntries] = useState<RecommendationJournalEntry[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RecommendationJournalEntry | null>(null);
  const [filters, setFilters] = useState<Filters>({ underlying: "all", decision: "all", status: "all", days: 7 });
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, analyticsRes] = await Promise.all([
        fetch("/api/recommendations"),
        fetch("/api/recommendations/analytics"),
      ]);
      if (entriesRes.ok) setEntries(await entriesRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshEntry = async (id: string) => {
    setRefreshing(id);
    try {
      const res = await fetch(`/api/recommendations/${id}/refresh`, { method: "POST" });
      if (res.ok) {
        const updated: RecommendationJournalEntry = await res.json();
        setEntries((prev) => prev.map((e) => e.id === id ? updated : e));
      }
    } finally {
      setRefreshing(null);
    }
  };

  const filtered = applyFilters(entries, filters);

  const FilterBtn = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={`rounded border px-2 py-0.5 text-xs transition ${active ? "border-blue-600 bg-blue-900/30 text-blue-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>{label}</button>
  );

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-200">Recommendation Journal</h2>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40">
            {loading ? "Loading…" : "Refresh Journal"}
          </button>
          <a href="/api/recommendations/export" download className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200">
            Export CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Underlying:</span>
          {(["all", "NIFTY", "BANKNIFTY"] as const).map((v) => <FilterBtn key={v} label={v === "all" ? "All" : v} active={filters.underlying === v} onClick={() => setFilters((f) => ({ ...f, underlying: v }))} />)}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Decision:</span>
          {(["all", "TRADE", "WAIT", "NO_TRADE"] as const).map((v) => <FilterBtn key={v} label={v === "all" ? "All" : v.replace("_", " ")} active={filters.decision === v} onClick={() => setFilters((f) => ({ ...f, decision: v }))} />)}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Days:</span>
          {([1, 7, 30, 0] as const).map((v) => <FilterBtn key={v} label={v === 0 ? "All Time" : v === 1 ? "Today" : `${v}d`} active={filters.days === v} onClick={() => setFilters((f) => ({ ...f, days: v }))} />)}
        </div>
      </div>

      {analytics && <AnalyticsPanel analytics={analytics} />}

      {filtered.length === 0 && !loading && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
          No recommendations found. Click &ldquo;Generate Recommendation&rdquo; to create one.
        </div>
      )}

      {/* Table — desktop */}
      {filtered.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 md:block">
          <table className="w-full text-xs">
            <thead className="border-b border-zinc-800 text-zinc-500">
              <tr>
                {["Date/Time", "Underlying", "Decision", "Direction", "Strategy", "Contract", "Entry", "SL", "T1", "T2", "Score", "Status", "P&L", "R", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const r = e.snapshot;
                const ex = r.execution;
                const o = e.outcome;
                return (
                  <tr key={e.id} className="cursor-pointer border-t border-zinc-800/40 hover:bg-zinc-800/30" onClick={() => setSelected(e)}>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{fmtDate(r.generatedAt)}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-200">{r.underlying}</td>
                    <td className="px-3 py-2"><Badge tone={decisionTone(r.decision)}>{r.decision}</Badge></td>
                    <td className="px-3 py-2"><Badge tone={r.direction === "BULLISH" ? "bull" : r.direction === "BEARISH" ? "bear" : "neutral"}>{r.direction}</Badge></td>
                    <td className="px-3 py-2 text-zinc-300">{r.strategy}</td>
                    <td className="px-3 py-2 font-mono text-zinc-400">{r.contract ? `${r.contract.strike}${r.contract.optionType}` : "—"}</td>
                    <td className="px-3 py-2 font-mono">{fmt(ex?.entry, "₹")}</td>
                    <td className="px-3 py-2 font-mono text-red-400">{fmt(ex?.stopLoss, "₹")}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400">{fmt(ex?.target1, "₹")}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400">{fmt(ex?.target2, "₹")}</td>
                    <td className="px-3 py-2 text-zinc-300">{r.score.total}</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(e.status)}>{e.status.replace(/_/g, " ")}</Badge></td>
                    <td className={`px-3 py-2 font-mono ${(o?.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(o?.pnl, "₹")}</td>
                    <td className={`px-3 py-2 font-mono ${(o?.rMultiple ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{o?.rMultiple !== null && o?.rMultiple !== undefined ? `${o.rMultiple > 0 ? "+" : ""}${o.rMultiple}R` : "—"}</td>
                    <td className="px-3 py-2">
                      {e.status === "MONITORING" && (
                        <button onClick={(ev) => { ev.stopPropagation(); refreshEntry(e.id); }} disabled={refreshing === e.id} className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-40">
                          {refreshing === e.id ? "…" : "↻"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards — mobile */}
      {filtered.length > 0 && (
        <div className="space-y-3 md:hidden">
          {filtered.map((e) => {
            const r = e.snapshot;
            const ex = r.execution;
            const o = e.outcome;
            return (
              <div key={e.id} className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 p-4" onClick={() => setSelected(e)}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500">{fmtDate(r.generatedAt)}</span>
                  <Badge tone={decisionTone(r.decision)}>{r.decision}</Badge>
                  <Badge tone={r.direction === "BULLISH" ? "bull" : "bear"}>{r.direction}</Badge>
                  <Badge tone={statusTone(e.status)}>{e.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="mb-1 font-semibold text-zinc-200">{r.underlying} · {r.strategy}</div>
                {r.contract && <div className="mb-2 font-mono text-xs text-zinc-400">{r.contract.strike}{r.contract.optionType} · {r.contract.expiry}</div>}
                <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                  {ex && <>
                    <span>E: <span className="font-mono text-zinc-300">{fmt(ex.entry, "₹")}</span></span>
                    <span>SL: <span className="font-mono text-red-400">{fmt(ex.stopLoss, "₹")}</span></span>
                    <span>T1: <span className="font-mono text-emerald-400">{fmt(ex.target1, "₹")}</span></span>
                  </>}
                  {o?.pnl !== null && o?.pnl !== undefined && (
                    <span className={o.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>P&L: {fmt(o.pnl, "₹")}</span>
                  )}
                  {o?.rMultiple !== null && o?.rMultiple !== undefined && (
                    <span className={o.rMultiple >= 0 ? "text-emerald-400" : "text-red-400"}>{o.rMultiple > 0 ? "+" : ""}{o.rMultiple}R</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && <DetailModal entry={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
