// Expanded path simulation + spread width feasibility. SYNTHETIC — RESEARCH ONLY.
// Implements docs/phase0/EXPANDED_PATH_SIMULATION_SPECIFICATION.md. Refuses to run if that file's hash changed.
// No production code, no market data, no historical or holdout data. Writes docs/phase0/*.md.
import fs from "node:fs";
import crypto from "node:crypto";

const SPEC = "docs/phase0/EXPANDED_PATH_SIMULATION_SPECIFICATION.md";
const FROZEN_SHA = "eecb87ed49c710144e2e5ed2e306140234776628905819872578637b18de99dd";
const specSha = crypto.createHash("sha256").update(fs.readFileSync(SPEC)).digest("hex");
if (specSha !== FROZEN_SHA) { console.error(`SPEC CHANGED: ${specSha} != frozen ${FROZEN_SHA}. Refusing to run.`); process.exit(2); }

// ── Pricing (Black-Scholes; synthetic) ───────────────────────────────────────────────────────────────────────────
function erf(x: number) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
type Model = { rate: number; days: number; volLevel: number };
const BASE_MODEL: Model = { rate: 0.065, days: 3, volLevel: 0.12 };
const S0 = 25000, ATR = 180, LOT = 65, STEPS = 75, SUB = 4;
function call(S: number, K: number, T: number, v: number, r: number) {
  if (T <= 1e-9) return Math.max(S - K, 0);
  const sq = v * Math.sqrt(T); const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / sq; const d2 = d1 - sq;
  return S * N(d1) - K * Math.exp(-r * T) * N(d2);
}
const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const normal = (u: () => number) => { const a = Math.max(u(), 1e-12), b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };

// ── Families (frozen) ────────────────────────────────────────────────────────────────────────────────────────────
type Cat = "Directional" | "Non-directional" | "Reversal" | "Sudden" | "Combined";
type IvShape = "flat" | "up20" | "down20" | "spike40" | "expand30" | "contract30";
const FAMILIES: { name: string; cat: Cat; kf: [number, number][]; iv: IvShape; zigzag?: number }[] = [
  { name: "STRONG_UP", cat: "Directional", kf: [[0, 0], [1, 2.0]], iv: "flat" },
  { name: "WEAK_UP", cat: "Directional", kf: [[0, 0], [1, 0.6]], iv: "flat" },
  { name: "STRONG_DOWN", cat: "Directional", kf: [[0, 0], [1, -2.0]], iv: "flat" },
  { name: "WEAK_DOWN", cat: "Directional", kf: [[0, 0], [1, -0.6]], iv: "flat" },
  { name: "TIGHT_SIDEWAYS", cat: "Non-directional", kf: [[0, 0], [0.25, 0.15], [0.5, -0.15], [0.75, 0.15], [1, 0]], iv: "flat" },
  { name: "WIDE_SIDEWAYS", cat: "Non-directional", kf: [[0, 0], [0.25, 0.6], [0.5, -0.6], [0.75, 0.6], [1, 0]], iv: "flat" },
  { name: "CHOPPY", cat: "Non-directional", kf: [[0, 0], [0.1, 0.3], [0.2, -0.2], [0.3, 0.4], [0.4, -0.3], [0.5, 0.2], [0.6, -0.4], [0.7, 0.3], [0.8, -0.2], [0.9, 0.2], [1, 0]], iv: "flat" },
  { name: "FALSE_BREAKOUT", cat: "Non-directional", kf: [[0, 0], [0.3, 0.8], [0.6, 0], [1, -0.1]], iv: "flat" },
  { name: "BULL_REVERSAL", cat: "Reversal", kf: [[0, 0], [0.4, -1.0], [1, 0.5]], iv: "flat" },
  { name: "BEAR_REVERSAL", cat: "Reversal", kf: [[0, 0], [0.4, 1.0], [1, -0.5]], iv: "flat" },
  { name: "MULTI_REVERSAL", cat: "Reversal", kf: [[0, 0], [0.2, 0.8], [0.4, -0.8], [0.6, 0.8], [0.8, -0.8], [1, 0]], iv: "flat" },
  { name: "BREAKOUT_FAILURE", cat: "Reversal", kf: [[0, 0], [0.4, 1.0], [0.7, -0.5], [1, -0.5]], iv: "flat" },
  { name: "GAP_UP", cat: "Sudden", kf: [[0, 0], [0.02, 1.0], [1, 1.0]], iv: "flat" },
  { name: "GAP_DOWN", cat: "Sudden", kf: [[0, 0], [0.02, -1.2], [1, -0.2]], iv: "flat" },
  { name: "FLASH_CRASH", cat: "Sudden", kf: [[0, 0], [0.48, 0], [0.5, -1.5], [0.52, -1.5], [1, 0]], iv: "spike40" },
  { name: "SUDDEN_RECOVERY", cat: "Sudden", kf: [[0, 0], [0.4, -0.8], [0.45, 0.2], [1, 0.2]], iv: "flat" },
  { name: "VOL_SHOCK", cat: "Sudden", kf: [[0, 0], [0.35, -1.0], [1, -0.8]], iv: "spike40" },
  { name: "UP_IV_DOWN", cat: "Combined", kf: [[0, 0], [1, 1.0]], iv: "down20" },
  { name: "DOWN_IV_UP", cat: "Combined", kf: [[0, 0], [1, -1.0]], iv: "up20" },
  { name: "UP_IV_UP", cat: "Combined", kf: [[0, 0], [1, 1.0]], iv: "up20" },
  { name: "DOWN_IV_DOWN", cat: "Combined", kf: [[0, 0], [1, -1.0]], iv: "down20" },
  { name: "SIDEWAYS_IV_EXPAND", cat: "Combined", kf: [[0, 0], [0.25, 0.3], [0.5, -0.3], [0.75, 0.3], [1, 0]], iv: "expand30" },
  { name: "SIDEWAYS_IV_CONTRACT", cat: "Combined", kf: [[0, 0], [0.25, 0.3], [0.5, -0.3], [0.75, 0.3], [1, 0]], iv: "contract30" },
];
const CATS: Cat[] = ["Directional", "Non-directional", "Reversal", "Sudden", "Combined"];
const STRESS_W: Record<Cat, number> = { Directional: 0.10, "Non-directional": 0.15, Reversal: 0.25, Sudden: 0.35, Combined: 0.15 };
const SETB_W: Record<Cat, number> = { Directional: 0.40, "Non-directional": 0.20, Reversal: 0.20, Sudden: 0.10, Combined: 0.10 };
const PATHS = 40;

function underlying(kf: [number, number][], u: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    let x = kf[kf.length - 1][1];
    for (let k = 0; k < kf.length - 1; k++) {
      const [f0, x0] = kf[k], [f1, x1] = kf[k + 1];
      if (f >= f0 && f <= f1) { x = f1 === f0 ? x1 : x0 + (x1 - x0) * (f - f0) / (f1 - f0); break; }
    }
    const eps = i === 0 ? 0 : 0.03 * normal(u);
    out.push(S0 + (x + eps) * ATR);
  }
  return out;
}
function ivSeries(shape: IvShape, base: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    let rel = 0;
    if (shape === "up20") rel = 0.2 * f;
    if (shape === "down20") rel = -0.2 * f;
    if (shape === "expand30") rel = 0.3 * f;
    if (shape === "contract30") rel = -0.3 * f;
    if (shape === "spike40") rel = f < 0.4 ? 0.4 * (f / 0.4) : 0.4 - 0.4 * Math.min(1, (f - 0.4) / 0.6);
    out.push(base * (1 + rel));
  }
  return out;
}

// ── Spread execution ─────────────────────────────────────────────────────────────────────────────────────────────
const RATE_CFG = { stt: 0.001, exch: 0.0003503, sebi: 0.000001, stamp: 0.00003, gst: 0.18 };
function legs(S: number, w: number, T: number, v: number, m: Model) { return { L: call(S, S0, T, v, m.rate), Sh: call(S, S0 + w, T, v, m.rate) }; }
function costPerUnit(eL: number, eS: number, xL: number, xS: number, mult: number) {
  const brokerage = (4 * 20) / LOT * mult;
  const turnover = eL + eS + xL + xS;
  const exch = RATE_CFG.exch * turnover, sebi = RATE_CFG.sebi * turnover;
  const stt = RATE_CFG.stt * (xL + eS), stamp = RATE_CFG.stamp * (eL + xS);
  return brokerage + exch + sebi + stt + stamp + RATE_CFG.gst * (brokerage + exch);
}
type Cost = { name: string; s: number; mult: number; legExtra: number };
const COSTS: Cost[] = [
  { name: "base", s: 0.0, mult: 1.0, legExtra: 0 },
  { name: "adverse", s: 0.02, mult: 1.5, legExtra: 0 },
  { name: "stress", s: 0.04, mult: 2.0, legExtra: 0 },
  { name: "legging", s: 0.0, mult: 1.0, legExtra: 0.01 },
];

type ScenarioValues = { v3m: number; v3p: number };
type Cand = { name: string; stop: (D: number, P: number, sc: ScenarioValues) => number; target: (D: number, P: number, sc: ScenarioValues) => number };
const STOPS: { name: string; f: (D: number, sc: ScenarioValues) => number }[] = [
  { name: "S0 50% of debit", f: (D) => 0.5 * D },
  { name: "S1 30% of debit", f: (D) => 0.3 * D },
  { name: "S2 70% of debit", f: (D) => 0.7 * D },
  { name: "S3 scenario -1 ATR", f: (_D, sc) => sc.v3m },
];
const TARGETS: { name: string; f: (D: number, P: number, sc: ScenarioValues) => number }[] = [
  { name: "T0 0.5 of max profit", f: (D, P) => D + 0.5 * P },
  { name: "T1 0.8 of max profit", f: (D, P) => D + 0.8 * P },
  { name: "T2 scenario +1 ATR", f: (_D, _P, sc) => sc.v3p },
];

type Exit = { reason: "STOP" | "STOP_GAP" | "TARGET" | "TIME"; pnl: number; recovered: boolean; mae: number; mfe: number; cost: number; debit: number; maxProfit: number; execCostPct: number };
function simulate(path: number[], ivs: number[], w: number, cost: Cost, m: Model) {
  const T0 = m.days / 365;
  const e0 = legs(path[0], w, T0, ivs[0], m);
  const entryL = e0.L * (1 + cost.s);
  const entryS = e0.Sh * (1 - cost.s);
  // Legging: the second leg is filled at a worse price (extra adverse fill on the short leg).
  const debitUnit = entryL - entryS * (1 - cost.legExtra) + 0 * cost.legExtra;
  const debit = debitUnit;
  const P = w - debit;
  const sc = {
    v3m: (() => { const x = legs(S0 - ATR, w, T0, m.volLevel, m); return x.L * (1 - cost.s) - x.Sh * (1 + cost.s); })(),
    v3p: (() => { const x = legs(S0 + ATR, w, T0, m.volLevel, m); return x.L * (1 - cost.s) - x.Sh * (1 + cost.s); })(),
  };
  const series: { v: number; L: number; Sh: number; idx: number; k: number; jump: number }[] = [];
  for (let i = 0; i < STEPS; i++) for (let k = 0; k < SUB; k++) {
    const f = (i + k / SUB) / STEPS;
    const S = path[i] + (path[i + 1] - path[i]) * (k / SUB);
    const v = ivs[i] + (ivs[i + 1] - ivs[i]) * (k / SUB);
    const T = Math.max(T0 - f / 365, 1e-9);
    const x = legs(S, w, T, v, m);
    series.push({ v: x.L * (1 - cost.s) - x.Sh * (1 + cost.s), L: x.L, Sh: x.Sh, idx: i, k, jump: i >= 1 ? Math.abs(path[i] - path[i - 1]) / ATR : 0 });
  }
  const Tend = Math.max(T0 - 1 / 365, 1e-9);
  const xe = legs(path[STEPS], w, Tend, ivs[STEPS], m);
  series.push({ v: xe.L * (1 - cost.s) - xe.Sh * (1 + cost.s), L: xe.L, Sh: xe.Sh, idx: STEPS, k: 0, jump: 0 });
  const mae = Math.min(...series.map((x) => x.v)) - debit;
  const mfe = Math.max(...series.map((x) => x.v)) - debit;
  const out: Record<string, Exit> = {};
  for (const s of STOPS) for (const t of TARGETS) {
    const stop = s.f(debit, sc), tgt = t.f(debit, P, sc);
    let ex: Exit | null = null, stopped = false, exitP = series.length - 1;
    for (let j = 0; j < series.length; j++) {
      const v = series[j].v;
      if (v <= stop) {
        const gap = series[j].k === 0 && series[j].jump >= 0.3;
        ex = { reason: gap ? "STOP_GAP" : "STOP", pnl: v - debit, recovered: false, mae, mfe, cost: 0, debit, maxProfit: P, execCostPct: 0 };
        stopped = true; exitP = j; break;
      }
      if (v >= tgt) { ex = { reason: "TARGET", pnl: v - debit, recovered: false, mae, mfe, cost: 0, debit, maxProfit: P, execCostPct: 0 }; exitP = j; break; }
    }
    if (!ex) ex = { reason: "TIME", pnl: series[series.length - 1].v - debit, recovered: false, mae, mfe, cost: 0, debit, maxProfit: P, execCostPct: 0 };
    if (stopped) ex.recovered = series[series.length - 1].v > stop;
    const xp = series[exitP];
    const c = costPerUnit(e0.L, e0.Sh, xp.L, xp.Sh, cost.mult);
    ex.cost = c; ex.pnl -= c; ex.execCostPct = debit > 0 ? (c / debit) * 100 : 0;
    out[`${s.name} | ${t.name}`] = ex;
  }
  return { out, debit, P };
}

// ── Runner: equal-weight primary, stress-weighted, set B; per width and cost; per model variant ──────────────
type Acc = { w: number; mean: number; worst: number; stop: number; tgt: number; time: number; gap: number; rec: number; mae: number; mfe: number; debitPct: number; cost: number; pctMP: number; n: number };
function runFamilies(seedOffset: number, w: number, cost: Cost, m: Model) {
  const per: Record<string, Record<string, Acc>> = {}; // family -> candidate -> acc
  for (let fi = 0; fi < FAMILIES.length; fi++) {
    const fam = FAMILIES[fi];
    per[fam.name] = {};
    for (let p = 0; p < PATHS; p++) {
      const u = rng(seedOffset + fi * 1000 + p);
      const path = underlying(fam.kf, u);
      const ivs = ivSeries(fam.iv, m.volLevel);
      const sim = simulate(path, ivs, w, cost, m);
      for (const [key, ex] of Object.entries(sim.out)) {
        const a = per[fam.name][key] ?? { w, mean: 0, worst: Infinity, stop: 0, tgt: 0, time: 0, gap: 0, rec: 0, mae: 0, mfe: 0, debitPct: 0, cost: 0, pctMP: 0, n: 0 };
        a.n++; a.mean += ex.pnl; a.worst = Math.min(a.worst, ex.pnl); a.mae += ex.mae; a.mfe += ex.mfe;
        if (ex.reason === "STOP") a.stop++; if (ex.reason === "STOP_GAP") a.gap++; if (ex.reason === "TARGET") a.tgt++; if (ex.reason === "TIME") a.time++;
        if (ex.recovered) a.rec++;
        a.debitPct += ex.debit > 0 ? (ex.pnl / ex.debit) * 100 : 0;
        a.cost += ex.execCostPct;
        a.pctMP += ex.maxProfit > 0 ? (Math.max(ex.pnl, 0) / ex.maxProfit) * 100 : 0;
        per[fam.name][key] = a;
      }
    }
  }
  return per;
}
// Weighted aggregate over families for a candidate.
function aggregate(per: Record<string, Record<string, Acc>>, weights: "equal" | Record<Cat, number>, key: string) {
  let sumW = 0, sum = 0, worst = Infinity, stop = 0, tgt = 0, time = 0, gap = 0, rec = 0, n = 0, mae = 0, mfe = 0, dpct = 0, cost = 0, mp = 0;
  const catCount: Record<Cat, number> = { Directional: 0, "Non-directional": 0, Reversal: 0, Sudden: 0, Combined: 0 };
  for (const f of FAMILIES) catCount[f.cat]++;
  for (const f of FAMILIES) {
    const a = per[f.name][key]; if (!a || a.n === 0) continue;
    const wgt = weights === "equal" ? (1 / 5) / catCount[f.cat] : weights[f.cat] / catCount[f.cat];
    sumW += wgt;
    sum += wgt * (a.mean / a.n);
    worst = Math.min(worst, a.worst);
    stop += wgt * (a.stop / a.n); tgt += wgt * (a.tgt / a.n); time += wgt * (a.time / a.n); gap += wgt * (a.gap / a.n); rec += wgt * (a.rec / a.n);
    mae += wgt * (a.mae / a.n); mfe += wgt * (a.mfe / a.n); dpct += wgt * (a.debitPct / a.n); cost += wgt * (a.cost / a.n); mp += wgt * (a.pctMP / a.n);
    n++;
  }
  const d = sumW || 1;
  return { mean: sum / d, worst, stop: stop / d, tgt: tgt / d, time: time / d, gap: gap / d, rec: rec / d, mae: mae / d, mfe: mfe / d, debitPct: dpct / d, cost: cost / d, mp: mp / d, families: n };
}
const pct = (x: number) => (x * 100).toFixed(0) + "%";
const f2 = (x: number) => x.toFixed(2);

// ── Width feasibility (SYNTHETIC; ATM long leg, valid on strike step) ───────────────────────────────────────────
const WIDTHS = [25, 50, 75, 100, 150, 200, 300];
const STEP = 50; // synthetic index strike step (NIFTY-like)
const feas: string[] = ["| Width | Valid on 50-point step? | Debit per unit | Max profit per unit | Max loss per lot incl. costs (₹) | Capital for one lot at 1% (₹) | Lots at ₹1,00,000 (1% = ₹1,000) | Net R:R after costs (base) | Costs as % of debit (base) |", "|---|---|---|---|---|---|---|---|---|"];
const widthNumbers: Record<number, { debit: number; loss: number; lots1L: number }> = {};
for (const w of WIDTHS) {
  const valid = w % STEP === 0;
  const T0 = BASE_MODEL.days / 365;
  const x = legs(S0, w, T0, BASE_MODEL.volLevel, BASE_MODEL);
  const debit = x.L - x.Sh;
  const P = w - debit;
  // Costs for a round trip: entry legs and exit legs, approximated by the entry prices at exit (no price move, base costs).
  const c = costPerUnit(x.L, x.Sh, x.L, x.Sh, 1.0);
  const loss = (debit + c) * LOT;
  const lots1L = Math.floor(1000 / loss);
  const netRR = (P - c) / (debit + c);
  widthNumbers[w] = { debit, loss, lots1L };
  feas.push(`| ${w} | ${valid ? "yes" : "no (not a listed strike interval here)"} | ${debit.toFixed(1)} | ${P.toFixed(1)} | ${Math.round(loss).toLocaleString("en-IN")} | ${Math.round(loss / 0.01).toLocaleString("en-IN")} | ${lots1L} | ${f2(netRR)} | ${(c / debit * 100).toFixed(0)}% |`);
}

// ── Main runs ────────────────────────────────────────────────────────────────────────────────────────────────
const WIDTHS_SIM = [50, 100, 200];
const SEED_DEV = 1000, SEED_SENS = 5000;
const lines: string[] = [];
lines.push("| Width | Costs | Candidate (stop | target) | Equal-weight mean P&L/unit | Stress-weighted mean | Set B mean | Worst family P&L | Stop % | Target % | Time % | Gap % | Stop then recovered % | MAE | MFE | Debit lost % (avg) | Max profit achieved % (avg, gains only) | Costs % of debit |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const primaryBest: string[] = [];
const sensRows: string[] = ["| Candidate | Width | Dev-sample equal-weight mean | Sensitivity-sample equal-weight mean | Difference |", "|---|---|---|---|---|"];
const famRows: string[] = ["| Family | Category | Width | Candidate | Mean P&L/unit (base) | Stop % | Target % | Stop then recovered % |", "|---|---|---|---|---|---|---|---|"];
for (const w of WIDTHS_SIM) {
  for (const cost of COSTS) {
    const per = runFamilies(SEED_DEV, w, cost, BASE_MODEL);
    const keys = Object.keys(per[FAMILIES[0].name]);
    for (const k of keys) {
      const eq = aggregate(per, "equal", k), st = aggregate(per, STRESS_W, k), b = aggregate(per, SETB_W, k);
      lines.push(`| ${w} | ${cost.name} | ${k.replace(" | ", " + ")} | ${eq.mean.toFixed(2)} | ${st.mean.toFixed(2)} | ${b.mean.toFixed(2)} | ${eq.worst.toFixed(2)} | ${pct(eq.stop)} | ${pct(eq.tgt)} | ${pct(eq.time)} | ${pct(eq.gap)} | ${pct(eq.rec)} | ${eq.mae.toFixed(2)} | ${eq.mfe.toFixed(2)} | ${eq.debitPct.toFixed(1)}% | ${eq.mp.toFixed(1)}% | ${eq.cost.toFixed(1)}% |`);
    }
    if (cost.name === "base" && w === 200) {
      for (const f of FAMILIES) for (const k of keys.slice(0, 4)) { const a = per[f.name][k]; famRows.push(`| ${f.name} | ${f.cat} | ${w} | ${k.replace(" | ", " + ")} | ${(a.mean / a.n).toFixed(2)} | ${pct(a.stop / a.n)} | ${pct(a.tgt / a.n)} | ${pct(a.rec / a.n)} |`); }
    }
  }
}
// Sensitivity: same candidate, independent seed sample, and model variants (primary candidate and one alternative only).
for (const [label, m] of [["rate 5%", { ...BASE_MODEL, rate: 0.05 }], ["rate 8%", { ...BASE_MODEL, rate: 0.08 }], ["2 days to expiry", { ...BASE_MODEL, days: 2 }], ["5 days to expiry", { ...BASE_MODEL, days: 5 }], ["entry IV 14%", { ...BASE_MODEL, volLevel: 0.14 }], ["entry IV 10%", { ...BASE_MODEL, volLevel: 0.10 }]] as [string, Model][]) {
  const per = runFamilies(SEED_DEV, 100, COSTS[0], m);
  const a = aggregate(per, "equal", "S0 50% of debit | T0 0.5 of max profit");
  const b = aggregate(per, "equal", "S2 70% of debit | T1 0.8 of max profit");
  sensRows.push(`| S0+T0 (model: ${label}) | 100 | ${a.mean.toFixed(2)} | — | — |`);
  sensRows.push(`| S2+T1 (model: ${label}) | 100 | ${b.mean.toFixed(2)} | — | — |`);
}
for (const k of ["S0 50% of debit | T0 0.5 of max profit", "S2 70% of debit | T1 0.8 of max profit"]) {
  const dev = aggregate(runFamilies(SEED_DEV, 100, COSTS[0], BASE_MODEL), "equal", k);
  const sens = aggregate(runFamilies(SEED_SENS, 100, COSTS[0], BASE_MODEL), "equal", k);
  sensRows.push(`| ${k} (seed independence) | 100 | ${dev.mean.toFixed(2)} | ${sens.mean.toFixed(2)} | ${(sens.mean - dev.mean).toFixed(2)} |`);
}

// ── Write outputs ─────────────────────────────────────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10);
const banner = `**SYNTHETIC — RESEARCH ONLY.** Not historical evidence. No holdout. No production change. Engine NO-GO. Frozen specification hash: \`${specSha}\`.`;
fs.writeFileSync("docs/phase0/SPREAD_WIDTH_FEASIBILITY_REPORT.md", `# Spread width feasibility (${stamp})\n\n${banner}\n\nLong leg at the money (ATM, delta about 0.5), short leg at long strike plus width. Synthetic inputs: index ${S0}, volatility ${BASE_MODEL.volLevel}, rate ${BASE_MODEL.rate}, ${BASE_MODEL.days} days, lot ${LOT}. The 1% risk limit (₹1,000 at ₹1 lakh) is applied without relaxation.\n\n${feas.join("\n")}\n\n## Reading\n- Only widths whose max loss per lot is at or below ₹1,000 can be traded at ₹1 lakh. Check the lots column.\n- Strike validity: 25-point and 75-point widths are not valid on a 50-point strike step. Real contract specifications must be checked for each instrument (BLOCKED).\n- Narrower spreads reduce debit but also reduce max profit. Net reward-to-risk is shown after costs.\n- Liquidity, bid-ask spreads, market depth and IV-surface behaviour cannot be measured offline (BLOCKED). Slippage sensitivity is in the cost report.\n- If no width is feasible at a given capital, the correct output is NO TRADE. The risk limit is not relaxed.\n`);
fs.writeFileSync("docs/phase0/EXPANDED_PATH_SIMULATION_RESULTS.md", `# Expanded path simulation results (${stamp})\n\n${banner}\n\nSpecification: \`docs/phase0/EXPANDED_PATH_SIMULATION_SPECIFICATION.md\` (frozen). Primary diagnostic: equal weight per category. Stress-weighted and weight-set B are predefined. Family weights are not real-world probabilities.\n\n## Aggregate results by width, cost scenario and candidate\n${lines.join("\n")}\n\n## Individual family results (base cost, width 200)\n${famRows.join("\n")}\n\n## Sensitivity\n${sensRows.join("\n")}\n\n## Reading\n- No candidate is selected. A ranking here reflects these synthetic families only.\n- The primary diagnostic is equal-weighted; the stress-weighted and set-B columns show whether the ranking depends on weights.\n- Individual family rows are reported so no aggregate hides a bad family.\n`);
fs.writeFileSync("docs/phase0/SPREAD_WIDTH_COST_SENSITIVITY.md", `# Spread width and cost sensitivity (${stamp})\n\n${banner}\n\nCosts: base (1x, configured rates, no added slippage), adverse (1.5x, 2% per leg per side), stress (2x, 4%), legging (base plus an extra 1% adverse fill on the second entry leg). Partial fills and depth are NOT TESTED (no depth data).\n\nWidth-normalised comparison (for widths 50, 100 and 200) is in the results report: debit lost %, max profit achieved %, MAE, and costs as a percentage of debit.\n\nCost multipliers and slippage levels are research sensitivity assumptions approved by the owner. They are not verified exchange or broker schedules.\n`);
console.log(`specSha ok; widths feasibility:`, Object.entries(widthNumbers).map(([w, v]) => `${w}:debit ${v.debit.toFixed(1)} lots@1L ${v.lots1L}`).join(" | "));
