import fs from "node:fs";
import path from "node:path";
import type { WalkForwardResult } from "../walkForwardEngine.ts";

const DIR = path.join(process.cwd(), ".data", "walk-forward");
const g = globalThis as typeof globalThis & { __walkForwardRuns?: Map<string, WalkForwardResult> };

function store(): Map<string, WalkForwardResult> {
  if (g.__walkForwardRuns) return g.__walkForwardRuns;
  const m = new Map<string, WalkForwardResult>();
  try {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as WalkForwardResult;
        m.set(r.wfRunId, r);
      } catch {
        // skip corrupted
      }
    }
  } catch {
    // dir doesn't exist yet
  }
  return (g.__walkForwardRuns = m);
}

export function saveWalkForwardRun(result: WalkForwardResult): void {
  store().set(result.wfRunId, result);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${result.wfRunId.replace(/[^\w-]/g, "")}.json`), JSON.stringify(result));
  } catch {
    // best effort persistence
  }
}

export function getWalkForwardRun(id: string): WalkForwardResult | undefined {
  return store().get(id);
}

export function getAllWalkForwardRuns(): WalkForwardResult[] {
  return [...store().values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
