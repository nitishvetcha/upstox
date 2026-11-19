// Regression: form controls on the audited pages must have an accessible name (placeholder alone is not a label).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FILES = [
  "src/app/saved-picks/page.tsx",
  "src/app/(research)/performance/page.tsx",
  "src/components/performance/TradeJournal.tsx",
];

function unlabeledControls(file: string): string[] {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");
  const out: string[] = [];
  const re = /<(input|select|textarea)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // The tag ends at the first ">" that is not part of an arrow function "=>".
    const rest = src.slice(m.index);
    const end = rest.search(/(?<!=)>/);
    const attrs = rest.slice(0, end + 1);
    const tagText = attrs;
    if (/type="hidden"/.test(attrs)) continue;
    if (/aria-label(ledby)?=/.test(attrs) || /\btitle=/.test(attrs)) continue;
    out.push(tagText.slice(0, 80));
  }
  return out;
}

for (const f of FILES) {
  test(`every form control in ${f} has an accessible name`, () => {
    assert.deepEqual(unlabeledControls(f), []);
  });
}

// Regression: the saved-picks error message must be announced to assistive technology, and the page must not
// leave a failed save or delete silent (the handlers must catch network failures).
test("saved-picks error message has role=alert", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../..", "src/app/saved-picks/page.tsx"), "utf8");
  assert.match(src, /<p role="alert"[^>]*>\{error\}<\/p>/);
});

test("saved-picks save and delete handle network failure instead of throwing", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../..", "src/app/saved-picks/page.tsx"), "utf8");
  assert.match(src, /catch \{ setError\("could not save the pick/);
  assert.match(src, /catch \{ setError\("could not delete the pick/);
});
