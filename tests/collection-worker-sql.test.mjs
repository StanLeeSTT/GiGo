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
  assert.match(sql, /returns text[\s\S]*'renewed'[\s\S]*'cancel_requested'[\s\S]*'lease_lost'/);
  assert.match(sql, /progress->>'collection_lease_token' = p_lease_token::text/);
  assert.match(sql, /cancel_requested/);
  assert.match(sql, /update public\.collection_runs[\s\S]*status = final_status/);
  assert.match(sql, /revoke all on function public\.gigo_collection_worker_heartbeat\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.gigo_collection_worker_heartbeat\(uuid, uuid\) to service_role/);
  assert.match(sql, /grant execute on function public\.gigo_cancel_collection_run\(uuid\) to authenticated/);
  assert.match(sql, /final_status := case when coalesce/);
});
