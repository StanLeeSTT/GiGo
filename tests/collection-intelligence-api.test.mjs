import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("collection intelligence API is authenticated and supports evidence-backed reads and writes", () => {
  const start = source.indexOf('if (url.pathname === "/api/v1/collection/insights")');
  const end = source.indexOf('if (url.pathname === "/api/v1/collection/runs")', start);
  assert.ok(start >= 0 && end > start, "collection intelligence route should be registered");
  const route = source.slice(start, end);
  assert.ok(route.includes('request.method === "GET"'));
  assert.ok(route.includes('request.method === "POST"'));
  assert.ok(route.includes("verifiedUserId(token, env)"));
  assert.ok(route.includes("collection_insight_evidence"));
  assert.ok(route.includes("gigo_create_collection_insight"));
  assert.ok(route.includes("body.evidence_item_ids.length > 25"));
  assert.ok(route.includes('review_status: "needs_review"'));
  assert.ok(route.includes("authorization: `Bearer ${token}`"));
});
