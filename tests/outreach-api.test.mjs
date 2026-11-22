import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("outreach campaign APIs require owner authentication and bounded explicit approval", () => {
  const start = source.indexOf("const outreachCampaignApprovalMatch =");
  const end = source.indexOf('if (request.method === "GET" && (url.pathname === "/healthz"', start);
  assert.ok(start >= 0 && end > start, "outreach routes should be registered");
  const route = source.slice(start, end);
  assert.ok(route.includes("verifiedUserId(token, env)"));
  assert.ok(route.includes("gigo_approve_outreach_campaign"));
  assert.ok(route.includes("initial_send_enabled !== true"));
  assert.ok(route.includes("followup_delays_days"));
  assert.ok(route.includes("outreach_suppressions"));
  assert.ok(route.includes("RECIPIENT_SUPPRESSED"));
  assert.ok(route.includes('status: "draft"'));
  assert.ok(route.includes('request.method === "GET"'));
});
