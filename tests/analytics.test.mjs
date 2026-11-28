import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/analytics.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/analytics.js", import.meta.url), "utf8");

test("Analytics dashboard derives its snapshot from owner-scoped workspace APIs", () => {
  for (const id of ["analytics-status","analytics-stats","analytics-pipeline","refresh-analytics"]) assert.ok(html.includes('id="'+id+'"'));
  for (const endpoint of ["/api/v1/projects","/api/v1/tasks","/api/v1/research/runs","/api/v1/partners","/api/v1/leads","/api/v1/offers","/api/v1/outreach/campaigns","/api/v1/marketing/assets","/api/v1/creative/briefs","/api/v1/customers/cases"]) assert.ok(client.includes(endpoint));
  assert.ok(client.includes("Promise.allSettled"));
  assert.ok(client.includes("Some modules were unavailable"));
});

test("Analytics never invents financial metrics without transaction data", () => {
  assert.ok(html.includes("They are not revenue, profit, conversion, cost or ROI metrics"));
  assert.ok(html.includes("GiGo cannot execute payments or other money movement"));
  assert.ok(client.includes("Approved campaigns"));
  assert.ok(!client.includes("estimated revenue"));
});
