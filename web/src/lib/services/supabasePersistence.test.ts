import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import {
  normalizePemCertificate,
  classifyPersistenceError,
  supabaseEnabled,
  supabasePersistenceIssue,
} from "./supabasePersistence.ts";

describe("supabasePersistence - normalizePemCertificate", () => {
  // Generate a valid self-signed X.509 cert using openssl for deterministic testing
  const validCert = execSync(
    'openssl req -x509 -newkey rsa:2048 -keyout /dev/null -out - -days 1 -nodes -subj "/CN=test-supabase-ca"',
    { encoding: "utf8" }
  );

  it("returns undefined for undefined, null, or empty string", () => {
    assert.equal(normalizePemCertificate(undefined), undefined);
    assert.equal(normalizePemCertificate(""), undefined);
    assert.equal(normalizePemCertificate("   "), undefined);
  });

  it("preserves standard valid multiline PEM format", () => {
    const normalized = normalizePemCertificate(validCert);
    assert.ok(normalized);
    assert.ok(normalized.startsWith("-----BEGIN CERTIFICATE-----"));
    assert.ok(normalized.endsWith("-----END CERTIFICATE-----"));
    // OpenSSL parses it cleanly
    const x509 = new X509Certificate(normalized);
    assert.equal(x509.subject.includes("CN=test-supabase-ca"), true);
  });

  it("handles literal \\n and \\r\\n escaped strings (Render CLI / env files)", () => {
    const escaped = validCert.replace(/\n/g, "\\n");
    const normalized = normalizePemCertificate(escaped);
    assert.ok(normalized);
    const x509 = new X509Certificate(normalized);
    assert.equal(x509.subject.includes("CN=test-supabase-ca"), true);
  });

  it("strips wrapping quotes around certificates", () => {
    const quotedDouble = `"${validCert.replace(/\n/g, "\\n")}"`;
    const normalizedDouble = normalizePemCertificate(quotedDouble);
    assert.ok(normalizedDouble);
    const x509Double = new X509Certificate(normalizedDouble);
    assert.equal(x509Double.subject.includes("CN=test-supabase-ca"), true);

    const quotedSingle = `'${validCert.replace(/\n/g, "\\n")}'`;
    const normalizedSingle = normalizePemCertificate(quotedSingle);
    assert.ok(normalizedSingle);
    const x509Single = new X509Certificate(normalizedSingle);
    assert.equal(x509Single.subject.includes("CN=test-supabase-ca"), true);
  });

  it("reconstructs valid PEM when Render's single-line dashboard converts newlines to spaces", () => {
    // This is the exact failure mode when users paste into Render's single-line input
    const singleLineWithSpaces = validCert.replace(/\r?\n/g, " ").trim();
    const normalized = normalizePemCertificate(singleLineWithSpaces);
    assert.ok(normalized);

    // Verify lines are formatted into 64-char chunks
    const lines = normalized.split("\n");
    assert.equal(lines[0], "-----BEGIN CERTIFICATE-----");
    assert.equal(lines[lines.length - 1], "-----END CERTIFICATE-----");
    for (let i = 1; i < lines.length - 1; i++) {
      assert.ok(lines[i].length <= 64, `Line ${i} should be <= 64 chars, got ${lines[i].length}`);
    }

    const x509 = new X509Certificate(normalized);
    assert.equal(x509.subject.includes("CN=test-supabase-ca"), true);
  });

  it("handles base64-encoded PEM file content", () => {
    const base64Encoded = Buffer.from(validCert).toString("base64");
    const normalized = normalizePemCertificate(base64Encoded);
    assert.ok(normalized);
    const x509 = new X509Certificate(normalized);
    assert.equal(x509.subject.includes("CN=test-supabase-ca"), true);
  });

  it("normalizes certificate chains / bundles with multiple certs", () => {
    const bundle = `${validCert}\n${validCert}`;
    const singleLineBundle = bundle.replace(/\r?\n/g, " ").trim();
    const normalized = normalizePemCertificate(singleLineBundle);
    assert.ok(normalized);
    assert.equal((normalized.match(/-----BEGIN CERTIFICATE-----/g) || []).length, 2);
    assert.equal((normalized.match(/-----END CERTIFICATE-----/g) || []).length, 2);
    const x509 = new X509Certificate(normalized);
    assert.equal(x509.subject.includes("CN=test-supabase-ca"), true);
  });
});

describe("supabasePersistence - classifyPersistenceError", () => {
  it("classifies password authentication error as AUTH_FAILED", () => {
    assert.equal(classifyPersistenceError({ code: "28P01", message: "password authentication failed for user" }), "AUTH_FAILED");
    assert.equal(classifyPersistenceError(new Error("password authentication failed for user 'postgres'")), "AUTH_FAILED");
  });

  it("classifies certificate, self-signed and TLS errors as TLS_VERIFICATION_FAILED", () => {
    assert.equal(classifyPersistenceError(new Error("self-signed certificate in certificate chain")), "TLS_VERIFICATION_FAILED");
    assert.equal(classifyPersistenceError(new Error("unable to verify the first certificate")), "TLS_VERIFICATION_FAILED");
    assert.equal(classifyPersistenceError(new Error("error:0480006C:PEM routines::no start line")), "TLS_VERIFICATION_FAILED");
    assert.equal(classifyPersistenceError(new Error("certificate has expired")), "TLS_VERIFICATION_FAILED");
    assert.equal(classifyPersistenceError(new Error("SSL connection has been closed unexpectedly")), "TLS_VERIFICATION_FAILED");
  });

  it("classifies network/connection timeouts as CONNECTION_FAILED", () => {
    assert.equal(classifyPersistenceError(new Error("connect ECONNREFUSED 127.0.0.1:5432")), "CONNECTION_FAILED");
    assert.equal(classifyPersistenceError(new Error("connection timeout after 5000ms")), "CONNECTION_FAILED");
    assert.equal(classifyPersistenceError(new Error("network error")), "CONNECTION_FAILED");
  });

  it("classifies generic errors as DATABASE_OPERATION_FAILED", () => {
    assert.equal(classifyPersistenceError(new Error("table does not exist")), "DATABASE_OPERATION_FAILED");
  });
});

describe("supabasePersistence - state check helpers", () => {
  it("reports DATABASE_URL_MISSING when DATABASE_URL is not set", () => {
    const oldUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      assert.equal(supabaseEnabled(), false);
      assert.equal(supabasePersistenceIssue(), "DATABASE_URL_MISSING");
    } finally {
      if (oldUrl) process.env.DATABASE_URL = oldUrl;
    }
  });
});
