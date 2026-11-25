"use client";

import { useEffect, useState } from "react";
import type { StrategyReadinessReport } from "@/lib/services/strategyReadiness";
import type { McxContractHealth } from "@/lib/services/mcxContractHealth";

type Payload = {
  generatedAt: string;
  requirements: { minimumCompletedTrades: number; minimumProfitFactor: number; maximumDrawdownR: number };
  strategies: StrategyReadinessReport[];
  mcxContractHealth: McxContractHealth[];
  disclaimer: string;
};

const tone = (value: string) => value === "PAPER_EVIDENCE_SUFFICIENT" || value === "READY_FOR_LIVE_CHECK"
  ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
  : value === "HOLD" || value === "EXPIRY_UNCONFIGURED"
  ? "border-amber-700/60 bg-amber-950/30 text-amber-300"
  : "border-red-800/60 bg-red-950/30 text-red-300";

export default function ReadinessPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/readiness/paper").then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? `Readiness report unavailable (HTTP ${response.status})`);
      return body as Payload;
    }).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  if (error) return <p className="text-red-300">{error}</p>;
  if (!data) return <p className="text-zinc-400">Loading live-paper readiness…</p>;
  return <div className="mx-auto max-w-6xl space-y-6 text-zinc-200">
    <header>
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Validation control room</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-100">Strategy Readiness</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-400">{data.disclaimer}</p>
    </header>
    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Required live-paper trades</div><div className="mt-1 text-2xl font-bold">{data.requirements.minimumCompletedTrades}</div></div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Minimum profit factor</div><div className="mt-1 text-2xl font-bold">{data.requirements.minimumProfitFactor.toFixed(2)}</div></div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Maximum drawdown</div><div className="mt-1 text-2xl font-bold">{data.requirements.maximumDrawdownR}R</div></div>
    </section>
    <section className="grid gap-3 md:grid-cols-2">
      {data.strategies.map((strategy) => <article key={strategy.strategy} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-zinc-100">{strategy.strategy.replace(/_/g, " ")}</h2><span className={`rounded border px-2 py-1 text-xs font-semibold ${tone(strategy.verdict)}`}>{strategy.verdict.replace(/_/g, " ")}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><div className="text-zinc-500">Trades</div><div>{strategy.completedTrades}</div></div><div><div className="text-zinc-500">Net R</div><div>{strategy.netR.toFixed(2)}</div></div><div><div className="text-zinc-500">PF</div><div>{strategy.profitFactor?.toFixed(2) ?? "—"}</div></div></div>
        <p className="mt-3 text-xs text-zinc-500">Drawdown {strategy.maxDrawdownR.toFixed(2)}R · regimes {strategy.distinctRegimes.join(", ") || "none"} · costed ledger trades {strategy.costedLedgerRecords} · quarantined outcomes {strategy.quarantinedTrades} · excluded records {strategy.excludedRecords}</p>
        {strategy.blockers.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-200">{strategy.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
        {strategy.setups.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-zinc-500"><tr><th className="py-1">Setup</th><th>Trades</th><th>Net R</th><th>PF</th><th>Status</th></tr></thead><tbody>{strategy.setups.map((setup) => <tr key={setup.setup} className="border-t border-zinc-800"><td className="py-1.5">{setup.setup}</td><td>{setup.completedTrades}</td><td>{setup.netR.toFixed(2)}</td><td>{setup.profitFactor?.toFixed(2) ?? "—"}</td><td>{setup.status.replace(/_/g, " ")}</td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-zinc-400">{strategy.nextRequirement}</p>
      </article>)}
    </section>
    <section><h2 className="mb-3 text-lg font-semibold text-zinc-100">MCX Contract Health</h2><div className="grid gap-3 md:grid-cols-2">{data.mcxContractHealth.map((contract) => <article key={contract.underlying} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="flex justify-between gap-2"><h3 className="font-semibold">{contract.underlying.toUpperCase()}</h3><span className={`rounded border px-2 py-1 text-xs ${tone(contract.status)}`}>{contract.status.replace(/_/g, " ")}</span></div><p className="mt-2 font-mono text-xs text-zinc-400">{contract.instrumentKey}</p><p className="mt-2 text-sm text-zinc-300">{contract.message}</p></article>)}</div></section>
  </div>;
}
