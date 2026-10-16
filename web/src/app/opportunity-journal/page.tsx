import { listPaperOpportunities, buildDailySummary } from "@/lib/services/paperOpportunityStore";
import type { PaperOpportunity, PaperStatus, DailySummary } from "@/lib/services/paperOpportunityStore";
import { listSessionRecords, buildMultiSessionSummary } from "@/lib/services/sessionEvidenceStore";
import { marketStatus } from "@/lib/services/liveSessionController";
import { tokenStatus } from "@/lib/services/upstoxAuth";
import { listCollectionRuns } from "@/lib/services/liveOpportunityCollector";
import { listMonitorRuns } from "@/lib/services/paperTradeMonitorRunner";

const STATUS_COLORS: Record<PaperStatus, string> = {
  OPEN:         "bg-blue-100 text-blue-800",
  TARGET1_HIT:  "bg-green-100 text-green-800",
  TARGET2_HIT:  "bg-emerald-100 text-emerald-800",
  STOP_HIT:     "bg-red-100 text-red-800",
  EXPIRED:      "bg-gray-100 text-gray-700",
  INVALIDATED:  "bg-orange-100 text-orange-800",
  EOD_EXIT:     "bg-purple-100 text-purple-800",
  EOD_UNPRICED: "bg-amber-100 text-amber-800",
};

const STATUS_LABEL: Record<PaperStatus, string> = {
  OPEN:         "OPEN",
  TARGET1_HIT:  "T1 HIT",
  TARGET2_HIT:  "T2 HIT",
  STOP_HIT:     "STOP HIT",
  EXPIRED:      "EXPIRED",
  INVALIDATED:  "INVALIDATED",
  EOD_EXIT:     "EOD EXIT",
  EOD_UNPRICED: "EOD UNPRICED",
};

function fmt(v: number | null, decimals = 2, prefix = ""): string {
  if (v === null) return "—";
  return `${prefix}${v.toFixed(decimals)}`;
}

function StatusBadge({ status }: { status: PaperStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatusBanner({
  mStatus,
  authStatus,
  sessionsCount,
  lastCollect,
  lastMonitor,
}: {
  mStatus: string;
  authStatus: string;
  sessionsCount: number;
  lastCollect: string | null;
  lastMonitor: string | null;
}) {
  const isConn = authStatus === "CONNECTED";
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-4 mb-6 text-xs grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div>
        <div className="text-neutral-500 font-medium">Market Status</div>
        <div className={`text-sm font-bold ${mStatus === "OPEN" ? "text-green-600" : "text-amber-600"}`}>
          {mStatus}
        </div>
      </div>
      <div>
        <div className="text-neutral-500 font-medium">Upstox Auth</div>
        <div className={`text-sm font-bold ${isConn ? "text-green-600" : "text-red-600"}`}>
          {authStatus}
        </div>
      </div>
      <div>
        <div className="text-neutral-500 font-medium">Distinct Sessions</div>
        <div className="text-sm font-bold">{sessionsCount}</div>
      </div>
      <div>
        <div className="text-neutral-500 font-medium">Last Collection</div>
        <div className="text-sm font-medium">{lastCollect ? lastCollect.slice(11, 19) : "—"}</div>
      </div>
      <div>
        <div className="text-neutral-500 font-medium">Last Monitor</div>
        <div className="text-sm font-medium">{lastMonitor ? lastMonitor.slice(11, 19) : "—"}</div>
      </div>
    </div>
  );
}

function MultiSessionCard({ summary }: { summary: ReturnType<typeof buildMultiSessionSummary> }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 mb-6 bg-white dark:bg-neutral-900">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-500">Multi-Session Evidence Summary</h2>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
          {summary.sampleSizeLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
        <div>
          <div className="text-xl font-bold">{summary.distinctSessions}</div>
          <div className="text-xs text-neutral-500">Sessions Recorded</div>
        </div>
        <div>
          <div className="text-xl font-bold">{summary.totalCreated}</div>
          <div className="text-xs text-neutral-500">Paper Trades Created</div>
        </div>
        <div>
          <div className="text-xl font-bold text-green-600">{summary.wins}</div>
          <div className="text-xs text-neutral-500">Wins (T1/T2)</div>
        </div>
        <div>
          <div className="text-xl font-bold text-red-600">{summary.losses}</div>
          <div className="text-xs text-neutral-500">Losses</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-neutral-600 dark:text-neutral-400">
        <div>Win Rate: <span className="font-semibold">{summary.winRate !== null ? `${(summary.winRate * 100).toFixed(0)}%` : "—"}</span></div>
        <div>Avg R: <span className="font-semibold">{fmt(summary.averageR)}</span></div>
        <div>Expectancy: <span className="font-semibold">{fmt(summary.expectancyR)}</span></div>
        <div>Profit Factor: <span className="font-semibold">{fmt(summary.profitFactor)}</span></div>
        <div>Max Drawdown R: <span className="font-semibold">{fmt(summary.maxDrawdownR)}</span></div>
        <div>Avg MFE R: <span className="font-semibold">{fmt(summary.averageMfeR)}</span></div>
        <div>Avg MAE R: <span className="font-semibold">{fmt(summary.averageMaeR)}</span></div>
        <div>Duplicates Skipped: <span className="font-semibold">{summary.totalDuplicates}</span></div>
      </div>
    </div>
  );
}

function OpenCard({ opp }: { opp: PaperOpportunity }) {
  const label = opp.optionType
    ? `${opp.underlying} ${opp.strike} ${opp.optionType}`
    : (opp.symbol ?? opp.underlying);
  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">{label}</span>
        <StatusBadge status={opp.status} />
      </div>
      <div className="text-xs text-neutral-600 dark:text-neutral-400 grid grid-cols-3 gap-1">
        <div>Entry: <span className="font-medium">₹{opp.entry}</span></div>
        <div>Stop: <span className="font-medium">₹{opp.stop}</span></div>
        <div>T1: <span className="font-medium">₹{opp.target1}</span></div>
        <div>T2: <span className="font-medium">₹{opp.target2}</span></div>
        <div>R:R: <span className="font-medium">{opp.rrTarget1}</span></div>
        <div>Grade: <span className="font-medium">{opp.grade}</span></div>
        <div>Score: <span className="font-medium">{opp.score}</span></div>
        <div>MFE: <span className="font-medium">{fmt(opp.mfe)}</span></div>
        <div>MAE: <span className="font-medium">{fmt(opp.mae)}</span></div>
      </div>
      {opp.source !== "LIVE" && (
        <div className="mt-2 text-xs text-orange-600 font-medium">Data source: {opp.source}</div>
      )}
    </div>
  );
}

function CompletedRow({ opp }: { opp: PaperOpportunity }) {
  const label = opp.optionType
    ? `${opp.underlying} ${opp.strike} ${opp.optionType}`
    : (opp.symbol ?? opp.underlying);
  const duration = opp.durationSeconds !== null
    ? opp.durationSeconds < 3600
      ? `${Math.floor(opp.durationSeconds / 60)}m`
      : `${(opp.durationSeconds / 3600).toFixed(1)}h`
    : "—";
  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800 text-sm">
      <td className="py-2 px-2">{opp.createdAt.slice(0, 10)}</td>
      <td className="py-2 px-2">{label}</td>
      <td className="py-2 px-2">{opp.direction}</td>
      <td className="py-2 px-2">₹{opp.entry}</td>
      <td className="py-2 px-2">{fmt(opp.exitPrice, 2, "₹")}</td>
      <td className="py-2 px-2"><StatusBadge status={opp.status} /></td>
      <td className="py-2 px-2">{fmt(opp.realizedR)}</td>
      <td className="py-2 px-2">{fmt(opp.mfeR)}</td>
      <td className="py-2 px-2">{fmt(opp.maeR)}</td>
      <td className="py-2 px-2">{duration}</td>
    </tr>
  );
}

export default async function OpportunityJournalPage() {
  const all = listPaperOpportunities();
  const sessions = listSessionRecords();
  const multiSummary = buildMultiSessionSummary(sessions, all);

  const mStatus = marketStatus();
  let authStatus = "NOT_CONNECTED";
  try {
    const st = await tokenStatus();
    authStatus = st.status === "VALID" ? "CONNECTED" : st.status === "EXPIRED" || st.status === "INVALID" ? "EXPIRED" : "NOT_CONNECTED";
  } catch {
    authStatus = "NOT_CONNECTED";
  }

  const collectRuns = listCollectionRuns();
  const monitorRuns = listMonitorRuns();
  const lastCollect = collectRuns.length > 0 ? collectRuns[0].timestamp : null;
  const lastMonitor = monitorRuns.length > 0 ? monitorRuns[0].timestamp : null;

  const open = all.filter((o) => o.status === "OPEN");
  const completed = all.filter((o) => o.status !== "OPEN");

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Opportunity Journal & Evidence Engine</h1>

      <StatusBanner
        mStatus={mStatus}
        authStatus={authStatus}
        sessionsCount={sessions.length}
        lastCollect={lastCollect}
        lastMonitor={lastMonitor}
      />

      <MultiSessionCard summary={multiSummary} />

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">
          Open Opportunities{" "}
          <span className="text-sm font-normal text-neutral-500">({open.length})</span>
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-neutral-500">No open paper opportunities.</p>
        ) : (
          open.map((o) => <OpenCard key={o.id} opp={o} />)
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">
          Completed Trades{" "}
          <span className="text-sm font-normal text-neutral-500">({completed.length})</span>
        </h2>
        {completed.length === 0 ? (
          <p className="text-sm text-neutral-500">No completed paper trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                  <th className="py-2 px-2 text-left">Date</th>
                  <th className="py-2 px-2 text-left">Instrument</th>
                  <th className="py-2 px-2 text-left">Dir</th>
                  <th className="py-2 px-2 text-left">Entry</th>
                  <th className="py-2 px-2 text-left">Exit</th>
                  <th className="py-2 px-2 text-left">Result</th>
                  <th className="py-2 px-2 text-left">R</th>
                  <th className="py-2 px-2 text-left">MFE-R</th>
                  <th className="py-2 px-2 text-left">MAE-R</th>
                  <th className="py-2 px-2 text-left">Duration</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((o) => <CompletedRow key={o.id} opp={o} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Market Session Audit Log{" "}
          <span className="text-sm font-normal text-neutral-500">({sessions.length} sessions)</span>
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-neutral-500">No market session records accumulated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                  <th className="py-2 px-2 text-left">Session Date</th>
                  <th className="py-2 px-2 text-left">Market</th>
                  <th className="py-2 px-2 text-left">Auth</th>
                  <th className="py-2 px-2 text-left">Collect Cycles</th>
                  <th className="py-2 px-2 text-left">Monitor Cycles</th>
                  <th className="py-2 px-2 text-left">Created</th>
                  <th className="py-2 px-2 text-left">Duplicates</th>
                  <th className="py-2 px-2 text-left">Errors</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionDate} className="border-b border-neutral-100 dark:border-neutral-800">
                    <td className="py-2 px-2 font-medium">{s.sessionDate}</td>
                    <td className="py-2 px-2">{s.marketStatus}</td>
                    <td className="py-2 px-2">{s.upstoxAuthStatus}</td>
                    <td className="py-2 px-2">{s.collectionCycles}</td>
                    <td className="py-2 px-2">{s.monitoringCycles}</td>
                    <td className="py-2 px-2 font-semibold text-green-600">{s.paperOpportunitiesCreated}</td>
                    <td className="py-2 px-2">{s.duplicateOpportunitiesSkipped}</td>
                    <td className="py-2 px-2">{s.sessionErrors.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
