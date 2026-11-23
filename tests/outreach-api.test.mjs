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


test("outreach preparation accepts identifiers only and delegates content rendering to the trusted database", () => {
  const start = source.indexOf("const outreachPrepareMatch =");
  const end = source.indexOf("if (outreachCampaignApprovalMatch)", start);
  assert.ok(start >= 0 && end > start, "outreach preparation route should be registered");
  const route = source.slice(start, end);
  assert.ok(route.includes('Object.keys(body).some(key => key !== "recipient_id")'));
  assert.ok(route.includes("content_rendered_by_database: true"));
  assert.ok(route.includes("p_owner_id: userId"));
  assert.ok(route.includes("p_campaign_id: campaignId"));
  assert.ok(route.includes("p_recipient_id: recipient.id"));
  assert.ok(!route.includes("subject_template"));
  assert.ok(!route.includes("body_template"));
  assert.ok(!route.includes("p_messages"));
  assert.ok(route.includes("provider_send_performed: false"));
});

test("database rendering is bound to approved templates and trusted evidence, not caller-supplied copy", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0036_outreach_database_rendering_and_final_guard.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("create or replace function public.gigo_prepare_outreach_sequence"));
  assert.ok(sql.includes("coalesce(auth.role(), '') <> 'service_role'"));
  assert.ok(sql.includes("template_row.subject_template"));
  assert.ok(sql.includes("template_row.body_template"));
  assert.ok(sql.includes("public.lead_social_profiles"));
  assert.ok(sql.includes("public.lead_evidence"));
  assert.ok(sql.includes("template_row.personalization_fields ? placeholder"));
  assert.ok(sql.includes("grant execute on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid) to service_role"));
  assert.ok(!sql.includes("p_messages jsonb"));
  assert.ok(sql.includes("revoke all on public.outreach_messages from public, anon, authenticated"));
  assert.ok(sql.includes("message no longer satisfies approved outreach eligibility"));
  assert.ok(sql.includes("outreach_suppressions"));
  assert.ok(sql.includes("approval_revoked_at is not null"));
});

test("outreach message client access is read-only and message status transitions recheck eligibility", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0036_outreach_database_rendering_and_final_guard.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("revoke all on public.outreach_messages from public, anon, authenticated"));
  assert.ok(sql.includes("grant select on public.outreach_messages to authenticated"));
  assert.ok(sql.includes("before update of status on public.outreach_messages"));
  assert.ok(sql.includes("contact_authorization_status <> 'approved'"));
  assert.ok(sql.includes("exists (select 1 from public.outreach_suppressions"));
  assert.ok(sql.includes("send_window_start"));
  assert.ok(sql.includes("quiet_hours_start"));
  assert.ok(sql.includes("previous.status = 'sent'"));
});

test("campaign approval cannot be forged by direct authenticated table updates", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0036_outreach_database_rendering_and_final_guard.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("revoke all on public.outreach_campaigns from public, anon, authenticated"));
  assert.ok(sql.includes("grant select, insert, delete on public.outreach_campaigns to authenticated"));
  assert.ok(sql.includes("create policy outreach_campaigns_owner_select"));
  assert.ok(sql.includes("create policy outreach_campaigns_owner_insert"));
  assert.ok(sql.includes("and approval_status = 'not_requested'"));
  assert.ok(sql.includes("and status = 'draft'"));
  assert.ok(sql.includes("security definer\nset search_path = ''"));
  assert.ok(sql.includes("owner_id uuid := auth.uid()"));
  assert.ok(sql.includes("grant execute on function public.gigo_approve_outreach_campaign"));
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


test("inbound provider webhook deduplication is atomic and scoped to provider account", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0035_outreach_inbound_event_idempotency.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("provider_account_id"));
  assert.ok(sql.includes("create unique index if not exists outreach_events_provider_delivery_unique"));
  assert.ok(sql.includes("on conflict (provider,provider_account_id,provider_event_id)"));
  assert.ok(sql.includes("returning id into event_row_id"));
  assert.ok(sql.includes("if event_row_id is null"));
  assert.ok(sql.includes("coalesce(auth.role(), '') <> 'service_role'"));
  assert.ok(sql.includes("grant execute on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text,text) to service_role"));
  assert.ok(sql.includes("update public.outreach_recipients"));
  assert.ok(sql.includes("outreach_suppressions"));
});
