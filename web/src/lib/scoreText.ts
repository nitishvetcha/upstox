// Plain-language explanation of the recommendation score. It is an agreement score, never a win probability.
import type { Analysis } from "./types";

export function scoreExplanation(a: Pick<Analysis, "total" | "factors" | "status" | "plan" | "blockers" | "setup">) {
  const availableMax = a.factors.reduce((t, f) => t + (f.available ? f.max : 0), 0);
  const unavailable = a.factors.filter((f) => !f.available).map((f) => `${f.label} (${f.max} pts)`);
  const shown = a.plan ? { value: a.plan.score, max: 100, what: "strategy score of the trade plan" } : { value: a.total, max: availableMax, what: "signal-agreement score" };
  const lines = [
    `${shown.value} / ${shown.max}: ${shown.what}. It measures how strongly the available inputs agree on one direction; it is not a probability of profit and has not been calibrated against outcomes.`,
    `Full scale is 100 points across ${a.factors.length} inputs; ${availableMax} points are available now${unavailable.length ? ` because these inputs are unavailable or unverified: ${unavailable.join(", ")}` : ""}.`,
    `Setup band: ${a.setup.toLowerCase()} (thresholds 50 / 65 / 80 on the 100-point scale).`,
  ];
  if (!a.plan) lines.push(`Status ${a.status}: no executable plan.${a.blockers.length ? ` Reasons: ${a.blockers.join("; ")}.` : ""}`);
  return { value: shown.value, max: shown.max, label: shown.what, lines };
}
