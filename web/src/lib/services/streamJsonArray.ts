// Streaming parser for gzipped JSON arrays of instrument objects (e.g., NSE.json.gz, BSE.json.gz, MCX.json.gz).
// Decompresses and decodes 64 KB chunks incrementally, parsing one top-level `{...}` object at a time
// so multi-100 MB raw Buffers / ArrayBuffers are never materialized in memory.

export async function parseGzipJsonArrayStream<T>(
  res: Response,
  mapItem: (raw: Record<string, unknown>) => T | null | undefined,
  options?: { yieldEvery?: number },
): Promise<T[]> {
  if (!res.body) {
    throw new Error("Response body unavailable for streaming decompression");
  }

  const yieldEvery = options?.yieldEvery ?? 500;
  const textStream = res.body
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream("utf-8"));
  const reader = textStream.getReader();

  const out: T[] = [];
  let inArray = false;
  let finished = false;
  let depth = 0;
  let inString = false;
  let escape = false;
  let pending = "";
  let parsedCount = 0;

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      let objStart = depth > 0 ? 0 : -1;

      for (let i = 0; i < value.length; i++) {
        const ch = value[i];

        if (!inArray) {
          if (ch === "[") {
            inArray = true;
          }
          continue;
        }

        if (depth === 0) {
          if (ch === "{") {
            depth = 1;
            objStart = i;
          } else if (ch === "]") {
            finished = true;
            break;
          }
          continue;
        }

        if (escape) {
          escape = false;
          continue;
        }

        if (inString) {
          if (ch === "\\") {
            escape = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
        } else if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const objJson = pending
              ? pending + value.slice(objStart, i + 1)
              : value.slice(objStart, i + 1);
            pending = "";
            objStart = -1;

            const parsed = JSON.parse(objJson) as Record<string, unknown>;
            const mapped = mapItem(parsed);
            if (mapped !== null && mapped !== undefined) {
              out.push(mapped);
            }

            parsedCount++;
            if (parsedCount % yieldEvery === 0) {
              await new Promise<void>((resolve) => setImmediate(resolve));
            }
          }
        }
      }

      if (!finished && depth > 0 && objStart !== -1) {
        pending += value.slice(objStart);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return out;
}
