import type { RecommendationDiagnostic, CheckStatus } from "@/lib/recommendationDiagnostic";
import { Badge, Card, num } from "./ui";

const ICON: Record<CheckStatus, string> = { PASS: "✓", WARN: "!", BLOCKED: "✕", NOT_EVALUATED: "·" };
const COLOR: Record<CheckStatus, string> = {
  PASS: "text-emerald-400",
  WARN: "text-amber-400",
  BLOCKED: "text-red-400",
  NOT_EVALUATED: "text-zinc-500",
};
const DECISION_TONE = { TRADE: "bull", WAIT: "warn", NO_TRADE: "bear" } as const;

// Renders the backend diagnostic as-is. No decision logic lives here.
export function RecommendationDiagnosticPanel({ d }: { d: RecommendationDiagnostic }) {
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-zinc-100">{d.underlying}</h2>
          <Badge tone={DECISION_TONE[d.finalDecision]}>{d.finalDecision.replace("_", " ")}</Badge>
          {d.engineDecision !== d.finalDecision && <span className="text-xs text-zinc-500">engine: {d.engineDecision}</span>}
        </div>
        <div className="text-xs text-zinc-500">
          Market {d.marketStatus} · data {d.freshness.overall} · {new Date(d.evaluatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} IST
        </div>
      </div>

      {d.upstox !== "CONNECTED" && (
        <div role="alert" className="rounded border border-red-800 bg-red-950/40 p-3">
          <div className="font-semibold text-red-300">{d.upstox === "SESSION_EXPIRED" ? "UPSTOX SESSION EXPIRED" : d.upstox === "API_ERROR" ? "UPSTOX API ERROR" : "UPSTOX NOT CONNECTED"}</div>
          <p className="text-sm text-zinc-300">Live recommendations are unavailable. Data source: <span className="font-mono">MOCK</span> · Recommendation: <span className="font-mono">BLOCKED</span></p>
          {d.upstox !== "MOCK_MODE" && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirect needs a full page load
            <a href="/api/auth/login" className="mt-2 inline-block rounded bg-red-700 px-3 py-1 text-sm font-semibold text-white hover:bg-red-600">
              {d.upstox === "SESSION_EXPIRED" ? "Reconnect Upstox" : "Connect Upstox"}
            </a>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Why?</div>
        <ul className="space-y-0.5 font-mono text-xs">
          {d.checks.map((c) => (
            <li key={c.stage} className="flex gap-2">
              <span className={`w-3 ${COLOR[c.status]}`}>{ICON[c.status]}</span>
              <span className="w-44 shrink-0 text-zinc-300">{c.name}</span>
              <span className={`w-28 shrink-0 ${COLOR[c.status]}`}>{c.status}</span>
              <span className="min-w-0 break-words text-zinc-500">{c.reason}</span>
            </li>
          ))}
        </ul>
      </div>

      {d.blockers.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-red-400">{d.blockers.length} blocking condition(s)</div>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {d.blockers.map((b, i) => (
              <li key={i} className="text-zinc-300">
                <span className="font-mono text-red-300">{b.code}</span> <span className="text-zinc-500">({b.source})</span>
                <div className="text-xs text-zinc-400">{b.message}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Candidates</div>
        <p className="text-sm text-zinc-300">{d.candidateSummary}</p>
        {d.candidates.map((c) => (
          <div key={c.strategy} className="mt-2 rounded border border-zinc-800 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-zinc-100">{c.strategy}</span>
              <span className="text-zinc-400">{c.direction}</span>
              <span className={c.score < d.requiredScore ? "text-red-300" : "text-zinc-400"}>score {c.score}/100 (required {d.requiredScore})</span>
              <Badge tone={c.executable ? "bull" : "bear"}>{c.executable ? "EXECUTABLE (paper)" : "BLOCKED — not executable"}</Badge>
            </div>
            <div className="mt-1 font-mono text-zinc-400">
              entry ₹{num(c.entry)} · stop ₹{num(c.stop)} · T1 ₹{num(c.target1)} · T2 ₹{num(c.target2)} · R:R 1:{c.rr}
            </div>
            <div className="mt-1 font-mono text-zinc-500">
              {c.legs.map((l) => `${l.side} ${l.strike} ${l.type} @${num(l.ltp)} [${l.instrumentKey ?? "no instrument key"}]`).join(" · ")}
            </div>
            {c.blockedBy.length > 0 && <div className="mt-1 text-red-300">Blocked by: {c.blockedBy.join(", ")}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Live data freshness</div>
          {(["spot", "optionChain", "technicals", "news", "breadth"] as const).map((k) => (
            <div key={k} className="flex justify-between font-mono"><span className="text-zinc-400">{k}</span><span className="text-zinc-200">{d.freshness[k]}</span></div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Event risk</div>
          <div className="font-mono text-zinc-300">{d.eventRisk.level}{d.eventRisk.blocking ? " — BLOCKING" : ""}</div>
          {d.eventRisk.reason && <div className="text-zinc-400">{d.eventRisk.reason}</div>}
          {d.eventRisk.articles !== null && <div className="text-zinc-500">{d.eventRisk.articles} articles</div>}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wider text-amber-400">Warnings (not blockers)</div>
        <ul className="space-y-1 text-xs text-zinc-400">
          {d.warnings.map((w, i) => <li key={i}><span className="text-amber-300">{w.title}</span> — {w.message}</li>)}
        </ul>
        <p className="mt-1 text-xs text-zinc-500">Historical option data is not a live blocker.</p>
      </div>
    </Card>
  );
}
