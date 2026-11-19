// S-04 / S-05 offline research (SYNTHETIC, research only). No production code is changed, no market data, no holdout.
// Compares the current bull-call-spread stop/target formulas with candidate alternatives, using full Black-Scholes
// repricing of both legs, a scenario grid, and per-leg per-side slippage on mid-price plus brokerage.
import fs from "node:fs";
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x: number) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
function price(S: number, K: number, T: number, r: number, v: number) {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T)); const d2 = d1 - v * Math.sqrt(T);
  return S * N(d1) - K * Math.exp(-r * T) * N(d2);
}
// Synthetic market (not observed): index 25000, daily ATR 180, step 50 -> wing width = ceil(180/50)*50 = 200 (engine rule).
const S0 = 25000, ATR = 180, STEP = 50, WIDTH = Math.ceil(ATR / STEP) * STEP, K1 = S0, K2 = S0 + WIDTH;
const R = 0.065, V0 = 0.12, T0 = 3 / 365;
const LOT = 65, BROKER_PER_ORDER = 20;
const SLIP = { base: 0.0, adverse: 0.02, stress: 0.04 }; // per leg, per side, fraction of mid
const COST_MULT = { base: 1.0, adverse: 1.5, stress: 2.0 };

// Spread value (net of mid) for a given underlying, IV and remaining time: long K1 minus short K2.
const spreadMid = (S: number, v: number, T: number) => price(S, K1, T, R, v) - price(S, K2, T, R, v);
// Entry debit with adverse execution: pay mid + slippage on the long leg, receive mid - slippage on the short leg.
function entryDebit(scn: "base" | "adverse" | "stress") {
  const L = price(S0, K1, T0, R, V0), Sh = price(S0, K2, T0, R, V0);
  return { mid: L - Sh, exec: L * (1 + SLIP[scn]) - Sh * (1 - SLIP[scn]) };
}
// Exit value per unit after slippage on both legs (sell long at bid, buy back short at ask).
function exitValue(S: number, v: number, T: number, scn: "base" | "adverse" | "stress") {
  const m = spreadMid(S, v, T);
  const L = price(S, K1, T, R, v), Sh = price(S, K2, T, R, v);
  return L * (1 - SLIP[scn]) - Sh * (1 + SLIP[scn]);
}
const brokerPerUnit = (orders: number) => (orders * BROKER_PER_ORDER) / LOT;

interface SpreadScenarioValues {
  stop3: number;
  target2: number;
}

// Current production formulas (strategy.ts debitSpread), in spread-value units:
const current = (debit: number, maxProfit: number) => ({
  stop: 0.5 * debit,
  t1: debit + 0.5 * maxProfit,
  t2: debit + 0.8 * maxProfit,
});
// Candidate alternatives (research only):
const candidates = {
  "S0 current: 50% of debit": (d: number, _m: number, _s: SpreadScenarioValues) => 0.5 * d,
  "S1 fixed 30% of debit": (d: number) => 0.3 * d,
  "S2 fixed 70% of debit": (d: number) => 0.7 * d,
  "S3 scenario: value at underlying -1 ATR (IV, time held)": (d: number, _m: number, s: SpreadScenarioValues) => s.stop3,
};
const targets = {
  "T0 current: 0.5 of max profit": (d: number, m: number) => d + 0.5 * m,
  "T1 0.8 of max profit (current t2)": (d: number, m: number) => d + 0.8 * m,
  "T2 scenario: value at underlying +1 ATR": (_d: number, _m: number, s: SpreadScenarioValues) => s.target2,
};

// Scenario grid: underlying move (ATR), IV change (relative), days passed. Uniform weights (an assumption).
const moves = [-2, -1, -0.5, 0, 0.5, 1, 2];
const ivs = [-0.2, 0, 0.2];
const days = [0, 1];
const scen: { x: number; iv: number; d: number }[] = [];
for (const x of moves) for (const iv of ivs) for (const d of days) scen.push({ x, iv, d });

function evaluate(scn: "base" | "adverse" | "stress") {
  const e = entryDebit(scn);
  const debit = e.exec; // what is actually paid per unit, including entry slippage
  const maxProfit = WIDTH - debit;
  const aux = {
    stop3: exitValue(S0 - ATR, V0, T0, scn),
    target2: exitValue(S0 + ATR, V0, T0, scn),
  };
  const cost = COST_MULT[scn] * brokerPerUnit(4); // entry 2 orders + exit 2 orders (brokerage per unit)
  const rows: string[] = [];
  rows.push("| Stop | Target | Stop hit | Target hit | Mean P&L per unit after costs | Worst P&L per unit | Gross R:R (plan) | Net R:R after costs |");
  rows.push("|---|---|---|---|---|---|---|---|");
  const out: Record<string, { stopHit: number; tgtHit: number; mean: number; worst: number; rr: number }> = {};
  for (const [sn, sf] of Object.entries(candidates)) for (const [tn, tf] of Object.entries(targets)) {
    const stop = sf(debit, maxProfit, aux);
    const tgt = tf(debit, maxProfit, aux);
    let stopHit = 0, tgtHit = 0, sum = 0, worst = Infinity;
    for (const s of scen) {
      const T = Math.max(T0 - s.d / 365, 1e-6);
      const S = S0 + s.x * ATR;
      const v = V0 * (1 + s.iv);
      const V = exitValue(S, v, T, scn);
      let pnl: number;
      if (V <= stop) { stopHit++; pnl = stop - debit; }
      else if (V >= tgt) { tgtHit++; pnl = tgt - debit; }
      else pnl = V - debit;
      pnl -= cost;
      sum += pnl; worst = Math.min(worst, pnl);
    }
    const n = scen.length;
    const grossRR = (tgt - debit) / (debit - stop); // what the plan shows (no costs)
    const netRR = ((tgt - debit) - cost) / ((debit - stop) + cost);
    out[`${sn} | ${tn}`] = { stopHit: stopHit / n, tgtHit: tgtHit / n, mean: sum / n, worst, rr: netRR };
    rows.push(`| ${sn} | ${tn} | ${(stopHit / n * 100).toFixed(0)}% | ${(tgtHit / n * 100).toFixed(0)}% | ${(sum / n).toFixed(2)} | ${worst.toFixed(2)} | ${grossRR.toFixed(2)} | ${netRR.toFixed(2)} |`);
  }
  return { debit, maxProfit, cost, rows, out, aux };
}

const base = evaluate("base");
const adverse = evaluate("adverse");
const stress = evaluate("stress");
const cur = current(base.debit, base.maxProfit);

const doc = `# S-04 / S-05 spread stop and target — offline research (SYNTHETIC)

Date: ${new Date().toISOString().slice(0, 10)}. Research only. No production code, strategy weights, thresholds, risk limits or Strategy 11.4 were changed. No historical or holdout data was used. Inputs are synthetic (Black-Scholes; index ${S0}; daily ATR ${ATR}; strike step ${STEP}; width ${WIDTH}; volatility ${V0}; rate ${R}; 3 days to expiry; lot ${LOT}).

## 1. Current production implementation (strategy.ts, debitSpread)
- Long leg: nearest strike to delta +0.5 (CE). Short leg: long strike + width.
- Width = ceil(daily ATR / strike step) x strike step (\`wingWidth\`). The width therefore scales with the daily range (see S-05 in STRATEGY_IMPLEMENTATION_AUDIT).
- Entry = debit = long mid − short mid (no slippage in the plan).
- Max profit = width − debit. Max loss = debit (plus costs, not in the plan).
- Stop = 0.5 × debit (spread-value units). Target 1 = debit + 0.5 × max profit. Target 2 = debit + 0.8 × max profit.
- Plan reward-to-risk (plan.rr) = (target1 − entry) / (entry − stop) = max profit / debit, gross of costs.

Hard-coded constants: 0.5 (stop), 0.5 (target 1), 0.8 (target 2), width rule (ATR multiple, rounded up to the strike step). None of these is derived in the documentation.

## 2. Synthetic reference values (base, no slippage)
- Entry debit (mid): ${base.debit.toFixed(2)} per unit. Max profit: ${base.maxProfit.toFixed(2)}.
- Current stop: ${cur.stop.toFixed(2)}. Current target 1: ${cur.t1.toFixed(2)}. Current target 2: ${cur.t2.toFixed(2)}.
- Scenario-based references: spread value at −1 ATR ${base.aux.stop3.toFixed(2)}; at +1 ATR ${base.aux.target2.toFixed(2)}.

## 3. Scenario grid and results (base cost, 1x)
Scenarios: underlying −2 to +2 ATR; IV −20% to +20% (relative); 0 or 1 day passed; 42 equally weighted scenarios (the weighting is an assumption). Exit rule for each scenario: stop if spread value ≤ stop; target if ≥ target; otherwise mark-to-market at scenario end. This is a terminal-value approximation, not a path simulation.

${base.rows.join("\n")}

## 4. Cost and slippage sensitivity
Slippage is per leg, per execution side, as a fraction of mid. Entry and exit both pay it on both legs. Brokerage is ₹20 per order (4 orders per round trip), converted per unit. Bid-ask is not added on top of the slippage assumption, so it is not double-counted.

### Adverse (1.5x costs, 2% slippage) — all candidates
${adverse.rows.join("\n")}

### Stress (2x costs, 4% slippage) — all candidates
${stress.rows.join("\n")}

## 5. Mathematical explanation
Spread value V(S, σ, t) = C(S, K1, σ, t) − C(S, K2, σ, t). Debit D = V at entry. Maximum profit = (K2 − K1) − D. Maximum loss = D (plus costs). Any stop or target expressed in spread value is an exit level on V. Premium changes of one leg alone are not the spread's P&L; both legs must be repriced (done here).

## 6. Failure cases
- Stop at 50% of debit is reached with no underlying move after one day (theta), so the stop can fire on time decay alone (see the no-move, 1-day rows).
- Targets at 80% of max profit are rarely reached when the underlying moves only half an ATR; they cost little to set but rarely fill.
- Plan reward-to-risk is gross. After costs and slippage it is lower, and the plan does not show that difference.
- Width tied to daily ATR means wide spreads with high debit on volatile days, which lowers the reward-to-risk.
- A scenario-based stop (−1 ATR) is a loss level that depends on the assumed volatility; if real IV differs, the level is wrong.

## 7. Candidate assessment (not validation)
- **Stop:** the fixed-fraction candidates (30%, 50%, 70%) trade off early exits against holding losers. The scenario-based stop ties the exit to a stated underlying move, which is more interpretable but depends on volatility and time assumptions.
- **Target:** the fixed fraction of max profit is simple and bounded. The scenario target at +1 ATR is linked to the same move the engine uses for the long-option analysis.
- **Recommended research candidate:** a scenario-based stop and a scenario-based target, each defined from full repricing of both legs, evaluated under the three cost scenarios. Recommendation is for research only. It is not evidence that any candidate works.

## 8. Synthetic results are not validation
These numbers come from one synthetic market with assumed volatility, rate and weights. A formula that looks best here has not been validated and must not be called validated. Validation needs real option prices, IV history and expiry data (BLOCKED), and a new holdout after a formal freeze.

## 9. Evidence still missing
Observed bid-ask and depth for both legs; IV history; actual expiry-day behaviour; verified cost schedules by effective date; a point-in-time option dataset; and a frozen strategy specification before any holdout is opened.
`;
fs.writeFileSync("docs/phase0/SPREAD_STOP_TARGET_RESEARCH.md", doc);
console.log("written", WIDTH, base.debit.toFixed(2), base.maxProfit.toFixed(2));
