import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../public/learning.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/learning.js", import.meta.url), "utf8");

test("Learning Planner creates owner workspace plans and tracks study milestones", () => {
  for (const id of ["learning-project-form","learning-project-select","create-learning-path","learning-task-list","learning-task-form","learning-progress"]) assert.ok(page.includes('id="'+id+'"'));
  assert.ok(client.includes("/api/v1/projects"));
  assert.ok(client.includes("/api/v1/tasks"));
  assert.ok(client.includes("Learning: "));
  assert.ok(client.includes("Study: "));
  assert.ok(client.includes("data-learning-status"));
  assert.ok(client.includes("standard study path"));
});

test("Learning Planner does not imply automatic enrollment or reminders", () => {
  assert.ok(page.includes("Study reminders and automatic course enrollment are not connected."));
});
