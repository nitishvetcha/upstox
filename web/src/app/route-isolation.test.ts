// Route isolation: research pages and the root layout must not import any broker, market or auth service.
// Static check over source files; runs offline.
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.dirname(fileURLToPath(import.meta.url));
// Modules that talk to Upstox or the market. A research route must not reach any of them through its import graph.
const NETWORK_MODULES = [
  "lib/services/upstoxAuth.ts",
  "lib/services/upstoxMarket.ts",
  "lib/services/market.ts",
  "lib/services/stockService.ts",
  "lib/services/liveOpportunityCollector.ts",
  "lib/services/paperTradeMonitorRunner.ts",
  "lib/services/liveSessionController.ts",
];
const SRC = path.resolve(APP, "..");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

function importsOf(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function resolveImport(from: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  if (!base) return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

// Returns the chain of modules by which `file` reaches a network module, or [] if it does not.
function reachesNetwork(file: string, seen = new Set<string>(), chain: string[] = []): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const rel = path.relative(SRC, file);
  if (NETWORK_MODULES.includes(rel)) return [...chain, rel];
  for (const spec of importsOf(file)) {
    const next = resolveImport(file, spec);
    if (!next) continue;
    const found = reachesNetwork(next, seen, [...chain, rel]);
    if (found.length) return found;
  }
  return [];
}

function violations(file: string): string[] {
  const chain = reachesNetwork(file);
  return chain.length ? [chain.join(" -> ")] : [];
}

describe("research route isolation", () => {
  const research = path.join(APP, "(research)");

  it("research group pages and layout import no broker, market, auth or engine service", () => {
    const bad = files(research).map((f) => [path.relative(APP, f), violations(f)] as const).filter(([, v]) => v.length);
    assert.deepEqual(bad, [], `forbidden imports in research routes: ${JSON.stringify(bad)}`);
  });

  it("root layout performs no data access", () => {
    const root = path.join(APP, "layout.tsx");
    assert.deepEqual(violations(root), []);
    assert.doesNotMatch(fs.readFileSync(root, "utf8"), /services\//);
    assert.doesNotMatch(fs.readFileSync(root, "utf8"), /await\s+get|fetch\(|tokenStatus\(|getDashboard\(/);
  });

  it("the live dashboard layout is the only shell that reads market data", () => {
    const dash = path.join(APP, "(dashboard)", "layout.tsx");
    assert.ok(violations(dash).length > 0, "dashboard layout is expected to read live data");
  });

  it("research group contains no order-placement or execution code", () => {
    for (const f of files(research)) {
      assert.doesNotMatch(fs.readFileSync(f, "utf8"), /placeOrder|\/v2\/order|order_type|paper:live|startSupervisor/i, path.relative(APP, f));
    }
  });
});
