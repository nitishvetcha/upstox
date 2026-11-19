import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreExplanation } from "./scoreText.ts";

const f = (label: string, max: number, available: boolean) => ({ key: label, label, max, available, score: 0, direction: 0, notes: [] }) as never;
const a = { total: 42, setup: "NO TRADE", status: "WAIT", plan: null, blockers: ["Option chain is stale"],
  factors: [f("Trend", 20, true), f("Option chain / OI", 20, false), f("Price action", 15, true), f("Technical", 15, true), f("Volatility / IV", 10, false), f("News", 10, true), f("Breadth", 10, true)] } as never;

test("42/70 is explained as an agreement score out of the available points, never a percentage or probability", () => {
  const e = scoreExplanation(a);
  assert.deepEqual([e.value, e.max], [42, 70]);
  const text = e.lines.join(" ");
  assert.ok(!/\d\s*%/.test(text), "no percent figures");
  assert.match(text, /not a probability of profit/);
  assert.match(text, /Option chain \/ OI \(20 pts\)/);
  assert.match(text, /Volatility \/ IV \(10 pts\)/);
  assert.match(text, /Status WAIT: no executable plan\. Reasons: Option chain is stale/);
});
