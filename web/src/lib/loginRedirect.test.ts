// The login URL built for a refused request must keep the page to return to and never point off-site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loginUrlFor } from "./loginRedirect.ts";

test("returns to the page the user was on", () => {
  assert.equal(loginUrlFor("/"), "/login?next=%2F");
  assert.equal(loginUrlFor("/opportunity-journal?days=7"), "/login?next=%2Fopportunity-journal%3Fdays%3D7");
});

test("an unsafe current location falls back to the dashboard", () => {
  assert.equal(loginUrlFor("//evil.example"), "/login?next=%2F");
  assert.equal(loginUrlFor("/login"), "/login?next=%2F");
});
