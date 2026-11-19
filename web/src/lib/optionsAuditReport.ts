// The one authoritative options-audit report (options-audit-1). Used by the CLI, the audit page and the dashboard,
// so no screen ever computes its own verdict.
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "./dataRoot.ts";
import { indexVerdict, AUDIT_VERSION, type Round } from "./optionsAudit.ts";
import { readJsonl } from "./ops/jsonl.ts";
import { INDICES, INSTRUMENTS } from "./services/instrumentRegistry.ts";

export const AUDIT_DIR = () => path.join(dataRoot(), "options-audit");

type RoundRec = Round & { version?: string; at?: string; expiry?: string; spot?: number };

export function auditReport(dir = AUDIT_DIR(), version = AUDIT_VERSION) {
  const { records, malformed, missing } = readJsonl<RoundRec>(path.join(dir, "rounds.jsonl"));
  let mapFile: string | null = null, mapping: Record<string, { pass?: boolean; issues?: string[]; usedExpiry?: string; lotSize?: number }> = {};
  try {
    // turbopackIgnore: dir is a runtime data directory (APP_DATA_DIR / .data), read at runtime, not bundled.
    mapFile = fs.readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.startsWith("mapping_")).sort().at(-1) ?? null;
    if (mapFile) mapping = JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, mapFile), "utf8"));
  } catch { /* no mapping yet */ }
  const indices = INDICES.map((index) => {
    const attempted = records.filter((r) => r.index === index && r.version === version);
    const ok = attempted.filter((r) => r.samples);
    const last = ok.at(-1);
    const missingQuotes = ok.reduce((n, r) => n + r.samples!.filter((s) => s.quoteLtp === null).length, 0);
    return {
      index, name: INSTRUMENTS[index].name,
      ...indexVerdict(attempted, mapping[index]?.pass ?? null),
      roundsSucceeded: ok.length,
      roundsErrored: attempted.filter((r) => r.error).length,
      roundsSkipped: attempted.filter((r) => r.skipped).length,
      lastSuccessfulAt: last?.at ?? null,
      lastRecordedAt: attempted.at(-1)?.at ?? null,
      lastError: [...attempted].reverse().find((r) => r.error || r.skipped)?.error ?? [...attempted].reverse().find((r) => r.skipped)?.skipped ?? null,
      roundsToday: ok.filter((r) => r.session === new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)).length,
      lastExpiry: last?.expiry ?? mapping[index]?.usedExpiry ?? null,
      missingQuotes,
      recentErrors: attempted.filter((r) => r.error || r.skipped).slice(-3).map((r) => `${r.at ?? "?"} ${r.error ?? r.skipped}`),
      mappingIssues: mapping[index]?.issues ?? [],
    };
  });
  return { version, roundsFileMissing: missing, malformedLines: malformed, mappingFile: mapFile, indices };
}
