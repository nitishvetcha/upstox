// Phase 11.3 / 11.3.2 — Recommendation journal persistence.
// Follows the backtestStore pattern. Supports environment-isolated stores via createRecommendationStore().
// The production app uses the default export functions; tests create their own isolated instance.
import fs from "node:fs";
import path from "node:path";
import type { RecommendationJournalEntry } from "../journalTypes.ts";

/** Canonical production path — never used by tests. */
export const PROD_STORE_DIR = path.resolve(
  process.env.RECOMMENDATION_STORE_DIR ?? path.join(process.cwd(), ".data", "recommendations"),
);

/** Factory: creates a fully isolated store backed by `dir`. Each instance has its own in-memory map. */
export function createRecommendationStore(dir: string) {
  const absDir = path.resolve(dir);

  // Safety guard: reject any store that resolves to the production path when running under an
  // explicit override (i.e. a test that forgot to pass its own directory).
  if (absDir === PROD_STORE_DIR && process.env.RECOMMENDATION_STORE_DIR && process.env.RECOMMENDATION_STORE_DIR !== dir) {
    throw new Error(`Recommendation store safety guard: test store path resolved to the production store (${PROD_STORE_DIR}). Tests must use an isolated directory.`);
  }

  const cache = new Map<string, RecommendationJournalEntry>();
  let loaded = false;

  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
      for (const f of fs.readdirSync(absDir).filter((x) => x.endsWith(".json"))) {
        try {
          const e = JSON.parse(fs.readFileSync(path.join(absDir, f), "utf8")) as RecommendationJournalEntry;
          cache.set(e.id, e);
        } catch {
          // unreadable file: skipped
        }
      }
    } catch {
      // directory doesn't exist yet — fine
    }
  }

  function filePath(id: string): string {
    return path.join(absDir, `${id.replace(/[^\w-]/g, "")}.json`);
  }

  function persist(entry: RecommendationJournalEntry): void {
    try {
      fs.mkdirSync(absDir, { recursive: true });
      fs.writeFileSync(filePath(entry.id), JSON.stringify(entry));
    } catch {
      // best-effort; in-memory still available
    }
  }

  return {
    dir: absDir,
    save(entry: RecommendationJournalEntry): void {
      ensureLoaded();
      cache.set(entry.id, entry);
      persist(entry);
    },
    get(id: string): RecommendationJournalEntry | undefined {
      ensureLoaded();
      return cache.get(id);
    },
    getAll(): RecommendationJournalEntry[] {
      ensureLoaded();
      return [...cache.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    update(id: string, patch: Partial<Pick<RecommendationJournalEntry, "status" | "outcome" | "paperTradeId">>): RecommendationJournalEntry | null {
      ensureLoaded();
      const entry = cache.get(id);
      if (!entry) return null;
      // Never touch entry.snapshot — immutable
      const updated: RecommendationJournalEntry = { ...entry, ...patch };
      cache.set(id, updated);
      persist(updated);
      return updated;
    },
  };
}

// ── Production singleton ───────────────────────────────────────────────────────
// Uses globalThis so Next.js route bundles share one instance.
const g = globalThis as typeof globalThis & { __recJournalStore?: ReturnType<typeof createRecommendationStore> };

function prodStore(): ReturnType<typeof createRecommendationStore> {
  if (!g.__recJournalStore) g.__recJournalStore = createRecommendationStore(PROD_STORE_DIR);
  return g.__recJournalStore;
}

export function saveJournalEntry(entry: RecommendationJournalEntry): void {
  prodStore().save(entry);
}

export function getJournalEntry(id: string): RecommendationJournalEntry | undefined {
  return prodStore().get(id);
}

export function getAllJournalEntries(): RecommendationJournalEntry[] {
  return prodStore().getAll();
}

export function updateJournalEntry(id: string, patch: Partial<Pick<RecommendationJournalEntry, "status" | "outcome" | "paperTradeId">>): RecommendationJournalEntry | null {
  return prodStore().update(id, patch);
}
