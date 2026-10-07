"use client";

import { useEffect, useState } from "react";
import type { StrategyEvidenceReport } from "@/lib/strategyEvidenceEngine";

const DECISION_COLOR: Record<string, string> = {
  GO_FOR_FURTHER_VALIDATION: "#22c55e",
  HOLD_INSUFFICIENT_EVIDENCE: "#f59e0b",
  REJECT_CURRENT_STRATEGY: "#ef4444",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color, color: "#fff", padding: "2px 10px", borderRadius: 4, fontWeight: 700, fontSize: 13 }}>
      {label}
    </span>
  );
}

function GateBadge({ status }: { status: string }) {
  const color = status === "PASS" ? "#22c55e" : status === "PARTIAL" ? "#f59e0b" : status === "FAIL" ? "#ef4444" : "#6b7280";
  return <Badge label={status} color={color} />;
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", background: "#1e293b", borderRadius: 6 }}>
      <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: value !== null ? "#f1f5f9" : "#64748b" }}>
        {value !== null && value !== undefined ? String(value) : "—"}
      </span>
    </div>
  );
}

function BacktestRow({ b }: { b: NonNullable<StrategyEvidenceReport["niftyCloseOnly"]> }) {
  const pnlColor = b.netPnl > 0 ? "#22c55e" : "#ef4444";
  return (
    <tr style={{ borderBottom: "1px solid #334155" }}>
      <td style={{ padding: "6px 10px" }}>{b.index.toUpperCase()} {b.executionModel}</td>
      <td style={{ padding: "6px 10px" }}>{b.trades}</td>
      <td style={{ padding: "6px 10px" }}>{(b.winRate * 100).toFixed(1)}%</td>
      <td style={{ padding: "6px 10px", color: pnlColor }}>₹{b.netPnl.toLocaleString("en-IN")}</td>
      <td style={{ padding: "6px 10px" }}>{b.profitFactor?.toFixed(2) ?? "—"}</td>
      <td style={{ padding: "6px 10px" }}>{b.maxDrawdownPct.toFixed(1)}%</td>
      <td style={{ padding: "6px 10px", fontSize: 11, color: "#94a3b8" }}>{b.strategyVersion ?? "pre-11.4"}</td>
    </tr>
  );
}

export default function StrategyEvidencePage() {
  const [report, setReport] = useState<StrategyEvidenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategy/evidence")
      .then((r) => r.json())
      .then(setReport)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div style={{ padding: 32, color: "#ef4444" }}>Error: {error}</div>;
  if (!report) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading evidence report…</div>;

  const decisionColor = DECISION_COLOR[report.finalDecision] ?? "#6b7280";

  return (
    <div style={{ background: "#0f172a", color: "#f1f5f9", minHeight: "100vh", padding: 32, fontFamily: "system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Strategy 11.4-Frozen — Evidence Assessment</h1>
        <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
          Generated {new Date(report.generatedAt).toLocaleString()} · Dataset: {report.datasetMode}
        </div>
      </div>

      {/* Final Decision Banner */}
      <div style={{ background: decisionColor + "22", border: `2px solid ${decisionColor}`, borderRadius: 10, padding: 20, marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>FINAL ASSESSMENT</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: decisionColor, marginBottom: 8 }}>{report.finalDecision.replace(/_/g, " ")}</div>
        <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>{report.finalRationale}</div>
      </div>

      {/* Data Fidelity Warning */}
      <div style={{ background: "#7c2d12", border: "1px solid #ef4444", borderRadius: 8, padding: 14, marginBottom: 28, fontSize: 13 }}>
        <strong>⚠ Historical Option Data Fidelity Warning</strong>
        <p style={{ margin: "6px 0 0", color: "#fca5a5" }}>{report.historicalOptionFidelityWarning}</p>
      </div>

      {/* Summary Metrics */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Overview</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 8 }}>
          <Metric label="Backtest Runs" value={report.storedBacktests.length} />
          <Metric label="Walk-Forward" value={report.walkForwardCompleted ? "COMPLETED" : "NOT RUN"} />
          <Metric label="OOS Windows" value={report.oosWindows.length} />
          <Metric label="Live Observations" value={report.liveObservations} />
          <Metric label="Live Trades" value={report.liveTrades} />
          <Metric label="Completed Trades" value={report.liveCompletedTrades} />
          <Metric label="Live Evidence" value={report.liveEvidenceStatus} />
          <Metric label="Sample Adequacy" value={report.sampleAdequacy} />
          <Metric label="Max DD (any run)" value={report.maxDrawdownPct !== null ? `${report.maxDrawdownPct.toFixed(1)}%` : null} />
        </div>
      </section>

      {/* Stored Backtest Results */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Stored Backtest Results</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#94a3b8" }}>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Run</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Trades</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Win Rate</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Net P&L</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>PF</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Max DD</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Version</th>
              </tr>
            </thead>
            <tbody>
              {report.storedBacktests.map((b) => (
                <BacktestRow key={b.runId} b={b} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Execution Robustness */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Execution Robustness</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "NIFTY", exec: report.niftyExecution },
            { label: "BANKNIFTY", exec: report.bankExecution },
          ].map(({ label, exec }) => (
            <div key={label} style={{ background: "#1e293b", borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
                <div style={{ color: "#94a3b8" }}>Close-Only P&L</div>
                <div style={{ color: (exec.closeOnlyNetPnl ?? 0) > 0 ? "#22c55e" : "#ef4444" }}>
                  {exec.closeOnlyNetPnl !== null ? `₹${exec.closeOnlyNetPnl.toLocaleString("en-IN")}` : "—"}
                </div>
                <div style={{ color: "#94a3b8" }}>Intrabar P&L</div>
                <div style={{ color: (exec.intrabarNetPnl ?? 0) > 0 ? "#22c55e" : "#ef4444" }}>
                  {exec.intrabarNetPnl !== null ? `₹${exec.intrabarNetPnl.toLocaleString("en-IN")}` : "—"}
                </div>
                <div style={{ color: "#94a3b8" }}>Deterioration</div>
                <div>{exec.pnlDeteriorationPct !== null ? `${exec.pnlDeteriorationPct.toFixed(1)}%` : "—"}</div>
                <div style={{ color: "#94a3b8" }}>Classification</div>
                <div>
                  <Badge label={exec.classification} color={exec.classification === "CRITICAL" ? "#ef4444" : exec.classification === "HIGH" ? "#f59e0b" : "#22c55e"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence Scorecard */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Evidence Scorecard</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1e293b", color: "#94a3b8" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Category</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Status</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {report.scorecard.map((item) => (
              <tr key={item.category} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{item.category}</td>
                <td style={{ padding: "6px 10px" }}><GateBadge status={item.status} /></td>
                <td style={{ padding: "6px 10px", color: "#94a3b8" }}>{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Data Fidelity Table */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Data Fidelity</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1e293b", color: "#94a3b8" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Dataset</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Status</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Evidence Quality</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {report.dataFidelityTable.map((row) => (
              <tr key={row.dataset} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{row.dataset}</td>
                <td style={{ padding: "6px 10px" }}>{row.status}</td>
                <td style={{ padding: "6px 10px" }}>
                  <Badge label={row.evidenceQuality}
                    color={row.evidenceQuality === "HIGH" ? "#22c55e" : row.evidenceQuality === "MEDIUM" ? "#f59e0b" : row.evidenceQuality === "LOW" ? "#f97316" : "#ef4444"} />
                </td>
                <td style={{ padding: "6px 10px", color: "#94a3b8", fontSize: 11 }}>{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Contradictions */}
      {report.contradictions.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Contradictions & Caveats</h2>
          {report.contradictions.map((c, i) => (
            <div key={i} style={{ background: "#1e293b", borderRadius: 8, padding: 14, marginBottom: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.description}</div>
              <div style={{ color: "#94a3b8" }}>Source: {c.source} · Impact: {c.impact}</div>
            </div>
          ))}
        </section>
      )}

      {/* Export */}
      <div style={{ marginTop: 24 }}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from an API route, not page navigation */}
        <a href="/api/strategy/evidence/export" download
          style={{ background: "#3b82f6", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
          ↓ Export CSV
        </a>
      </div>
    </div>
  );
}
