import { NextResponse } from "next/server";
import * as fs from "node:fs";
import { countOpportunitiesInSqlite, getDbPath, getSqliteDb } from "@/lib/services/sqliteLedger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dbPath = getDbPath();
    const db = getSqliteDb();

    // Check WAL mode
    const pragmaRow = db.prepare("PRAGMA journal_mode;").get() as { journal_mode: string } | undefined;
    const journalMode = pragmaRow?.journal_mode || "unknown";

    const counts = countOpportunitiesInSqlite(db);

    let fileSize = 0;
    if (fs.existsSync(dbPath)) {
      fileSize = fs.statSync(dbPath).size;
    }

    return NextResponse.json({
      engine: "SQLite 3 (Node 22 Built-in)",
      dbPath,
      journalMode,
      fileSizeBytes: fileSize,
      fileSizeKb: Math.round(fileSize / 1024),
      counts,
      walActive: journalMode.toLowerCase() === "wal",
      status: "HEALTHY",
    });
  } catch (err) {
    return NextResponse.json(
      { status: "ERROR", error: (err as Error).message },
      { status: 500 },
    );
  }
}
