import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("outreach campaign APIs require owner authentication and bounded explicit approval", () => {
  const start = source.indexOf("const outreachCampaignApprovalMatch =");
  const end = source.indexOf('if (request.method === "GET" && (url.pathname === "/healthz"', start);
  assert.ok(start >= 0 && end > start, "outreach routes should be registered");
  const route = source.slice(start, end);
  assert.ok(route.includes("verifiedUserId(token, env)"));
  assert.ok(route.includes("gigo_approve_outreach_campaign"));
  assert.ok(route.includes("initial_send_enabled !== true"));
  assert.ok(route.includes("followup_delays_days"));
  assert.ok(route.includes("outreach_suppressions"));
  assert.ok(route.includes("RECIPIENT_SUPPRESSED"));
  assert.ok(route.includes('status: "draft"'));
  assert.ok(route.includes('request.method === "GET"'));
});


test("outreach template API restricts sequence size and personalization fields", () => {
  const start = source.indexOf("const outreachTemplatesMatch =");
  const end = source.indexOf('if (!["GET","POST"].includes(request.method))', start);
  assert.ok(start >= 0 && end > start, "template route should be registered");
  const route = source.slice(start, end);
  assert.ok(route.includes("outreach_templates"));
  assert.ok(route.includes("sequence_number"));
  assert.ok(route.includes("specific_observation"));
  assert.ok(route.includes("placeholders.some"));
  assert.ok(route.includes("matchAll"));
  assert.ok(route.includes("verifiedUserId(token, env)"));
});


test("outreach preparation requires approval, uses evidence-backed placeholders and persists only through atomic RPC", () => {
  const start = source.indexOf("const outreachPrepareMatch =");
  const end = source.indexOf('if (request.method === "GET" && (url.pathname === "/healthz"', start);
  assert.ok(start >= 0 && end > start, "outreach preparation route should be registered");
  const route = source.slice(start, end);
  assert.ok(route.includes('approval_status !== "approved"'));
  assert.ok(route.includes("lead_social_profiles"));
  assert.ok(route.includes("lead_evidence"));
  assert.ok(route.includes("missing_verified_personalization"));
  assert.ok(route.includes("gigo_prepare_outreach_sequence"));
  assert.ok(route.includes("provider_send_performed: false"));
  assert.ok(route.includes('limit: "25"'));
});

test("outreach preparation SQL is owner-scoped, template-bound, idempotent and does not send", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0030_outreach_sequence_preparation.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("auth.uid()"));
  assert.ok(sql.includes("approval_status <> 'approved'") || sql.includes("approval_status = 'approved'"));
  assert.ok(sql.includes("approved_at is not null"));
  assert.ok(sql.includes("on conflict (recipient_id,sequence_number) do nothing"));
  assert.ok(sql.includes("outreach_suppressions"));
  assert.ok(sql.includes("outreach_events"));
  assert.ok(sql.includes("to authenticated"));
});


test("inbound outreach events stop queued follow-ups and suppress negative responses", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0031_outreach_inbound_event_safety.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("gigo_record_outreach_recipient_event"));
  assert.ok(sql.includes("'reply_received'"));
  assert.ok(sql.includes("'unsubscribe_received'"));
  assert.ok(sql.includes("outreach_suppressions"));
  assert.ok(sql.includes("status = 'cancelled'"));
  assert.ok(sql.includes("sequence_number > 0"));
  assert.ok(sql.includes("to service_role"));
  assert.ok(sql.includes("provider_event_id"));
});
