// Regression tests for the collector fail-closed guard. Guarded scripts are executed ONLY in their blocked
// state (flags unset), so each exits with code 2 before any network code runs. No collector is ever authorised here.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { GUARDED } from "../../scripts/lib/collectionGuard.mjs";

const SCRIPTS = path.resolve(import.meta.dirname, "../../scripts");

// Scripts that match the network pattern but are not collectors. Each has a stated reason.
const EXCLUDED: Record<string, string> = {
  "paper-live.mjs": "paper runner: calls the local app only (app routes are gated); must not run unattended",
  "paper-cycle.mjs": "paper runner: local app only",
  "paper-collect.mjs": "paper runner: local app only",
  "paper-evaluate.mjs": "paper runner: local app only",
  "run-paper-supervisor.mjs": "paper supervisor: starts local app and paper runner; not modified (protected)",
  "upstox-cli.mjs": "localhost client library imported by other scripts; targets the local app only",
  "verify-mock-news-offline.mjs": "offline test helper: localhost only",
  "outbound-recorder.cjs": "preload that records outbound calls; does not call out",
  "run-telegram-market-bot.ts": "telegram bot scheduler: manages user notifications and interaction",
  "send-test-signal.ts": "test utility: dispatches test telegram notification",
  "start-render.mjs": "render entrypoint: supervisor for web and bot",
};

function scriptFiles(): string[] {
  return fs.readdirSync(SCRIPTS).filter((f) => /\.(mjs|cjs|ts|py)$/.test(f));
}

function isNetworkScript(file: string): boolean {
  const body = fs.readFileSync(path.join(SCRIPTS, file), "utf8");
  return /fetch\(|https?:\/\/|urllib|requests\./.test(body);
}

test("every guarded script carries its guard before any network code", () => {
  for (const name of Object.keys(GUARDED)) {
    const body = fs.readFileSync(path.join(SCRIPTS, name), "utf8");
    const guardAt = body.search(/assertCollectionAuthorized\(|_guard_sys\.exit\(2\)/);
    assert.ok(guardAt >= 0, `${name}: guard is missing`);
    const netAt = body.search(/fetch\(|https?:\/\/|urllib|requests\./);
    if (netAt >= 0) assert.ok(guardAt < netAt, `${name}: guard must come before the first network reference`);
  }
});

test("no network-capable script is unregistered (new collectors cannot bypass the guard silently)", () => {
  const unregistered = scriptFiles().filter((f) => isNetworkScript(f) && !(f in GUARDED) && !(f in EXCLUDED));
  assert.deepEqual(unregistered, [], `unguarded network scripts: ${unregistered.join(", ")}`);
});

test("every guarded script refuses to run without its authorisation flags, before any network call", () => {
  for (const [name, kind] of Object.entries(GUARDED)) {
    const env: NodeJS.ProcessEnv = { ...process.env, MARKET_DATA_PROVIDER: "mock" };
    delete env.UPSTOX_COLLECTION_ENABLED;
    delete env.EXTERNAL_COLLECTION_ENABLED;
    const file = path.join(SCRIPTS, name);
    const r = name.endsWith(".py")
      ? spawnSync("python3", ["-I", file], { env, encoding: "utf8", timeout: 20_000 })
      : spawnSync(process.execPath, name.endsWith(".ts") ? ["--experimental-strip-types", file] : [file], { env, encoding: "utf8", timeout: 20_000 });
    assert.equal(r.status, 2, `${name} (${kind}): expected exit 2, got ${r.status}; stderr=${(r.stderr ?? "").slice(0, 200)}`);
    assert.match(r.stderr ?? "", /COLLECTION BLOCKED/, `${name}: blocked message missing`);
    assert.match(r.stderr ?? "", /No network request was sent/, `${name}: no-request statement missing`);
  }
});

test("an upstox collector stays blocked when only one of its two flags is set", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, MARKET_DATA_PROVIDER: "upstox" };
  delete env.UPSTOX_COLLECTION_ENABLED;
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, "upstox-discovery.mjs")], { env, encoding: "utf8", timeout: 20_000 });
  assert.equal(r.status, 2, `expected exit 2 without UPSTOX_COLLECTION_ENABLED, got ${r.status}`);
});

test("an external collector stays blocked when EXTERNAL_COLLECTION_ENABLED is absent", () => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.EXTERNAL_COLLECTION_ENABLED;
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, "sync-constituents.mjs")], { env, encoding: "utf8", timeout: 20_000 });
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
});
