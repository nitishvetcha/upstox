// Server-only Supabase/Postgres persistence for automation audit records.
// It is deliberately optional during migration: local ledger storage remains
// authoritative until every legacy store has been migrated and verified.
import { Pool } from "pg";
import type { PaperTrade, PaperTradeEvent } from "../paperTypes.ts";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;
let lastPersistenceIssue: "DATABASE_URL_MISSING" | "AUTH_FAILED" | "TLS_VERIFICATION_FAILED" | "CONNECTION_FAILED" | "DATABASE_OPERATION_FAILED" | null = null;

export function supabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function classifyPersistenceError(error: unknown): NonNullable<typeof lastPersistenceIssue> {
  const value = error as { code?: string; message?: string };
  const text = String(value?.message ?? "").toLowerCase();
  if (value?.code === "28P01" || text.includes("password authentication")) return "AUTH_FAILED";
  if (text.includes("certificate") || text.includes("self-signed")) return "TLS_VERIFICATION_FAILED";
  if (text.includes("connect") || text.includes("timeout") || text.includes("network")) return "CONNECTION_FAILED";
  return "DATABASE_OPERATION_FAILED";
}

export function supabasePersistenceIssue(): typeof lastPersistenceIssue {
  return supabaseEnabled() ? lastPersistenceIssue : "DATABASE_URL_MISSING";
}

function db(): Pool | null {
  if (!supabaseEnabled()) return null;
  // Supabase exposes its database root certificate in Database Settings. Render
  // stores multiline secrets with literal \n escapes, so normalize those before
  // giving the CA to node-postgres for full hostname/certificate verification.
  const ca = process.env.SUPABASE_DB_CA?.replace(/\\n/g, "\n");
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
  });
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
    CREATE TABLE IF NOT EXISTS paper_validation_state (
      state_key TEXT PRIMARY KEY,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      trades JSONB NOT NULL,
      events JSONB NOT NULL,
      opportunities JSONB NOT NULL
    );
  `).then(() => undefined);
  await schemaReady;
}

export interface PaperValidationSnapshot {
  updatedAt: string;
  trades: PaperTrade[];
  events: PaperTradeEvent[];
  opportunities: PaperOpportunity[];
}

const PAPER_VALIDATION_STATE_KEY = "primary";

// A complete, versioned snapshot is intentionally stored as one transaction. The local
// event-sourced ledger remains the active process cache, while Postgres is the durable
// recovery source for Render instances with ephemeral filesystems.
export async function savePaperValidationSnapshot(
  trades: PaperTrade[], events: PaperTradeEvent[], opportunities: PaperOpportunity[],
): Promise<boolean> {
  try {
    const client = db();
    if (!client) return false;
    await ensureSchema();
    await client.query(
      `INSERT INTO paper_validation_state (state_key, trades, events, opportunities)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (state_key) DO UPDATE SET
         updated_at = now(),
         trades = EXCLUDED.trades,
         events = EXCLUDED.events,
         opportunities = EXCLUDED.opportunities`,
      [PAPER_VALIDATION_STATE_KEY, JSON.stringify(trades), JSON.stringify(events), JSON.stringify(opportunities)],
    );
    lastPersistenceIssue = null;
    return true;
  } catch (error) {
    lastPersistenceIssue = classifyPersistenceError(error);
    return false;
  }
}

export async function loadPaperValidationSnapshot(): Promise<PaperValidationSnapshot | null> {
  try {
    const client = db();
    if (!client) return null;
    await ensureSchema();
    const result = await client.query<{
      updated_at: Date;
      trades: unknown;
      events: unknown;
      opportunities: unknown;
    }>(
      `SELECT updated_at, trades, events, opportunities
       FROM paper_validation_state WHERE state_key = $1`,
      [PAPER_VALIDATION_STATE_KEY],
    );
    const row = result.rows[0];
    if (!row || !Array.isArray(row.trades) || !Array.isArray(row.events) || !Array.isArray(row.opportunities)) return null;
    return {
      updatedAt: row.updated_at.toISOString(),
      trades: row.trades as PaperTrade[],
      events: row.events as PaperTradeEvent[],
      opportunities: row.opportunities as PaperOpportunity[],
    };
  } catch {
    return null;
  }
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
