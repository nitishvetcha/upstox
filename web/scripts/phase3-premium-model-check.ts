// Phase 3 (offline): how well does the engine's delta-only premium move (|delta| x ATR) match a full repricing?
// SYNTHETIC inputs only (Black-Scholes, assumed rate and volatility). No market data, no network. This measures model
// error; it does not validate the strategy. Output is written to docs/phase0/PHASE3_PREMIUM_MODEL_CHECK.md.
import fs from "node:fs";
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x: number) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
function call(S: number, K: number, T: number, r: number, v: number) {
  const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T)); const d2 = d1 - v * Math.sqrt(T);
  return { price: S * N(d1) - K * Math.exp(-r * T) * N(d2), delta: N(d1) };
}
const r = 0.065, v = 0.12, S = 25000, ATR = 180; // ATR 180 = the daily ATR used in the mock snapshot
const rows: string[] = [];
rows.push("| Days to expiry | Strike offset | Delta | Premium now | Engine move (|delta| x ATR) | Full repricing move (index +1 ATR) | Engine error |");
rows.push("|---|---|---|---|---|---|---|");
for (const days of [1, 3, 7]) for (const off of [0, 100, 300]) {
  const T = days / 365, K = S + off;
  const now = call(S, K, T, r, v);
  const up = call(S + ATR, K, T, r, v);
  const engine = now.delta * ATR;
  const full = up.price - now.price;
  const err = full === 0 ? 0 : (engine - full) / full;
  rows.push(`| ${days} | +${off} | ${now.delta.toFixed(3)} | ${now.price.toFixed(1)} | ${engine.toFixed(1)} | ${full.toFixed(1)} | ${(err * 100).toFixed(1)}% |`);
}
const doc = `# Phase 3 — premium model check (offline, synthetic)

Date: ${new Date().toISOString().slice(0, 10)}. Inputs are SYNTHETIC: index ${S}, ATR ${ATR} (the mock daily ATR), rate ${r}, volatility ${v}. Model: Black-Scholes, European call.

This measures how far the engine's delta-only premium move departs from a full repricing when the index moves one ATR. It is a model-error check, not evidence that the strategy makes money.

${rows.join("\n")}

Reading: the engine's estimate ignores gamma (the move is larger than delta suggests when price moves toward the strike) and theta (time decay). The error column shows the size of that gap under these synthetic inputs. Finding S-06 is confirmed; the magnitude depends on real IV and expiry, which need market data (BLOCKED).
`;
fs.writeFileSync("docs/phase0/PHASE3_PREMIUM_MODEL_CHECK.md", doc);
console.log(rows.join("\n"));

// ── Scenario grid (synthetic): underlying move, IV change, one day of time decay ─────────────────────────────
// Compares three estimates of the premium change against a full repricing:
//   delta-only (engine today): |delta| x move
//   delta + gamma (second-order Taylor): delta x move + 0.5 x gamma x move^2
//   full repricing: Black-Scholes at the new spot, new IV and remaining time
function gamma(S: number, K: number, T: number, r: number, v: number) {
  const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T));
  return Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI) / (S * v * Math.sqrt(T));
}
const scen: string[] = [];
scen.push("| Scenario | Strike offset | Premium change: full | Delta-only error | Delta+gamma error |");
scen.push("|---|---|---|---|---|");
const T0 = 3 / 365;
for (const [name, dS, dV, dT] of [
  ["Index +1 ATR", ATR, 0, 0],
  ["Index -1 ATR", -ATR, 0, 0],
  ["Index +1 ATR, IV -20% (relative)", ATR, -0.2 * v, 0],
  ["No move, IV +20% (relative)", 0, 0.2 * v, 0],
  ["No move, one day passes (theta)", 0, 0, 1 / 365],
] as const) {
  for (const off of [0, 300]) {
    const K = S + off;
    const base = call(S, K, T0, r, v);
    const newT = Math.max(T0 - dT, 1e-6);
    const after = call(S + dS, K, newT, r, v + dV);
    const full = after.price - base.price;
    const d = base.delta * dS;
    const dg = d + 0.5 * gamma(S, K, T0, r, v) * dS * dS;
    const errD = full === 0 ? 0 : (d - full) / Math.abs(full);
    const errDG = full === 0 ? 0 : (dg - full) / Math.abs(full);
    scen.push(`| ${name} | +${off} | ${full.toFixed(1)} | ${(errD * 100).toFixed(1)}% | ${(errDG * 100).toFixed(1)}% |`);
  }
}
const extra = `\n## Scenario grid (synthetic)\n\nSame synthetic inputs. Errors are relative to the full repricing. The delta-only column is what the engine uses today.\n\n${scen.join("\n")}\n\nThese scenarios show model error only. They are not historical performance and do not validate any strategy.\n`;
fs.appendFileSync("docs/phase0/PHASE3_PREMIUM_MODEL_CHECK.md", extra);
console.log(scen.join("\n"));

// ── Spread repricing (synthetic): bull call spread, both legs repriced independently ─────────────────────────────
// Long call at K, short call at K+width. Net value = long − short. Compared with the delta-only estimate of the net
// move: (delta_long − delta_short) x move. SYNTHETIC inputs; research sensitivity only.
const spread: string[] = [];
spread.push("| Scenario | Width | Net spread value now | Full repricing move | Delta-only error (net) |");
spread.push("|---|---|---|---|---|");
const K1 = S, width = 200, K2 = S + width;
for (const [name, dS, dV, dT] of [["Index +1 ATR", ATR, 0, 0], ["Index -1 ATR", -ATR, 0, 0], ["No move, IV +20%", 0, 0.2 * v, 0], ["No move, one day passes", 0, 0, 1 / 365]] as const) {
  const T = 3 / 365;
  const l0 = call(S, K1, T, r, v), s0 = call(S, K2, T, r, v);
  const net0 = l0.price - s0.price;
  const l1 = call(S + dS, K1, Math.max(T - dT, 1e-6), r, v + dV), s1 = call(S + dS, K2, Math.max(T - dT, 1e-6), r, v + dV);
  const full = (l1.price - s1.price) - net0;
  const dd = (l0.delta - s0.delta) * dS;
  const err = full === 0 ? 0 : (dd - full) / Math.abs(full);
  spread.push(`| ${name} | ${width} | ${net0.toFixed(1)} | ${full.toFixed(1)} | ${(err * 100).toFixed(1)}% |`);
}
fs.appendFileSync("docs/phase0/PHASE3_PREMIUM_MODEL_CHECK.md", `\n## Spread repricing (synthetic, bull call spread)\n\nBoth legs repriced independently; the net value is long minus short. Research sensitivity only; not a production result.\n\n${spread.join("\n")}\n`);
console.log(spread.join("\n"));
