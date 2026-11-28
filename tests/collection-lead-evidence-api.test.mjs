import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("lead social profile and evidence endpoints are authenticated, owner-scoped and HTTPS-only", () => {
  const start = source.indexOf("const leadEvidenceRouteMatch =");
  const end = source.indexOf('if (request.method === "GET" && (url.pathname === "/healthz"', start);
  assert.ok(start >= 0 && end > start, "lead evidence routes should be registered");
  const route = source.slice(start, end);
  assert.ok(route.includes("verifiedUserId(token, env)"));
  assert.ok(route.includes('parsed.protocol === "https:"'));
  assert.ok(route.includes("lead_social_profiles"));
  assert.ok(route.includes("lead_evidence"));
  assert.ok(route.includes("user_id: userId"));
  assert.ok(route.includes("sourceFieldsValid"));
  assert.ok(route.includes("follower_count"));
  assert.ok(route.includes("typical_views"));
});
