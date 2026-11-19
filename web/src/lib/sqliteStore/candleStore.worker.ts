// Child process used by the concurrency test: writes N candles into a shared database file.
import { openStore, insertCandles, type CandleRow } from "./candleStore.ts";

const [file, tag, countStr] = process.argv.slice(2);
const n = Number(countStr);
const db = openStore(file);
const rows: CandleRow[] = Array.from({ length: n }, (_, i) => ({
  instrumentKey: `NSE_FO|${tag}|09-11-2026`, indexName: "NIFTY", expiry: "2026-11-09", optionType: "PE", strike: 25000,
  interval: "30minute", barTimestamp: new Date(Date.parse("2026-11-09T09:15:00+05:30") + i * 1800_000).toISOString(),
  open: 1, high: 2, low: 0.5, close: 1, volume: i, oi: i, requestSeq: 1, retrievedAt: "2026-11-13T00:00:00Z",
}));
const r = insertCandles(db, rows);
db.close();
console.log(`WROTE ${r.inserted}`);
