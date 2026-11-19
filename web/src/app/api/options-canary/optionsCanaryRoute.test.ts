import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { handleOptionsCanaryRequest, type OptionsCanaryRouteDeps } from "./canaryHandler.ts";
import type { CanaryRunResult } from "../../../lib/services/optionQuoteCanary.ts";

describe("Phase 2.3.15 Stage 4 — Canary Route Authorization & Security", () => {
  const GET = handleOptionsCanaryRequest;
  const TEST_SECRET = "secure-canary-secret-phase2315-xyz";

  // 1. Missing secret returns 500
  it("1. Missing CANARY_AUTH_SECRET returns HTTP 500 AUTH_NOT_CONFIGURED", async () => {
    let canaryInvoked = false;
    const deps: OptionsCanaryRouteDeps = {
      getSecret: () => undefined,
      isCanaryEnabled: () => true,
      runCanarySample: async () => {
        canaryInvoked = true;
        throw new Error("Should not be called");
      },
    };

    const req = new Request("http://localhost:3123/api/options-canary", {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
    });

    const res = await GET(req, deps);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, "AUTH_NOT_CONFIGURED");
    assert.equal(canaryInvoked, false);
  });

  // 2. Empty secret returns 500
  it("2. Empty or whitespace CANARY_AUTH_SECRET returns HTTP 500 AUTH_NOT_CONFIGURED", async () => {
    for (const emptySecret of ["", "   ", "\t\n"]) {
      let canaryInvoked = false;
      const deps: OptionsCanaryRouteDeps = {
        getSecret: () => emptySecret,
        isCanaryEnabled: () => true,
        runCanarySample: async () => {
          canaryInvoked = true;
          throw new Error("Should not be called");
        },
      };

      const req = new Request("http://localhost:3123/api/options-canary", {
        headers: { Authorization: `Bearer ${emptySecret}` },
      });

      const res = await GET(req, deps);
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.error, "AUTH_NOT_CONFIGURED");
      assert.equal(canaryInvoked, false);
    }
  });

  // 3. Missing Authorization header returns 401
  it("3. Missing Authorization header returns HTTP 401 UNAUTHORIZED", async () => {
    let canaryInvoked = false;
    const deps: OptionsCanaryRouteDeps = {
      getSecret: () => TEST_SECRET,
      isCanaryEnabled: () => true,
      runCanarySample: async () => {
        canaryInvoked = true;
        throw new Error("Should not be called");
      },
    };

    const req = new Request("http://localhost:3123/api/options-canary"); // no headers
    const res = await GET(req, deps);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "UNAUTHORIZED");
    assert.equal(canaryInvoked, false);
  });

  // 4. Incorrect bearer token returns 401
  it("4. Incorrect or malformed Authorization header returns HTTP 401 UNAUTHORIZED", async () => {
    const invalidHeaders = [
      "Bearer wrong-token",
      "Bearer",
      "Basic dXNlcjpwYXNz",
      TEST_SECRET, // missing 'Bearer ' prefix
      `Bearer ${TEST_SECRET}extra`,
    ];

    for (const headerVal of invalidHeaders) {
      let canaryInvoked = false;
      const deps: OptionsCanaryRouteDeps = {
        getSecret: () => TEST_SECRET,
        isCanaryEnabled: () => true,
        runCanarySample: async () => {
          canaryInvoked = true;
          throw new Error("Should not be called");
        },
      };

      const req = new Request("http://localhost:3123/api/options-canary", {
        headers: { Authorization: headerVal },
      });

      const res = await GET(req, deps);
      assert.equal(res.status, 401, `Expected 401 for header: "${headerVal}"`);
      const body = await res.json();
      assert.equal(body.error, "UNAUTHORIZED");
      assert.equal(canaryInvoked, false);
    }
  });

  // 5. Correct token with disabled canary flag returns 403
  it("5. Correct token with disabled canary flag returns HTTP 403 CANARY_DISABLED", async () => {
    let canaryInvoked = false;
    const deps: OptionsCanaryRouteDeps = {
      getSecret: () => TEST_SECRET,
      isCanaryEnabled: () => false, // Canary disabled
      runCanarySample: async () => {
        canaryInvoked = true;
        throw new Error("Should not be called");
      },
    };

    const req = new Request("http://localhost:3123/api/options-canary", {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
    });

    const res = await GET(req, deps);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "CANARY_DISABLED");
    assert.equal(canaryInvoked, false);
  });

  // 6. No rejected request invokes the canary service
  it("6. No rejected request (500, 401, 403) invokes the canary service", async () => {
    let canaryInvocations = 0;
    const mockCanary = async (): Promise<CanaryRunResult> => {
      canaryInvocations++;
      return {
        status: "EXECUTED",
        reason: "Mock executed",
        timestamp: new Date().toISOString(),
        audit: null,
        keysRequested: 0,
        durationMs: 0,
      };
    };

    // Case A: Missing secret
    await GET(new Request("http://localhost:3123/api/options-canary"), {
      getSecret: () => undefined,
      runCanarySample: mockCanary,
    });

    // Case B: Missing header
    await GET(new Request("http://localhost:3123/api/options-canary"), {
      getSecret: () => TEST_SECRET,
      runCanarySample: mockCanary,
    });

    // Case C: Invalid token
    await GET(new Request("http://localhost:3123/api/options-canary", {
      headers: { Authorization: "Bearer bad-token" },
    }), {
      getSecret: () => TEST_SECRET,
      runCanarySample: mockCanary,
    });

    // Case D: Flag disabled
    await GET(new Request("http://localhost:3123/api/options-canary", {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
    }), {
      getSecret: () => TEST_SECRET,
      isCanaryEnabled: () => false,
      runCanarySample: mockCanary,
    });

    assert.equal(canaryInvocations, 0, "Canary service must NEVER be invoked on rejected requests");
  });

  // 7. No rejected request writes diagnostic logs
  it("7. No rejected request writes to the canary diagnostic log file", async () => {
    const tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-route-test-"));
    const origLogDir = process.env.CANARY_LOG_DIR;
    process.env.CANARY_LOG_DIR = tempLogDir;

    try {
      // Execute rejected calls
      await GET(new Request("http://localhost:3123/api/options-canary"), {
        getSecret: () => undefined,
      });

      await GET(new Request("http://localhost:3123/api/options-canary"), {
        getSecret: () => TEST_SECRET,
      });

      await GET(new Request("http://localhost:3123/api/options-canary", {
        headers: { Authorization: "Bearer bad-token" },
      }), {
        getSecret: () => TEST_SECRET,
      });

      await GET(new Request("http://localhost:3123/api/options-canary", {
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      }), {
        getSecret: () => TEST_SECRET,
        isCanaryEnabled: () => false,
      });

      // Verify no files were created in temp log directory
      const files = fs.readdirSync(tempLogDir);
      assert.equal(files.length, 0, "No diagnostic logs should be written for rejected requests");
    } finally {
      if (origLogDir) process.env.CANARY_LOG_DIR = origLogDir;
      else delete process.env.CANARY_LOG_DIR;
      fs.rmSync(tempLogDir, { recursive: true, force: true });
    }
  });

  // 8. No request can bypass authorization by omitting configuration
  it("8. An unauthenticated public request cannot bypass authorization when CANARY_AUTH_SECRET is omitted", async () => {
    const origSecret = process.env.CANARY_AUTH_SECRET;
    delete process.env.CANARY_AUTH_SECRET; // Omit environment configuration entirely

    try {
      // Even if canary flag is explicitly forced on:
      const req = new Request("http://localhost:3123/api/options-canary"); // Public request, no auth
      const res = await GET(req, { isCanaryEnabled: () => true });

      // Must fail closed with 500, never succeed or leak canary execution
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.error, "AUTH_NOT_CONFIGURED");
    } finally {
      if (origSecret) process.env.CANARY_AUTH_SECRET = origSecret;
    }
  });

  // 9. Valid authorization still cannot bypass authentication, market-status, or concurrency checks
  it("9. Valid authorization cannot bypass Upstox session authentication check", async () => {
    // 9a: Expired or invalid Upstox token rejects with 401 AUTH_INVALID
    const depsInvalidAuth: OptionsCanaryRouteDeps = {
      getSecret: () => TEST_SECRET,
      isCanaryEnabled: () => true,
      getTokenStatus: async () => ({ status: "EXPIRED" }),
      getAccessToken: async () => "expired-token",
    };

    const req = new Request("http://localhost:3123/api/options-canary", {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
    });

    const res = await GET(req, depsInvalidAuth);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "AUTH_INVALID");

    // 9b: Missing Upstox token rejects with 401 TOKEN_MISSING
    const depsMissingToken: OptionsCanaryRouteDeps = {
      getSecret: () => TEST_SECRET,
      isCanaryEnabled: () => true,
      getTokenStatus: async () => ({ status: "VERIFIED_CONNECTED" }),
      getAccessToken: async () => null,
    };

    const resMissing = await GET(req, depsMissingToken);
    assert.equal(resMissing.status, 401);
    const bodyMissing = await resMissing.json();
    assert.equal(bodyMissing.error, "TOKEN_MISSING");
  });
});
