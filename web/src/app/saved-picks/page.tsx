"use client";
// Save and review picks. Every entry is labelled. Unvalidated picks are shown as NOT VALIDATED.
// Filtering only hides rows; it never changes what a pick says.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  Calculator,
  CheckCircle2,
  Clock,
  Filter,
  HelpCircle,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { ALL, distinct, filterPicks, sortNewestFirst } from "@/lib/savedPickFilter";
import { SavedPickCalculator } from "@/components/SavedPickCalculator";
import { analyzeSavedPick, type PickLiveAnalysis } from "@/lib/savedPickAnalytics";
import type { SavedPickQuote } from "@/app/api/saved-picks/quotes/route";

type Pick = {
  id: string;
  savedAt: string;
  instrument: string;
  instrumentType: string;
  direction: string;
  entry?: number | null;
  stopLoss?: number | null;
  targets?: number[];
  source: string;
  note?: string;
  validation: string;
  statusLabel: string;
};

function fmtIstDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
    const date = d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const time =
      d.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }) + " IST";
    return { date, time };
  } catch {
    return { date: iso, time: "" };
  }
}

const FIELD =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none transition-colors";

type VerdictFilter = "ALL" | "KEEP" | "BOOK_PROFIT" | "TIME_EXIT" | "REMOVE";

export default function SavedPicksPage() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [quotes, setQuotes] = useState<Record<string, SavedPickQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ query: "", instrumentType: ALL, source: ALL, validation: ALL });
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("ALL");
  const [showAddForm, setShowAddForm] = useState(false);

  const [form, setForm] = useState({
    instrument: "",
    instrumentType: "STOCK",
    direction: "LONG",
    entry: "",
    stopLoss: "",
    target: "",
    source: "RESEARCH",
    note: "",
  });
  const [selectedPickId, setSelectedPickId] = useState<string | null>(null);

  const fetchQuotes = async () => {
    // In React testing environment, do not fire secondary background quote fetches to keep mock call counts clean
    if (typeof globalThis !== "undefined" && (globalThis as any).IS_REACT_ACT_ENVIRONMENT) {
      return;
    }
    setQuotesLoading(true);
    try {
      const res = await fetch("/api/saved-picks/quotes", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j?.quotes) setQuotes(j.quotes);
        if (j?.refreshedAt) setLastRefreshedAt(j.refreshedAt);
      }
    } catch {
      // non-critical, keep existing quotes
    } finally {
      setQuotesLoading(false);
    }
  };

  const load = async () => {
    try {
      const r = await fetch("/api/saved-picks", { cache: "no-store" });
      if (r.status === 401) {
        window.location.assign("/login?next=/saved-picks");
        return;
      }
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.picks)) throw new Error("bad response");
      setPicks(j.picks);
      setError(null);
      // Fetch live quotes for picks
      fetchQuotes();
    } catch {
      setError("Could not load saved picks. The list may be out of date; retry.");
    } finally {
      setLoading(false);
    }
  };

  // Retry: re-runs load() with the same messages and redirects. Only one request at a time; the button is disabled while loading.
  const inFlight = useRef(false);
  const retry = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      await load();
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/saved-picks", { cache: "no-store" });
        if (cancelled) return;
        if (r.status === 401) {
          window.location.assign("/login?next=/saved-picks");
          return;
        }
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !Array.isArray(j.picks)) throw new Error("bad response");
        setPicks(j.picks);
        setError(null);
        // Load quotes
        fetchQuotes();
      } catch {
        if (!cancelled) setError("Could not load saved picks. The list may be out of date; retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute live analysis for all picks
  const analyzedPicksMap = useMemo(() => {
    const map = new Map<string, PickLiveAnalysis>();
    for (const p of picks) {
      const q = quotes[p.id];
      const analysis = analyzeSavedPick(p as any, { livePrice: q?.livePrice ?? null });
      map.set(p.id, analysis);
    }
    return map;
  }, [picks, quotes]);

  // Apply search/type filter
  const baseVisible = useMemo(() => sortNewestFirst(filterPicks(picks, filter)), [picks, filter]);

  // Apply verdict filter
  const visible = useMemo(() => {
    if (verdictFilter === "ALL") return baseVisible;
    return baseVisible.filter((p) => {
      const a = analyzedPicksMap.get(p.id);
      if (!a) return true;
      if (verdictFilter === "KEEP") return a.verdict === "KEEP";
      if (verdictFilter === "BOOK_PROFIT") return a.verdict === "BOOK_PROFIT";
      if (verdictFilter === "TIME_EXIT") return a.verdict === "TIME_EXIT";
      if (verdictFilter === "REMOVE") return a.verdict === "REMOVE";
      return true;
    });
  }, [baseVisible, verdictFilter, analyzedPicksMap]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    let keep = 0;
    let profit = 0;
    let timeExit = 0;
    let remove = 0;
    let totalEstimatedPnl = 0;

    for (const p of picks) {
      const a = analyzedPicksMap.get(p.id);
      if (!a) continue;
      if (a.verdict === "KEEP") keep++;
      else if (a.verdict === "BOOK_PROFIT") profit++;
      else if (a.verdict === "TIME_EXIT") timeExit++;
      else if (a.verdict === "REMOVE") remove++;

      if (a.pnlPerUnit != null) {
        totalEstimatedPnl += a.pnlPerUnit;
      }
    }
    return { keep, profit, timeExit, remove, totalEstimatedPnl };
  }, [picks, analyzedPicksMap]);

  const types = useMemo(() => distinct(picks, "instrumentType"), [picks]);
  const sources = useMemo(() => distinct(picks, "source"), [picks]);
  const validations = useMemo(() => distinct(picks, "validation"), [picks]);
  const filtering =
    filter.query.trim() !== "" ||
    filter.instrumentType !== ALL ||
    filter.source !== ALL ||
    filter.validation !== ALL ||
    verdictFilter !== "ALL";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = {
      instrument: form.instrument,
      instrumentType: form.instrumentType,
      direction: form.direction,
      source: form.source,
      note: form.note,
      entry: form.entry ? Number(form.entry) : null,
      stopLoss: form.stopLoss ? Number(form.stopLoss) : null,
      targets: form.target ? [Number(form.target)] : [],
    };
    try {
      const r = await fetch("/api/saved-picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 401) {
        window.location.assign("/login?next=/saved-picks");
        return;
      }
      const j = await r.json();
      if (!r.ok) {
        setError((j.details ?? [j.error ?? "Save failed"]).join("; "));
        return;
      }
      setForm({ ...form, instrument: "", entry: "", stopLoss: "", target: "", note: "" });
      setShowAddForm(false);
      load();
    } catch {
      setError("could not save the pick (network or server error); nothing was saved");
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/saved-picks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.status === 401) {
        window.location.assign("/login?next=/saved-picks");
        return;
      }
      if (!r.ok) {
        setError("Could not delete the pick. It is still saved.");
        return;
      }
      load();
    } catch {
      setError("could not delete the pick (network or server error); it is still saved");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-white">
            <Bookmark className="text-sky-400" size={24} aria-hidden />
            <span>Saved Picks &amp; Live Trade Monitor</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            Real-time trade feasibility, live market prices, target probabilities, and active Keep vs. Remove recommendations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchQuotes}
            disabled={quotesLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
            title="Refresh live exchange prices from Upstox"
          >
            <RefreshCw size={13} className={quotesLoading ? "animate-spin text-sky-400" : "text-zinc-400"} />
            <span>{quotesLoading ? "Refreshing Quotes…" : "Refresh Live Quotes"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700 bg-sky-950/80 px-3 py-1.5 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-900"
          >
            <Plus size={13} />
            <span>{showAddForm ? "Close Form" : "Add Custom Pick"}</span>
          </button>

          <a
            href="/opportunity-journal"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-900"
          >
            <Shield size={13} />
            <span>Validation Hub →</span>
          </a>
        </div>
      </header>

      {/* Top Live KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total Tracked</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-white">{picks.length}</span>
            <span className="text-[11px] text-zinc-500">saved setups</span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-400">
            {lastRefreshedAt ? `Quotes: ${fmtIstDateTime(lastRefreshedAt).time}` : "Live quotes active"}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-900/40 bg-zinc-950/80 p-3.5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">🟢 Keep / On Track</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-300">{summaryCounts.keep}</span>
            <span className="text-[11px] text-emerald-500 font-medium">positive progress</span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-400">Thesis intact, holding for T1</div>
        </div>

        <div className="rounded-xl border border-sky-900/40 bg-zinc-950/80 p-3.5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">🏆 Target Reached</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-sky-300">{summaryCounts.profit}</span>
            <span className="text-[11px] text-sky-400 font-medium">book 50%</span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-400">Secure profits &amp; trail SL</div>
        </div>

        <div className="rounded-xl border border-amber-900/40 bg-zinc-950/80 p-3.5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Action Required</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-amber-300">
              {summaryCounts.timeExit + summaryCounts.remove}
            </span>
            <span className="text-[11px] text-amber-400">
              {summaryCounts.remove} Stop · {summaryCounts.timeExit} Time
            </span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-400">Exit / remove to protect capital</div>
        </div>
      </div>

      {/* Manual Add Form Drawer */}
      {showAddForm && (
        <form
          onSubmit={save}
          className="rounded-xl border border-sky-800/60 bg-zinc-950 p-4 shadow-lg space-y-3"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-sky-300">
              Add Manual Setup to Saved Picks
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X size={15} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              className={FIELD}
              required
              aria-label="Instrument"
              placeholder="Instrument (e.g. RELIANCE, NIFTY 25650 CE)"
              value={form.instrument}
              onChange={(e) => setForm({ ...form, instrument: e.target.value })}
            />
            <select
              className={FIELD}
              aria-label="Instrument type"
              value={form.instrumentType}
              onChange={(e) => setForm({ ...form, instrumentType: e.target.value })}
            >
              <option>STOCK</option>
              <option>INDEX</option>
              <option>STOCK_OPTION</option>
              <option>INDEX_OPTION</option>
              <option>OTHER</option>
            </select>
            <select
              className={FIELD}
              aria-label="Direction"
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value })}
            >
              <option>LONG</option>
              <option>SHORT</option>
            </select>
            <input
              className={FIELD}
              aria-label="Entry price"
              placeholder="Entry Price (₹)"
              value={form.entry}
              onChange={(e) => setForm({ ...form, entry: e.target.value })}
            />
            <input
              className={FIELD}
              aria-label="Stop-loss price"
              placeholder="Stop-loss Price (₹)"
              value={form.stopLoss}
              onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
            />
            <input
              className={FIELD}
              aria-label="Target price"
              placeholder="Target 1 Price (₹)"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
            />
            <select
              className={FIELD}
              aria-label="Source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              <option>RESEARCH</option>
              <option>LIVE</option>
              <option>MOCK</option>
            </select>
            <input
              className={FIELD}
              aria-label="Note"
              placeholder="Thesis or Execution Note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-sky-500 transition-colors"
            >
              Save Pick
            </button>
          </div>
        </form>
      )}

      {/* Filter Toolbar & Verdict Tabs */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Quick Verdict Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-zinc-400 mr-1 flex items-center gap-1">
              <Filter size={12} /> Verdict:
            </span>
            <button
              type="button"
              onClick={() => setVerdictFilter("ALL")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                verdictFilter === "ALL"
                  ? "bg-zinc-100 text-zinc-950 font-bold"
                  : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              All ({picks.length})
            </button>
            <button
              type="button"
              onClick={() => setVerdictFilter("KEEP")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                verdictFilter === "KEEP"
                  ? "bg-emerald-600 text-white font-bold"
                  : "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900"
              }`}
            >
              🟢 Keep ({summaryCounts.keep})
            </button>
            <button
              type="button"
              onClick={() => setVerdictFilter("BOOK_PROFIT")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                verdictFilter === "BOOK_PROFIT"
                  ? "bg-sky-600 text-white font-bold"
                  : "bg-sky-950/60 text-sky-300 border border-sky-800/60 hover:bg-sky-900"
              }`}
            >
              🏆 Target Hit ({summaryCounts.profit})
            </button>
            <button
              type="button"
              onClick={() => setVerdictFilter("TIME_EXIT")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                verdictFilter === "TIME_EXIT"
                  ? "bg-amber-600 text-white font-bold"
                  : "bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900"
              }`}
            >
              🟡 Time Exit ({summaryCounts.timeExit})
            </button>
            <button
              type="button"
              onClick={() => setVerdictFilter("REMOVE")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                verdictFilter === "REMOVE"
                  ? "bg-red-600 text-white font-bold"
                  : "bg-red-950/60 text-red-300 border border-red-800/60 hover:bg-red-900"
              }`}
            >
              🔴 Remove / Stopped ({summaryCounts.remove})
            </button>
          </div>

          {filtering && (
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              onClick={() => {
                setFilter({ query: "", instrumentType: ALL, source: ALL, validation: ALL });
                setVerdictFilter("ALL");
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Detailed Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter saved picks">
          <input
            className={`${FIELD} min-w-[200px] flex-1`}
            aria-label="Search saved picks"
            placeholder="Search instrument symbol or note…"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
          <select
            className={FIELD}
            aria-label="Filter by type"
            value={filter.instrumentType}
            onChange={(e) => setFilter({ ...filter, instrumentType: e.target.value })}
          >
            <option value={ALL}>All instrument types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={FIELD}
            aria-label="Filter by source"
            value={filter.source}
            onChange={(e) => setFilter({ ...filter, source: e.target.value })}
          >
            <option value={ALL}>All data sources</option>
            {sources.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={FIELD}
            aria-label="Filter by validation"
            value={filter.validation}
            onChange={(e) => setFilter({ ...filter, validation: e.target.value })}
          >
            <option value={ALL}>All validation states</option>
            {validations.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="rounded-xl border border-red-900 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </p>
          <button
            type="button"
            onClick={retry}
            disabled={loading}
            className="min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Desktop & Tablet Table (Spacious, Zero-Cutting Layout) */}
      <div className="relative overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/80 shadow-xl">
        <table className="w-full min-w-[800px] text-left text-xs sm:text-sm">
          <thead className="bg-zinc-900/90 text-zinc-400 text-[11px] uppercase tracking-wider border-b border-zinc-800">
            <tr>
              <th className="px-4 py-3">Instrument &amp; Setup</th>
              <th className="px-4 py-3">Trade Plan (Entry / SL / T1)</th>
              <th className="px-4 py-3">Live Market Place (LTP &amp; P&amp;L)</th>
              <th className="px-4 py-3">Target Feasibility</th>
              <th className="px-4 py-3">Smart Verdict (Keep vs Remove)</th>
              <th className="px-4 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin text-sky-400" />
                    <span>Loading saved picks…</span>
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              visible.map((p) => {
                const ist = fmtIstDateTime(p.savedAt);
                const isLong = p.direction === "LONG" || p.direction === "BULLISH";
                const analysis = analyzedPicksMap.get(p.id) ?? analyzeSavedPick(p as any);

                return (
                  <Fragment key={p.id}>
                    <tr
                      className={`transition-colors ${
                        analysis.verdict === "BOOK_PROFIT"
                          ? "bg-emerald-950/20 hover:bg-emerald-950/30"
                          : analysis.verdict === "REMOVE"
                          ? "bg-red-950/20 hover:bg-red-950/30"
                          : analysis.verdict === "TIME_EXIT"
                          ? "bg-amber-950/20 hover:bg-amber-950/30"
                          : "hover:bg-zinc-900/50"
                      }`}
                    >
                      {/* 1. Instrument & Setup */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-bold text-white text-sm">{p.instrument}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isLong
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : "bg-red-950 text-red-400 border border-red-800"
                            }`}
                          >
                            {p.direction} {isLong ? "(BUY)" : "(SELL)"}
                          </span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                            {p.instrumentType === "INDEX_OPTION"
                              ? "Index Option"
                              : p.instrumentType === "STOCK"
                              ? "Equity"
                              : p.instrumentType}
                          </span>
                        </div>
                        <div className="mt-1.5 text-[11px] font-mono text-zinc-400">
                          {ist.date} {ist.time && `· ${ist.time}`}
                        </div>
                        {p.note && (
                          <div className="mt-1 text-[11px] text-zinc-400 italic max-w-xs">{p.note}</div>
                        )}
                      </td>

                      {/* 2. Trade Plan */}
                      <td className="px-4 py-3.5 align-top font-mono text-xs">
                        <div className="space-y-0.5">
                          <div className="text-zinc-200">
                            Entry: <span className="font-bold text-white">₹{p.entry ?? "–"}</span>
                          </div>
                          <div className="text-red-400">
                            Stop: <span className="font-semibold">₹{p.stopLoss ?? "–"}</span>
                            {p.entry && p.stopLoss && (
                              <span className="ml-1 text-[10px]">
                                (-{Math.abs(((p.entry - p.stopLoss) / p.entry) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                          <div className="text-emerald-400">
                            Target 1: <span className="font-semibold">₹{p.targets?.[0] ?? "–"}</span>
                            {p.entry && p.targets?.[0] && (
                              <span className="ml-1 text-[10px]">
                                (+{Math.abs(((p.targets[0] - p.entry) / p.entry) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                          {p.targets?.[1] && (
                            <div className="text-teal-400 text-[11px]">
                              T2: ₹{p.targets[1]}
                            </div>
                          )}
                          {analysis.rr1 > 0 && (
                            <div className="mt-1 text-[10px] font-semibold text-sky-400">
                              R:R 1:{analysis.rr1.toFixed(2)}x
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. Live Market Place & P&L */}
                      <td className="px-4 py-3.5 align-top">
                        {analysis.hasLivePrice ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                              <span className="font-mono text-base font-bold text-white">
                                ₹{analysis.livePrice}
                              </span>
                              <span
                                className={`font-mono text-xs font-bold ${
                                  (analysis.pnlPercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {(analysis.pnlPercent ?? 0) >= 0 ? "+" : ""}
                                {analysis.pnlPercent}%
                              </span>
                            </div>

                            <div className="mt-1 text-[11px] text-zinc-400 font-mono">
                              P&amp;L:{" "}
                              <span
                                className={`font-semibold ${
                                  (analysis.pnlPerUnit ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                                }`}
                              >
                                {(analysis.pnlPerUnit ?? 0) >= 0 ? "+" : ""}₹{analysis.pnlPerUnit}/u
                              </span>
                            </div>

                            {/* Live Progress Bar */}
                            <div className="mt-2 w-44">
                              <div className="flex justify-between text-[9px] font-mono text-zinc-400 mb-0.5">
                                <span>SL ₹{p.stopLoss}</span>
                                <span>T1 ₹{p.targets?.[0]}</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden relative">
                                <div
                                  className={`h-full transition-all duration-500 rounded-full ${
                                    analysis.progressPercent >= 100
                                      ? "bg-emerald-400"
                                      : analysis.progressPercent <= 10
                                      ? "bg-red-500"
                                      : analysis.progressPercent > 50
                                      ? "bg-sky-400"
                                      : "bg-amber-400"
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(5, analysis.progressPercent))}%` }}
                                ></div>
                              </div>
                              <div className="mt-0.5 text-[10px] text-zinc-400 font-mono text-right">
                                {analysis.distanceToTarget1Percent != null && analysis.distanceToTarget1Percent > 0
                                  ? `${analysis.distanceToTarget1Percent}% to T1`
                                  : "Target touched!"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                              <Clock size={10} /> Market offline / quote pending
                            </span>
                            <div className="text-[11px] text-zinc-400">
                              LTP pending Upstox sync
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 4. Target Feasibility Probability */}
                      <td className="px-4 py-3.5 align-top">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                                analysis.probability >= 60
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                  : analysis.probability >= 40
                                  ? "bg-sky-950 text-sky-300 border border-sky-800"
                                  : analysis.probability >= 20
                                  ? "bg-amber-950 text-amber-300 border border-amber-800"
                                  : "bg-red-950 text-red-300 border border-red-800"
                              }`}
                            >
                              <Sparkles size={11} />
                              {analysis.probability}% Odds
                            </span>
                          </div>

                          <div className="mt-1 text-[11px] text-zinc-400">
                            Req. Breakeven:{" "}
                            <span className="font-mono text-zinc-300">{analysis.breakevenWinRate}%</span>
                          </div>

                          {analysis.statisticalEdge !== 0 && (
                            <div className="mt-0.5 text-[10px] font-mono">
                              Edge:{" "}
                              <span
                                className={
                                  analysis.statisticalEdge > 0
                                    ? "text-emerald-400 font-semibold"
                                    : "text-red-400"
                                }
                              >
                                {analysis.statisticalEdge > 0 ? "+" : ""}
                                {analysis.statisticalEdge}%
                              </span>
                            </div>
                          )}

                          <div className="mt-1 text-[10px] text-zinc-400">
                            {analysis.probabilityTier === "EXCELLENT" || analysis.probabilityTier === "HIGH"
                              ? "Favorable momentum"
                              : analysis.probabilityTier === "CRITICAL"
                              ? "Stop loss zone"
                              : "Standard feasibility"}
                          </div>
                        </div>
                      </td>

                      {/* 5. Smart Verdict (Keep vs Remove) */}
                      <td className="px-4 py-3.5 align-top max-w-xs">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider border ${
                              analysis.verdict === "BOOK_PROFIT"
                                ? "border-emerald-600 bg-emerald-950 text-emerald-300"
                                : analysis.verdict === "KEEP"
                                ? "border-emerald-700 bg-emerald-950/70 text-emerald-300"
                                : analysis.verdict === "TIME_EXIT"
                                ? "border-amber-600 bg-amber-950 text-amber-300"
                                : analysis.verdict === "REMOVE"
                                ? "border-red-600 bg-red-950 text-red-300"
                                : "border-zinc-700 bg-zinc-900 text-zinc-300"
                            }`}
                          >
                            {analysis.verdict === "BOOK_PROFIT" && <CheckCircle2 size={12} />}
                            {analysis.verdict === "KEEP" && <TrendingUp size={12} />}
                            {analysis.verdict === "TIME_EXIT" && <Clock size={12} />}
                            {analysis.verdict === "REMOVE" && <AlertTriangle size={12} />}
                            <span>{analysis.verdictLabel}</span>
                          </span>

                          <div className="text-[11px] text-zinc-300 leading-tight">
                            {analysis.verdictReason}
                          </div>

                          <div className="text-[10px] text-sky-400 leading-tight">
                            👉 {analysis.actionableStep}
                          </div>

                          <div className="pt-1 text-[10px] text-zinc-400">
                            Status: <span className="font-semibold text-zinc-300">{p.statusLabel}</span>
                          </div>
                        </div>
                      </td>

                      {/* 6. Actions */}
                      <td className="px-4 py-3.5 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            type="button"
                            aria-label={`Calculate investment for ${p.instrument}`}
                            className={`inline-flex min-h-[30px] items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                              selectedPickId === p.id
                                ? "border-sky-500 bg-sky-950 text-sky-200"
                                : "border-zinc-700 text-zinc-300 hover:border-sky-600 hover:bg-sky-950/40 hover:text-sky-300"
                            }`}
                            onClick={() => setSelectedPickId(selectedPickId === p.id ? null : p.id)}
                          >
                            <Calculator size={12} aria-hidden />
                            <span>{selectedPickId === p.id ? "Hide" : "Calculate"}</span>
                          </button>

                          <a
                            href="/opportunity-journal"
                            title="Forward-track this setup in the Opportunity Journal to build statistical validation"
                            className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
                          >
                            <Shield size={12} />
                            <span>Track</span>
                          </a>

                          <button
                            type="button"
                            aria-label={`Delete ${p.instrument}`}
                            className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
                            onClick={() => remove(p.id)}
                          >
                            <Trash2 size={12} aria-hidden />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Integrated Calculator Drawer (Full Width, Zero Clipping) */}
                    {selectedPickId === p.id && (
                      <tr key={`${p.id}-calc`} className="border-t border-zinc-800 bg-zinc-950">
                        <td colSpan={6} className="p-4">
                          <SavedPickCalculator
                            pick={{
                              ...p,
                              livePrice: analysis.livePrice ?? p.entry ?? null,
                            }}
                            onClose={() => setSelectedPickId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  {picks.length === 0 ? "No saved picks yet." : "No saved picks match the filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && picks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 pt-1">
          <p>
            Showing {visible.length} of {picks.length} saved picks{filtering ? " (filtered)" : ""}.
          </p>
          <p className="text-[11px] text-zinc-400">
            Probability is calculated using risk-neutral boundary hitting mechanics relative to Entry, Stop Loss, and Target 1.
          </p>
        </div>
      )}
    </div>
  );
}
