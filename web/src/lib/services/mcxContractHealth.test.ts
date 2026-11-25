import test from "node:test";
import assert from "node:assert/strict";
import { mcxContractHealth } from "./mcxContractHealth.ts";

test("MCX health fails closed until a current expiry is configured", () => {
  const priorCrude = process.env.MCX_CRUDEOIL_EXPIRY;
  const priorGas = process.env.MCX_NATURALGAS_EXPIRY;
  delete process.env.MCX_CRUDEOIL_EXPIRY;
  delete process.env.MCX_NATURALGAS_EXPIRY;
  try {
    const health = mcxContractHealth(new Date("2026-11-25T05:30:00Z"));
    assert.ok(health.every((entry) => entry.status === "EXPIRY_UNCONFIGURED"));
  } finally {
    if (priorCrude === undefined) delete process.env.MCX_CRUDEOIL_EXPIRY; else process.env.MCX_CRUDEOIL_EXPIRY = priorCrude;
    if (priorGas === undefined) delete process.env.MCX_NATURALGAS_EXPIRY; else process.env.MCX_NATURALGAS_EXPIRY = priorGas;
  }
});

test("MCX health identifies an expired configured contract", () => {
  const prior = process.env.MCX_CRUDEOIL_EXPIRY;
  process.env.MCX_CRUDEOIL_EXPIRY = "2026-11-24";
  try {
    assert.equal(mcxContractHealth(new Date("2026-11-25T05:30:00Z")).find((entry) => entry.underlying === "crudeoil")?.status, "ROLL_REQUIRED");
  } finally {
    if (prior === undefined) delete process.env.MCX_CRUDEOIL_EXPIRY; else process.env.MCX_CRUDEOIL_EXPIRY = prior;
  }
});
