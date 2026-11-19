export const dynamic = "force-dynamic";

// Opens a stored paper opportunity. Every gate runs on the server, against a FRESH snapshot.
// The opportunity's stored price is never used as an execution price.
import { requireOperator } from "../../../../../lib/operatorSession.ts";
import {
  claimOpportunityOpening,
  getPaperOpportunity,
  releaseOpportunityOpening,
  updatePaperOpportunity,
  type PaperOpportunity,
} from "@/lib/services/paperOpportunityStore";
import { openDeps } from "@/lib/services/paperOpenDeps";
import { isIndexId } from "@/lib/services/instrumentRegistry";
import { serverProvenance } from "@/lib/services/paperOpportunityProvenance";
import { decideOpen, publicEngineReason, type OpenDecision, type OpenFacts } from "@/lib/services/paperOpportunityOpen";
import { getPaperTradingEngine } from "@/lib/services/paperStore";
import { analyze } from "@/lib/engine/strategy";
import { logEvent } from "@/lib/ops/structuredLog";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const { id } = await params;
  const opp = getPaperOpportunity(id);

  // Cheap refusals first: no market data is fetched for an opportunity that cannot be opened.
  const earlyFacts: OpenFacts = { opp, provenance: null, hasPlan: false, planRejected: null, engine: null };
  const early = decideOpen(earlyFacts);
  const pre = early.code === "NOT_FOUND" || early.code === "ALREADY_OPENED" || early.code === "NOT_OPEN" || early.code === "UNSUPPORTED";
  if (pre) return finish(id, early);

  // Claim before the first await: a concurrent request is refused here, not run in parallel. Always released below.
  const claim = claimOpportunityOpening(id, openDeps.now());
  if (!claim) return finish(id, ALREADY_OPEN);
  try {
    return await attemptOpen(id, opp!, earlyFacts);
  } finally {
    releaseOpportunityOpening(id, claim);
  }
}

async function attemptOpen(id: string, opp: PaperOpportunity, earlyFacts: OpenFacts) {
  const index = (opp.underlying ?? "").toLowerCase();
  if (!isIndexId(index)) return finish(id, decideOpen({ ...earlyFacts, opp: { ...opp, instrumentType: "UNSUPPORTED" } }));

  // Fresh server-side snapshot, provenance and strategy analysis.
  const now = openDeps.now();
  const snapshot = await openDeps.getSnapshot(index);
  // Breadth status lives on the snapshot, not in its sources map.
  const provenance = serverProvenance({ ...snapshot.sources, breadth: { status: snapshot.breadth?.status ?? null, source: snapshot.sources.breadth } } as never);
  if (!provenance.ok) return finish(id, decideOpen({ ...earlyFacts, provenance }));

  const analysis = analyze(snapshot, now);
  const plan = analysis.plan ?? null;
  const planRejected = plan?.rejected ?? null;
  const detail = [...analysis.blockers, ...analysis.candidates.map((c) => c.rejected).filter((x): x is string => !!x)];
  if (!plan || planRejected) return finish(id, decideOpen({ ...earlyFacts, provenance, hasPlan: !!plan, planRejected, detail }));

  // The paper engine re-checks freshness, position limits, sizing, the 1% risk assessment and fills.
  // Last check, in the same synchronous step as the engine call: a link written while the snapshot loaded wins.
  if (getPaperOpportunity(id)?.openedPaperTradeId) return finish(id, ALREADY_OPEN);
  const engine = getPaperTradingEngine();
  const result = engine.processRecommendation(analysis, now);
  const facts: OpenFacts = {
    opp,
    provenance,
    hasPlan: true,
    planRejected: null,
    engine: { created: result.created, reason: publicEngineReason(result.reason), tradeId: result.trade?.id ?? null },
  };
  return finish(id, decideOpen(facts), result.trade?.id ?? null);
}

// Same answer whether the opportunity is already linked or another request holds its claim.
const ALREADY_OPEN: OpenDecision = { code: "ALREADY_OPENED", ok: false, status: 409, reasons: ["already opened, or being opened by another request"] };

// Records the attempt on the opportunity (audit) and links the trade only when opening succeeded.
function finish(id: string, d: ReturnType<typeof decideOpen>, tradeId: string | null = null) {
  const at = new Date().toISOString();
  logEvent(d.ok ? "info" : "warn", d.ok ? "paper_open_accepted" : "paper_open_rejected", { opportunityId: id, code: d.code, reasons: d.reasons, tradeId });
  if (d.ok && tradeId) {
    updatePaperOpportunity(id, { openedPaperTradeId: tradeId, lastOpenAttempt: { at, code: d.code, reasons: [] } });
    return Response.json({ status: "success", code: d.code, tradeId }, { status: 201 });
  }
  if (d.code !== "NOT_FOUND" && d.code !== "ALREADY_OPENED") {
    updatePaperOpportunity(id, { lastOpenAttempt: { at, code: d.code, reasons: d.reasons } });
  }
  // reference: the audit handle. The matching server log line carries the redacted diagnostics.
  return Response.json({ status: "rejected", code: d.code, reasons: d.reasons, reference: id }, { status: d.status });
}
