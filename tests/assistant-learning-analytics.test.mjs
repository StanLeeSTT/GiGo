import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
const autonomy = readFileSync(new URL("../src/assistant/autonomy.ts", import.meta.url), "utf8");

test("GiGo Assistant can manage owner-private learning plans and milestones", () => {
  for (const name of ["learning_list_plans","learning_create_plan","learning_list_milestones","learning_add_milestone","learning_update_milestone"]) {
    assert.equal((runtime.match(new RegExp('name: "'+name+'"',"g"))||[]).length,1);
    assert.equal((runtime.match(new RegExp('if \\(name === "'+name+'"\\)',"g"))||[]).length,1);
  }
  assert.ok(runtime.includes('startsWith("Learning: ")'));
  assert.ok(runtime.includes('title: "Study: " + title'));
  assert.ok(registry.includes('id:"learning.create_plan"'));
  assert.ok(registry.includes('id:"learning.update_milestone"'));
  assert.match(autonomy,/learning_create_plan: "draft"/);
  assert.match(autonomy,/learning_update_milestone: "internal_execute"/);
});

test("GiGo Assistant Analytics snapshot is read-only and does not invent financial results", () => {
  assert.equal((runtime.match(/name: "analytics_snapshot"/g)||[]).length,1);
  assert.equal((runtime.match(/if \(name === "analytics_snapshot"\)/g)||[]).length,1);
  assert.ok(registry.includes('id:"analytics.snapshot"'));
  assert.match(autonomy,/analytics_snapshot: "observe"/);
  assert.ok(runtime.includes('financial_metrics: "not_available_without_transaction_data"'));
  assert.ok(runtime.includes("money_movement_performed: false"));
});
