// Server-only Supabase/Postgres persistence for automation audit records.
// It is deliberately optional during migration: local ledger storage remains
// authoritative until every legacy store has been migrated and verified.
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function supabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function db(): Pool | null {
  if (!supabaseEnabled()) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: true } });
  return pool;
}

async function ensureSchema(): Promise<void> {
  const client = db();
  if (!client) return;
  schemaReady ??= client.query(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      payload JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS automation_runs_kind_created_idx ON automation_runs (kind, created_at DESC);
  `).then(() => undefined);
  await schemaReady;
}

export async function recordAutomationRun(id: string, kind: string, status: string, payload: unknown): Promise<void> {
  try {
    const client = db();
    if (!client) return;
    await ensureSchema();
    await client.query(
      `INSERT INTO automation_runs (id, kind, status, payload) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload`,
      [id, kind, status, JSON.stringify(payload)],
    );
  } catch {
    // Automation must fail closed at the caller, but a database-audit failure
    // must never leak DATABASE_URL details into the response or logs.
  }
}
