export const dynamic = "force-dynamic";

// Defect fixed (Phase 29): page was HTTP-fetching itself at localhost:3000 which fails when
// the dev server runs on a different port. Now calls engines directly as a server component.
import { getSnapshot } from "@/lib/services/market";
import { evaluateOptionsOpportunity } from "@/lib/engine/opportunityEngine";
import { scanStocks } from "@/lib/engine/stockOpportunityEngine";
import { scanLongTerm, NO_FUNDAMENTAL_PROVIDER } from "@/lib/engine/longTermEngine";
import { listOpportunityRecords } from "@/lib/services/opportunityTrackingStore";
import type { ContractOpportunity, OpportunityGrade } from "@/lib/engine/opportunityEngine";
import type { StockOpportunity } from "@/lib/engine/stockOpportunityEngine";
import type { OpportunityRecord } from "@/lib/services/opportunityTrackingStore";

// ── Data fetching (server-side direct calls, no HTTP self-fetch) ──────────────

async function loadData() {
  try {
    const now = new Date();
    const [niftySnap, bnSnap, intradayResult, swingResult, ltResult] = await Promise.all([
      getSnapshot("nifty"),
      getSnapshot("banknifty"),
      scanStocks("intraday", now),
      scanStocks("swing", now),
      scanLongTerm(NO_FUNDAMENTAL_PROVIDER),
    ]);
    const niftyOptions = evaluateOptionsOpportunity(niftySnap, "NIFTY", now);
    const bnOptions = evaluateOptionsOpportunity(bnSnap, "BANKNIFTY", now);
    return { niftyOptions, bnOptions, intradayResult, swingResult, ltResult, now };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: "green" | "red" | "yellow" | "gray" | "blue" }) {
  const cls = {
    green:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    red:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    gray:   "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    blue:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  }[color];
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function dirColor(dir: string): "green" | "red" | "gray" {
  if (dir.includes("BULL")) return "green";
  if (dir.includes("BEAR")) return "red";
  return "gray";
}

function GradeBadge({ grade }: { grade: OpportunityGrade | undefined }) {
  if (!grade) return null;
  const cfg: Record<OpportunityGrade, { color: string }> = {
    "A+":     { color: "bg-emerald-600 text-white" },
    "A":      { color: "bg-green-600 text-white" },
    "B":      { color: "bg-yellow-500 text-white" },
    "C":      { color: "bg-orange-400 text-white" },
    "REJECT": { color: "bg-red-500 text-white" },
  };
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold ${cfg[grade].color}`}>{grade}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 65 ? "bg-green-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function OptionsCard({ contract, title }: { contract: ContractOpportunity; title: string }) {
  const isBull = contract.optionType === "CE";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</span>
        <div className="flex gap-1.5 flex-wrap">
          {contract.grade && <GradeBadge grade={contract.grade} />}
          <Badge label={contract.optionType} color={isBull ? "green" : "red"} />
          <Badge label={contract.strategyType.replace("_", " ")} color="blue" />
        </div>
      </div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-xl font-bold text-gray-900 dark:text-white">
          {contract.underlying} {contract.strike}
        </span>
        <span className="text-sm text-gray-500">@ ₹{contract.ltp}</span>
      </div>
      <div className="mb-2 text-xs text-gray-500">Expiry: {contract.expiry ?? "—"}</div>
      <ScoreBar score={contract.opportunityScore} />
      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
        <span>Score {contract.opportunityScore}/100</span>
        <span>Confidence {contract.confidence}%</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-gray-50 p-2 dark:bg-gray-800">
          <div className="font-semibold text-gray-900 dark:text-white">₹{contract.entry}</div>
          <div className="text-gray-500">Entry</div>
        </div>
        <div className="rounded bg-red-50 p-2 dark:bg-red-900/20">
          <div className="font-semibold text-red-700 dark:text-red-400">₹{contract.stop}</div>
          <div className="text-gray-500">Stop</div>
        </div>
        <div className="rounded bg-green-50 p-2 dark:bg-green-900/20">
          <div className="font-semibold text-green-700 dark:text-green-400">₹{contract.target1}</div>
          <div className="text-gray-500">T1</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-xs text-gray-500">
        <span>R:R {contract.rr}x</span>
        <span>·</span><span>S/R room {contract.srRoom}pts</span>
        {contract.iv != null && <><span>·</span><span>IV {contract.iv.toFixed(1)}%</span></>}
        {contract.delta != null && <><span>·</span><span>Δ {contract.delta.toFixed(2)}</span></>}
      </div>
      {contract.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {contract.reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="text-xs text-gray-600 dark:text-gray-400">• {r}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        Invalidation: {contract.invalidation}
      </div>
    </div>
  );
}

function StockCard({ stock, rank }: { stock: StockOpportunity; rank?: number }) {
  const isBull = stock.direction === "BULLISH";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {rank != null && <span className="text-xs font-bold text-gray-400">#{rank}</span>}
          <div>
            <span className="font-bold text-gray-900 dark:text-white">{stock.symbol}</span>
            <span className="ml-2 text-xs text-gray-500">{stock.name}</span>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {stock.grade && <GradeBadge grade={stock.grade} />}
          <Badge label={stock.direction} color={isBull ? "green" : "red"} />
          <Badge label={stock.setup} color="blue" />
        </div>
      </div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-lg font-bold text-gray-900 dark:text-white">₹{stock.ltp}</span>
        {stock.changePercent != null && (
          <span className={`text-sm font-medium ${stock.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
            {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
          </span>
        )}
        <Badge label={stock.freshness} color={stock.freshness === "LIVE" ? "green" : stock.freshness === "MOCK" ? "yellow" : "gray"} />
      </div>
      <ScoreBar score={stock.opportunityScore} />
      <div className="mt-1 text-xs text-gray-500">Score {stock.opportunityScore}/100</div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded bg-gray-50 p-2 dark:bg-gray-800">
          <div className="font-semibold text-gray-900 dark:text-white">₹{stock.entry.toFixed(1)}</div>
          <div className="text-gray-500">Entry</div>
        </div>
        <div className="rounded bg-red-50 p-2 dark:bg-red-900/20">
          <div className="font-semibold text-red-700 dark:text-red-400">₹{stock.stop.toFixed(1)}</div>
          <div className="text-gray-500">Stop</div>
        </div>
        <div className="rounded bg-green-50 p-2 dark:bg-green-900/20">
          <div className="font-semibold text-green-700 dark:text-green-400">₹{stock.target1.toFixed(1)}</div>
          <div className="text-gray-500">T1</div>
        </div>
        <div className="rounded bg-emerald-50 p-2 dark:bg-emerald-900/20">
          <div className="font-semibold text-emerald-700 dark:text-emerald-400">₹{stock.target2.toFixed(1)}</div>
          <div className="text-gray-500">T2</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
        <span>R:R {stock.rr}x</span>
        {stock.relativeStrength != null && (
          <span>RS {stock.relativeStrength > 1 ? "+" : ""}{((stock.relativeStrength - 1) * 100).toFixed(1)}%</span>
        )}
        {stock.rangePosition != null && (
          <span>Range pos {(stock.rangePosition * 100).toFixed(0)}%</span>
        )}
      </div>
      {stock.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {stock.reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="text-xs text-gray-600 dark:text-gray-400">• {r}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        Invalidation: {stock.invalidation}
      </div>
    </div>
  );
}

const outcomeIcon: Record<string, string> = {
  OPEN: "●", TARGET1_HIT: "T1", TARGET2_HIT: "T2", STOP_HIT: "SL", EXPIRED: "EX", INVALIDATED: "IV",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OpportunitiesPage() {
  const result = await loadData();
  const outcomes: OpportunityRecord[] = listOpportunityRecords().slice(0, 5);

  if ("error" in result) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Opportunity Engine</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20">
          Failed to load: {result.error}
        </div>
      </div>
    );
  }

  const { niftyOptions, bnOptions, intradayResult, swingResult, ltResult, now } = result;

  // Overall best across all engines
  const allCandidates = [
    ...niftyOptions.topOpportunities.map((c) => ({ engine: "NIFTY Options", score: c.opportunityScore, item: c as ContractOpportunity | StockOpportunity })),
    ...bnOptions.topOpportunities.map((c) => ({ engine: "BANKNIFTY Options", score: c.opportunityScore, item: c as ContractOpportunity | StockOpportunity })),
    ...intradayResult.topOpportunities.map((s) => ({ engine: "Intraday Stock", score: s.opportunityScore, item: s as ContractOpportunity | StockOpportunity })),
    ...swingResult.topOpportunities.map((s) => ({ engine: "Swing Stock", score: s.opportunityScore, item: s as ContractOpportunity | StockOpportunity })),
  ].sort((a, b) => b.score - a.score);
  const best = allCandidates[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Opportunity Engine</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            v20.1 · Independent of 11.4-frozen strategy · Read-only · No real orders
          </p>
        </div>
        <span className="text-xs text-gray-400">{now.toLocaleTimeString("en-IN")}</span>
      </div>

      {/* Decision funnel: market pulse */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Decision Funnel</div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {[
            { label: "NIFTY", regime: niftyOptions.marketRegime, dir: niftyOptions.marketDirection, score: niftyOptions.topOpportunities[0]?.opportunityScore ?? null, candidates: niftyOptions.topOpportunities.length, eventPenalty: niftyOptions.eventRiskPenalty },
            { label: "BANKNIFTY", regime: bnOptions.marketRegime, dir: bnOptions.marketDirection, score: bnOptions.topOpportunities[0]?.opportunityScore ?? null, candidates: bnOptions.topOpportunities.length, eventPenalty: bnOptions.eventRiskPenalty },
            { label: "Intraday", regime: intradayResult.freshness, dir: intradayResult.noOpportunityReason ? "NONE" : "SCANNED", score: intradayResult.topOpportunities[0]?.opportunityScore ?? null, candidates: intradayResult.topOpportunities.length, eventPenalty: 0 },
            { label: "Swing", regime: swingResult.freshness, dir: swingResult.noOpportunityReason ? "NONE" : "SCANNED", score: swingResult.topOpportunities[0]?.opportunityScore ?? null, candidates: swingResult.topOpportunities.length, eventPenalty: 0 },
          ].map((row) => (
            <div key={row.label} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-900">
              <div className="mb-1 font-semibold text-gray-900 dark:text-white">{row.label}</div>
              <div className="text-xs text-gray-500">{row.regime}</div>
              <div className="text-xs text-gray-500">{row.dir}</div>
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                {row.eventPenalty > 0 && <Badge label={`−${row.eventPenalty} event`} color="yellow" />}
                <span className="text-xs">{row.candidates} candidates</span>
                {row.score != null && <span className="text-xs font-medium">top {row.score}</span>}
              </div>
            </div>
          ))}
        </div>
        {/* Rejection reasons */}
        {niftyOptions.noOpportunityReason && (
          <p className="mt-2 text-xs text-gray-500">NIFTY: {niftyOptions.noOpportunityReason}</p>
        )}
        {bnOptions.noOpportunityReason && (
          <p className="mt-1 text-xs text-gray-500">BANKNIFTY: {bnOptions.noOpportunityReason}</p>
        )}
        {intradayResult.noOpportunityReason && (
          <p className="mt-1 text-xs text-gray-500">Intraday: {intradayResult.noOpportunityReason}</p>
        )}
        {swingResult.noOpportunityReason && (
          <p className="mt-1 text-xs text-gray-500">Swing: {swingResult.noOpportunityReason}</p>
        )}
      </div>

      {/* Best opportunity */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
          Best Opportunity Now
          {best && <span className="ml-2 text-sm font-normal text-gray-400">from {best.engine}</span>}
        </h2>
        {best ? (
          <div className="relative">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-green-400 to-blue-500 opacity-20" />
            <div className="relative">
              {"optionType" in best.item ? (
                <OptionsCard contract={best.item as ContractOpportunity} title={`#1 · ${best.engine}`} />
              ) : (
                <StockCard stock={best.item as StockOpportunity} rank={1} />
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            No opportunities cleared all filters at this time. See decision funnel above for reasons.
          </div>
        )}
      </section>

      {/* Options section */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Options</h2>
        <p className="mb-3 text-xs text-gray-500">
          NIFTY: {niftyOptions.contractsEvaluated} evaluated, {niftyOptions.contractsRejected} rejected
          {niftyOptions.eventRiskPenalty > 0 && `, event-risk penalty −${niftyOptions.eventRiskPenalty}`}
          {" · "}
          BANKNIFTY: {bnOptions.contractsEvaluated} evaluated, {bnOptions.contractsRejected} rejected
          {bnOptions.eventRiskPenalty > 0 && `, event-risk penalty −${bnOptions.eventRiskPenalty}`}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {niftyOptions.topOpportunities.length > 0 ? (
            niftyOptions.topOpportunities.slice(0, 2).map((c, i) => (
              <OptionsCard key={c.strike + c.optionType} contract={c} title={`NIFTY #${i + 1}`} />
            ))
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/50">
              <span className="font-medium">NIFTY:</span> No candidates — {niftyOptions.marketRegime}
              {niftyOptions.noOpportunityReason && <p className="mt-1 text-xs">{niftyOptions.noOpportunityReason}</p>}
            </div>
          )}
          {bnOptions.topOpportunities.length > 0 ? (
            bnOptions.topOpportunities.slice(0, 2).map((c, i) => (
              <OptionsCard key={c.strike + c.optionType} contract={c} title={`BANKNIFTY #${i + 1}`} />
            ))
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/50">
              <span className="font-medium">BANKNIFTY:</span> No candidates — {bnOptions.marketRegime}
              {bnOptions.noOpportunityReason && <p className="mt-1 text-xs">{bnOptions.noOpportunityReason}</p>}
            </div>
          )}
        </div>
      </section>

      {/* Intraday stocks — show ALL, not just 1 */}
      <section>
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Intraday Stocks
          </h2>
          <Badge
            label={intradayResult.freshness}
            color={intradayResult.freshness === "LIVE" ? "green" : intradayResult.freshness === "MOCK" ? "yellow" : "gray"}
          />
        </div>
        <p className="mb-3 text-xs text-gray-500">
          {intradayResult.stocksScanned} scanned · {intradayResult.stocksAvailable} with data · {intradayResult.stocksRejected} rejected ·{" "}
          {intradayResult.topOpportunities.length} candidates
        </p>
        {intradayResult.topOpportunities.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {intradayResult.topOpportunities.map((s, i) => (
              <StockCard key={s.symbol} stock={s} rank={i + 1} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500">No intraday setups cleared all filters.</p>
            {intradayResult.noOpportunityReason && (
              <p className="mt-1 text-xs text-gray-400">{intradayResult.noOpportunityReason}</p>
            )}
          </div>
        )}
      </section>

      {/* Swing stocks — show ALL */}
      <section>
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Swing Stocks</h2>
          <Badge
            label={swingResult.freshness}
            color={swingResult.freshness === "LIVE" ? "green" : swingResult.freshness === "MOCK" ? "yellow" : "gray"}
          />
        </div>
        <p className="mb-3 text-xs text-gray-500">
          {swingResult.stocksScanned} scanned · {swingResult.topOpportunities.length} candidates
        </p>
        {swingResult.topOpportunities.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {swingResult.topOpportunities.map((s, i) => (
              <StockCard key={s.symbol} stock={s} rank={i + 1} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500">No swing setups found.</p>
            {swingResult.noOpportunityReason && (
              <p className="mt-1 text-xs text-gray-400">{swingResult.noOpportunityReason}</p>
            )}
          </div>
        )}
      </section>

      {/* Long-term */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Long-Term Screening</h2>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <Badge label={ltResult.fundamentalDataAvailable ? "DATA AVAILABLE" : "DATA UNAVAILABLE"} color={ltResult.fundamentalDataAvailable ? "green" : "gray"} />
          <p className="mt-2 text-sm text-gray-500">{ltResult.dataAvailabilityMessage}</p>
        </div>
      </section>

      {/* Recent tracked recommendations */}
      {outcomes.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Recent Tracked</h2>
          <div className="space-y-2">
            {outcomes.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <span className="w-8 text-center text-xs font-bold text-gray-500">{outcomeIcon[r.outcome] ?? "?"}</span>
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">{r.underlying}</span>
                    {r.strike && <span className="ml-1.5 text-sm text-gray-500">{r.strike} {r.optionType}</span>}
                    {r.symbol && <span className="ml-1.5 text-sm text-gray-500">{r.symbol}</span>}
                  </div>
                  <GradeBadge grade={r.grade} />
                </div>
                <div className="text-right text-xs text-gray-400">
                  <div>R:R {r.rr}</div>
                  <div>{new Date(r.trackedAt).toLocaleDateString("en-IN")}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
