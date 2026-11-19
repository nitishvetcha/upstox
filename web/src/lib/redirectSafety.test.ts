// Open-redirect protection for the post-login destination.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "./redirectSafety.ts";

test("same-origin paths are kept, including query strings", () => {
  assert.equal(safeNextPath("/saved-picks"), "/saved-picks");
  assert.equal(safeNextPath("/opportunities?underlying=nifty"), "/opportunities?underlying=nifty");
});

test("missing or empty destination falls back to the dashboard", () => {
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath(undefined), "/");
  assert.equal(safeNextPath(""), "/");
});

test("external absolute URLs are refused", () => {
  assert.equal(safeNextPath("https://evil.example/steal"), "/");
  assert.equal(safeNextPath("http://evil.example"), "/");
  assert.equal(safeNextPath("javascript:alert(1)"), "/");
});

test("protocol-relative and backslash tricks are refused", () => {
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("/\\evil.example"), "/");
  assert.equal(safeNextPath("/%5Cevil.example"), "/%5Cevil.example"); // encoded backslash is inert path text
});

test("control characters (header-injection style) are refused", () => {
  assert.equal(safeNextPath("/ok\r\nSet-Cookie: x=1"), "/");
  assert.equal(safeNextPath("/ok\u0000"), "/");
});

test("the login page and API routes are never redirect targets", () => {
  assert.equal(safeNextPath("/login"), "/");
  assert.equal(safeNextPath("/login?next=/x"), "/");
  assert.equal(safeNextPath("/api/saved-picks"), "/");
});

test("over-long destinations are refused", () => {
  assert.equal(safeNextPath("/" + "a".repeat(600)), "/");
});
