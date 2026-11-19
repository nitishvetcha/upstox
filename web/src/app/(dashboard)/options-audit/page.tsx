export const dynamic = "force-dynamic";

import Link from "next/link";
import { Card, SectionTitle, StatusPill, fmtIstTs } from "@/components/ui";
import { VERDICT_STATUS } from "@/components/OpsPanel";
import { auditReport } from "@/lib/optionsAuditReport";
import { MIN_SESSIONS, MIN_ROUNDS_PER_SESSION, PASS_SHARE, PRICE_TOL, LIVE_MAX_AGE_S, IV_MEDIAN_MAX, IV_P95_MAX, MAX_FAILED_ROUND_SHARE } from "@/lib/optionsAudit";

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
const chk = (v: boolean, have: boolean) => (!have ? <StatusPill status="unknown" title="Evaluated only on rounds from qualifying sessions (≥ 6 successful rounds in a day)">not yet evaluable</StatusPill> : v ? <StatusPill status="ok">pass</StatusPill> : <StatusPill status="error">fail</StatusPill>);
const MEANING: Record<string, string> = {
  DATA_TRUSTED: "Mapping, freshness, price agreement and chain IV all pass. Permits research only, never live trading.",
  PRICES_TRUSTED_IV_UNVERIFIED: "Prices pass, but chain IV/Greeks disagree with fresh prices: they must not be used.",
  DATA_NOT_TRUSTED: "A required check failed on the full sample.",
  INSUFFICIENT: "Not enough qualifying evidence yet. This is not a failure, and collecting five sessions does not imply a pass.",
};

export default async function OptionsAuditPage({ searchParams }: { searchParams?: Promise<{ version?: string }> }) {
  const sp = await searchParams;
  const selectedVersion = sp?.version === "options-audit-1" ? "options-audit-1" : "options-audit-1a";
  const r = auditReport(undefined, selectedVersion);
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Options Data Audit</h1>
          <p className="text-sm text-zinc-400">
            Protocol <span className="font-mono">{r.version}</span> (docs/options-audit-1a.md). Verdicts come from the authoritative audit code, not from this page.
            Rounds are collected by the background runner every 40 min while the market is open, whether or not this page is open. Options stay blocked until an index is trusted.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">View protocol:</span>
          <Link
            href="/options-audit"
            className={`rounded px-2.5 py-1 font-mono transition-colors ${selectedVersion === "options-audit-1a" ? "bg-sky-600 text-white font-semibold" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
          >
            options-audit-1a (Active)
          </Link>
          <Link
            href="/options-audit?version=options-audit-1"
            className={`rounded px-2.5 py-1 font-mono transition-colors ${selectedVersion === "options-audit-1" ? "bg-sky-600 text-white font-semibold" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
          >
            options-audit-1 (Legacy)
          </Link>
        </div>
      </div>
      {(r.roundsFileMissing || r.malformedLines > 0) && (
        <div role="status" className="rounded border border-amber-600/50 bg-amber-900/20 p-3 text-sm text-amber-200">
          {r.roundsFileMissing ? "No audit rounds recorded yet: the first round is taken during the next market session." : ""}
          {r.malformedLines > 0 ? ` ${r.malformedLines} malformed line(s) in rounds.jsonl were ignored.` : ""}
        </div>
      )}
      <Card className="overflow-x-auto p-3">
        <table className="w-full min-w-[1000px] text-xs">
          <thead className="text-left text-zinc-500"><tr>
            {["Index", "Verdict", "Collection progress", "Rounds ok / err / skip", "Mapping", "Fresh (≤60 s)", "Price agree (≤2%)", "Chain IV vs fresh", "Missing quotes", "Last good round"].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>{r.indices.map((i) => (
            <tr key={i.index} className="border-t border-zinc-800/70 align-top">
              <td className="p-2 font-semibold text-zinc-100">{i.name}</td>
              <td className="p-2"><StatusPill status={VERDICT_STATUS[i.verdict] ?? "unknown"}>{i.verdict.replaceAll("_", " ")}</StatusPill></td>
              <td className="p-2 font-mono">
                <div className="mb-1 h-1.5 w-24 rounded bg-zinc-800" aria-hidden><div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.min(100, (i.sessionsWithEnoughRounds / MIN_SESSIONS) * 100)}%` }} /></div>
                {i.sessionsWithEnoughRounds} / {MIN_SESSIONS} <span className="text-zinc-500">({i.sessions} seen)</span>
                <div className="text-zinc-500">today {i.roundsToday}/{MIN_ROUNDS_PER_SESSION} rounds</div>
                <div className="text-[10px] text-zinc-600">collection progress, not a pass</div></td>
              <td className="p-2 font-mono">{i.roundsSucceeded} / <span className={i.roundsErrored ? "text-red-300" : ""}>{i.roundsErrored}</span> / <span className={i.roundsSkipped ? "text-amber-300" : ""}>{i.roundsSkipped}</span>
                <div className="text-zinc-500">failed {pct(i.failedRoundShare)} (max {pct(MAX_FAILED_ROUND_SHARE)})</div></td>
              <td className="p-2">{i.mappingPass === null ? <StatusPill status="unknown">not run</StatusPill> : i.mappingPass ? <StatusPill status="ok">pass</StatusPill> : <StatusPill status="error">fail</StatusPill>}</td>
              <td className="p-2">{chk(i.checks.B_fresh, i.liveShare !== null)} <span className="font-mono">{pct(i.liveShare)}</span></td>
              <td className="p-2">{chk(i.checks.C_priceAgree, i.priceAgreeShare !== null)} <span className="font-mono">{pct(i.priceAgreeShare)}</span></td>
              <td className="p-2">{chk(i.checks.D_chainIvUsable, i.ivMedianDiff !== null)}
                <div className="font-mono text-zinc-500">median {i.ivMedianDiff?.toFixed(2) ?? "—"} · p95 {i.ivP95Diff?.toFixed(2) ?? "—"} pts</div></td>
              <td className="p-2 font-mono">{i.missingQuotes}</td>
              <td className="p-2 font-mono">{fmtIstTs(i.lastSuccessfulAt)}<div className="text-zinc-500">expiry {i.lastExpiry ?? "—"}</div>
                <div className="text-zinc-500">last recorded {fmtIstTs(i.lastRecordedAt)}</div>
                {i.lastError && <div className="text-red-300" title={i.lastError}>last error: {i.lastError.slice(0, 60)}</div>}</td>
            </tr>))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 text-sm">
          <SectionTitle>What each verdict means</SectionTitle>
          <dl className="space-y-1.5">{Object.entries(MEANING).map(([k, v]) => (
            <div key={k}><dt><StatusPill status={VERDICT_STATUS[k]}>{k.replaceAll("_", " ")}</StatusPill></dt><dd className="mt-0.5 text-xs text-zinc-400">{v}</dd></div>))}</dl>
        </Card>
        <Card className="p-4 text-xs text-zinc-400">
          <SectionTitle>Frozen thresholds</SectionTitle>
          <ul className="space-y-1">
            <li>Qualifying session: ≥ {MIN_ROUNDS_PER_SESSION} successful rounds; ≥ {MIN_SESSIONS} sessions needed.</li>
            <li>Fresh: trade ≤ {LIVE_MAX_AGE_S} s old for ≥ {PASS_SHARE * 100}% of liquid samples; a missing quote counts as not fresh.</li>
            <li>Price agreement: chain vs quote within {PRICE_TOL * 100}% for ≥ {PASS_SHARE * 100}%.</li>
            <li>Chain IV usable: median difference ≤ {IV_MEDIAN_MAX} and p95 ≤ {IV_P95_MAX} vol points vs IV recomputed from the fresh price.</li>
            <li>Market-closed runs record nothing and never count as a session.</li>
          </ul>
          <SectionTitle>Recent failures</SectionTitle>
          {r.indices.some((i) => i.recentErrors.length || i.mappingIssues.length)
            ? <ul className="space-y-0.5 font-mono">{r.indices.flatMap((i) => [...i.recentErrors, ...i.mappingIssues].map((e) => <li key={i.index + e}>{i.index}: {e}</li>))}</ul>
            : <p>None recorded.</p>}
        </Card>
      </div>
    </div>
  );
}
