import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { parseGzipJsonArrayStream } from "./streamJsonArray.ts";

describe("parseGzipJsonArrayStream", () => {
  it("streams gzipped JSON arrays and filters items incrementally", async () => {
    const payload = [
      { id: 1, keep: false, label: 'ignored {braces} inside "quotes"' },
      { id: 2, keep: true, label: "valid {nested}", meta: { a: [1, 2], b: "}" } },
      { id: 3, keep: false, label: "escaped quote \\\" { still string" },
      { id: 4, keep: true, label: "final-kept" },
    ];
    const gz = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));

    // Split gzip stream into tiny 7-byte chunks to stress chunk-boundary state tracking
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < gz.length; i += 7) {
          controller.enqueue(gz.subarray(i, i + 7));
        }
        controller.close();
      },
    });
    const res = new Response(stream);

    const out = await parseGzipJsonArrayStream(
      res,
      (row) => (row.keep === true ? { id: row.id as number, label: String(row.label) } : null),
      { yieldEvery: 2 },
    );

    assert.deepEqual(out, [
      { id: 2, label: "valid {nested}" },
      { id: 4, label: "final-kept" },
    ]);
  });

  it("handles empty arrays cleanly", async () => {
    const res = new Response(gzipSync(Buffer.from("[]", "utf8")));
    const out = await parseGzipJsonArrayStream(res, (row) => row);
    assert.deepEqual(out, []);
  });
});
