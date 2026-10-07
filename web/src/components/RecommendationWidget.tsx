"use client";

import { useState } from "react";
import type { RecommendationResponse } from "@/lib/recommendationEnricher";
import { Badge, Card, Stat, num, signed } from "./ui";

const na = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "N/A" : num(v, d));

// One-click recommendation generator. No polling, no auto-refresh.
export function RecommendationWidget() {
  const [index, setIndex] = useState<"nifty" | "banknifty">("nifty");
  const [loading, setLoading] = useState(false);
  const [rec, setRec] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paperStatus, setPaperStatus] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setPaperStatus(null);
    try {
      const res = await fetch("/api/recommendations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setRec(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function paperTrade() {
    if (!rec || rec.decision !== "TRADE") return;
    setPaperStatus("Submitting…");
    try {
      const res = await fetch("/api/paper-trading/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const body = await res.json();
      setPaperStatus(body.status === "success" ? `Paper trade created — ID ${body.data?.id ?? ""}` : `Rejected: ${body.reason ?? body.message ?? "unknown"}`);
    } catch (e) {
      setPaperStatus(`Error: ${(e as Error).message}`);
    }
  }

  const decideTone = (d: RecommendationResponse["decision"]) =>
    d === "TRADE" ? "bull" : d === "WAIT" ? "warn" : "neutral";

  return (
    <Card className="p-4">
      {/* Header / Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">Generate Recommendation</h2>
        <div className="flex gap-1">
          {(["nifty", "banknifty"] as const).map((id) => (
            <button
              key={id}
              onClick={() => { setIndex(id); setRec(null); setError(null); }}
              className={`rounded border px-3 py-1 text-xs font-semibold ${index === id ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"}`}
            >
              {id === "nifty" ? "NIFTY" : "BANK NIFTY"}
            </button>
          ))}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="ml-auto rounded bg-zinc-700 px-4 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : rec ? "Refresh Recommendation" : "Generate Recommendation"}
        </button>
      </div>

      {/* Empty state */}
      {!rec && !loading && !error && (
        <p className="text-sm text-zinc-500">No recommendation generated yet. Select an underlying and click Generate Recommendation.</p>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-1 text-xs text-zinc-400">
          <p className="font-semibold text-zinc-200">Analyzing market…</p>
          {["Spot", "Option Chain", "Technicals", "Breadth", "News", "Event Risk", "Risk"].map((s) => (
            <p key={s} className="flex items-center gap-1"><span className="text-emerald-400">✓</span> Fetching {s}</p>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          <p className="font-semibold">Unable to generate recommendation</p>
          <p className="text-xs">{error}</p>
          <button onClick={generate} className="mt-2 text-xs text-red-200 underline">Retry</button>
        </div>
      )}

      {/* Recommendation result */}
      {rec && !loading && (
        <div className="space-y-4">
          {/* Warning banner */}
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
            Paper analysis only. No order has been placed with Upstox. Recommendation is based on current market data and may become invalid if conditions change.
            {rec.source !== "LIVE" && <span className="ml-1 font-semibold">Data source: {rec.source} — execution disabled.</span>}
          </div>

          {/* Decision card */}
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[160px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={decideTone(rec.decision)}>{rec.decision.replace("_", " ")}</Badge>
                <Badge>{rec.direction}</Badge>
                {rec.strategy !== "NONE" && <Badge tone="neutral">{rec.strategy}</Badge>}
                <Badge tone={rec.source === "LIVE" ? "bull" : "warn"}>{rec.source}</Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {rec.underlying} · confidence {rec.confidence}% · regime {rec.market.regime}
              </p>
            </div>
          </div>

          {/* Contract details */}
          {rec.contract && (
            <Card className="p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Selected Contract</h3>
              <div className="mb-1 font-mono text-sm font-semibold text-zinc-100">{rec.contract.displaySymbol}</div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {rec.instrumentKeyAvailable
                  ? <Badge tone="bull">LIVE CONTRACT</Badge>
                  : <Badge tone="warn">CONTRACT ID UNAVAILABLE</Badge>}
                <span className="font-mono text-[10px] text-zinc-500">{rec.contract.instrumentKey ?? "N/A"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <Stat label="LTP" value={na(rec.contract.ltp)} />
                <Stat label="Bid" value={na(rec.contract.bid)} />
                <Stat label="Ask" value={na(rec.contract.ask)} />
                <Stat label="IV" value={rec.contract.iv != null ? `${na(rec.contract.iv, 1)}%` : "N/A"} />
                <Stat label="OI" value={na(rec.contract.oi, 0)} />
                <Stat label="ΔOI" value={rec.contract.changeOi != null ? signed(rec.contract.changeOi, 0) : "N/A"} />
                <Stat label="Volume" value={na(rec.contract.volume, 0)} />
                <Stat label="Delta" value={na(rec.contract.delta, 3)} />
                <Stat label="Gamma" value={na(rec.contract.gamma, 4)} />
                <Stat label="Theta" value={na(rec.contract.theta, 3)} />
                <Stat label="Vega" value={na(rec.contract.vega, 3)} />
              </div>
              {rec.entryDetail && (
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-zinc-800 pt-2 sm:grid-cols-4">
                  <Stat label="Current LTP" value={na(rec.entryDetail.ltp)} />
                  <Stat label="Bid" value={na(rec.entryDetail.bid)} />
                  <Stat label="Ask" value={na(rec.entryDetail.ask)} />
                  <Stat label={`Paper Entry (${rec.entryDetail.paperEntrySource})`} value={na(rec.entryDetail.paperEntry)} tone="warn" />
                </div>
              )}
            </Card>
          )}

          {/* Execution plan */}
          {rec.execution && (
            <Card className="p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Trade Plan</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <Stat label="Entry" value={`₹${na(rec.execution.entry)}`} />
                <Stat label="Stop Loss" value={`₹${na(rec.execution.stopLoss)}`} tone="bear" />
                <Stat label="Target 1" value={`₹${na(rec.execution.target1)}`} tone="bull" />
                <Stat label="Target 2" value={`₹${na(rec.execution.target2)}`} tone="bull" />
                <Stat label="Breakeven" value={rec.execution.breakeven != null ? na(rec.execution.breakeven, 0) : "N/A"} />
                <Stat label="R:R (T1)" value={`1 : ${na(rec.execution.rrTarget1)}`} />
                <Stat label="R:R (T2)" value={`1 : ${na(rec.execution.rrTarget2)}`} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-zinc-800 pt-2 sm:grid-cols-4">
                <Stat label="Lots" value={String(rec.execution.lots)} />
                <Stat label="Quantity" value={String(rec.execution.quantity)} />
                <Stat label="Capital Required" value={`₹${num(rec.execution.capitalRequired, 0)}`} />
                <Stat label="Planned Risk" value={`₹${num(rec.execution.plannedRisk, 0)}`} tone="bear" />
                <Stat label="Max Loss" value={rec.execution.maximumLoss != null ? `₹${num(rec.execution.maximumLoss, 0)}` : "N/A"} tone="bear" />
                <Stat label="T1 Profit" value={`₹${num(rec.execution.target1Profit, 0)}`} tone="bull" />
                <Stat label="T2 Profit" value={`₹${num(rec.execution.target2Profit, 0)}`} tone="bull" />
              </div>
            </Card>
          )}

          {/* WAIT / NO TRADE explanations */}
          {rec.decision !== "TRADE" && (
            <Card className="p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Why no trade?</h3>
              <ul className="space-y-1 text-xs text-zinc-400">
                {(["Market", "Option chain", "Technicals", "OI", "News", "Risk"] as const).map((s) => (
                  <li key={s} className="flex items-center gap-1"><span className="text-emerald-400">✓</span> {s} analyzed</li>
                ))}
              </ul>
              {rec.blockers.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Blocking factors</div>
                  <ul className="mt-1 space-y-1 text-xs text-amber-400">{rec.blockers.map((b) => <li key={b}>• {b}</li>)}</ul>
                </div>
              )}
              {rec.blockedCandidate && (
                <div className="mt-2 rounded border border-amber-800/40 bg-amber-900/10 p-2 text-xs">
                  <span className="font-semibold text-amber-300">Blocked candidate: </span>
                  <span className="text-zinc-300">{rec.blockedCandidate.strategy} — {rec.blockedCandidate.strike} {rec.blockedCandidate.type}</span>
                  <div className="mt-0.5 text-amber-400">Blocker: {rec.blockedCandidate.blocker}</div>
                </div>
              )}
            </Card>
          )}

          {/* OI Analysis */}
          <Card className="p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Option Chain / OI Analysis</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <Stat label="Spot" value={na(rec.market.spot, 0)} />
              <Stat label="ATM Strike" value={na(rec.market.maxPain, 0)} />
              <Stat label="PCR (OI)" value={na(rec.market.pcr)} />
              <Stat label="Max Pain" value={na(rec.market.maxPain, 0)} />
              <Stat label="Support" value={na(rec.market.support, 0)} />
              <Stat label="Resistance" value={na(rec.market.resistance, 0)} />
              <Stat label="Highest Call OI" value={na(rec.oiAnalysis.highestCallOiStrike, 0)} />
              <Stat label="Highest Put OI" value={na(rec.oiAnalysis.highestPutOiStrike, 0)} />
              <Stat label="Call OI Total" value={na(rec.oiAnalysis.callOiTotal, 0)} />
              <Stat label="Put OI Total" value={na(rec.oiAnalysis.putOiTotal, 0)} />
              <Stat label="Call OI Change" value={rec.oiAnalysis.callOiChange != null ? signed(rec.oiAnalysis.callOiChange, 0) : "N/A"} />
              <Stat label="Put OI Change" value={rec.oiAnalysis.putOiChange != null ? signed(rec.oiAnalysis.putOiChange, 0) : "N/A"} />
            </div>
            <div className="mt-2 space-y-1">
              {rec.oiAnalysis.interpretation.map((line) => <p key={line} className="text-xs text-zinc-400">{line}</p>)}
            </div>
          </Card>

          {/* 7-factor score */}
          <Card className="p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">7-Factor Score — {rec.score.total}/100</h3>
            <div className="space-y-1.5">
              {Object.entries(rec.score.factors).map(([k, f]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr_4rem] items-center gap-2 text-xs">
                  <span className="truncate text-zinc-400">{k}</span>
                  <div className="h-1.5 rounded bg-zinc-800"><div className="h-1.5 rounded bg-zinc-400" style={{ width: `${f.available ? (f.score / f.max) * 100 : 0}%` }} /></div>
                  <span className="text-right font-mono text-zinc-300">{f.available ? `${num(f.score, 1)}/${f.max}` : "N/A"}</span>
                </div>
              ))}
              <div className="grid grid-cols-[9rem_1fr_4rem] gap-2 border-t border-zinc-800 pt-1 text-xs font-semibold">
                <span className="text-zinc-200">Total</span><span /><span className="text-right font-mono text-zinc-100">{rec.score.total}/100</span>
              </div>
            </div>
          </Card>

          {/* Why this trade */}
          {rec.whyReasons.length > 0 && (
            <Card className="p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Why this recommendation?</h3>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-400">
                {rec.whyReasons.map((r) => <li key={r}>{r}</li>)}
              </ol>
            </Card>
          )}

          {/* Data quality */}
          <Card className="p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Data Quality</h3>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 font-mono text-xs">
              {Object.entries(rec.dataQuality).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-zinc-400">{k}</dt>
                  <dd className={v === "LIVE" ? "text-zinc-200" : "text-amber-400"}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1 text-[10px] text-zinc-500">Generated {new Date(rec.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
          </Card>

          {/* Paper trade */}
          <div className="flex items-center gap-3">
            {rec.decision === "TRADE" && rec.source === "LIVE" ? (
              <button
                onClick={paperTrade}
                className="rounded border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
              >
                PAPER TRADE
              </button>
            ) : (
              <button disabled className="rounded border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-500 cursor-not-allowed">
                Trade blocked
              </button>
            )}
            {paperStatus && <span className="text-xs text-zinc-300">{paperStatus}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
