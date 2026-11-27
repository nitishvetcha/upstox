import {
  claimOpportunityOpening,
  getPaperOpportunity,
  releaseOpportunityOpening,
  updatePaperOpportunity,
  type PaperOpportunity,
} from "./paperOpportunityStore.ts";
import { openDeps } from "./paperOpenDeps.ts";
import { isIndexId } from "./instrumentRegistry.ts";
import { serverProvenance } from "./paperOpportunityProvenance.ts";
import { decideOpen, publicEngineReason, type OpenDecision, type OpenFacts } from "./paperOpportunityOpen.ts";
import { circuitBreaker } from "./portfolioCircuitBreaker.ts";
import { getPaperTradingEngine } from "./paperStore.ts";
import { paperPortfolioRiskContext } from "./paperPortfolioRiskContext.ts";
import { analyze } from "../engine/strategy.ts";
import { logEvent } from "../ops/structuredLog.ts";

// Shared by the operator route and the automatic paper cycle. Every gate runs on the server, against a FRESH snapshot.
export async function runOpenFlow(id: string): Promise<Response> {
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

  const now = openDeps.now();

  // Portfolio Circuit Breaker Gate
  const ledger = getPaperTradingEngine();
  const portfolio = paperPortfolioRiskContext(ledger.getTrades());
  const cb = circuitBreaker.canOpenTrade(
    portfolio.openPositionsCount, now, portfolio.unrealizedMtmLoss, index, portfolio.openUnderlyingSymbols,
  );
  if (!cb.allowed) {
    return finish(id, decideOpen({ ...earlyFacts, circuitBreakerRejected: cb.reason }));
  }

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
  const result = ledger.processRecommendation(analysis, now);
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
function finish(id: string, d: ReturnType<typeof decideOpen>, tradeId: string | null = null): Response {
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
