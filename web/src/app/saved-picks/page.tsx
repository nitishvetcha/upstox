"use client";
// Save and review picks. Every entry is labelled. Unvalidated picks are shown as NOT VALIDATED.
// Filtering only hides rows; it never changes what a pick says.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Calculator, Trash2 } from "lucide-react";
import { ALL, distinct, filterPicks, sortNewestFirst } from "@/lib/savedPickFilter";
import { SavedPickCalculator } from "@/components/SavedPickCalculator";

type Pick = { id: string; savedAt: string; instrument: string; instrumentType: string; direction: string; entry?: number | null; stopLoss?: number | null; targets?: number[]; source: string; note?: string; validation: string; statusLabel: string };

function fmtIstDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
    const date = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " IST";
    return { date, time };
  } catch {
    return { date: iso, time: "" };
  }
}

const FIELD = "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600";

export default function SavedPicksPage() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ query: "", instrumentType: ALL, source: ALL, validation: ALL });
  const [form, setForm] = useState({ instrument: "", instrumentType: "STOCK", direction: "LONG", entry: "", stopLoss: "", target: "", source: "RESEARCH", note: "" });
  const [selectedPickId, setSelectedPickId] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/saved-picks", { cache: "no-store" });
      if (r.status === 401) { window.location.assign("/login?next=/saved-picks"); return; }
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.picks)) throw new Error("bad response");
      setPicks(j.picks);
      setError(null);
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
    try { await load(); } finally { inFlight.current = false; }
  };

  // Initial load runs inside the effect with a cancellation flag, so an unmounted page never sets state.
  // The first setState happens only after the awaited fetch, never synchronously inside the effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/saved-picks", { cache: "no-store" });
        if (cancelled) return;
        if (r.status === 401) { window.location.assign("/login?next=/saved-picks"); return; }
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !Array.isArray(j.picks)) throw new Error("bad response");
        setPicks(j.picks);
        setError(null);
      } catch {
        if (!cancelled) setError("Could not load saved picks. The list may be out of date; retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => sortNewestFirst(filterPicks(picks, filter)), [picks, filter]);
  const types = useMemo(() => distinct(picks, "instrumentType"), [picks]);
  const sources = useMemo(() => distinct(picks, "source"), [picks]);
  const validations = useMemo(() => distinct(picks, "validation"), [picks]);
  const filtering = filter.query.trim() !== "" || filter.instrumentType !== ALL || filter.source !== ALL || filter.validation !== ALL;

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const body = { instrument: form.instrument, instrumentType: form.instrumentType, direction: form.direction, source: form.source, note: form.note,
      entry: form.entry ? Number(form.entry) : null, stopLoss: form.stopLoss ? Number(form.stopLoss) : null, targets: form.target ? [Number(form.target)] : [] };
    // A network failure or a non-JSON error body must surface as a visible error, not an unhandled rejection.
    try {
      const r = await fetch("/api/saved-picks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.status === 401) { window.location.assign("/login?next=/saved-picks"); return; }
      const j = await r.json();
      if (!r.ok) { setError((j.details ?? [j.error ?? "Save failed"]).join("; ")); return; }
      setForm({ ...form, instrument: "", entry: "", stopLoss: "", target: "", note: "" });
      load();
    } catch { setError("could not save the pick (network or server error); nothing was saved"); }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/saved-picks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.status === 401) { window.location.assign("/login?next=/saved-picks"); return; }
      if (!r.ok) { setError("Could not delete the pick. It is still saved."); return; }
      load();
    } catch { setError("could not delete the pick (network or server error); it is still saved"); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
          <Bookmark className="text-zinc-400" size={20} aria-hidden />
          Saved picks
        </h1>
        <p className="mt-1 text-sm text-amber-400">Saved picks are research records for review. None is a validated or profitable signal unless its status says VALIDATED. No orders are placed.</p>
      </header>

      <form onSubmit={save} className="grid gap-2 rounded border border-zinc-800 p-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
        <input className={FIELD} required aria-label="Instrument" placeholder="Instrument (e.g. RELIANCE)" value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} />
        <select className={FIELD} aria-label="Instrument type" value={form.instrumentType} onChange={(e) => setForm({ ...form, instrumentType: e.target.value })}>
          <option>STOCK</option><option>INDEX</option><option>STOCK_OPTION</option><option>INDEX_OPTION</option><option>OTHER</option>
        </select>
        <select className={FIELD} aria-label="Direction" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}><option>LONG</option><option>SHORT</option></select>
        <input className={FIELD} aria-label="Entry price" placeholder="Entry" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} />
        <input className={FIELD} aria-label="Stop-loss price" placeholder="Stop-loss" value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} />
        <input className={FIELD} aria-label="Target price" placeholder="Target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        <select className={FIELD} aria-label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option>RESEARCH</option><option>LIVE</option><option>MOCK</option></select>
        <input className={FIELD} aria-label="Note" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit" className="min-h-[36px] rounded bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-white">Save pick</button>
      </form>

      <div className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter saved picks">
        <input className={`${FIELD} min-w-[180px] flex-1`} aria-label="Search saved picks" placeholder="Search instrument or note" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
        <select className={FIELD} aria-label="Filter by type" value={filter.instrumentType} onChange={(e) => setFilter({ ...filter, instrumentType: e.target.value })}>
          <option value={ALL}>All types</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={FIELD} aria-label="Filter by source" value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })}>
          <option value={ALL}>All sources</option>{sources.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={FIELD} aria-label="Filter by validation" value={filter.validation} onChange={(e) => setFilter({ ...filter, validation: e.target.value })}>
          <option value={ALL}>All statuses</option>{validations.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {filtering && <button type="button" className="min-h-[32px] rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800" onClick={() => setFilter({ query: "", instrumentType: ALL, source: ALL, validation: ALL })}>Clear filters</button>}
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
          <button type="button" onClick={retry} disabled={loading} className="min-h-[32px] rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">Retry</button>
        </div>
      )}

      {/* relative: the sr-only "Actions" label is absolutely positioned; without a positioned box it extends the page width. */}
      <div className="relative overflow-x-auto rounded border border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
            <tr><th className="px-3 py-2">Saved At (IST)</th><th className="px-3 py-2">Instrument</th><th className="px-3 py-2">Dir</th><th className="px-3 py-2">Entry</th><th className="px-3 py-2">Stop</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-zinc-500">Loading saved picks…</td></tr>}
            {!loading && visible.map((p) => {
              const ist = fmtIstDateTime(p.savedAt);
              return (
                <Fragment key={p.id}>
                  <tr className="border-t border-zinc-800/70 text-zinc-300">
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    <div className="font-semibold text-zinc-200">{ist.date}</div>
                    {ist.time && <div className="text-[11px] text-zinc-400">{ist.time}</div>}
                  </td>
                  <td className="px-3 py-2">{p.instrument} <span className="text-xs text-zinc-500">({p.instrumentType})</span></td>
                  <td className="px-3 py-2">{p.direction}</td>
                  <td className="px-3 py-2 font-mono">{p.entry ?? "–"}</td>
                  <td className="px-3 py-2 font-mono">
                    <div>{p.stopLoss ?? "–"}</div>
                    {p.entry && p.stopLoss && (
                      <div className="text-[10px] text-red-400 font-mono">
                        -{Math.abs(((p.entry - p.stopLoss) / p.entry) * 100).toFixed(1)}%
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <div>{p.targets?.join(", ") || "–"}</div>
                    {p.entry && p.targets?.[0] && (
                      <div className="text-[10px] text-emerald-400 font-mono">
                        +{Math.abs(((p.targets[0] - p.entry) / p.entry) * 100).toFixed(1)}%
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{p.source}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold text-zinc-100">{p.statusLabel}</span>
                    {p.entry && p.targets?.[0] && p.stopLoss && Math.abs(p.entry - p.stopLoss) > 0 && (
                      <div className="text-[10px] font-mono text-sky-400">
                        R:R {(Math.abs(p.targets[0] - p.entry) / Math.abs(p.entry - p.stopLoss)).toFixed(2)}x
                      </div>
                    )}
                    {p.note ? <div className="text-xs text-zinc-500">{p.note}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Calculate investment for ${p.instrument}`}
                        className={`inline-flex min-h-[32px] items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors ${
                          selectedPickId === p.id
                            ? "border-sky-500 bg-sky-950/70 text-sky-200"
                            : "border-zinc-700 text-zinc-300 hover:border-sky-700 hover:bg-sky-950/40 hover:text-sky-300"
                        }`}
                        onClick={() => setSelectedPickId(selectedPickId === p.id ? null : p.id)}
                      >
                        <Calculator size={12} aria-hidden />
                        {selectedPickId === p.id ? "Hide" : "Calculate"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${p.instrument}`}
                        className="inline-flex min-h-[32px] items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
                        onClick={() => remove(p.id)}
                      >
                        <Trash2 size={12} aria-hidden />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {selectedPickId === p.id && (
                  <tr key={`${p.id}-calc`} className="border-t border-zinc-800 bg-zinc-950/90">
                    <td colSpan={9} className="p-3">
                      <SavedPickCalculator
                        pick={p}
                        onClose={() => setSelectedPickId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-zinc-500">{picks.length === 0 ? "No saved picks yet." : "No saved picks match these filters."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!loading && picks.length > 0 && <p className="text-xs text-zinc-500">Showing {visible.length} of {picks.length} saved picks, newest first.</p>}
    </div>
  );
}
