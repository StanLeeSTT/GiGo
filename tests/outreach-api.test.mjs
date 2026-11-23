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
  assert.ok(sql.includes("revoke all on function public.gigo_prepare_outreach_sequence(uuid, uuid, jsonb) from public, anon, authenticated"));
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


test("follow-up delays start after the preceding message is provider-accepted", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0032_outreach_followup_clock.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("new.sent_at + make_interval(days => delay_days)"));
  assert.ok(sql.includes("previous.sequence_number = m.sequence_number - 1"));
  assert.ok(sql.includes("previous.status = 'sent'"));
  assert.ok(sql.includes("gigo_claim_due_outreach_messages"));
  assert.ok(sql.includes("followups_enabled = true"));
});

test("outbound provider policy never routes partnership outreach through transactional APIs", () => {
  const provider = readFileSync(new URL("../src/outreach/providers.ts", import.meta.url), "utf8");
  assert.ok(provider.includes('"relationship_outreach"'));
  assert.ok(provider.includes('"marketing_campaign"'));
  assert.ok(provider.includes("MARKETING_CONTACT_NOT_REGISTERED"));
  assert.ok(provider.includes("outboundIdempotencyKey"));
  assert.ok(provider.includes("mayRetryProviderOutcome"));
  assert.ok(provider.includes("OUTBOUND_PROVIDER_ADAPTERS: readonly OutboundProviderAdapter[] = []"));
});


test("provider policy behavior blocks unregistered marketing contacts and ambiguous retries", async () => {
  const policy = await import("../src/outreach/providers.ts");
  const resend = policy.PROVIDER_CATALOGUE.find(p => p.id === "resend");
  assert.ok(resend);
  assert.equal(policy.selectOutboundChannel(resend, "transactional", false), "transactional_api");
  assert.equal(policy.selectOutboundChannel(resend, "relationship_outreach", true), "marketing_campaign");
  assert.throws(() => policy.selectOutboundChannel(resend, "relationship_outreach", false), /MARKETING_CONTACT_NOT_REGISTERED/);
  assert.equal(policy.outboundIdempotencyKey("123e4567-e89b-12d3-a456-426614174000"), "gigo-outreach/123e4567-e89b-12d3-a456-426614174000");
  assert.equal(policy.mayRetryProviderOutcome({ kind: "unknown", code: "TIMEOUT", message: "unknown" }), false);
  assert.equal(policy.mayRetryProviderOutcome({ kind: "rejected_before_send", code: "429", message: "rate limit", retryable: true }), true);
});


test("outreach recipients require a reviewed contact basis and marketing-audience registration", () => {
  const sourceText = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.ok(sourceText.includes("outreachRecipientEligibilityMatch"));
  assert.ok(sourceText.includes("INVALID_CONTACT_AUTHORIZATION"));
  assert.ok(sourceText.includes("contact_authorization_status: \"eq.approved\""));
  assert.ok(sourceText.includes("marketing_contact_registered: \"eq.true\""));
  const sql = readFileSync(new URL("../supabase/migrations/0033_outreach_contact_eligibility.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("contact_authorization_reviewed_at"));
  assert.ok(sql.includes("marketing_contact_registered"));
  assert.ok(sql.includes("gigo_guard_outreach_send_eligibility"));
  assert.ok(sql.includes("recipient lacks reviewed marketing-contact authorization"));
});


test("outreach outbox preparation is service-only and users cannot mutate message status directly", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0034_outreach_outbox_privilege_hardening.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("drop policy if exists outreach_messages_owner_all"));
  assert.ok(sql.includes("for select using (user_id = auth.uid())"));
  assert.ok(sql.includes("revoke insert, update, delete on public.outreach_messages from anon, authenticated"));
  assert.ok(sql.includes("coalesce(auth.role(), '') <> 'service_role'"));
  assert.ok(sql.includes("grant execute on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb) to service_role"));
  assert.ok(sql.includes("recipient_row.contact_authorization_status <> 'approved'"));
  assert.ok(sql.includes("recipient_row.marketing_contact_registered is not true"));
  assert.ok(!sql.includes("to authenticated"));
});

test("API calls the outbox preparation RPC with server credentials only after verifying user identity", () => {
  const start = source.indexOf("const outreachPrepareMatch =");
  const end = source.indexOf('if (outreachCampaignApprovalMatch)', start);
  const route = source.slice(start, end);
  assert.ok(route.includes("verifiedUserId(token, env)"));
  assert.ok(route.includes("const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(route.includes("p_owner_id: userId"));
  assert.ok(route.includes('if (!serviceKey.startsWith("sb_secret_")) serviceHeaders.authorization = "Bearer " + serviceKey'));
  assert.ok(route.includes("provider_send_performed: false"));
});
