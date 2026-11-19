"use client";
// Informational contract selection on the option-chain page. No order, no paper trade, no recommendation side effects.
import { useMemo, useState } from "react";
import { resolveSelection, type ChainRowLite, type Selection, type Side } from "@/lib/optionContractSelection";

export interface ChainRowView {
  strike: number;
  moneyness: string;
  isAtm: boolean;
  call: { ltp: number | null; oi: number | null; chgOi: number | null; iv: number | null; instrumentKey?: string | null };
  put: { ltp: number | null; oi: number | null; chgOi: number | null; iv: number | null; instrumentKey?: string | null };
}

export interface ChainPayload {
  index: string;
  expiry: string;
  spot: number;
  atmStrike: number | null;
  rows: ChainRowView[];
  source: string | null;
  fallbackMessage: string | null;
  lotSize: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const fmt = (x: number | null, d = 2) => (x === null || Number.isNaN(x) ? "N/A" : x.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d === 0 ? 0 : Math.min(d, 2) }));

export function OptionContractPicker({
  initial,
  expiries,
  indexId,
}: {
  initial: ChainPayload;
  expiries: string[];
  indexId: string;
}) {
  const [chain, setChain] = useState<ChainPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [lots, setLots] = useState(1);

  // Expiry switch: fetch the same backend chain for the chosen backend-supplied expiry; reset any selection.
  async function changeExpiry(expiry: string) {
    if (expiry === chain.expiry) return;
    if (!expiries.includes(expiry)) return;
    setSelection(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/option-chain/${indexId.toLowerCase()}?expiry=${encodeURIComponent(expiry)}&range=15`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        expiry: string;
        spot: number;
        atmStrike: number | null;
        lotSize?: number | null;
        strikes: { strike: number; call: Record<string, number | null | string>; put: Record<string, number | null | string>; }[];
        source?: string | null;
        fallbackMessage?: string | null;
      };
      setChain({
        index: chain.index,
        expiry: j.expiry,
        spot: j.spot,
        atmStrike: j.atmStrike,
        source: j.source ?? null,
        fallbackMessage: j.fallbackMessage ?? null,
        lotSize: typeof j.lotSize === "number" ? j.lotSize : null, // as supplied by the backend; never inferred
        rows: j.strikes.map((r) => ({
          strike: r.strike,
          isAtm: r.strike === j.atmStrike,
          moneyness: moneynessLabel(r.strike, j.spot, j.atmStrike),
          call: { ltp: num(r.call.ltp), oi: num(r.call.oi), chgOi: num(r.call.changeOi), iv: num(r.call.iv), instrumentKey: str(r.call.instrumentKey) },
          put: { ltp: num(r.put.ltp), oi: num(r.put.oi), chgOi: num(r.put.changeOi), iv: num(r.put.iv), instrumentKey: str(r.put.instrumentKey) },
        })),
      });
    } catch (e) {
      setError(`Could not load expiry ${expiry}: ${e instanceof Error ? e.message : "unknown error"}. Nothing is selected.`);
    } finally {
      setLoading(false);
    }
  }

  const rowsForRules: ChainRowLite[] = useMemo(
    () =>
      chain.rows.map((r) => ({
        strike: r.strike,
        call: { ltp: r.call.ltp ?? 0, instrumentKey: r.call.instrumentKey ?? null },
        put: { ltp: r.put.ltp ?? 0, instrumentKey: r.put.instrumentKey ?? null },
      })),
    [chain.rows],
  );

  // Selection is validated against the chain currently shown; a missing strike is reported, not substituted.
  const result = resolveSelection(rowsForRules, selection, chain.index, chain.expiry, chain.lotSize, lots);
  function toggle(strike: number, side: Side) {
    setSelection((cur) => (cur && cur.strike === strike && cur.side === side ? null : { strike, side }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-zinc-400">
          Expiry
          <select
            aria-label="Expiry"
            className="mt-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
            value={chain.expiry}
            disabled={loading || expiries.length === 0}
            onChange={(e) => changeExpiry(e.target.value)}
          >
            {!expiries.includes(chain.expiry) && <option value={chain.expiry}>{chain.expiry}</option>}
            {expiries.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-zinc-500">{loading ? "Loading expiry…" : `${chain.rows.length} strikes · source ${chain.source ?? "N/A"}`}</span>
      </div>
      {chain.fallbackMessage && <p className="text-xs text-amber-400">{chain.fallbackMessage}</p>}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-right font-mono text-[11px]" aria-label="Option chain">
          <thead className="text-zinc-500">
            <tr><th>CE OI</th><th>CE ΔOI</th><th>CE IV</th><th>CE LTP</th><th className="text-center">Strike</th><th>PE LTP</th><th>PE IV</th><th>PE ΔOI</th><th>PE OI</th></tr>
          </thead>
          <tbody>
            {chain.rows.map((r) => {
              const ceOn = selection?.strike === r.strike && selection.side === "CE";
              const peOn = selection?.strike === r.strike && selection.side === "PE";
              return (
                <tr key={r.strike} className={`border-t border-zinc-800/60 ${r.isAtm ? "bg-zinc-800/50 text-zinc-100" : "text-zinc-300"}`}>
                  <td>{fmt(r.call.oi, 0)}</td><td>{fmt(r.call.chgOi, 0)}</td><td>{fmt(r.call.iv, 1)}</td>
                  <td>
                    <button type="button" aria-pressed={ceOn} aria-label={`Select CE ${r.strike}`} onClick={() => toggle(r.strike, "CE")}
                      className={`min-h-[32px] min-w-[44px] rounded px-1 ${ceOn ? "bg-emerald-700 text-white" : "hover:bg-zinc-800"}`}>{fmt(r.call.ltp)}</button>
                  </td>
                  <td className="text-center font-semibold">{fmt(r.strike, 0)}<div className="text-[9px] font-normal text-zinc-500">{r.moneyness}</div></td>
                  <td>
                    <button type="button" aria-pressed={peOn} aria-label={`Select PE ${r.strike}`} onClick={() => toggle(r.strike, "PE")}
                      className={`min-h-[32px] min-w-[44px] rounded px-1 ${peOn ? "bg-emerald-700 text-white" : "hover:bg-zinc-800"}`}>{fmt(r.put.ltp)}</button>
                  </td>
                  <td>{fmt(r.put.iv, 1)}</td><td>{fmt(r.put.chgOi, 0)}</td><td>{fmt(r.put.oi, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-label="Selected contract" className="rounded border border-zinc-800 p-3 text-xs text-zinc-300">
        <h3 className="mb-2 font-semibold uppercase tracking-wider text-zinc-400">Selected contract (informational only, no order)</h3>
        {!selection && <p className="text-zinc-500">No contract selected. Select a CE or PE premium in the table.</p>}
        {selection && result.kind === "MISSING" && <p role="alert" className="text-amber-400">{result.reason} Select another strike.</p>}
        {selection && result.kind === "INVALID" && <p role="alert" className="text-red-400">{result.reason}</p>}
        {selection && result.kind === "OK" && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono sm:grid-cols-3">
              <dt className="text-zinc-500">Instrument key</dt><dd>{result.details.instrumentKey ?? "Not provided"}</dd>
              <dt className="text-zinc-500">Underlying</dt><dd>{result.details.underlying}</dd>
              <dt className="text-zinc-500">Expiry</dt><dd>{result.details.expiry}</dd>
              <dt className="text-zinc-500">Strike</dt><dd>{fmt(result.details.strike, 0)}</dd>
              <dt className="text-zinc-500">Option type</dt><dd>{result.details.optionType}</dd>
              <dt className="text-zinc-500">LTP</dt><dd>{result.details.ltp === null ? "N/A" : fmt(result.details.ltp)}</dd>
              <dt className="text-zinc-500">Lot size</dt><dd>{result.details.lotSize === null ? "Unavailable" : result.details.lotSize}</dd>
            </dl>
            {result.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-amber-400">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <p className="mt-2 text-zinc-500">Checked against the chain shown for {chain.expiry}.</p>
          </>
        )}
        {selection && (
          // Kept outside the OK branch so an invalid value (e.g. 0) stays editable.
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col">
              Lots
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                value={lots}
                onChange={(e) => setLots(Number(e.target.value))}
                className="mt-1 w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
              />
            </label>
            {result.kind === "OK" && (
              <span className="font-mono">Quantity: {result.details.quantity === null ? "Unavailable (lot size missing)" : result.details.quantity}</span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function moneynessLabel(strike: number, spot: number, atm: number | null): string {
  if (atm !== null && strike === atm) return "ATM";
  if (strike < spot) return "CE ITM · PE OTM";
  return "CE OTM · PE ITM";
}
