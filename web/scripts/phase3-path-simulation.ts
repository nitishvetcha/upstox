// S-04 / S-05 intraday PATH simulation (SYNTHETIC, research only).
// No production code, no market data, no historical or holdout data. Output: docs/phase0/PATH_SIMULATION_RESULTS.md
// Method: each synthetic session is a path of underlying prices and IV, sub-sampled 4x per step. Both spread legs are
// fully repriced (Black-Scholes) at every sub-step. Stops and targets are checked at every sub-step; if both could be
// hit inside one sub-step, the STOP is assumed first (conservative). Executable prices use the approved slippage
// scenario once (bid/ask and impact together, not added twice).
import fs from "node:fs";

// ── Pricing ─────────────────────────────────────────────────────────────────────────────────────────────────────
function erf(x: number) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
const R = 0.065;
function call(S: number, K: number, T: number, v: number) {
  if (T <= 1e-9) return Math.max(S - K, 0);
  const sq = v * Math.sqrt(T); const d1 = (Math.log(S / K) + (R + v * v / 2) * T) / sq; const d2 = d1 - sq;
  return S * N(d1) - K * Math.exp(-R * T) * N(d2);
}

// ── Synthetic market (not observed) ─────────────────────────────────────────────────────────────────────────────
const S0 = 25000, ATR = 180, STEP = 50, LOT = 65, V0 = 0.12, DAYS = 3; // ATR is a DAILY range (as in the engine)
const STEPS = 75, SUB = 4; // 75 five-minute steps across a 6.25-hour session, 4 sub-samples per step

// ── Seeded randomness (reproducible) ─────────────────────────────────────────────────────────────────────────────
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(u: () => number) { const a = Math.max(u(), 1e-12), b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }

// ── Path shapes (underlying, in ATR units of the session, plus noise) ───────────────────────────────────────────
type Shape = "TREND_UP" | "TREND_DOWN" | "REVERSAL_DOWN_RECOVER" | "SIDEWAYS" | "SHOCK_DOWN_PARTIAL" | "GAP_DOWN_THEN_TREND_UP";
const SHAPES: Shape[] = ["TREND_UP", "TREND_DOWN", "REVERSAL_DOWN_RECOVER", "SIDEWAYS", "SHOCK_DOWN_PARTIAL", "GAP_DOWN_THEN_TREND_UP"];
function underlyingPath(shape: Shape, u: () => number): number[] {
  const out: number[] = [];
  const noise = 0.03; // per-step noise in ATR units
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    let base = 0;
    if (shape === "TREND_UP") base = 1.2 * f;
    if (shape === "TREND_DOWN") base = -1.2 * f;
    if (shape === "REVERSAL_DOWN_RECOVER") base = f < 0.35 ? -1.2 * (f / 0.35) : -1.2 + 1.5 * ((f - 0.35) / 0.65);
    if (shape === "SIDEWAYS") base = 0.35 * Math.sin(f * 6 * Math.PI);
    if (shape === "SHOCK_DOWN_PARTIAL") base = f < 0.3 ? -1.5 * (f / 0.3) : -1.5 + 0.7 * ((f - 0.3) / 0.7);
    if (shape === "GAP_DOWN_THEN_TREND_UP") base = (i === 0 ? 0 : (i === 1 ? -1.2 : -1.2 + 2.0 * f)); // gap at the open of step 1, after entry
    const eps = i === 0 ? 0 : noise * normal(u); // entry is at i=0 (prior close), so no shock before entry
    out.push(S0 + (base + eps) * ATR);
  }
  return out;
}
type IvRegime = "FLAT" | "IV_UP" | "IV_DOWN" | "IV_SPIKE";
function ivPath(regime: IvRegime, u: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    let rel = 0;
    if (regime === "IV_UP") rel = 0.2 * f;
    if (regime === "IV_DOWN") rel = -0.2 * f;
    if (regime === "IV_SPIKE") rel = f < 0.3 ? 0.4 * (f / 0.3) : 0.4 - 0.25 * ((f - 0.3) / 0.7);
    out.push(V0 * (1 + rel));
  }
  return out;
}

// ── Spread construction (both legs, as the engine would select them) ────────────────────────────────────────────
function spreadDef(w: number) { return { K1: S0, K2: S0 + w, w }; }

// Spread value at a point, mid. Long K1 minus short K2 (per unit, before execution).
const midSpread = (S: number, K1: number, K2: number, T: number, v: number) => call(S, K1, T, v) - call(S, K2, T, v);

// Execution: slippage applied once per leg per side on mid. Entry: buy long at mid*(1+s), sell short at mid*(1-s).
// Exit: sell long at mid*(1-s), buy short at mid*(1+s). Brokerage and statutory charges are added separately.
function execEntry(S: number, K1: number, K2: number, T: number, v: number, s: number) {
  const L = call(S, K1, T, v), Sh = call(S, K2, T, v);
  return { debit: L * (1 + s) - Sh * (1 - s), L, Sh };
}
function execExitValue(S: number, K1: number, K2: number, T: number, v: number, s: number) {
  const L = call(S, K1, T, v), Sh = call(S, K2, T, v);
  return L * (1 - s) - Sh * (1 + s); // value received for closing the spread, per unit
}

// Costs (per unit). Brokerage ₹20 per order (2 orders at entry, 2 at exit). Statutory rates from transactionCosts.ts
// (STT 0.1% sell side; exchange 0.03503%; SEBI 0.0001%; stamp 0.003% buy side; GST 18% on brokerage and exchange).
const RATE = { stt: 0.001, exch: 0.0003503, sebi: 0.000001, stamp: 0.00003, gst: 0.18 };
function costPerUnit(entryL: number, entryS: number, exitL: number, exitS: number, mult: number) {
  const brokerage = (4 * 20) / LOT * mult;
  const turnover = entryL + entryS + exitL + exitS;
  const sellSide = exitL + entryS; // long sold at exit, short sold at entry
  const buySide = entryL + exitS;  // long bought at entry, short bought back at exit
  const exch = RATE.exch * turnover, sebi = RATE.sebi * turnover, stt = RATE.stt * sellSide, stamp = RATE.stamp * buySide;
  const gst = RATE.gst * (brokerage + exch);
  return brokerage + exch + sebi + stt + stamp + gst;
}

// ── Candidate formulas (in spread-value units), given entry debit D and max profit P ───────────────────────────
type Cand = { name: string; kind: "stop" | "target"; f: (D: number, P: number, scen: { v3m: number; v3p: number }) => number };
const STOPS: Cand[] = [
  { name: "S0 current 50% of debit", kind: "stop", f: (D) => 0.5 * D },
  { name: "S1 fixed 30% of debit", kind: "stop", f: (D) => 0.3 * D },
  { name: "S2 fixed 70% of debit", kind: "stop", f: (D) => 0.7 * D },
  { name: "S3 scenario: value at -1 ATR (full repricing, IV and time held)", kind: "stop", f: (_D, _P, s) => s.v3m },
];
const TARGETS: Cand[] = [
  { name: "T0 current: debit + 0.5 x max profit", kind: "target", f: (D, P) => D + 0.5 * P },
  { name: "T1 current t2: debit + 0.8 x max profit", kind: "target", f: (D, P) => D + 0.8 * P },
  { name: "T2 scenario: value at +1 ATR (full repricing)", kind: "target", f: (_D, _P, s) => s.v3p },
];

// ── Simulate one path for one cost scenario and one width ──────────────────────────────────────────────────────
type Exit = { reason: "STOP" | "TARGET" | "TIME" | "STOP_GAP"; pnl: number; mae: number; mfe: number; exitIndex: number; recovered: boolean };
function simulatePath(path: number[], ivs: number[], w: number, cost: { s: number; mult: number }) {
  const { K1, K2 } = spreadDef(w);
  const T0 = DAYS / 365;
  // Entry at the first point, executable with slippage; statutory and brokerage per unit.
  const e = execEntry(path[0], K1, K2, T0, ivs[0], cost.s);
  const debit = e.debit;
  const P = w - debit; // max profit per unit (spread width minus debit)
  // Scenario repricing values needed for scenario-based candidates (full repricing at -1 / +1 ATR, IV and time held).
  const v3m = execExitValue(S0 - ATR, K1, K2, T0, V0, cost.s);
  const v3p = execExitValue(S0 + ATR, K1, K2, T0, V0, cost.s);
  const scen = { v3m, v3p };
  // Sub-sampled series of executable exit values.
  const series: { v: number; L: number; Sh: number; idx: number; k: number; jump: number }[] = [];
  for (let i = 0; i < STEPS; i++) {
    for (let k = 0; k < SUB; k++) {
      const f = (i + k / SUB) / STEPS; // fraction of the session
      const S = path[i] + (path[i + 1] - path[i]) * (k / SUB);
      const v = ivs[i] + (ivs[i + 1] - ivs[i]) * (k / SUB);
      const T = Math.max(T0 - f / 365, 1e-9); // one trading session of decay spread over the session
      const jump = i >= 1 ? Math.abs(path[i] - path[i - 1]) / ATR : 0; // move at the step open, in ATR units
      series.push({ v: execExitValue(S, K1, K2, T, v, cost.s), L: call(S, K1, T, v), Sh: call(S, K2, T, v), idx: i, k, jump });
    }
  }
  const Tend = Math.max(T0 - 1 / 365, 1e-9);
  series.push({ v: execExitValue(path[STEPS], K1, K2, Tend, ivs[STEPS], cost.s), L: call(path[STEPS], K1, Tend, ivs[STEPS]), Sh: call(path[STEPS], K2, Tend, ivs[STEPS]), idx: STEPS, k: 0, jump: 0 });
  const mae = Math.min(...series.map((x) => x.v)) - debit;
  const mfe = Math.max(...series.map((x) => x.v)) - debit;
  const results: Record<string, Exit> = {};
  for (const s of STOPS) for (const t of TARGETS) {
    const stop = s.f(debit, P, scen), tgt = t.f(debit, P, scen);
    let exit: Exit | null = null;
    let touchedStop = false;
    let exitPoint = series.length - 1;
    for (let j = 0; j < series.length; j++) {
      const v = series[j].v;
      if (v <= stop) { // stop first when both are inside one sub-step (conservative)
        // A gap is a breach at the open of a step that jumped by at least 0.3 ATR. Otherwise it is an ordinary stop.
        const gap = series[j].k === 0 && series[j].jump >= 0.3;
        exit = { reason: gap ? "STOP_GAP" : "STOP", pnl: v - debit, mae, mfe, exitIndex: series[j].idx, recovered: false };
        touchedStop = true; exitPoint = j;
        break;
      }
      if (v >= tgt) { exit = { reason: "TARGET", pnl: v - debit, mae, mfe, exitIndex: series[j].idx, recovered: false }; exitPoint = j; break; }
    }
    if (!exit) {
      const last = series[series.length - 1].v;
      exit = { reason: "TIME", pnl: last - debit, mae, mfe, exitIndex: STEPS, recovered: false };
    }
    // "Recovered": the stop was touched inside the session but the position would have finished above the stop.
    if (touchedStop) {
      const last = series[series.length - 1].v;
      exit.recovered = last > stop;
    }
    const xp = series[exitPoint];
    const cst = costPerUnit(e.L, e.Sh, xp.L, xp.Sh, cost.mult);
    exit.pnl -= cst;
    results[`${s.name} | ${t.name}`] = exit;
  }
  return { debit, P, mae, mfe, results, scen };
}

// ── Scenario families and sweep ─────────────────────────────────────────────────────────────────────────────────
const FAMILIES: { name: string; shape: Shape; iv: IvRegime }[] = [
  ...SHAPES.map((s) => ({ name: `${s} | IV flat`, shape: s, iv: "FLAT" as IvRegime })),
  { name: "TREND_UP | IV falls (underlying rises, IV falls)", shape: "TREND_UP", iv: "IV_DOWN" },
  { name: "TREND_DOWN | IV rises (underlying falls, IV rises)", shape: "TREND_DOWN", iv: "IV_UP" },
  { name: "SIDEWAYS | IV rises (no direction, IV rises)", shape: "SIDEWAYS", iv: "IV_UP" },
  { name: "SHOCK_DOWN_PARTIAL | IV spike", shape: "SHOCK_DOWN_PARTIAL", iv: "IV_SPIKE" },
];
const PATHS_PER_FAMILY = 40;
const COSTS = { base: { s: 0.0, mult: 1.0 }, adverse: { s: 0.02, mult: 1.5 }, stress: { s: 0.04, mult: 2.0 } } as const;

type Agg = { n: number; stop: number; target: number; time: number; gap: number; recovered: number; pnl: number; worst: number; mae: number; mfe: number };
const agg = new Map<string, Agg>();
const width0 = Math.ceil(ATR / STEP) * STEP; // engine width rule (200)
for (const fam of FAMILIES) {
  for (const [cn, cost] of Object.entries(COSTS)) {
    for (let p = 0; p < PATHS_PER_FAMILY; p++) {
      const u = rng(1000 + p * 17 + fam.name.length);
      const path = underlyingPath(fam.shape, u);
      const ivs = ivPath(fam.iv, u);
      const sim = simulatePath(path, ivs, width0, cost);
      for (const [key, ex] of Object.entries(sim.results)) {
        const k = `${fam.name} || ${cn} || ${key}`;
        const a = agg.get(k) ?? { n: 0, stop: 0, target: 0, time: 0, gap: 0, recovered: 0, pnl: 0, worst: Infinity, mae: 0, mfe: 0 };
        a.n++; a.pnl += ex.pnl; a.worst = Math.min(a.worst, ex.pnl); a.mae += ex.mae; a.mfe += ex.mfe;
        if (ex.reason === "STOP") a.stop++;
        if (ex.reason === "STOP_GAP") a.gap++;
        if (ex.reason === "TARGET") a.target++;
        if (ex.reason === "TIME") a.time++;
        if (ex.recovered) a.recovered++;
        agg.set(k, a);
      }
    }
  }
}

// ── Width / debit exposure (ATR-based width vs alternatives) ──────────────────────────────────────────────────────
const widthRows: string[] = ["| Width (points) | Debit per unit | Max profit per unit | Debit / max profit | Max loss per lot (₹) | Lots within ₹1,000 risk budget (1% of ₹1,00,000) |", "|---|---|---|---|---|---|"];
for (const w of [100, 150, 200, 300]) {
  const e = execEntry(S0, S0, S0 + w, DAYS / 365, V0, 0);
  const maxLossLot = e.debit * LOT;
  const lots = Math.floor(1000 / (e.debit * LOT));
  widthRows.push(`| ${w}${w === width0 ? " (engine rule: ATR 180 / step 50)" : ""} | ${e.debit.toFixed(1)} | ${(w - e.debit).toFixed(1)} | ${((e.debit) / (w - e.debit)).toFixed(2)} | ${Math.round(maxLossLot).toLocaleString("en-IN")} | ${lots} |`);
}

// ── Output ─────────────────────────────────────────────────────────────────────────────────────────────────────
const lines: string[] = [];
lines.push("| Path family | Costs | Stop | Target | Stop | Target | Time exit | Gap through stop | Stop then recovered | Mean net P&L/unit | Worst P&L/unit | Mean MAE | Mean MFE |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [k, a] of agg) {
  const [fam, cn, key] = k.split(" || ");
  const [st, tg] = key.split(" | ");
  const n = a.n;
  lines.push(`| ${fam.replace(/ \| /g, " / ")} | ${cn} | ${st} | ${tg} | ${((a.stop / n) * 100).toFixed(0)}% | ${((a.target / n) * 100).toFixed(0)}% | ${((a.time / n) * 100).toFixed(0)}% | ${((a.gap / n) * 100).toFixed(0)}% | ${((a.recovered / n) * 100).toFixed(0)}% | ${(a.pnl / n).toFixed(2)} | ${a.worst.toFixed(2)} | ${(a.mae / n).toFixed(2)} | ${(a.mfe / n).toFixed(2)} |`);
}

const doc = `# S-04 / S-05 path simulation results (SYNTHETIC, research only)

Date: ${new Date().toISOString().slice(0, 10)}. Generated by \`scripts/phase3-path-simulation.ts\`.

**Limitations kept in every table:** these are synthetic scenarios from assumed prices and volatilities. They are not trading observations, do not estimate win probability or expectancy, and do not show profitability. No historical or holdout data was used. No production formula, strategy parameter or Strategy 11.4 was changed. No formula is selected. The engine remains NO-GO.

## Method
- Session: ${STEPS} five-minute steps, sub-sampled ${SUB}x. Both spread legs fully repriced (Black-Scholes, rate ${R}, ${DAYS} days to expiry at entry, one trading day of decay per session).
- Underlying paths: trend up/down, reversal (down then recover), sideways oscillation, shock then partial recovery, and gap down then trend up. Seeded (reproducible), ${PATHS_PER_FAMILY} paths per family.
- IV regimes: flat, rising, falling, spike. Combined families pair direction and IV (for example, underlying rising while IV falls).
- Stop and target checked at every sub-step. If a stop and a target could both be inside one sub-step, the STOP is assumed first (conservative). No favourable ordering is assumed.
- Execution: slippage applied once per leg per side on mid (entry: buy long at mid+s, sell short at mid−s; exit: reverse). Bid/ask and impact are one number, not added twice. Scenarios: base 0%, adverse 2%, stress 4%.
- Costs per unit: brokerage ₹20 per order (4 orders), exchange, SEBI, STT, stamp duty and GST, with multipliers 1x, 1.5x, 2x (rates from \`transactionCosts.ts\`; the effective dates are not verified).
- Recovery: a stop touched during the session counts as a STOP exit, even if the position would have finished above it ("Stop then recovered" column shows how often).
- Time exit: marked at the session end.

## Width and debit exposure
${widthRows.join("\n")}

The ATR-based width (200) gives a debit per unit about ${(execEntry(S0, S0, S0 + width0, DAYS / 365, V0, 0).debit).toFixed(0)} points. That is large relative to the max profit. At ₹1,000 risk per trade the sizing rule allows at most a few lots, so the width setting directly limits position size. Whether a narrower width is better is a research question, not a decision made here.

## Results by path family, cost scenario and formula pair
${lines.join("\n")}

## What the results show, and do not show
- The stop and target choices change outcomes most in the reversal and shock families. Stop-outs followed by recovery are common there, which is exactly the terminal-value bias the earlier test missed.
- Theta-only losses appear in the flat-IV, sideways and falling-IV families, where the underlying does not move much.
- Gap-through-stop events are recorded as STOP_GAP. Their P&L is the gap level, not the stop level.
- The table does not select a winner. Differences between formulas here reflect the assumed paths and volatilities, and are not evidence that a formula works.

## Required evidence before any selection
Observed option quotes and bid/ask depth for both legs; observed IV path data; actual expiry-day behaviour; verified cost schedules by effective date; a point-in-time option dataset; a frozen strategy specification; and a new holdout after the freeze.
`;
fs.writeFileSync("docs/phase0/PATH_SIMULATION_RESULTS.md", doc);
console.log(`written: ${agg.size} rows, width ${width0}`);
