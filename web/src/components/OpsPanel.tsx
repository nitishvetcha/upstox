// Server component: "is the system actually working?" from real evidence only.
import Link from "next/link";
import { Card, SectionTitle, StatusPill, fmtIstTs, type Status } from "./ui";
import { tokenStatus, verifyCurrentCredentialCached } from "@/lib/services/upstoxAuth";
import { marketStatus } from "@/lib/services/liveSessionController";
import { runnerStatus, buildAttention, type RunnerState, type Severity } from "@/lib/ops/opsStatus";
import { getDashboard } from "@/lib/services/market";
import { MIN_SESSIONS } from "@/lib/optionsAudit";
import { freshnessDisplayLabel } from "@/lib/freshnessLabel";
import { auditReport } from "@/lib/optionsAuditReport";
import { collectionAgeDisplay } from "@/lib/ops/collectionAge";
import { isCommodityId } from "@/lib/services/instrumentRegistry";

export const VERDICT_STATUS: Record<string, Status> = {
  DATA_TRUSTED: "ok", PRICES_TRUSTED_IV_UNVERIFIED: "warn", DATA_NOT_TRUSTED: "error", INSUFFICIENT: "info", // pending evidence, not a failure
};
const RUNNER_STATUS: Record<RunnerState, Status> = { RUNNING: "ok", STALLED: "error", NOT_RUNNING: "error", IDLE_MARKET_CLOSED: "info", UNKNOWN: "unknown" };
const SOURCE_STATUS: Record<string, Status> = { LIVE: "ok", AGING: "stale", STALE: "stale", END_OF_DAY: "info", MOCK: "blocked", UNAVAILABLE: "error" };
const SEV: Record<Severity, { status: Status; label: string }> = { critical: { status: "error", label: "CRITICAL" }, warning: { status: "warn", label: "WARNING" }, info: { status: "info", label: "INFO" } };
const AUTH_STATUS: Record<string, Status> = { VERIFIED_CONNECTED: "ok", CONFIGURED_UNVERIFIED: "stale", VERIFICATION_FAILED: "error", EXPIRED: "error", INVALID: "error", MISSING: "error", UNKNOWN: "unknown" };

// `now` is passed in by the parent render (epoch ms). The panel itself reads no clock, so its output depends only on its props.
export async function OpsPanel({ now }: { now: number }) {
  const market = marketStatus();
  const token = await verifyCurrentCredentialCached().catch(() =>
    tokenStatus().catch(() => ({ status: "UNKNOWN" as const, expiresAt: null }))
  );
  const runner = runnerStatus(market);
  const audit = auditReport();

  const { analyses } = await getDashboard();
  const sources = analyses.flatMap((a) => Object.entries(a.snapshot.sources).map(([subsystem, x]) => ({ index: a.snapshot.name, subsystem, source: x.source })));
  const attention = buildAttention({
    market, authStatus: token.status, runner, sources, audit, healthMalformed: runner.healthMalformed, minSessions: MIN_SESSIONS,
    lastFirstOpen: runner.healthEvents.find((h) => h.event === "FIRST_OPEN_COLLECTION") ?? null,
  });

  return (
    <Card className="p-4">
      <SectionTitle>System status</SectionTitle>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><div className="text-[11px] uppercase tracking-wider text-zinc-500">Market (IST)</div>
          <StatusPill status={market === "OPEN" ? "ok" : "info"}>{market.replace("_", " ")}</StatusPill></div>
        <div><div className="text-[11px] uppercase tracking-wider text-zinc-500">Upstox login</div>
          <StatusPill status={AUTH_STATUS[token.status] ?? "unknown"}>{token.status}</StatusPill>
          {token.expiresAt && <div className="text-[11px] text-zinc-500">expires {fmtIstTs(token.expiresAt)}</div>}</div>
        <div><div className="text-[11px] uppercase tracking-wider text-zinc-500">Paper runner</div>
          <StatusPill status={RUNNER_STATUS[runner.state]} title={runner.reason}>{runner.state.replaceAll("_", " ")}</StatusPill>
          <div className="text-[11px] text-zinc-500">{runner.reason}</div></div>
        <div><div className="text-[11px] uppercase tracking-wider text-zinc-500">Last stock collection</div>
          <div className="font-mono text-xs text-zinc-200">{fmtIstTs(runner.lastCollectionAt)}</div>
          {(() => {
            // Age of the last stored collection run. Anything older than a day is labelled, never shown as current.
            const age = collectionAgeDisplay(runner.lastCollectionAt, now);
            return <div className={`text-[11px] ${age.stale ? "text-amber-400" : "text-zinc-500"}`}>{age.text}</div>;
          })()}
          <div className="text-[11px] text-zinc-500">monitor {fmtIstTs(runner.lastMonitorAt)}</div></div>
      </div>
      <div className="mt-3" id="data-sources">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Market-data sources (per index, from snapshot metadata)</div>
        <div className="space-y-1">
          {analyses.map((a) => (
            <div key={a.snapshot.index} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="w-24 shrink-0 font-semibold text-zinc-300">{a.snapshot.name}</span>
              {Object.entries(a.snapshot.sources).map(([k, x]) => {
                const isComm = isCommodityId(a.snapshot.index);
                if (isComm && k === "breadth") {
                  return (
                    <StatusPill key={k} status="info" title="Commodities trade on physical contracts and do not have equity constituent breadth">
                      breadth: N/A
                    </StatusPill>
                  );
                }
                const isWarmup = k === "technical" && x.source === "UNAVAILABLE" && (a.snapshot.technicalReasonCode === "NO_INTRADAY_CANDLES" || a.snapshot.technicalReasonCode === "PRE_OPEN");
                const pillStatus = isWarmup ? "info" : (SOURCE_STATUS[x.source] ?? "unknown");
                const displayLabel = isWarmup ? "WARMING UP" : freshnessDisplayLabel(x.source);
                const titleText = isWarmup
                  ? "Market open: waiting for first completed 15m candle (09:15–09:30 IST). Indicators become LIVE at 09:30."
                  : (a.snapshot.technicalReason && k === "technical" ? `${a.snapshot.technicalReason} · fetched ${fmtIstTs(x.fetchedAt)}` : `fetched ${fmtIstTs(x.fetchedAt)}`);
                return (
                  <StatusPill key={k} status={pillStatus} title={titleText}>
                    {k}: {displayLabel}
                  </StatusPill>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">Runner health and data quality are separate: a running collector can still receive stale or unavailable inputs.</p>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">
          Options data audit ({audit.version}) · <Link href="/options-audit" className="inline-flex min-h-[24px] items-center normal-case tracking-normal text-sky-300 underline">details</Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {audit.indices.map((i) => (
            <StatusPill key={i.index} status={VERDICT_STATUS[i.verdict] ?? "unknown"} title={`${i.roundsSucceeded} successful rounds, ${i.sessionsWithEnoughRounds} qualifying sessions`}>
              {i.index.toUpperCase()}: {i.verdict === "INSUFFICIENT" ? `COLLECTING ${i.sessionsWithEnoughRounds}/${MIN_SESSIONS} sessions · ${i.roundsSucceeded} rounds` : i.verdict.replaceAll("_", " ")}
            </StatusPill>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Needs attention</div>
        {attention.length ? (
          <ul className="space-y-1 text-xs">{attention.map((a) => (
            <li key={a.text} className="flex items-start gap-2"><StatusPill status={SEV[a.severity].status}>{SEV[a.severity].label}</StatusPill><span className="text-zinc-300">{a.text}</span></li>
          ))}</ul>
        ) : <p className="text-xs text-emerald-300">All checks with evidence pass: login valid, runner healthy, all sources live, audit verdicts settled.</p>}
      </div>
    </Card>
  );
}
