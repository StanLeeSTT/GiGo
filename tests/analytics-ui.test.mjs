import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Analytics is backed by saved owner workspace data and avoids invented financial metrics", () => {
  const html = readFileSync(new URL("../public/analytics.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/analytics.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="analytics-stats"'));
  assert.ok(html.includes('id="analytics-pipeline"'));
  assert.ok(html.includes('id="refresh-analytics"'));
  assert.ok(html.includes('id="whop-sales-stats"'));
  assert.ok(html.includes('id="whop-partner-sales"'));
  assert.ok(html.includes("They are not revenue, profit, conversion, cost or ROI metrics."));
  for (const route of ["/api/v1/projects","/api/v1/tasks","/api/v1/research/runs","/api/v1/partners","/api/v1/leads","/api/v1/offers","/api/v1/outreach/campaigns","/api/v1/marketing/assets","/api/v1/creative/briefs","/api/v1/customers/cases"]) assert.ok(js.includes(route));
  assert.ok(js.includes("Promise.allSettled"));
  assert.ok(js.includes('api.request("/api/v1/whop/sales")'));
  assert.ok(js.includes("Whop retains all payment and payout control."));
  assert.ok(js.includes("approvedCampaigns"));
  assert.ok(!js.includes("revenue ="));
  assert.ok(!js.includes("ROI ="));
});
