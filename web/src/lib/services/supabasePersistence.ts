// Server-only Supabase/Postgres persistence for automation audit records.
// It is deliberately optional during migration: local ledger storage remains
// authoritative until every legacy store has been migrated and verified.
import { existsSync, readFileSync, statSync } from "node:fs";
import { Pool } from "pg";
import type { PaperTrade, PaperTradeEvent } from "../paperTypes.ts";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;
let lastPersistenceIssue: "DATABASE_URL_MISSING" | "AUTH_FAILED" | "TLS_VERIFICATION_FAILED" | "CONNECTION_FAILED" | "DATABASE_OPERATION_FAILED" | null = null;

export function supabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function classifyPersistenceError(error: unknown): NonNullable<typeof lastPersistenceIssue> {
  const value = error as { code?: string; message?: string };
  const text = String(value?.message ?? "").toLowerCase();
  if (value?.code === "28P01" || text.includes("password authentication")) return "AUTH_FAILED";
  if (
    text.includes("certificate") ||
    text.includes("self-signed") ||
    text.includes("no start line") ||
    text.includes("unable to verify") ||
    text.includes("issuer") ||
    text.includes("tls") ||
    text.includes("ssl")
  ) {
    return "TLS_VERIFICATION_FAILED";
  }
  if (text.includes("connect") || text.includes("timeout") || text.includes("network")) return "CONNECTION_FAILED";
  return "DATABASE_OPERATION_FAILED";
}

export function supabasePersistenceIssue(): typeof lastPersistenceIssue {
  return supabaseEnabled() ? lastPersistenceIssue : "DATABASE_URL_MISSING";
}

/**
 * Normalizes a PEM certificate string from environment variables or files into
 * valid, OpenSSL-compliant X.509 PEM format.
 *
 * Handles:
 * 1. Standard multiline PEM text.
 * 2. Render / Docker single-line inputs with literal '\n' or '\r\n' escape sequences.
 * 3. Render dashboard single-line inputs where newlines were stripped into spaces.
 * 4. Strings wrapped in leading/trailing single or double quotes.
 * 5. Base64-encoded PEM strings.
 * 6. Raw base64 payload missing PEM header/footer delimiters.
 * 7. Certificate chains/bundles (multiple BEGIN/END blocks).
 * 8. File paths (e.g. Render Secret Files mounted at /etc/secrets/...).
 */
export function normalizePemCertificate(raw?: string): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  let clean = raw.trim();
  if (!clean) return undefined;

  // 1. Strip wrapping quotes if user pasted as "\"content\"" or "'content'"
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim();
    if (!clean) return undefined;
  }

  // 2. Check if clean represents an existing file path (e.g. Render Secret File)
  if (
    (clean.startsWith("/") || clean.startsWith("./") || clean.endsWith(".crt") || clean.endsWith(".pem")) &&
    existsSync(clean)
  ) {
    try {
      if (statSync(clean).isFile()) {
        clean = readFileSync(clean, "utf8").trim();
      }
    } catch {
      // Fall through and treat clean as certificate text
    }
  }

  // 3. Unescape literal \n or \r\n characters commonly produced by CLI/env serializers
  clean = clean.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  // 4. Handle base64-encoded PEM file content
  if (!clean.includes("-----BEGIN") && clean.length > 50) {
    try {
      const decoded = Buffer.from(clean, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) {
        clean = decoded;
      }
    } catch {
      // Ignore decoding failure
    }
  }

  // 5. Extract all certificate blocks (supporting single certificate or a bundle/chain)
  const certPattern = /-----BEGIN\s+([A-Z0-9_\s]+)-----([\s\S]*?)-----END\s+\1-----/g;
  const matches = [...clean.matchAll(certPattern)];

  if (matches.length > 0) {
    const formattedCerts = matches.map((m) => {
      const type = m[1].trim();
      // Remove internal whitespace (including spaces introduced when newlines were stripped)
      const body = m[2].replace(/\s+/g, "");
      // Chunk into standard 64-character PEM lines
      const chunked = body.match(/.{1,64}/g)?.join("\n") ?? body;
      return `-----BEGIN ${type}-----\n${chunked}\n-----END ${type}-----`;
    });
    return formattedCerts.join("\n\n");
  }

  // 6. Delimiters smashed or flattened with spaces into a single line
  const flattened = clean.replace(/\s+/g, " ");
  const fallbackMatch = flattened.match(
    /-----BEGIN\s+([A-Z0-9_\s]+)-----\s*([A-Za-z0-9+/= ]+)\s*-----END\s+\1-----/
  );
  if (fallbackMatch) {
    const type = fallbackMatch[1].trim();
    const body = fallbackMatch[2].replace(/\s+/g, "");
    const chunked = body.match(/.{1,64}/g)?.join("\n") ?? body;
    return `-----BEGIN ${type}-----\n${chunked}\n-----END ${type}-----`;
  }

  // 7. Raw base64 string without delimiters
  const pureBase64 = clean.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(pureBase64) && pureBase64.length >= 64) {
    const chunked = pureBase64.match(/.{1,64}/g)?.join("\n") ?? pureBase64;
    return `-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`;
  }

  return clean;
}

export function getCaCertificate(): string | undefined {
  const directCa = process.env.SUPABASE_DB_CA;
  const fileCa = process.env.SUPABASE_DB_CA_FILE;
  if (directCa) {
    return normalizePemCertificate(directCa);
  }
  if (fileCa) {
    return normalizePemCertificate(fileCa);
  }
  return undefined;
}

export function _resetPoolForTesting(): void {
  pool = null;
  schemaReady = null;
  lastPersistenceIssue = null;
}

function db(): Pool | null {
  if (!supabaseEnabled()) return null;
  // Supabase exposes its database root certificate in Database Settings. Render
  // stores multiline secrets with literal \n escapes or spaces in single-line inputs,
  // so normalize those into valid PEM before giving the CA to node-postgres.
  const ca = getCaCertificate();
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
    lastPersistenceIssue = null;
    return {
      updatedAt: row.updated_at.toISOString(),
      trades: row.trades as PaperTrade[],
      events: row.events as PaperTradeEvent[],
      opportunities: row.opportunities as PaperOpportunity[],
    };
  } catch (error) {
    lastPersistenceIssue = classifyPersistenceError(error);
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
