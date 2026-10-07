import Link from "next/link";
import { Check, Minus, TriangleAlert, X } from "lucide-react";
import type { Analysis, TradePlan } from "@/lib/types";
import { fmtDate } from "@/lib/time";
import { Badge, Card, Stat, inr, num } from "./ui";
import { DataTimestamps } from "./DataTimestamps";
import { dataLabel } from "@/lib/dataStatus";

function legLine(l: TradePlan["legs"][number]) {
  return `${l.side} ${num(l.strike, 0)} ${l.type} @ ${inr(l.ltp)}`;
}

function PlanDetails({ plan, expiry }: { plan: TradePlan; expiry: string }) {
  const unit = plan.credit ? " (buy-back)" : "";
  const r = plan.risk;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-zinc-50">{plan.strategy.toUpperCase()}</div>
        <ul className="mt-1 space-y-0.5 font-mono text-sm text-zinc-300">
          {plan.legs.map((l) => (
            <li key={l.side + l.type + l.strike}>{legLine(l)}</li>
          ))}
        </ul>
        <div className="mt-1 text-xs text-zinc-500">Expiry {fmtDate(expiry)} · prices per unit</div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Stat label={plan.credit ? "Entry (credit)" : "Entry zone"} value={`${inr(plan.entryZone[0])} – ${inr(plan.entryZone[1])}`} />
        <Stat label={`Stop loss${unit}`} value={inr(plan.stop)} tone="bear" />
        <Stat label="Risk / reward" value={`1 : ${num(plan.rr)}`} />
        <Stat label={`Target 1${unit}`} value={inr(plan.target1)} tone="bull" />
        <Stat label={`Target 2${unit}`} value={inr(plan.target2)} tone="bull" />
        <Stat label="Breakeven" value={plan.breakevens.map((b) => num(b)).join(" / ")} />
        <Stat label="Max loss" value={plan.maxLoss === null ? "—" : inr(plan.maxLoss)} />
        <Stat label="Max profit" value={plan.maxProfit === null ? "Open-ended" : inr(plan.maxProfit)} />
        <Stat label="Strategy score" value={`${plan.score}/100`} />
      </div>

      {r && (
        <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Risk & Position Sizing</span>
            <Badge tone={r.status === "APPROVED" ? "neutral" : "warn"}>{r.status}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            <Stat label="Risk / trade" value={`${r.riskPercent}% (${inr(r.totalRisk)})`} tone={r.totalRisk > 0 ? "bear" : undefined} />
            <Stat label="Quantity / Lots" value={`${r.quantity} (${r.lots} ${r.lots === 1 ? "lot" : "lots"})`} />
            <Stat label="Capital required" value={inr(r.capitalRequired)} />
            <Stat label="Stop risk (total)" value={inr(r.totalRisk)} tone="bear" />
            <Stat label="Max loss (total)" value={r.maxTheoreticalLoss === null ? "Open-ended" : inr(r.maxTheoreticalLoss)} />
            <Stat label="Lot size" value={String(r.lotSize)} />
          </div>
          {r.warnings.length > 0 && (
            <div className="mt-2 text-[11px] text-zinc-500">
              {r.warnings.map((w) => (
                <div key={w}>• {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RecommendationCard({ a }: { a: Analysis }) {
  const s = a.snapshot;
  const confidence = a.plan?.score ?? a.total;
  const notes = a.factors.filter((f) => f.key !== "news").flatMap((f) => f.notes);
  const newsNotes = a.factors.find((f) => f.key === "news")!.notes;
  const support = notes.filter((n) => n.sign > 0);
  const against = notes.filter((n) => n.sign < 0);
  const neutral = notes.filter((n) => n.sign === 0);
  const label = dataLabel([s]);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Recommendation of the day</h2>
        <Badge tone={label === "LIVE DATA" ? "neutral" : "warn"}>{label}</Badge>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-zinc-100">{s.name}</span>
            <Badge>{a.status}</Badge>
            <Badge>{a.bias}</Badge>
            <span className="text-xs text-zinc-500">Regime: {a.regime}</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tabular-nums text-zinc-50">{confidence}%</span>
            <span className="text-xs text-zinc-500">model confidence · {a.setup.toLowerCase()}</span>
          </div>

          {a.plan ? (
            <PlanDetails plan={a.plan} expiry={s.expiry} />
          ) : (
            <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-xl font-semibold text-zinc-100">{a.status === "WAIT" ? "WAIT FOR CONFIRMATION" : "NO TRADE"}</div>
              <p className="mt-1 text-sm text-zinc-400">No executable trade plan is available. The model will not force a trade.{a.blockers.length ? " Reasons:" : ""}</p>
            </div>
          )}

          {a.blockers.length > 0 && (
            <ul className="space-y-1 text-sm text-amber-400">
              {a.blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Link
              href="/paper-trading"
              className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
            >
              Take Paper Trade
            </Link>
            <Link
              href="/recommendations"
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              View Analysis
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {a.plan ? "Why this trade?" : "What the model sees"}
            </h3>
            <ul className="space-y-1 text-sm">
              {support.map((n) => (
                <li key={n.text} className="flex gap-2 text-zinc-200">
                  <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-label="supports" /> {n.text}
                </li>
              ))}
              {against.map((n) => (
                <li key={n.text} className="flex gap-2 text-zinc-400">
                  <X size={15} className="mt-0.5 shrink-0 text-red-400" aria-label="against" /> {n.text}
                </li>
              ))}
              {neutral.map((n) => (
                <li key={n.text} className="flex gap-2 text-zinc-500">
                  <Minus size={15} className="mt-0.5 shrink-0" aria-label="neutral or unavailable" /> {n.text}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">News</h3>
            <ul className="space-y-1 text-sm">
              {newsNotes.map((n) => (
                <li key={n.text} className={`flex gap-2 ${n.sign > 0 ? "text-zinc-200" : n.sign < 0 ? "text-zinc-400" : "text-zinc-500"}`}>
                  {n.sign > 0 ? (
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-label="supports" />
                  ) : n.sign < 0 ? (
                    <X size={15} className="mt-0.5 shrink-0 text-red-400" aria-label="against" />
                  ) : (
                    <Minus size={15} className="mt-0.5 shrink-0" aria-label="neutral or unavailable" />
                  )}
                  {n.text}
                </li>
              ))}
            </ul>
          </div>

          {a.risks.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Risks</h3>
              <ul className="space-y-1 text-sm text-amber-400">
                {a.risks.map((r) => (
                  <li key={r} className="flex gap-2">
                    <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <span>Score breakdown</span>
              <span className="font-mono text-zinc-200">{a.total}/100</span>
            </h3>
            <div className="space-y-1.5">
              {a.factors.map((f) => (
                <div key={f.key} className="grid grid-cols-[9.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                  <span className="text-zinc-400">{f.label}</span>
                  <div className="h-1.5 rounded bg-zinc-800">
                    <div className="h-1.5 rounded bg-zinc-400" style={{ width: `${(f.score / f.max) * 100}%` }} />
                  </div>
                  <span className="text-right font-mono tabular-nums text-zinc-300">
                    {f.available ? `${num(f.score, 1)}/${f.max}` : "N/A"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
        <DataTimestamps s={s} stale={a.stale} />
        <span>Model output for analysis and paper trading only. Not investment advice; no outcome is guaranteed.</span>
      </div>
    </Card>
  );
}
