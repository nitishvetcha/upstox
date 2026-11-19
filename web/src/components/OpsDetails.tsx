// Server component: runner health events and bounded, redacted log tails. Read-only; no controls.
import path from "node:path";
import { Card, SectionTitle, StatusPill } from "./ui";
import { logAgeInfo } from "@/lib/ops/logAge";

function LogAge({ file, lines }: { file: string; lines: string[] }) {
  const info = logAgeInfo(file, lines);
  if (!info) return null;
  return (
    <p className={`mt-1 text-[11px] ${info.status === "STALE" ? "text-amber-300" : "text-emerald-300"}`}>
      {info.status} · file last written {info.writtenAt} (age {info.ageHours} h)
      {info.latestRecordAt ? ` · latest record timestamp in tail ${info.latestRecordAt}` : " · no timestamped record in tail"}
      {info.status === "STALE" ? " · older than 24 h: do not treat as current runner or server state" : ""}
    </p>
  );
}
import { logTail, runnerStatus } from "@/lib/ops/opsStatus";
import { marketStatus } from "@/lib/services/liveSessionController";

const LOGS: [string, string, string][] = [
  ["launchd.stdout.log", "Runner and supervisor output", "Cycle summaries, readiness lines, supervisor start/stop."],
  ["launchd.stderr.log", "Server errors", "Next.js server exceptions. Older entries can predate fixes; check the timestamps."],
  ["options-audit.log", "Options audit rounds", "Output of the background audit rounds (created on the first live round)."],
];
const EVENT_HELP: Record<string, string> = {
  RUNNER_START: "Runner launched (authStatus shown is at launch time).",
  FIRST_OPEN_COLLECTION: "First collection after 09:15 with auth re-checked.",
  COLLECT_ERROR: "A collection call failed (logged when the error changes).",
  SERVER_START_FAILED: "The supervisor could not start the server.",
};

export function OpsDetails() {
  const r = runnerStatus(marketStatus());
  const dir = path.join(process.cwd(), "logs");
  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto p-4">
        <SectionTitle hint="Append-only evidence from .data/runner-health.jsonl">Runner health events (newest first)</SectionTitle>
        {r.healthMalformed > 0 && <p className="mb-2 text-xs text-amber-300">{r.healthMalformed} malformed line(s) ignored.</p>}
        {r.healthEvents.length === 0 ? <p className="text-xs text-zinc-500">No runner health events recorded yet.</p> : (
          <table className="w-full min-w-[640px] text-xs"><thead className="text-left text-zinc-500"><tr><th className="p-1.5">Session</th><th className="p-1.5">Time</th><th className="p-1.5">Event</th><th className="p-1.5">Details</th></tr></thead>
            <tbody className="font-mono">{r.healthEvents.map((h, i) => (
              <tr key={i} className="border-t border-zinc-800/60" title={EVENT_HELP[h.event]}>
                <td className="p-1.5">{h.sessionDate ?? "—"}</td><td className="p-1.5">{h.atIst ?? "—"}</td>
                <td className="p-1.5"><StatusPill status={h.event.includes("FAIL") || h.event.includes("ERROR") ? "error" : h.openingWindowMissed ? "warn" : "info"}>{h.event}</StatusPill></td>
                <td className="p-1.5 text-zinc-400">{[
                  h.authStatus && `auth ${h.authStatus}`,
                  h.openingWindowMissed !== undefined && `opening missed: ${h.openingWindowMissed}`,
                  h.stockDataErrors !== undefined && `stock data errors ${h.stockDataErrors}`,
                  h.stockAggregateWarnings !== undefined && `stock aggregate warnings ${h.stockAggregateWarnings}`,
                  h.message,
                ].filter(Boolean).join(" · ")}</td>
              </tr>))}</tbody></table>)}
      </Card>
      {LOGS.map(([file, title, help]) => {
        const t = logTail(path.join(dir, file));
        return (
          <Card key={file} className="p-4">
            <SectionTitle hint={help}>{title} <span className="font-mono normal-case tracking-normal text-zinc-500">logs/{file}</span></SectionTitle>
            {t.missing ? <p className="text-xs text-zinc-500">Log not present yet.</p>
              : <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-950 p-2 text-[11px] leading-relaxed text-zinc-300">{t.lines.join("\n") || "(empty)"}</pre>}
            <p className="mt-1 text-[11px] text-zinc-500">Last 60 lines (max 64 KB), tokens redacted, routine successful API calls hidden.</p>
            <LogAge file={path.join(dir, file)} lines={t.lines} />
          </Card>
        );
      })}
    </div>
  );
}
