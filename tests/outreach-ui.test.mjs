import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Outreach Studio uses real authenticated campaign APIs and preparation-only messaging", () => {
  const html = readFileSync(new URL("../public/outreach.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/outreach.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="campaign-form"'));
  assert.ok(html.includes('id="recipient-form"'));
  assert.ok(html.includes('id="template-form"'));
  assert.ok(html.includes('id="approval-form"'));
  assert.ok(html.includes("Preparation only — no messages are sent from this page."));
  assert.ok(js.includes("/api/v1/outreach/campaigns"));
  assert.ok(js.includes("/kind"));
  assert.ok(js.includes("/eligibility"));
  assert.ok(js.includes("/templates"));
  assert.ok(js.includes("/approve"));
  assert.ok(js.includes("/prepare"));
  assert.ok(js.includes("No message was sent"));
  assert.ok(!js.includes("fetch("), "UI must use the authenticated shared API client");
});

test("Outreach templates respect concise subject and body limits and full sequence range", () => {
  const html = readFileSync(new URL("../public/outreach.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="template-subject" maxlength="80"'));
  assert.ok(html.includes('id="template-body" maxlength="340"'));
  for (const n of [0,1,2,3,4,5]) assert.ok(html.includes('value="'+n+'"'));
  assert.ok(html.includes("50/50 net revenue"));
});
