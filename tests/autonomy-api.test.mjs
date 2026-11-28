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


test("owner audit and approval APIs remain scoped to verified owner sessions", () => {
  const start = source.indexOf("const autonomyApprovalRevokeMatch");
  const end = source.indexOf('if (url.pathname === "/api/v1/settings/message-signature")', start);
  const route = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(route.includes("verifiedUserId(token, env)"));
  assert.ok(route.includes("autonomy_audit_events"));
  assert.ok(route.includes("autonomy_approvals"));
  assert.ok(route.includes("gigo_create_autonomy_approval"));
  assert.ok(route.includes("gigo_revoke_autonomy_approval"));
  assert.ok(route.includes("parameters_sha256"));
  assert.ok(route.includes("expiresAt > Date.now() + 30 * 86400000"));
  assert.ok(route.includes("Financial actions cannot be approved"));
});

test("settings displays recent owner-scoped autonomy audit records", () => {
  const html = readFileSync(new URL("../public/settings.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/settings.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="autonomy-audit"'));
  assert.ok(js.includes("/api/v1/autonomy/audit?limit=20"));
  assert.ok(js.includes("event.reason_code"));
  assert.ok(html.includes('id="autonomy-approvals"'));
  assert.ok(js.includes("/api/v1/autonomy/approvals"));
  assert.ok(js.includes("data-revoke-autonomy-approval"));
  assert.ok(js.includes("/revoke"));
});
