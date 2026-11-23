import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("autonomy owner APIs verify the session and expose only bounded governance operations", () => {
  const start = source.indexOf('if (url.pathname === "/api/v1/autonomy"');
  const end = source.indexOf('if (url.pathname === "/api/v1/settings/message-signature")', start);
  const route = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(route.includes("verifiedUserId(token, env)"));
  assert.ok(route.includes("gigo_initialize_autonomy_defaults"));
  assert.ok(route.includes("gigo_set_autonomy_pause"));
  assert.ok(route.includes("gigo_set_autonomy_policy"));
  assert.ok(route.includes("financial_execution: \"hard_denied\""));
  assert.ok(route.includes("external_execution_available: false"));
  assert.ok(route.includes("body.scope === \"external_execute\" && body.require_approval !== true"));
  assert.ok(!route.includes("SUPABASE_SECRET_KEY"));
});

test("settings UI never offers external or financial execution and provides pause controls", () => {
  const html = readFileSync(new URL("../public/settings.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/settings.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="initialize-autonomy"'));
  assert.ok(html.includes('id="toggle-autonomy-pause"'));
  assert.ok(js.includes("/api/v1/autonomy/initialize"));
  assert.ok(js.includes("/api/v1/autonomy/pause"));
  assert.ok(js.includes("/api/v1/autonomy/policies"));
  assert.ok(js.includes("External execution"));
  assert.ok(js.includes("Disabled — campaign-bound approval"));
});
