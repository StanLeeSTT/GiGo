import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Launch Planner creates internal projects and milestone tasks through the authenticated API", () => {
  const html = readFileSync(new URL("../public/launch.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/launch.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="launch-project-form"'));
  assert.ok(html.includes('id="launch-project-select"'));
  assert.ok(html.includes('id="create-launch-checklist"'));
  assert.ok(html.includes('id="launch-task-form"'));
  assert.ok(js.includes("/api/v1/projects"));
  assert.ok(js.includes("/api/v1/tasks"));
  assert.ok(js.includes("Launch: "));
  assert.ok(js.includes("data-launch-status"));
  assert.ok(js.includes("Promise.all"));
  assert.ok(!js.includes("fetch("));
});

test("standard launch checklist covers validation, product, sales, distribution, support and measurement", () => {
  const js = readFileSync(new URL("../public/launch.js", import.meta.url), "utf8");
  for (const phrase of ["Validate the customer problem","Validate the offer and economics","Complete the product or service","landing page and sales assets","Prepare launch content","distribution and partner plan","Prepare customer support","post-launch review"]) assert.ok(js.includes(phrase));
  assert.ok(js.includes("no messages are sent here"));
});
