import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../public/analytics.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/analytics.html", import.meta.url), "utf8");

test("Analytics dashboard includes the full saved-workflow snapshot", () => {
  for (const path of [
    "/api/v1/projects","/api/v1/tasks","/api/v1/research/runs","/api/v1/partners",
    "/api/v1/leads","/api/v1/offers","/api/v1/outreach/campaigns",
    "/api/v1/marketing/assets","/api/v1/creative/briefs","/api/v1/customers/cases"
  ]) assert.ok(script.includes(path), "missing analytics source: " + path);
  for (const label of ["Marketing drafts","Creative briefs","Support cases","Approved campaigns"]) assert.ok(script.includes(label));
  assert.ok(script.includes("Promise.allSettled"));
});

test("Analytics page does not promise unsupported financial reporting", () => {
  assert.ok(page.includes("Review saved business records, workflow status and operating activity."));
  assert.ok(page.includes("They are not revenue, profit, conversion, cost or ROI metrics."));
  assert.ok(page.includes("cannot execute payments"));
});
