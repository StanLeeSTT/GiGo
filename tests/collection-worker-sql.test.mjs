import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

test("generic scheduler never recovers or claims collection jobs", () => {
  const sql = migration("0011_scheduler_job_type_allowlist.sql");
  assert.match(sql, /where status = 'processing'[\s\S]*job_type in \('research_scan','business_review','daily_briefing','lead_review','custom'\)/);
  assert.match(sql, /and job_type in \('research_scan','business_review','daily_briefing','lead_review','custom'\)/);
  assert.doesNotMatch(sql, /'collection_run'/);
});

test("collection claim RPC is a service-role-only SKIP LOCKED path", () => {
  const sql = migration("0013_collection_worker_claim.sql");
  assert.match(sql, /create or replace function public\.gigo_claim_collection_jobs/);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /collection_runs_job_id_unique/);
  assert.match(sql, /candidate\.input->>'dataset_id'/);
  assert.match(sql, /provider_key text/);
  assert.match(sql, /target_provider_key/);
  assert.match(sql, /collection_lease_token/);
  assert.match(sql, /collection_lease_expires_at/);
  assert.match(sql, /grant execute on function public\.gigo_claim_collection_jobs\(integer, integer\) to service_role/);
  assert.match(sql, /revoke all on function public\.gigo_claim_collection_jobs\(integer, integer\) from public, anon, authenticated/);
});

test("collection persistence RPCs require a live matching lease", () => {
  const sql = migration("0014_collection_worker_persistence.sql");
  assert.equal(sql.split("\n").filter((line) => line.trim() === "as $$").length, 4);
  assert.equal(sql.split("\n").filter((line) => line.trim() === "$$;").length, 4, "each SQL function must have a closing delimiter");
  for (const fn of [
    "gigo_collection_worker_progress",
    "gigo_collection_worker_item",
    "gigo_finish_collection_job",
    "gigo_retry_collection_job"
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(`));
  }
  assert.equal((sql.match(/collection_lease_token' = p_lease_token::text/g) ?? []).length, 4);
  assert.equal((sql.match(/collection_lease_expires_at'\)::timestamptz > now\(\)/g) ?? []).length, 4);
  assert.match(sql, /returns text/);
  assert.match(sql, /returns text[\s\S]*return case when inserted_id is not null then 'inserted' else 'duplicate' end/);
  assert.match(sql, /return 'lease_lost'/);
  assert.match(sql, /on conflict \(dataset_id, item_key\) do nothing/);
  assert.match(sql, /item_count = item_count \+ 1/);
});

test("enqueue RPC permits only the reviewed public-page actor version", () => {
  const sql = migration("0012_collection_run_enqueue.sql");
  assert.match(sql, /safe_actor_key <> 'public_page_metadata'/);
  assert.match(sql, /p_actor_version is distinct from 1/);
  assert.match(sql, /p_provider_key text/);
  assert.match(sql, /safe_provider_key not in \('crawlee','playwright','gigo_safe_http_batch'\)/);
  assert.match(sql, /p\.status = 'healthy'/);
  assert.match(sql, /jsonb_build_array\('web_fetch'\)/);
  assert.match(sql, /provider_id, actor_key, actor_version, provider_key/);
  assert.match(sql, /insert into public\.jobs/);
  assert.match(sql, /insert into public\.collection_runs/);
  assert.match(sql, /insert into public\.collection_datasets/);
});

test("active collection cancellation is cooperative and lease-bound", () => {
  const sql = migration("0017_collection_cooperative_cancellation.sql");
  assert.match(sql, /returns text/);
  for (const outcome of ["renewed", "cancel_requested", "lease_lost"]) assert.ok(sql.includes(String.fromCharCode(39) + outcome + String.fromCharCode(39)));
  assert.match(sql, /progress->>'collection_lease_token' = p_lease_token::text/);
  assert.match(sql, /cancel_requested/);
  assert.match(sql, /update public\.collection_runs[\s\S]*status = final_status/);
  assert.match(sql, /revoke all on function public\.gigo_collection_worker_heartbeat\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.gigo_collection_worker_heartbeat\(uuid, uuid\) to service_role/);
  assert.match(sql, /grant execute on function public\.gigo_cancel_collection_run\(uuid\) to authenticated/);
  assert.match(sql, /final_status := case when coalesce/);
});


test("retry progress preserves cumulative page/request counters and derives items from the dataset", () => {
  const sql = migration("0018_collection_cumulative_progress.sql");
  assert.ok(sql.includes("create or replace function public.gigo_collection_worker_progress"));
  assert.ok(sql.includes("target_dataset_id uuid"));
  assert.ok(sql.includes("jsonb_build_object('items', d.item_count)"));
  assert.ok(sql.includes("set counters = cumulative_counters"));
  assert.ok(sql.includes("grant execute on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) to service_role"));
});


test("collection intelligence requires same-owner evidence from the same run and dataset", () => {
  const sql = migration("0019_collection_intelligence.sql");
  assert.ok(sql.includes("create table if not exists public.collection_insights"));
  assert.ok(sql.includes("create table if not exists public.collection_insight_evidence"));
  assert.ok(sql.includes("foreign key (dataset_id, run_id, user_id)"));
  assert.ok(sql.includes("foreign key (item_id, dataset_id, run_id, user_id)"));
  assert.ok(sql.includes("coalesce(cardinality(p_evidence_item_ids),0) not between 1 and 25"));
  assert.ok(sql.includes("ci.run_id = p_run_id"));
  assert.ok(sql.includes("ci.dataset_id = p_dataset_id"));
  assert.ok(sql.includes("ci.user_id = auth.uid()"));
  assert.ok(sql.includes("grant execute on function public.gigo_create_collection_insight"));
  assert.ok(sql.includes("review_status text not null default 'needs_review'"));
});


test("cross-platform lead profiles and qualification evidence preserve owner and collection provenance", () => {
  const sql = migration("0021_cross_platform_lead_evidence.sql");
  assert.ok(sql.includes("create table if not exists public.lead_social_profiles"));
  assert.ok(sql.includes("create table if not exists public.lead_evidence"));
  assert.ok(sql.includes("youtube','instagram','tiktok','facebook','x','linkedin','other"));
  assert.ok(sql.includes("typical_views bigint"));
  assert.ok(sql.includes("public_contact_route"));
  assert.ok(sql.includes("foreign key (lead_id, user_id)"));
  assert.ok(sql.includes("foreign key (source_item_id, source_dataset_id, source_run_id, user_id)"));
  assert.ok(sql.includes("alter table public.lead_social_profiles enable row level security"));
  assert.ok(sql.includes("alter table public.lead_evidence enable row level security"));
  assert.ok(sql.includes("do not harvest private messages or sensitive personal data"));
});


test("outreach campaigns enforce explicit bounded approval, recipient state and suppression", () => {
  const sql = migration("0022_outreach_campaigns.sql");
  assert.ok(sql.includes("create table if not exists public.outreach_campaigns"));
  assert.ok(sql.includes("create table if not exists public.outreach_recipients"));
  assert.ok(sql.includes("create table if not exists public.outreach_messages"));
  assert.ok(sql.includes("create table if not exists public.outreach_suppressions"));
  assert.ok(sql.includes("approval_status text not null default 'not_requested'"));
  assert.ok(sql.includes("initial_send_enabled boolean not null default false"));
  assert.ok(sql.includes("followups_enabled boolean not null default false"));
  assert.ok(sql.includes("unique (user_id, email)"));
  assert.ok(sql.includes("alter table public.outreach_messages enable row level security"));
  assert.ok(sql.includes("status in ('draft','awaiting_approval','queued','sending','sent','failed','cancelled')"));
  assert.ok(sql.includes("does not send email or enable a sender"));
});


test("outreach campaign approval is an explicit owner-authorized bounded policy", () => {
  const sql = migration("0023_outreach_campaign_approval.sql");
  assert.ok(sql.includes("gigo_approve_outreach_campaign"));
  assert.ok(sql.includes("auth.uid()"));
  assert.ok(sql.includes("p_max_recipients > 10000"));
  assert.ok(sql.includes("p_max_messages_per_recipient > 6"));
  assert.ok(sql.includes("p_initial_send_enabled is distinct from true"));
  assert.ok(sql.includes("campaign_approved"));
  assert.ok(sql.includes("grant execute on function public.gigo_approve_outreach_campaign"));
});


test("outreach recipient admission is guarded by database policy and suppression checks", () => {
  const sql = migration("0024_outreach_recipient_guard.sql");
  assert.ok(sql.includes("gigo_guard_outreach_recipient"));
  assert.ok(sql.includes("auth.uid()"));
  assert.ok(sql.includes("outreach_suppressions"));
  assert.ok(sql.includes("campaign.max_recipients"));
  assert.ok(sql.includes("campaign.status <> 'active'"));
  assert.ok(sql.includes("before insert on public.outreach_recipients"));
});


test("outreach campaign templates are owner-scoped and sequence-numbered", () => {
  const sql = migration("0025_outreach_templates.sql");
  assert.ok(sql.includes("create table if not exists public.outreach_templates"));
  assert.ok(sql.includes("unique (campaign_id, sequence_number)"));
  assert.ok(sql.includes("sequence_number = 0 and message_type = 'initial'"));
  assert.ok(sql.includes("outreach_templates_owner_all"));
  assert.ok(sql.includes("approved_at timestamptz"));
});


test("outreach campaign approval requires a complete authored message sequence", () => {
  const sql = migration("0026_outreach_template_approval_guard.sql");
  assert.ok(sql.includes("gigo_validate_outreach_template_sequence"));
  assert.ok(sql.includes("expected_followups + 1"));
  assert.ok(sql.includes("last_sequence is distinct from expected_followups"));
  assert.ok(sql.includes("set approved_at = now()"));
  assert.ok(sql.includes("before update on public.outreach_campaigns"));
});


test("approved outreach templates cannot be silently edited or replaced", () => {
  const sql = migration("0027_outreach_template_immutability.sql");
  assert.ok(sql.includes("gigo_protect_approved_outreach_template"));
  assert.ok(sql.includes("approved outreach templates are immutable"));
  assert.ok(sql.includes("before insert or update or delete on public.outreach_templates"));
  assert.ok(sql.includes("templates cannot be changed after campaign approval"));
});


test("outreach outbox claim revalidates approval, suppression, templates and recipient state", () => {
  const sql = migration("0028_outreach_outbox_worker.sql");
  assert.ok(sql.includes("gigo_claim_due_outreach_messages"));
  assert.ok(sql.includes("gigo_finish_outreach_message"));
  assert.ok(sql.includes("c.approval_status = 'approved'"));
  assert.ok(sql.includes("t.approved_at is not null"));
  assert.ok(sql.includes("outreach_suppressions"));
  assert.ok(sql.includes("for update of m, r skip locked"));
  assert.ok(sql.includes("delivery outcome is uncertain"));
  assert.ok(sql.includes("grant execute on function public.gigo_claim_due_outreach_messages(integer,integer) to service_role"));
});
