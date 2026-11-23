import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Analytics is backed by saved owner workspace data and avoids invented financial metrics", () => {
  const html = readFileSync(new URL("../public/analytics.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/analytics.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="analytics-stats"'));
  assert.ok(html.includes('id="analytics-pipeline"'));
  assert.ok(html.includes('id="refresh-analytics"'));
  assert.ok(html.includes("does not infer revenue, profit, conversion rates or ROI"));
  for (const route of ["/api/v1/projects","/api/v1/tasks","/api/v1/research/runs","/api/v1/partners","/api/v1/leads","/api/v1/offers","/api/v1/outreach/campaigns"]) assert.ok(js.includes(route));
  assert.ok(js.includes("Promise.allSettled"));
  assert.ok(js.includes("approvedCampaigns"));
  assert.ok(!js.includes("revenue ="));
  assert.ok(!js.includes("ROI ="));
});
