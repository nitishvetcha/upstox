import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route.ts";

describe("GET /api/opportunities/options", () => {
  it("evaluates default NIFTY opportunities", async () => {
    const req = new Request("http://localhost/api/opportunities/options");
    const res = await GET(req);
    assert.equal(res.status, 200);
    const data = await res.json() as { underlying: string };
    assert.equal(data.underlying, "NIFTY");
  });

  it("evaluates CRUDEOIL commodity options opportunities", async () => {
    const req = new Request("http://localhost/api/opportunities/options?underlying=crudeoil");
    const res = await GET(req);
    assert.equal(res.status, 200);
    const data = await res.json() as { underlying: string; topOpportunities: unknown[] };
    assert.equal(data.underlying, "CRUDEOIL");
    assert.ok(Array.isArray(data.topOpportunities));
  });

  it("evaluates NATURALGAS commodity options opportunities", async () => {
    const req = new Request("http://localhost/api/opportunities/options?underlying=naturalgas");
    const res = await GET(req);
    assert.equal(res.status, 200);
    const data = await res.json() as { underlying: string; topOpportunities: unknown[] };
    assert.equal(data.underlying, "NATURALGAS");
    assert.ok(Array.isArray(data.topOpportunities));
  });

  it("rejects unknown underlying with 400", async () => {
    const req = new Request("http://localhost/api/opportunities/options?underlying=bitcoin");
    const res = await GET(req);
    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.match(data.error, /unknown underlying "bitcoin"/);
  });
});
