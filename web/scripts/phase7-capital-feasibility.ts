// Phase 7 research: capital feasibility by width, and alternative width-method comparison. SYNTHETIC — RESEARCH ONLY.
// Existing limits applied without relaxation: 1% risk per trade, 20% capital allocation, 5-lot cap.
// Safety buffer: a 10% margin on the per-lot maximum loss (research assumption). Not a production rule.
import fs from "node:fs";
function erf(x: number) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
const R = 0.065, V = 0.12, T = 3 / 365, S0 = 25000, LOT = 65, ATR = 180;
function call(S: number, K: number) { const sq = V * Math.sqrt(T); const d1 = (Math.log(S / K) + (R + V * V / 2) * T) / sq; const d2 = d1 - sq; return S * N(d1) - K * Math.exp(-R * T) * N(d2); }
const RATE = { stt: 0.001, exch: 0.0003503, sebi: 0.000001, stamp: 0.00003, gst: 0.18 };
function roundTripCost(L: number, Sh: number, mult: number) { // entry and exit legs, base costs
  const brokerage = (4 * 20) / LOT * mult; const turnover = 2 * (L + Sh);
  const exch = RATE.exch * turnover, sebi = RATE.sebi * turnover, stt = RATE.stt * (L + Sh), stamp = RATE.stamp * (L + Sh);
  return brokerage + exch + sebi + stt + stamp + RATE.gst * (brokerage + exch);
}
const SAFETY = 1.10; // 10% buffer on per-lot maximum loss (research assumption)
const CAPITALS = [100000, 170000, 200000, 300000, 500000, 600000];
const WIDTHS = [25, 50, 75, 100, 150, 200, 300];
const STEP = 50;
function row(w: number) {
  const L = call(S0, S0), Sh = call(S0, S0 + w), debit = L - Sh, P = w - debit;
  const cost = roundTripCost(L, Sh, 1.0);
  const lossPerLot = (debit * LOT + cost * LOT) * SAFETY;
  const premiumPerLot = debit * LOT;
  return { w, valid: w % STEP === 0, debit, P, cost, lossPerLot, premiumPerLot, netRR: (P - cost) / (debit + cost) };
}
const rows = WIDTHS.map(row);
// Lots permitted = min(1% risk lots, 20% allocation lots, 5-lot cap), using the buffered loss and the premium.
const lotsFor = (r: ReturnType<typeof row>, cap: number) => Math.max(0, Math.min(Math.floor(cap * 0.01 / r.lossPerLot), Math.floor(cap * 0.2 / r.premiumPerLot), 5));
const capTable = ["| Width | Valid on 50-pt step | Debit/unit | Max profit/unit | Buffered loss per lot (₹) | " + CAPITALS.map((c) => `Lots at ₹${(c / 100000).toFixed(1)}L`).join(" | ") + " |", "|---|---|---|---|---|" + CAPITALS.map(() => "---").join("|") + "|"];
for (const r of rows) capTable.push(`| ${r.w} | ${r.valid ? "yes" : "no"} | ${r.debit.toFixed(1)} | ${r.P.toFixed(1)} | ${Math.round(r.lossPerLot).toLocaleString("en-IN")} | ${CAPITALS.map((c) => lotsFor(r, c)).join(" | ")} |`);
const minCap = (r: ReturnType<typeof row>) => Math.ceil(r.lossPerLot / 0.01 / 1000) * 1000;
const minCapRows = ["| Width | Valid | Minimum capital for 1 lot (1% rule, buffered, costs) | Also needs 20% allocation |", "|---|---|---|---|"];
for (const r of rows) minCapRows.push(`| ${r.w} | ${r.valid ? "yes" : "no"} | ₹${minCap(r).toLocaleString("en-IN")} | ₹${Math.ceil(r.premiumPerLot / 0.2 / 1000) * 1000} |`);
// Alternative width methods (research only): each yields a width; feasibility then checked by the same rules.
const methods: { name: string; pick: (cap: number) => number }[] = [
  { name: "M0 production: daily ATR, rounded up to step", pick: () => Math.ceil(ATR / STEP) * STEP },
  { name: "M1 fixed listed width: 50 points (narrowest valid)", pick: () => 50 },
  { name: "M2 ATR-based with min 50 / max 150", pick: () => Math.min(150, Math.max(50, Math.ceil(ATR / STEP) * STEP)) },
  { name: "M3 volatility bucket (low 50 / normal 100 / high 150)", pick: () => 100 },
  { name: "M4 risk-budget constrained: widest valid width whose buffered loss fits 1%", pick: (cap) => {
      const ok = WIDTHS.filter((w) => w % STEP === 0).map(row).filter((r) => lotsFor(r, cap) >= 1);
      return ok.length ? ok[ok.length - 1].w : 0; } },
];
const mRows = ["| Method | Capital | Selected width | Lots | Buffered loss per lot (₹) | Net R:R after costs | Status |", "|---|---|---|---|---|---|---|"];
for (const m of methods) for (const cap of [100000, 170000, 300000, 500000]) {
  const w = m.pick(cap);
  if (!w) { mRows.push(`| ${m.name} | ₹${cap.toLocaleString("en-IN")} | none | 0 | — | — | NO TRADE |`); continue; }
  const r = row(w), lots = lotsFor(r, cap);
  mRows.push(`| ${m.name} | ₹${cap.toLocaleString("en-IN")} | ${w} | ${lots} | ${Math.round(r.lossPerLot).toLocaleString("en-IN")} | ${r.netRR.toFixed(2)} | ${lots >= 1 ? "feasible under 1% (research)" : "NO TRADE"} |`);
}
const stamp = new Date().toISOString().slice(0, 10);
const banner = "**SYNTHETIC — RESEARCH ONLY.** Not a deposit recommendation, not a trading recommendation, not evidence of profitability. Engine NO-GO. Production unchanged.";
fs.writeFileSync("docs/phase0/CAPITAL_FEASIBILITY_RESEARCH.md", `# Capital feasibility research (${stamp})\n\n${banner}\n\nAssumptions (synthetic): index ${S0}, volatility ${V}, rate ${R}, 3 days to expiry, lot ${LOT}. Costs: base configured rates, round trip. Safety buffer: ${((SAFETY - 1) * 100).toFixed(0)}% on the per-lot maximum loss (research assumption). Limits applied without relaxation: 1% risk, 20% allocation, 5-lot cap.\n\n## Lots permitted by width and capital\n${capTable.join("\n")}\n\n## Minimum capital for one lot\n${minCapRows.join("\n")}\n\nThese figures are minimum estimates from a synthetic model. They are not guaranteed minimums. Real capital needs depend on actual premiums, margin, liquidity and execution.\n`);
fs.writeFileSync("docs/phase0/ALTERNATIVE_WIDTH_METHODS_RESEARCH.md", `# Alternative width methods (research only; ${stamp})\n\n${banner}\n\nEach method picks a width; feasibility is then checked by the same rules (1% risk with buffer, 20% allocation, 5-lot cap). No method is approved for production. Liquidity, bid-ask spread and depth are NOT TESTED (no data).\n\n${mRows.join("\n")}\n\n## Reading\n- A method is only useful if it yields a valid strike width and a lot count of at least one at the capital in use.\n- The risk-budget constrained method (M4) always respects the 1% rule by construction; its outcome shows the widest width that fits at each capital level.\n- Narrower widths reduce debit but also reduce max profit; net reward-to-risk after costs is shown for each choice.\n- Any method needs independent validation and explicit approval before production use.\n`);
console.log("ok", rows.map((r) => `${r.w}:${Math.round(r.lossPerLot)}`).join(" "));
