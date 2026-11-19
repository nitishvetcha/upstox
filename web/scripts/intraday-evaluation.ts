// Phase 2 intraday evaluation report (rules: docs/intraday-evaluation-rules.md). Read-only on paper records.
// Writes .data/intraday-evaluation/report_<IST date>.json.   Run: node scripts/intraday-evaluation.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listPaperOpportunities } from "../src/lib/services/paperOpportunityStore.ts";
import { evaluateIntraday, type GroupStats } from "../src/lib/intradayEvaluation.ts";

const all = listPaperOpportunities();
const report = evaluateIntraday(all);
const reference = evaluateIntraday(all, "2026-10-01"); // pre-rules trades, same cost model; NOT part of the evaluation
const healthFile = path.join(process.cwd(), ".data", "runner-health.jsonl");
const health = existsSync(healthFile) ? readFileSync(healthFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const sinceStart = health.filter((h) => h.sessionDate >= report.evalStart);
const firstOpen = sinceStart.filter((h) => h.event === "FIRST_OPEN_COLLECTION");

const out = path.join(process.cwd(), ".data", "intraday-evaluation");
mkdirSync(out, { recursive: true });
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
writeFileSync(path.join(out, `report_${today}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), report, runnerHealth: sinceStart, referencePreRules: reference }, null, 2));

const row = (label: string, g: GroupStats) =>
  console.log(label.padEnd(9), `n ${g.trades} (${g.sessions} sessions)`.padEnd(20), `mean ${g.meanNetR ?? "—"}R`.padEnd(14), `95% ${g.ci95 ? `[${g.ci95[0]}, ${g.ci95[1]}]` : "—"}`.padEnd(22),
    `PF ${g.profitFactor ?? "—"}`.padEnd(9), `win ${g.winRate ?? "—"}`.padEnd(10), `cum ${g.cumulativeR}R  maxDD ${g.maxDrawdownR}R  cost ${g.meanCostR ?? "—"}R/trade  →  ${g.verdict}`);
console.log(`\nIntraday evaluation (${report.version}) — trades from ${report.evalStart}; ${report.eligible} eligible`);
row("combined", report.combined); row("long", report.long); row("short", report.short);
console.log("excluded:", report.excluded);
console.log(`runner: ${firstOpen.length} sessions collected, opening window missed in ${firstOpen.filter((h) => h.openingWindowMissed).length}; starts ${sinceStart.filter((h) => h.event === "RUNNER_START").map((h) => `${h.sessionDate} ${h.atIst} ${h.authStatus}`).join(", ") || "none"}`);
console.log(`\nReference only (pre-rules trades from 2026-10-15, same cost model — not part of the verdict):`);
row("combined", reference.combined); row("long", reference.long); row("short", reference.short);
