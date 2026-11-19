export const dynamic = "force-dynamic";

import { Card, SectionTitle, StatusPill } from "@/components/ui";
import { intradayReplay, positionalV1, positionalV2Dev, type GroupLike } from "@/lib/research/frozenResults";
import { evaluateIntraday, COSTS, NOTIONAL, EVAL_START, MIN_TRADES } from "@/lib/intradayEvaluation";
import { listPaperOpportunities } from "@/lib/services/paperOpportunityStore";
import { DEFAULT_COSTS } from "@/lib/engine/positionalBacktest";

const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? <span className="text-zinc-500">—</span> : v.toFixed(d));
const VERDICT: Record<string, "ok" | "error" | "unknown" | "warn"> = { POSITIVE: "ok", NEGATIVE: "error", INCONCLUSIVE: "warn", INSUFFICIENT_SAMPLE: "unknown" };

function GroupTable({ rows }: { rows: [string, GroupLike][] }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-xs">
      <thead className="text-left text-zinc-500"><tr>{["", "Trades", "Sessions", "Mean net R", "95% range (session bootstrap)", "Profit factor", "Win rate", "Cumulative R", "Max DD (R)", "Cost/trade (R)", "Verdict"].map((h) => <th key={h} className="p-1.5 font-medium">{h}</th>)}</tr></thead>
      <tbody className="font-mono">{rows.map(([label, g]) => (
        <tr key={label} className="border-t border-zinc-800/60">
          <td className="p-1.5 font-sans text-zinc-300">{label}</td><td className="p-1.5">{g.trades.toLocaleString("en-IN")}</td><td className="p-1.5">{g.sessions}</td>
          <td className={`p-1.5 ${g.meanNetR !== null && g.meanNetR < 0 ? "text-red-300" : ""}`}>{f(g.meanNetR)}</td>
          <td className="p-1.5">{g.ci95 ? `${g.ci95[0]} to ${g.ci95[1]}` : <span className="text-zinc-500">— (needs ≥ 10 sessions)</span>}</td>
          <td className="p-1.5">{f(g.profitFactor, 2)}</td><td className="p-1.5">{g.winRate === null ? "—" : `${(g.winRate * 100).toFixed(0)}%`}</td>
          <td className="p-1.5">{f(g.cumulativeR, 1)}</td><td className="p-1.5">{f(g.maxDrawdownR, 1)}</td><td className="p-1.5">{f(g.meanCostR)}</td>
          <td className="p-1.5"><StatusPill status={VERDICT[g.verdict] ?? "unknown"}>{g.verdict.replaceAll("_", " ")}</StatusPill></td>
        </tr>))}</tbody></table></div>
  );
}

export default function StrategyPerformancePage() {
  const replay = intradayReplay(), v1 = positionalV1(), v2 = positionalV2Dev();
  const live = evaluateIntraday(listPaperOpportunities());
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Strategy Performance</h1>
        <p className="text-sm text-zinc-400">Frozen research results, shown as recorded. Nothing here is re-run or re-tuned. Costs are <b>estimates</b>, not broker-confirmed charges. No real orders.</p>
      </div>

      <Card className="p-4">
        <SectionTitle>Intraday stock strategy: historical replay (intraday-replay-1)</SectionTitle>
        {!replay.value ? <p className="text-xs text-zinc-500">Result file {replay.file}: {replay.error}.</p> : (<>
          <p className="mb-2 text-xs text-zinc-400">{replay.value.strategy} · {replay.value.range.FROM} → {replay.value.range.TO} · {replay.value.sessionsReplayed} sessions · 1-min candles, today&apos;s NIFTY 50 (survivorship bias) · stop-first when a bar touches both.</p>
          {(["development", "validation"] as const).map((p) => {
            const d = replay.value![p];
            return (<div key={p} className="mb-3">
              <div className="mb-1 text-xs font-semibold text-zinc-300">{p === "development" ? "Development" : "Validation (untouched)"} {d.from} → {d.to} · gross mean {f(d.grossMeanR)} R before costs</div>
              <GroupTable rows={[["Combined", d.combined], ["Long", d.long], ["Short", d.short]]} />
            </div>);
          })}
          <div className="text-xs text-zinc-400">By year (mean net R): {Object.entries(replay.value.byYear).map(([y, v]) => `${y} ${v.meanNetR} (${v.trades.toLocaleString("en-IN")} trades)`).join(" · ")}</div>
        </>)}
      </Card>

      <Card className="p-4">
        <SectionTitle>Intraday stock strategy: forward paper evaluation (intraday-eval-1, from {EVAL_START})</SectionTitle>
        <p className="mb-2 text-xs text-zinc-400">Genuine live-collector paper trades only. {live.eligible} eligible; a verdict needs ≥ {MIN_TRADES} trades and ≥ 10 sessions. Excluded: {Object.entries(live.excluded).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}.</p>
        <GroupTable rows={[["Combined", live.combined], ["Long", live.long], ["Short", live.short]]} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {([["Positional v1 (retired) — frozen 5-year baseline", v1], ["Positional v2 — development run (rejected; validation not run)", v2]] as const).map(([title, r]) => (
          <Card key={title} className="p-4 text-xs">
            <SectionTitle>{title}</SectionTitle>
            {!r.value ? <p className="text-zinc-500">{r.file}: {r.error}.</p> : (<>
              <p className="mb-2 text-zinc-400">{r.value.from} → {r.value.to}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                {Object.entries(r.value.stats).map(([k, v]) => <div key={k} className="contents"><dt className="font-sans text-zinc-500">{k}</dt><dd>{v === null ? "—" : String(v)}</dd></div>)}
                {"benchmark" in r.value && Object.entries(r.value.benchmark).map(([k, v]) => <div key={k} className="contents"><dt className="font-sans text-zinc-500">NIFTY {k}</dt><dd>{String(v)}</dd></div>)}
              </dl>
              {"gates" in r.value && <p className="mt-2">{Object.entries(r.value.gates).map(([k, v]) => <span key={k} className="mr-1"><StatusPill status={v ? "ok" : "error"}>{k}</StatusPill></span>)}</p>}
              <ul className="mt-2 list-disc pl-4 text-zinc-500">{r.value.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
            </>)}
          </Card>))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 text-xs text-zinc-400">
          <SectionTitle>Intraday cost model (estimate, intraday-eval-1 / replay)</SectionTitle>
          <p>₹{NOTIONAL.toLocaleString("en-IN")} notional per trade · slippage {COSTS.slippagePct}% per side · brokerage ₹{COSTS.brokerageMax} or {COSTS.brokeragePct}% per order (lower) · STT {COSTS.sttSellPct}% sell · exchange {COSTS.exchangePct}% · SEBI {COSTS.sebiPct}% · stamp {COSTS.stampBuyPct}% buy · GST {COSTS.gstPct}% on brokerage + exchange + SEBI.</p>
          <p className="mt-1 text-amber-300">Not verified against an Upstox contract note.</p>
        </Card>
        <Card className="p-4 text-xs text-zinc-400">
          <SectionTitle>Delivery cost model (estimate, positional v1/v2)</SectionTitle>
          <p>Brokerage ₹{DEFAULT_COSTS.brokeragePerOrder}/order · STT {DEFAULT_COSTS.sttPct}% each side · exchange {DEFAULT_COSTS.exchangePct}% · SEBI {DEFAULT_COSTS.sebiPct}% · stamp {DEFAULT_COSTS.stampBuyPct}% buy · GST {DEFAULT_COSTS.gstPct}% · DP ₹{DEFAULT_COSTS.dpPerSell}/sell · slippage {DEFAULT_COSTS.slippagePct}% per side.</p>
          <p className="mt-1 text-amber-300">Approximate; check against your broker&apos;s current schedule.</p>
        </Card>
      </div>
    </div>
  );
}
