// Run: node --test scripts/upstox-cli.operatorHeaders.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { operatorHeadersFrom } from "./upstox-cli.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "a".repeat(32);

test("missing token fails with a clear message and never echoes a token", () => {
  assert.throws(() => operatorHeadersFrom({}), /OPERATOR_TOKEN is missing or shorter than 32/);
  const short = "secret-short-value";
  assert.throws(() => operatorHeadersFrom({ OPERATOR_TOKEN: short }), (e) => {
    assert.match(e.message, /shorter than 32/);
    assert.ok(!e.message.includes(short), "error must not contain the token");
    return true;
  });
});

test("31 characters is refused; 32 is the minimum accepted", () => {
  assert.throws(() => operatorHeadersFrom({ OPERATOR_TOKEN: "b".repeat(31) }));
  assert.deepEqual(operatorHeadersFrom({ OPERATOR_TOKEN: TOKEN }), { Authorization: `Bearer ${TOKEN}` });
});

test("every POST in the paper scripts sends the operator header", () => {
  for (const name of ["paper-live.mjs", "paper-cycle.mjs", "paper-collect.mjs", "paper-evaluate.mjs"]) {
    const src = fs.readFileSync(path.join(here, name), "utf8");
    assert.match(src, /requireOperatorHeaders\(\)/, `${name} must check the token first`);
    const posts = src.split("\n").filter((l) => l.includes('method: "POST"'));
    assert.ok(posts.length > 0, `${name} has POST calls`);
    for (const line of posts) assert.ok(line.includes("headers: AUTH"), `${name}: POST without header: ${line.trim()}`);
  }
});
