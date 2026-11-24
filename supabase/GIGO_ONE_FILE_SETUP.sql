-- =============================================================================
-- GiGo: ONE-FILE PENDING DATABASE SETUP
-- =============================================================================
-- Scope: applies canonical migrations 0010 through 0047 in their exact order.
--
-- IMPORTANT: This bundle is specifically for the existing GiGo Supabase
-- project. The known baseline migrations 0001 and 0004-0009 are already
-- applied there. Migrations 0010-0047 are recorded in the repository as
-- unapplied. The application status of 0002/0003 was uncertain; this bundle safely re-applies
-- their idempotent trigger/function/index definitions before migrations 0010+.
--
-- Run this file ONCE in Supabase SQL Editor, against the intended GiGo
-- project, after confirming that migrations 0010-0047 have not already been
-- applied. Do not run it on a different/fresh project.
--
-- The canonical individual files in supabase/migrations/ are deliberately
-- retained. Do NOT delete them: they are the source of truth for migration
-- history, future diffs, recovery and Supabase CLI workflows.
--
-- Supabase SQL Editor execution does not automatically register these
-- versions in supabase_migrations.schema_migrations. If you later use the
-- Supabase CLI, reconcile the migration history using the CLI's migration
-- repair workflow only after confirming the database state. Do not blindly
-- run db push after this manual install.
--
-- This file is transactional. Any SQL error should roll back the bundle.
-- If preflight detects existing collection tables, it stops before changes;
-- do not remove that guard to force a second run.
--
-- This bundle does NOT configure Cloudflare/R2, API secrets, provider
-- credentials, sender domains, GitHub Actions secrets or deploy the Worker.
-- It does not activate external outreach sending. Financial actions remain
-- prohibited by GiGo's application governance.
-- =============================================================================

BEGIN;

DO $gigo_preflight$
BEGIN
  IF to_regclass('public.jobs') IS NULL THEN
    RAISE EXCEPTION 'GiGo baseline missing: public.jobs was not found. Stop and reconcile the baseline migrations first.';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'GiGo baseline missing: public.set_updated_at() was not found. Stop and reconcile the baseline migrations first.';
  END IF;
  IF to_regclass('public.projects') IS NULL OR to_regclass('public.tasks') IS NULL
     OR to_regclass('public.assistant_conversations') IS NULL OR to_regclass('public.assistant_messages') IS NULL THEN
    RAISE EXCEPTION 'GiGo baseline missing: projects/tasks/assistant conversation tables are required before this setup.';
  END IF;
  IF to_regclass('public.collection_providers') IS NOT NULL THEN
    RAISE EXCEPTION 'GiGo migrations 0010+ appear to be present already. This one-file bundle is not safe to re-run.';
  END IF;
END;
$gigo_preflight$;





-- ============================================================================
-- BASELINE REPAIR: 0002_task_project_ownership.sql (idempotent)
-- ============================================================================

-- Keep tasks attached only to projects owned by the same account.
-- Runs with the caller's auth context and relies on projects RLS.
create or replace function public.check_task_project_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
    select 1
    from public.projects p
    where p.id = new.project_id
      and p.user_id = new.user_id
  ) then
    raise exception 'The selected project does not belong to this account.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_check_project_owner on public.tasks;
create trigger tasks_check_project_owner
before insert or update of project_id, user_id on public.tasks
for each row execute function public.check_task_project_owner();

create index if not exists tasks_user_created_idx
  on public.tasks(user_id, created_at desc);


-- ============================================================================
-- BASELINE REPAIR: 0003_assistant_conversation_activity.sql (idempotent)
-- ============================================================================

-- Keep conversation recency aligned with its newest message.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.assistant_conversations
  set updated_at = now()
  where id = new.conversation_id
    and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists assistant_messages_touch_conversation on public.assistant_messages;
create trigger assistant_messages_touch_conversation
after insert on public.assistant_messages
for each row execute function public.touch_conversation_on_message();

create index if not exists assistant_messages_user_created_idx
  on public.assistant_messages(user_id, created_at desc);


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0010_universal_collection_engine.sql
-- ============================================================================

-- GiGo Universal Collection Engine foundation.
-- This migration adds owner-scoped provider, actor, run, dataset and item records.
-- Collection execution remains disabled until a provider adapter is explicitly configured.

create table if not exists public.collection_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null check (provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  provider_type text not null check (provider_type in ('search','web_crawl','browser','social_api','social_collection','data_extraction','custom')),
  status text not null default 'not_configured'
    check (status in ('not_configured','configured','healthy','degraded','disabled','quota_exhausted','permission_required','error')),
  access_mode text not null default 'unknown'
    check (access_mode in ('official_api','owner_authorized','public_web_permitted','self_hosted','external_service','unknown')),
  capabilities jsonb not null default '[]'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  quota_state jsonb not null default '{}'::jsonb,
  last_health_check_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_key)
);

create table if not exists public.collection_actors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_key text not null check (actor_key ~ '^[a-z][a-z0-9_-]{1,95}$'),
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  category text not null check (category in ('web_search','web_crawl','browser_automation','social_discovery','lead_discovery','data_extraction','market_intelligence','custom')),
  input_schema jsonb not null default '{"type":"object"}'::jsonb,
  output_schema jsonb not null default '{"type":"object"}'::jsonb,
  required_capabilities jsonb not null default '[]'::jsonb,
  policy_tags jsonb not null default '[]'::jsonb,
  is_enabled boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, actor_key, version)
);

create table if not exists public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references public.collection_actors(id) on delete set null,
  provider_id uuid references public.collection_providers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  actor_key text not null,
  actor_version integer not null default 1,
  provider_key text,
  status text not null default 'queued'
    check (status in ('queued','validating','running','waiting_for_quota','completed','partial','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  checkpoint jsonb not null default '{}'::jsonb,
  counters jsonb not null default '{"pages":0,"items":0,"requests":0}'::jsonb,
  quota_estimate jsonb not null default '{}'::jsonb,
  quota_actual jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.collection_runs(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  item_count integer not null default 0 check (item_count >= 0),
  schema_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, name),
  unique (id, run_id, user_id)
);

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null,
  run_id uuid not null,
  item_key text not null check (char_length(item_key) between 1 and 512),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  source_platform text,
  source_type text not null default 'web',
  observed_at timestamptz,
  collected_at timestamptz not null default now(),
  access_method text not null default 'unknown',
  permission_context jsonb not null default '{}'::jsonb,
  record jsonb not null,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (dataset_id, item_key),
  constraint collection_items_dataset_run_owner_fk
    foreign key (dataset_id, run_id, user_id)
    references public.collection_datasets(id, run_id, user_id)
    on delete cascade
);

create index if not exists collection_providers_user_status_idx
  on public.collection_providers(user_id, status, provider_key);
create index if not exists collection_actors_user_enabled_idx
  on public.collection_actors(user_id, is_enabled, category);
create index if not exists collection_runs_user_created_idx
  on public.collection_runs(user_id, created_at desc);
create index if not exists collection_runs_status_created_idx
  on public.collection_runs(status, created_at);
create index if not exists collection_datasets_run_idx
  on public.collection_datasets(run_id, created_at);
create index if not exists collection_items_dataset_created_idx
  on public.collection_items(dataset_id, created_at desc);
create index if not exists collection_items_source_url_idx
  on public.collection_items(user_id, source_url);

alter table public.collection_providers enable row level security;
alter table public.collection_actors enable row level security;
alter table public.collection_runs enable row level security;
alter table public.collection_datasets enable row level security;
alter table public.collection_items enable row level security;

drop policy if exists collection_providers_owner_all on public.collection_providers;
create policy collection_providers_owner_all on public.collection_providers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists collection_actors_owner_all on public.collection_actors;
create policy collection_actors_owner_all on public.collection_actors
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists collection_runs_owner_all on public.collection_runs;
create policy collection_runs_owner_all on public.collection_runs
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (actor_id is null or exists (
      select 1 from public.collection_actors a where a.id = actor_id and a.user_id = auth.uid()
    ))
    and (provider_id is null or exists (
      select 1 from public.collection_providers p where p.id = provider_id and p.user_id = auth.uid()
    ))
    and (job_id is null or exists (
      select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()
    ))
  );

drop policy if exists collection_datasets_owner_all on public.collection_datasets;
create policy collection_datasets_owner_all on public.collection_datasets
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.collection_runs r where r.id = run_id and r.user_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.collection_runs r where r.id = run_id and r.user_id = auth.uid())
  );

drop policy if exists collection_items_owner_all on public.collection_items;
create policy collection_items_owner_all on public.collection_items
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.collection_datasets d where d.id = dataset_id and d.user_id = auth.uid())
    and exists (select 1 from public.collection_runs r where r.id = run_id and r.user_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.collection_datasets d where d.id = dataset_id and d.user_id = auth.uid())
    and exists (select 1 from public.collection_runs r where r.id = run_id and r.user_id = auth.uid())
  );

drop trigger if exists collection_providers_set_updated_at on public.collection_providers;
create trigger collection_providers_set_updated_at before update on public.collection_providers
  for each row execute function public.set_updated_at();
drop trigger if exists collection_actors_set_updated_at on public.collection_actors;
create trigger collection_actors_set_updated_at before update on public.collection_actors
  for each row execute function public.set_updated_at();
drop trigger if exists collection_runs_set_updated_at on public.collection_runs;
create trigger collection_runs_set_updated_at before update on public.collection_runs
  for each row execute function public.set_updated_at();

comment on table public.collection_providers is 'Owner-scoped collection provider registry; secrets must never be stored in configuration JSON.';
comment on table public.collection_actors is 'Versioned reusable collection task definitions with explicit input/output schemas and policy tags.';
comment on table public.collection_runs is 'Durable execution records; job scheduler remains the execution authority.';
comment on table public.collection_datasets is 'Named output datasets produced by collection runs.';
comment on table public.collection_items is 'Normalized collected records with source provenance and permission context.';


-- Owner-authorized cancellation for runs that have not started executing.
-- Lock order is jobs -> collection_runs, matching the scheduler's job-first
-- claim path. This avoids a lock inversion when cancellation races a claim.
create or replace function public.gigo_cancel_collection_run(p_run_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_job_id uuid;
  target_job_status text;
  target_run_status text;
  locked_run_job_id uuid;
begin
  -- Read the association without locking the run. The job_id is immutable
  -- after a run is created; lock the job first if one is attached.
  select r.job_id
    into target_job_id
    from public.collection_runs r
    where r.id = p_run_id
      and r.user_id = auth.uid();

  if not found then
    return false;
  end if;

  if target_job_id is not null then
    select j.status
      into target_job_status
      from public.jobs j
      where j.id = target_job_id
        and j.user_id = auth.uid()
      for update;

    if not found or target_job_status not in ('pending','waiting_for_worker','waiting_for_quota') then
      return false;
    end if;
  end if;

  -- Recheck run state after obtaining the job lock. A worker may have
  -- advanced the run while this request was waiting.
  select r.status, r.job_id
    into target_run_status, locked_run_job_id
    from public.collection_runs r
    where r.id = p_run_id
      and r.user_id = auth.uid()
    for update;

  if not found
     or locked_run_job_id is distinct from target_job_id
     or target_run_status not in ('queued','waiting_for_quota') then
    return false;
  end if;

  if target_job_id is not null then
    update public.jobs
      set status = 'cancelled',
          finished_at = now(),
          last_error = null,
          progress = coalesce(progress, '{}'::jsonb) ||
            jsonb_build_object('stage','cancelled','cancelled_at',now())
      where id = target_job_id and user_id = auth.uid();
  end if;

  update public.collection_runs
    set status = 'cancelled',
        finished_at = now(),
        error = null,
        counters = coalesce(counters, '{}'::jsonb) ||
          jsonb_build_object('cancelled_at',now())
    where id = p_run_id and user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.gigo_cancel_collection_run(uuid) from public, anon;
grant execute on function public.gigo_cancel_collection_run(uuid) to authenticated;


-- END CANONICAL MIGRATION 0010_universal_collection_engine.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0011_scheduler_job_type_allowlist.sql
-- ============================================================================

-- Keep the generic durable worker fail-closed.
-- Collection jobs must not be claimable until a dedicated collection worker is
-- wired into the scheduler and has passed its integration tests.

create or replace function public.gigo_claim_due_jobs(p_limit integer default 5)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Recover work abandoned by a terminated worker after a conservative timeout.
  update public.jobs
    set status = case when attempts >= 5 then 'failed' else 'waiting_for_worker' end,
        run_after = now(),
        finished_at = case when attempts >= 5 then now() else null end,
        last_error = 'Recovered after an interrupted worker execution.'
    where status = 'processing'
      and job_type in ('research_scan','business_review','daily_briefing','lead_review','custom')
      and updated_at < now() - interval '20 minutes';

  return query
    with candidates as (
      select id
      from public.jobs
      where status in ('pending','waiting_for_worker','waiting_for_quota')
        and job_type in ('research_scan','business_review','daily_briefing','lead_review','custom')
        and run_after <= now()
        and attempts < 5
      order by run_after asc, created_at asc
      limit greatest(1, least(coalesce(p_limit, 5), 10))
      for update skip locked
    )
    update public.jobs as j
      set status = 'processing',
          attempts = j.attempts + 1,
          started_at = coalesce(j.started_at, now()),
          last_error = null,
          progress = coalesce(j.progress, '{}'::jsonb) ||
            jsonb_build_object('stage','claimed','claimed_at',now())
      from candidates
      where j.id = candidates.id
      returning j.*;
end;
$$;

revoke all on function public.gigo_claim_due_jobs(integer) from public, anon, authenticated;
grant execute on function public.gigo_claim_due_jobs(integer) to service_role;

comment on function public.gigo_claim_due_jobs(integer) is
  'Claims only job types handled by the generic operations worker. New worker categories must be added only with a dedicated handler and integration tests.';


-- END CANONICAL MIGRATION 0011_scheduler_job_type_allowlist.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0012_collection_run_enqueue.sql
-- ============================================================================

-- Atomically create an owner-scoped collection run, its output dataset,
-- and a durable job. The generic scheduler allowlist intentionally excludes
-- collection_run until the dedicated worker is deployed.
create or replace function public.gigo_create_collection_run(
  p_actor_key text,
  p_actor_version integer,
  p_input jsonb,
  p_provider_key text,
  p_dataset_name text default 'Collected data'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_job_id uuid;
  new_run_id uuid;
  new_dataset_id uuid;
  safe_actor_key text;
  safe_provider_key text;
  safe_dataset_name text;
  selected_provider_id uuid;
  selected_capabilities jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  safe_actor_key := lower(btrim(coalesce(p_actor_key, '')));
  safe_provider_key := lower(btrim(coalesce(p_provider_key, '')));
  safe_dataset_name := btrim(coalesce(p_dataset_name, 'Collected data'));

  -- Only the reviewed actor version can be enqueued through this RPC.
  if safe_actor_key <> 'public_page_metadata'
     or p_actor_version is distinct from 1
     or safe_provider_key not in ('crawlee','playwright','gigo_safe_http_batch')
     or jsonb_typeof(coalesce(p_input, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_input, '{}'::jsonb)::text) > 32768
     or char_length(safe_dataset_name) not between 1 and 180 then
    raise exception 'invalid collection run request' using errcode = '22023';
  end if;

  -- Bind the run to an owner-configured, healthy provider that explicitly
  -- grants the actor's required web_fetch capability.
  select p.id, p.capabilities
    into selected_provider_id, selected_capabilities
    from public.collection_providers p
    where p.user_id = auth.uid()
      and p.provider_key = safe_provider_key
      and p.status = 'healthy'
    for share;

  if selected_provider_id is null
     or (coalesce(selected_capabilities, '[]'::jsonb) @> jsonb_build_array('web_fetch')) is not true then
    raise exception 'provider is not healthy or lacks required actor capability' using errcode = '22023';
  end if;

  insert into public.jobs (user_id, job_type, status, input, progress, run_after, idempotency_key)
  values (
    auth.uid(), 'collection_run', 'pending',
    jsonb_build_object(
      'actor_key', safe_actor_key,
      'actor_version', p_actor_version,
      'actor_input', coalesce(p_input, '{}'::jsonb),
      'provider_key', safe_provider_key
    ),
    jsonb_build_object('stage','queued'),
    now(),
    'collection:' || gen_random_uuid()::text
  )
  returning id into new_job_id;

  insert into public.collection_runs (
    user_id, job_id, provider_id, actor_key, actor_version, provider_key, status, input
  )
  values (
    auth.uid(), new_job_id, selected_provider_id, safe_actor_key, p_actor_version,
    safe_provider_key, 'queued', coalesce(p_input, '{}'::jsonb)
  )
  returning id into new_run_id;

  insert into public.collection_datasets (user_id, run_id, name, metadata)
  values (
    auth.uid(), new_run_id, safe_dataset_name,
    jsonb_build_object(
      'actor_key', safe_actor_key,
      'actor_version', p_actor_version,
      'provider_key', safe_provider_key
    )
  )
  returning id into new_dataset_id;

  update public.jobs
    set input = input || jsonb_build_object(
      'collection_run_id', new_run_id,
      'dataset_id', new_dataset_id,
      'provider_key', safe_provider_key
    )
    where id = new_job_id and user_id = auth.uid();

  return jsonb_build_object(
    'job_id', new_job_id,
    'run_id', new_run_id,
    'dataset_id', new_dataset_id,
    'provider_key', safe_provider_key,
    'status', 'queued',
    'execution_enabled', false
  );
end;
$$;

revoke all on function public.gigo_create_collection_run(text, integer, jsonb, text, text) from public, anon;
grant execute on function public.gigo_create_collection_run(text, integer, jsonb, text, text) to authenticated;

comment on function public.gigo_create_collection_run(text, integer, jsonb, text, text) is
  'Atomically creates a queued collection job, run and dataset for the authenticated owner, bound to a healthy owner-configured provider. Generic scheduler deliberately does not claim collection_run.';


-- END CANONICAL MIGRATION 0012_collection_run_enqueue.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0013_collection_worker_claim.sql
-- ============================================================================

-- Dedicated collection worker claim boundary.
create unique index if not exists collection_runs_job_id_unique
  on public.collection_runs(job_id) where job_id is not null;

-- This function is service-role only. It never makes collection jobs visible to
-- the generic operations worker and claims at most ten jobs per call.
create or replace function public.gigo_claim_collection_jobs(
  p_limit integer default 1,
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid,
  user_id uuid,
  run_id uuid,
  dataset_id uuid,
  actor_key text,
  actor_version integer,
  provider_key text,
  actor_input jsonb,
  checkpoint jsonb,
  attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.jobs%rowtype;
  target_run_id uuid;
  target_dataset_id uuid;
  target_actor_key text;
  target_actor_version integer;
  target_provider_key text;
  target_input jsonb;
  target_checkpoint jsonb;
  new_lease_token uuid;
  new_lease_expiry timestamptz;
begin
  -- Recover only expired collection leases. The generic scheduler must never
  -- mutate collection_run jobs or their run records.
  update public.jobs j
    set status = case when j.attempts >= 5 then 'failed' else 'waiting_for_worker' end,
        run_after = now(),
        finished_at = case when j.attempts >= 5 then now() else null end,
        last_error = 'Collection worker lease expired; run is eligible for recovery.',
        progress = coalesce(j.progress, '{}'::jsonb) - 'collection_lease_token' - 'collection_lease_expires_at'
    where j.job_type = 'collection_run'
      and j.status = 'processing'
      and case
        when (j.progress ->> 'collection_lease_expires_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          then (j.progress ->> 'collection_lease_expires_at')::timestamptz <= now()
        else j.updated_at < now() - interval '20 minutes'
      end;

  update public.collection_runs r
    set status = case when exists (
      select 1 from public.jobs j where j.id = r.job_id and j.status = 'failed'
    ) then 'failed' else 'queued' end,
        finished_at = case when exists (
          select 1 from public.jobs j where j.id = r.job_id and j.status = 'failed'
        ) then now() else null end
    where r.status = 'running'
      and exists (
        select 1 from public.jobs j
        where j.id = r.job_id and j.job_type = 'collection_run'
          and j.status in ('failed','waiting_for_worker')
      );

  for candidate in
    select j.*
    from public.jobs j
    where j.job_type = 'collection_run'
      and j.status in ('pending','waiting_for_worker')
      and j.run_after <= now()
      and j.attempts < 5
    order by j.run_after asc, j.created_at asc
    limit greatest(1, least(coalesce(p_limit, 1), 10))
    for update skip locked
  loop
    target_run_id := null;
    target_dataset_id := null;
    target_actor_key := null;
    target_actor_version := null;
    target_provider_key := null;
    target_input := null;
    target_checkpoint := '{}'::jsonb;

    select r.id, d.id, r.actor_key, r.actor_version, r.provider_key, r.input, r.checkpoint
      into target_run_id, target_dataset_id, target_actor_key, target_actor_version, target_provider_key, target_input, target_checkpoint
      from public.collection_runs r
      join public.collection_datasets d
        on d.run_id = r.id and d.user_id = r.user_id
      where r.id = (candidate.input->>'collection_run_id')::uuid
        and d.id = (candidate.input->>'dataset_id')::uuid
        and r.job_id = candidate.id
        and r.user_id = candidate.user_id
        and r.status = 'queued'
      order by d.created_at asc
      limit 1
      for update of r;

    if target_run_id is null then
      update public.jobs
        set status = 'failed',
            finished_at = now(),
            last_error = 'Collection job has no matching queued run and dataset.'
        where id = candidate.id;
      continue;
    end if;

    new_lease_token := gen_random_uuid();
    new_lease_expiry := now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900)));

    update public.jobs
      set status = 'processing',
          attempts = attempts + 1,
          started_at = coalesce(started_at, now()),
          finished_at = null,
          last_error = null,
          progress = coalesce(progress, '{}'::jsonb) ||
            jsonb_build_object(
              'stage', 'collection_claimed',
              'claimed_at', now(),
              'collection_lease_token', new_lease_token,
              'collection_lease_expires_at', new_lease_expiry
            )
      where id = candidate.id;

    update public.collection_runs
      set status = 'running',
          started_at = coalesce(started_at, now()),
          finished_at = null,
          error = null
      where id = target_run_id and user_id = candidate.user_id;

    job_id := candidate.id;
    user_id := candidate.user_id;
    run_id := target_run_id;
    dataset_id := target_dataset_id;
    actor_key := target_actor_key;
    actor_version := target_actor_version;
    provider_key := target_provider_key;
    actor_input := coalesce(target_input, '{}'::jsonb);
    checkpoint := coalesce(target_checkpoint, '{}'::jsonb);
    attempts := candidate.attempts + 1;
    lease_token := new_lease_token;
    lease_expires_at := new_lease_expiry;
    return next;
  end loop;
end;
$$;

revoke all on function public.gigo_claim_collection_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.gigo_claim_collection_jobs(integer, integer) to service_role;

comment on function public.gigo_claim_collection_jobs(integer, integer) is
  'Dedicated service-role claim path for collection_run jobs. Uses row locks, SKIP LOCKED, owner-linked run/dataset checks, and expiring lease tokens.';


-- END CANONICAL MIGRATION 0013_collection_worker_claim.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0014_collection_worker_persistence.sql
-- ============================================================================

-- Trusted persistence and lifecycle RPCs for the dedicated collection worker.
-- All functions are service-role only; the worker supplies an unguessable lease
-- token issued by gigo_claim_collection_jobs for every mutation.
create or replace function public.gigo_collection_worker_progress(
  p_job_id uuid,
  p_lease_token uuid,
  p_counters jsonb,
  p_checkpoint jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  target_run_id uuid;
begin
  if jsonb_typeof(coalesce(p_counters, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_checkpoint, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_checkpoint, '{}'::jsonb)::text) > 32768
     or coalesce(p_counters->>'pages', '0') !~ '^[0-9]+$'
     or coalesce(p_counters->>'items', '0') !~ '^[0-9]+$'
     or coalesce(p_counters->>'requests', '0') !~ '^[0-9]+$'
     or (coalesce(p_counters->>'pages', '0'))::numeric > 2147483647
     or (coalesce(p_counters->>'items', '0'))::numeric > 2147483647
     or (coalesce(p_counters->>'requests', '0'))::numeric > 2147483647 then
    raise exception 'invalid collection progress' using errcode = '22023';
  end if;

  select j.user_id, (j.input->>'collection_run_id')::uuid
    into owner_id, target_run_id
    from public.jobs j
    where j.id = p_job_id
      and j.job_type = 'collection_run'
      and j.status = 'processing'
      and j.progress->>'collection_lease_token' = p_lease_token::text
      and (j.progress->>'collection_lease_expires_at')::timestamptz > now()
    for update;

  if not found then return false; end if;

  update public.collection_runs
    set counters = coalesce(p_counters, '{}'::jsonb),
        checkpoint = coalesce(p_checkpoint, '{}'::jsonb)
    where id = target_run_id
      and user_id = owner_id
      and job_id = p_job_id
      and status = 'running';

  if not found then return false; end if;

  update public.jobs
    set progress = coalesce(progress, '{}'::jsonb) ||
      jsonb_build_object('stage','collection_running','counters',p_counters,'checkpoint',p_checkpoint,
        'heartbeat_at',now(),'collection_lease_expires_at',now() + interval '120 seconds')
    where id = p_job_id;
  return true;
end;
$$;

create or replace function public.gigo_collection_worker_item(
  p_job_id uuid,
  p_lease_token uuid,
  p_item jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  target_run_id uuid;
  target_dataset_id uuid;
  inserted_id uuid;
begin
  if jsonb_typeof(p_item) <> 'object'
     or coalesce(p_item->>'itemKey','') = ''
     or char_length(p_item->>'itemKey') > 512
     or coalesce(p_item->>'sourceType','') = ''
     or char_length(p_item->>'sourceType') > 80
     or coalesce(p_item->>'accessMethod','') = ''
     or char_length(p_item->>'accessMethod') > 80
     or jsonb_typeof(p_item->'permissionContext') is distinct from 'object'
     or jsonb_typeof(p_item->'record') is distinct from 'object'
     or char_length(coalesce(p_item->>'sourceUrl','')) > 2048
     or char_length(coalesce(p_item->>'sourcePlatform','')) > 80 then
    raise exception 'invalid collection item' using errcode = '22023';
  end if;

  select j.user_id, (j.input->>'collection_run_id')::uuid, (j.input->>'dataset_id')::uuid
    into owner_id, target_run_id, target_dataset_id
    from public.jobs j
    where j.id = p_job_id
      and j.job_type = 'collection_run'
      and j.status = 'processing'
      and j.progress->>'collection_lease_token' = p_lease_token::text
      and (j.progress->>'collection_lease_expires_at')::timestamptz > now()
    for update;

  if not found then return 'lease_lost'; end if;

  insert into public.collection_items (
    user_id, dataset_id, run_id, item_key, source_url, source_platform,
    source_type, observed_at, access_method, permission_context, record, content_hash
  )
  values (
    owner_id, target_dataset_id, target_run_id, p_item->>'itemKey',
    nullif(p_item->>'sourceUrl',''), nullif(p_item->>'sourcePlatform',''),
    p_item->>'sourceType',
    case when coalesce(p_item->>'observedAt','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      then (p_item->>'observedAt')::timestamptz else null end,
    p_item->>'accessMethod', p_item->'permissionContext', p_item->'record',
    nullif(p_item->>'contentHash','')
  )
  on conflict (dataset_id, item_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    update public.collection_datasets
      set item_count = item_count + 1
      where id = target_dataset_id and run_id = target_run_id and user_id = owner_id;
    if not found then raise exception 'collection dataset not found for active run'; end if;

    update public.collection_runs
      set counters = jsonb_set(
        coalesce(counters, '{"pages":0,"items":0,"requests":0}'::jsonb),
        '{items}',
        to_jsonb(coalesce((counters->>'items')::integer, 0) + 1),
        true
      )
      where id = target_run_id and user_id = owner_id and job_id = p_job_id and status = 'running';
    if not found then raise exception 'collection run is not active'; end if;
  end if;

  update public.jobs
    set progress = coalesce(progress, '{}'::jsonb) ||
      jsonb_build_object('heartbeat_at',now(),'collection_lease_expires_at',now() + interval '120 seconds')
    where id = p_job_id;
  return case when inserted_id is not null then 'inserted' else 'duplicate' end;
end;
$$;

create or replace function public.gigo_finish_collection_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_error jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  target_run_id uuid;
  final_job_status text;
begin
  if p_status is null or p_status not in ('completed','partial','failed','cancelled')
     or (p_error is not null and (jsonb_typeof(p_error) <> 'object' or octet_length(p_error::text) > 8192)) then
    raise exception 'invalid collection completion state' using errcode = '22023';
  end if;

  select j.user_id, (j.input->>'collection_run_id')::uuid
    into owner_id, target_run_id
    from public.jobs j
    where j.id = p_job_id
      and j.job_type = 'collection_run'
      and j.status = 'processing'
      and j.progress->>'collection_lease_token' = p_lease_token::text
      and (j.progress->>'collection_lease_expires_at')::timestamptz > now()
    for update;

  if not found then return false; end if;

  final_job_status := case when p_status in ('completed','partial') then 'completed' else p_status end;

  update public.collection_runs
    set status = p_status,
        error = p_error,
        finished_at = now()
    where id = target_run_id and user_id = owner_id and job_id = p_job_id and status = 'running';

  if not found then return false; end if;

  update public.jobs
    set status = final_job_status,
        finished_at = now(),
        last_error = case when p_status = 'failed' then left(coalesce(p_error->>'message','Collection worker failed.'), 1000) else null end,
        progress = (coalesce(progress, '{}'::jsonb) - 'collection_lease_token' - 'collection_lease_expires_at') ||
          jsonb_build_object('stage',p_status,'finished_at',now())
    where id = p_job_id;
  return true;
end;
$$;

create or replace function public.gigo_retry_collection_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error jsonb,
  p_delay_seconds integer default 300
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  target_run_id uuid;
  current_attempts integer;
  retry_allowed boolean;
begin
  if p_error is not null and (jsonb_typeof(p_error) <> 'object' or octet_length(p_error::text) > 8192) then
    raise exception 'invalid collection error' using errcode = '22023';
  end if;

  select j.user_id, (j.input->>'collection_run_id')::uuid, j.attempts
    into owner_id, target_run_id, current_attempts
    from public.jobs j
    where j.id = p_job_id
      and j.job_type = 'collection_run'
      and j.status = 'processing'
      and j.progress->>'collection_lease_token' = p_lease_token::text
      and (j.progress->>'collection_lease_expires_at')::timestamptz > now()
    for update;

  if not found then return 'lease_lost'; end if;
  retry_allowed := current_attempts < 5;

  update public.collection_runs
    set status = case when retry_allowed then 'queued' else 'failed' end,
        error = p_error,
        finished_at = case when retry_allowed then null else now() end
    where id = target_run_id and user_id = owner_id and job_id = p_job_id and status = 'running';

  if not found then return 'lease_lost'; end if;

  update public.jobs
    set status = case when retry_allowed then 'waiting_for_worker' else 'failed' end,
        run_after = case when retry_allowed then now() + make_interval(secs => greatest(30, least(coalesce(p_delay_seconds,300),86400))) else run_after end,
        finished_at = case when retry_allowed then null else now() end,
        last_error = left(coalesce(p_error->>'message','Collection worker requested a retry.'), 1000),
        progress = (coalesce(progress, '{}'::jsonb) - 'collection_lease_token' - 'collection_lease_expires_at') ||
          jsonb_build_object('stage',case when retry_allowed then 'retry_scheduled' else 'failed' end,'retry_scheduled_at',now())
    where id = p_job_id;
  return case when retry_allowed then 'retry_scheduled' else 'failed' end;
end;
$$;

revoke all on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.gigo_collection_worker_item(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.gigo_finish_collection_job(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.gigo_retry_collection_job(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.gigo_collection_worker_item(uuid, uuid, jsonb) to service_role;
grant execute on function public.gigo_finish_collection_job(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.gigo_retry_collection_job(uuid, uuid, jsonb, integer) to service_role;

comment on function public.gigo_collection_worker_item(uuid, uuid, jsonb) is
  'Atomically inserts a provenance-bearing collection item under a live worker lease; duplicate dataset item keys are ignored.';


-- END CANONICAL MIGRATION 0014_collection_worker_persistence.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0015_collection_provider_health.sql
-- ============================================================================

-- Service-role-only health gate for the first internal safe-HTTP provider.
-- The health RPC verifies the complete worker RPC surface, not merely this migration.
create or replace function public.gigo_collection_worker_health()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('public.gigo_claim_collection_jobs(integer,integer)') is null
     or to_regprocedure('public.gigo_collection_worker_heartbeat(uuid,uuid)') is null
     or to_regprocedure('public.gigo_collection_worker_progress(uuid,uuid,jsonb,jsonb)') is null
     or to_regprocedure('public.gigo_collection_worker_item(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.gigo_finish_collection_job(uuid,uuid,text,jsonb)') is null
     or to_regprocedure('public.gigo_retry_collection_job(uuid,uuid,jsonb,integer)') is null then
    raise exception 'collection worker migrations are incomplete' using errcode = '55000';
  end if;
  return 'gigo-collection-worker-v1';
end;
$$;
revoke all on function public.gigo_collection_worker_health() from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_health() to service_role;

create or replace function public.gigo_set_collection_provider_health(p_provider_id uuid, p_check_version text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_check_version is distinct from 'safe-http-batch-v1' then
    raise exception 'unsupported collection health check' using errcode = '22023';
  end if;
  update public.collection_providers
    set status = 'healthy', last_health_check_at = now(), last_error_code = null
    where id = p_provider_id
      and provider_key = 'gigo_safe_http_batch'
      and status in ('configured', 'degraded', 'healthy')
      and provider_type = 'web_crawl'
      and access_mode = 'public_web_permitted'
      and capabilities @> '["web_fetch"]'::jsonb
      and configuration @> '{"execution_mode":"batch_runner","runner":"github_actions","adapter_key":"gigo_safe_http_batch","adapter_version":1,"network_policy":"public_https_only","authentication":"none"}'::jsonb;
  return found;
end;
$$;
revoke all on function public.gigo_set_collection_provider_health(uuid, text) from public, anon, authenticated;
grant execute on function public.gigo_set_collection_provider_health(uuid, text) to service_role;


-- END CANONICAL MIGRATION 0015_collection_provider_health.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0016_collection_worker_heartbeat.sql
-- ============================================================================

-- Lease heartbeat: renew a live collection lease without overwriting
-- persisted counters/checkpoints. The worker must stop if this returns false.
create or replace function public.gigo_collection_worker_heartbeat(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
    set progress = coalesce(progress, '{}'::jsonb) ||
      jsonb_build_object('heartbeat_at', now(), 'collection_lease_expires_at', now() + interval '120 seconds')
    where id = p_job_id
      and job_type = 'collection_run'
      and status = 'processing'
      and progress->>'collection_lease_token' = p_lease_token::text
      and (progress->>'collection_lease_expires_at')::timestamptz > now();
  return found;
end;
$$;
revoke all on function public.gigo_collection_worker_heartbeat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_heartbeat(uuid, uuid) to service_role;


-- END CANONICAL MIGRATION 0016_collection_worker_heartbeat.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0017_collection_cooperative_cancellation.sql
-- ============================================================================

-- Cooperative cancellation for active collection workers.
-- The owner only requests cancellation; the worker acknowledges it under its live lease.
drop function if exists public.gigo_collection_worker_heartbeat(uuid, uuid);
create function public.gigo_collection_worker_heartbeat(
  p_job_id uuid,
  p_lease_token uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_progress jsonb;
  current_expiry timestamptz;
begin
  select coalesce(j.progress, '{}'::jsonb),
         nullif(j.progress->>'collection_lease_expires_at','')::timestamptz
    into current_progress, current_expiry
    from public.jobs j
    where j.id = p_job_id
      and j.job_type = 'collection_run'
      and j.status = 'processing'
      and j.progress->>'collection_lease_token' = p_lease_token::text
    for update;

  if not found or current_expiry is null or current_expiry <= now() then
    return 'lease_lost';
  end if;

  if coalesce((current_progress->>'cancel_requested')::boolean, false) then
    return 'cancel_requested';
  end if;

  update public.jobs
    set progress = current_progress ||
      jsonb_build_object('heartbeat_at', now(), 'collection_lease_expires_at', now() + interval '120 seconds')
    where id = p_job_id;
  return 'renewed';
end;
$$;
revoke all on function public.gigo_collection_worker_heartbeat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_heartbeat(uuid, uuid) to service_role;

-- Active cancellation is a request, not a premature status transition.
-- The worker stops its adapter and acknowledges cancellation via finish RPC.
create or replace function public.gigo_cancel_collection_run(p_run_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_job_id uuid;
  target_job_status text;
  target_run_status text;
  locked_run_job_id uuid;
begin
  select r.job_id into target_job_id
    from public.collection_runs r
    where r.id = p_run_id and r.user_id = auth.uid();

  if not found then return false; end if;

  if target_job_id is not null then
    select j.status into target_job_status
      from public.jobs j
      where j.id = target_job_id and j.user_id = auth.uid()
      for update;
    if not found then return false; end if;
  end if;

  select r.status, r.job_id into target_run_status, locked_run_job_id
    from public.collection_runs r
    where r.id = p_run_id and r.user_id = auth.uid()
    for update;

  if not found or locked_run_job_id is distinct from target_job_id then return false; end if;

  if target_job_status in ('pending','waiting_for_worker','waiting_for_quota')
     and target_run_status in ('queued','waiting_for_quota') then
    update public.jobs
      set status = 'cancelled', finished_at = now(), last_error = null,
          progress = coalesce(progress, '{}'::jsonb) ||
            jsonb_build_object('stage','cancelled','cancelled_at',now())
      where id = target_job_id and user_id = auth.uid();

    update public.collection_runs
      set status = 'cancelled', finished_at = now(), error = null,
          counters = coalesce(counters, '{}'::jsonb) || jsonb_build_object('cancelled_at',now())
      where id = p_run_id and user_id = auth.uid();
    return true;
  end if;

  if target_job_status = 'processing' and target_run_status = 'running' then
    update public.jobs
      set progress = coalesce(progress, '{}'::jsonb) ||
        jsonb_build_object('cancel_requested',true,'cancel_requested_at',now())
      where id = target_job_id and user_id = auth.uid()
        and status = 'processing';
    return found;
  end if;

  return false;
end;
$$;
revoke all on function public.gigo_cancel_collection_run(uuid) from public, anon;
grant execute on function public.gigo_cancel_collection_run(uuid) to authenticated;

-- Finalization rechecks the cancellation flag while holding the job row lock.
-- This closes the race where a cancellation arrives just before normal finish.
create or replace function public.gigo_finish_collection_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_error jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  target_run_id uuid;
  final_status text;
  final_error jsonb;
  job_progress jsonb;
begin
  if p_status is null or p_status not in ('completed','partial','failed','cancelled')
     or (p_error is not null and (jsonb_typeof(p_error) <> 'object' or octet_length(p_error::text) > 8192)) then
    raise exception 'invalid collection completion state' using errcode = '22023';
  end if;

  select j.user_id, (j.input->>'collection_run_id')::uuid, coalesce(j.progress,'{}'::jsonb)
    into owner_id, target_run_id, job_progress
    from public.jobs j
    where j.id = p_job_id
      and j.job_type = 'collection_run'
      and j.status = 'processing'
      and j.progress->>'collection_lease_token' = p_lease_token::text
      and (j.progress->>'collection_lease_expires_at')::timestamptz > now()
    for update;

  if not found then return false; end if;

  final_status := case when coalesce((job_progress->>'cancel_requested')::boolean,false)
    then 'cancelled' else p_status end;
  final_error := case when final_status = 'cancelled' then null else p_error end;

  update public.collection_runs
    set status = final_status,
        error = final_error,
        finished_at = now()
    where id = target_run_id and user_id = owner_id and job_id = p_job_id and status = 'running';

  if not found then return false; end if;

  update public.jobs
    set status = case when final_status in ('completed','partial') then 'completed' else final_status end,
        finished_at = now(),
        last_error = case when final_status = 'failed' then left(coalesce(final_error->>'message','Collection worker failed.'), 1000) else null end,
        progress = (coalesce(progress, '{}'::jsonb) - 'collection_lease_token' - 'collection_lease_expires_at') ||
          jsonb_build_object('stage',final_status,'finished_at',now())
    where id = p_job_id;
  return true;
end;
$$;

revoke all on function public.gigo_finish_collection_job(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.gigo_finish_collection_job(uuid, uuid, text, jsonb) to service_role;


-- END CANONICAL MIGRATION 0017_collection_cooperative_cancellation.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0018_collection_cumulative_progress.sql
-- ============================================================================

-- Keep collection progress counters cumulative across durable retries.
-- Page/request totals are checkpointed by the adapter; item totals are derived
-- from the idempotent dataset row count so retries cannot double-count items.
create or replace function public.gigo_collection_worker_progress(
  p_job_id uuid,
  p_lease_token uuid,
  p_counters jsonb,
  p_checkpoint jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  target_run_id uuid;
  target_dataset_id uuid;
  cumulative_counters jsonb;
begin
  if jsonb_typeof(coalesce(p_counters, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_checkpoint, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_checkpoint, '{}'::jsonb)::text) > 32768
     or coalesce(p_counters->>'pages', '0') !~ '^[0-9]+$'
     or coalesce(p_counters->>'items', '0') !~ '^[0-9]+$'
     or coalesce(p_counters->>'requests', '0') !~ '^[0-9]+$'
     or (coalesce(p_counters->>'pages', '0'))::numeric > 2147483647
     or (coalesce(p_counters->>'items', '0'))::numeric > 2147483647
     or (coalesce(p_counters->>'requests', '0'))::numeric > 2147483647 then
    raise exception 'invalid collection progress' using errcode = '22023';
  end if;

  select j.user_id, (j.input->>'collection_run_id')::uuid, (j.input->>'dataset_id')::uuid
    into owner_id, target_run_id, target_dataset_id
    from public.jobs j
    where j.id = p_job_id
      and j.job_type = 'collection_run'
      and j.status = 'processing'
      and j.progress->>'collection_lease_token' = p_lease_token::text
      and (j.progress->>'collection_lease_expires_at')::timestamptz > now()
    for update;

  if not found then return false; end if;

  select coalesce(p_counters, '{}'::jsonb) || jsonb_build_object('items', d.item_count)
    into cumulative_counters
    from public.collection_datasets d
    where d.id = target_dataset_id
      and d.run_id = target_run_id
      and d.user_id = owner_id;

  if cumulative_counters is null then return false; end if;

  update public.collection_runs
    set counters = cumulative_counters,
        checkpoint = coalesce(p_checkpoint, '{}'::jsonb)
    where id = target_run_id
      and user_id = owner_id
      and job_id = p_job_id
      and status = 'running';

  if not found then return false; end if;

  update public.jobs
    set progress = coalesce(progress, '{}'::jsonb) ||
      jsonb_build_object('stage','collection_running','counters',cumulative_counters,'checkpoint',coalesce(p_checkpoint, '{}'::jsonb),
        'heartbeat_at',now(),'collection_lease_expires_at',now() + interval '120 seconds')
    where id = p_job_id;
  return true;
end;
$$;

revoke all on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) to service_role;

comment on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) is
  'Persists cumulative page/request checkpoints and derives item totals from the idempotent dataset count across retries.';


-- END CANONICAL MIGRATION 0018_collection_cumulative_progress.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0019_collection_intelligence.sql
-- ============================================================================

-- Evidence-backed intelligence derived from collected records.
-- Insights are separate from raw collection items and always retain explicit evidence links.

create table if not exists public.collection_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  dataset_id uuid not null,
  insight_key text not null check (char_length(insight_key) between 1 and 160),
  insight_type text not null check (insight_type in (
    'market_signal','customer_problem','competitor','product_opportunity',
    'lead_candidate','trend','risk','fact','other'
  )),
  title text not null check (char_length(title) between 1 and 240),
  summary text not null check (char_length(summary) between 1 and 8000),
  structured_data jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_data) = 'object'),
  confidence numeric(5,4) check (confidence between 0 and 1),
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review','accepted','rejected','superseded')),
  created_by text not null default 'assistant'
    check (created_by in ('assistant','user','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, insight_key),
  unique (id, run_id, dataset_id, user_id),
  constraint collection_insights_dataset_run_owner_fk
    foreign key (dataset_id, run_id, user_id)
    references public.collection_datasets(id, run_id, user_id)
    on delete cascade
);

create table if not exists public.collection_insight_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  insight_id uuid not null,
  run_id uuid not null,
  dataset_id uuid not null,
  item_id uuid not null,
  evidence_role text not null default 'supports'
    check (evidence_role in ('supports','contradicts','context')),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (insight_id, item_id),
  constraint collection_insight_evidence_insight_fk
    foreign key (insight_id, run_id, dataset_id, user_id)
    references public.collection_insights(id, run_id, dataset_id, user_id)
    on delete cascade,
  constraint collection_insight_evidence_item_fk
    foreign key (item_id, dataset_id, run_id, user_id)
    references public.collection_items(id, dataset_id, run_id, user_id)
    on delete cascade
);

create index if not exists collection_insights_user_status_idx
  on public.collection_insights(user_id, review_status, updated_at desc);
create index if not exists collection_insights_run_type_idx
  on public.collection_insights(run_id, insight_type, created_at desc);
create index if not exists collection_insight_evidence_item_idx
  on public.collection_insight_evidence(item_id);

alter table public.collection_insights enable row level security;
alter table public.collection_insight_evidence enable row level security;

drop policy if exists collection_insights_owner_all on public.collection_insights;
create policy collection_insights_owner_all on public.collection_insights
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists collection_insight_evidence_owner_all on public.collection_insight_evidence;
create policy collection_insight_evidence_owner_all on public.collection_insight_evidence
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.collection_insights i
      where i.id = insight_id and i.run_id = run_id
        and i.dataset_id = dataset_id and i.user_id = auth.uid()
    )
    and exists (
      select 1 from public.collection_items ci
      where ci.id = item_id and ci.dataset_id = dataset_id
        and ci.run_id = run_id and ci.user_id = auth.uid()
    )
  );

drop trigger if exists collection_insights_set_updated_at on public.collection_insights;
create trigger collection_insights_set_updated_at before update on public.collection_insights
  for each row execute function public.set_updated_at();

create or replace function public.gigo_create_collection_insight(
  p_run_id uuid,
  p_dataset_id uuid,
  p_insight_key text,
  p_insight_type text,
  p_title text,
  p_summary text,
  p_structured_data jsonb,
  p_confidence numeric,
  p_evidence_item_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_insight_id uuid;
  safe_evidence_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_insight_key is null or char_length(p_insight_key) not between 1 and 160
     or p_insight_type not in ('market_signal','customer_problem','competitor','product_opportunity','lead_candidate','trend','risk','fact','other')
     or p_title is null or char_length(p_title) not between 1 and 240
     or p_summary is null or char_length(p_summary) not between 1 and 8000
     or jsonb_typeof(coalesce(p_structured_data, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_structured_data, '{}'::jsonb)::text) > 16384
     or (p_confidence is not null and (p_confidence < 0 or p_confidence > 1))
     or coalesce(cardinality(p_evidence_item_ids),0) not between 1 and 25 then
    raise exception 'invalid collection insight' using errcode = '22023';
  end if;

  if (select count(distinct x) from unnest(p_evidence_item_ids) as x)
       <> cardinality(p_evidence_item_ids) then
    raise exception 'duplicate evidence item ids' using errcode = '22023';
  end if;

  select count(*) into safe_evidence_count
    from public.collection_items ci
    where ci.id = any(p_evidence_item_ids)
      and ci.run_id = p_run_id
      and ci.dataset_id = p_dataset_id
      and ci.user_id = auth.uid();

  if safe_evidence_count <> cardinality(p_evidence_item_ids) then
    raise exception 'evidence items must belong to this owner's dataset and run' using errcode = '42501';
  end if;

  insert into public.collection_insights(
    user_id, run_id, dataset_id, insight_key, insight_type, title,
    summary, structured_data, confidence, created_by
  ) values (
    auth.uid(), p_run_id, p_dataset_id, p_insight_key, p_insight_type, p_title,
    p_summary, coalesce(p_structured_data, '{}'::jsonb), p_confidence, 'assistant'
  )
  on conflict (run_id, insight_key) do update
    set insight_type = excluded.insight_type,
        title = excluded.title,
        summary = excluded.summary,
        structured_data = excluded.structured_data,
        confidence = excluded.confidence
    where public.collection_insights.user_id = auth.uid()
  returning id into new_insight_id;

  if new_insight_id is null then
    raise exception 'insight key already exists outside this owner scope' using errcode = '23505';
  end if;

  insert into public.collection_insight_evidence(
    user_id, insight_id, run_id, dataset_id, item_id, evidence_role
  )
  select auth.uid(), new_insight_id, p_run_id, p_dataset_id, ci.id, 'supports'
  from public.collection_items ci
  where ci.id = any(p_evidence_item_ids)
    and ci.run_id = p_run_id
    and ci.dataset_id = p_dataset_id
    and ci.user_id = auth.uid()
  on conflict (insight_id, item_id) do nothing;

  return new_insight_id;
end;
$$;

revoke all on function public.gigo_create_collection_insight(uuid, uuid, text, text, text, text, jsonb, numeric, uuid[]) from public, anon;
grant execute on function public.gigo_create_collection_insight(uuid, uuid, text, text, text, text, jsonb, numeric, uuid[]) to authenticated;

comment on table public.collection_insights is
  'Structured interpretations of collected data. Every insight must link to evidence items from the same owner, run and dataset.';
comment on table public.collection_insight_evidence is
  'Explicit supporting, contradicting or contextual links between an insight and its raw collected evidence.';


-- END CANONICAL MIGRATION 0019_collection_intelligence.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0020_collection_insight_review.sql
-- ============================================================================

-- Explicit human review transitions and immutable review history for collection insights.
create unique index if not exists collection_insights_id_user_unique
  on public.collection_insights(id, user_id);
create table if not exists public.collection_insight_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_id uuid not null,
  previous_status text not null check (previous_status in ('needs_review','accepted','rejected','superseded')),
  new_status text not null check (new_status in ('accepted','rejected','superseded')),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  constraint collection_insight_reviews_insight_owner_fk
    foreign key (insight_id, user_id)
    references public.collection_insights(id, user_id)
    on delete cascade
);

create index if not exists collection_insight_reviews_owner_time_idx
  on public.collection_insight_reviews(user_id, created_at desc);
create index if not exists collection_insight_reviews_insight_time_idx
  on public.collection_insight_reviews(insight_id, created_at desc);

alter table public.collection_insight_reviews enable row level security;
drop policy if exists collection_insight_reviews_owner_read on public.collection_insight_reviews;
create policy collection_insight_reviews_owner_read on public.collection_insight_reviews
  for select using (user_id = auth.uid());
drop policy if exists collection_insight_reviews_owner_insert on public.collection_insight_reviews;
create policy collection_insight_reviews_owner_insert on public.collection_insight_reviews
  for insert with check (user_id = auth.uid());

create or replace function public.gigo_review_collection_insight(
  p_insight_id uuid,
  p_review_status text,
  p_note text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_review_status not in ('accepted','rejected','superseded')
     or (p_note is not null and char_length(p_note) > 2000) then
    raise exception 'invalid insight review' using errcode = '22023';
  end if;

  select i.review_status into old_status
    from public.collection_insights i
    where i.id = p_insight_id and i.user_id = auth.uid()
    for update;
  if not found then return false; end if;

  if not (
    (old_status = 'needs_review' and p_review_status in ('accepted','rejected'))
    or (old_status = 'accepted' and p_review_status = 'superseded')
    or (old_status = 'rejected' and p_review_status = 'superseded')
  ) then
    raise exception 'review transition not allowed' using errcode = '22023';
  end if;

  update public.collection_insights
    set review_status = p_review_status
    where id = p_insight_id and user_id = auth.uid();

  insert into public.collection_insight_reviews(user_id, insight_id, previous_status, new_status, note)
    values (auth.uid(), p_insight_id, old_status, p_review_status, nullif(btrim(p_note), ''));

  return true;
end;
$$;

revoke all on function public.gigo_review_collection_insight(uuid, text, text) from public, anon;
grant execute on function public.gigo_review_collection_insight(uuid, text, text) to authenticated;

comment on table public.collection_insight_reviews is
  'Owner-only append-only audit trail for explicit collection insight review decisions.';


-- END CANONICAL MIGRATION 0020_collection_insight_review.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0021_cross_platform_lead_evidence.sql
-- ============================================================================

-- Cross-platform lead identity and source-backed qualification evidence.
-- This migration enriches the existing Leads CRM without enabling any platform scraping.

create unique index if not exists leads_id_user_unique
  on public.leads(id, user_id);

create table if not exists public.lead_social_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null,
  platform text not null check (platform in ('youtube','instagram','tiktok','facebook','x','linkedin','other')),
  profile_url text not null check (char_length(profile_url) between 8 and 2048),
  handle text check (handle is null or char_length(handle) <= 200),
  display_name text check (display_name is null or char_length(display_name) <= 240),
  account_type text check (account_type is null or char_length(account_type) <= 100),
  follower_count bigint check (follower_count is null or follower_count >= 0),
  typical_views bigint check (typical_views is null or typical_views >= 0),
  engagement_rate numeric(8,5) check (engagement_rate is null or engagement_rate between 0 and 100),
  niche text check (niche is null or char_length(niche) <= 240),
  public_contact_route text check (public_contact_route is null or char_length(public_contact_route) <= 500),
  verified_at timestamptz,
  source_item_id uuid,
  source_dataset_id uuid,
  source_run_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check ((source_item_id is null and source_dataset_id is null and source_run_id is null) or (source_item_id is not null and source_dataset_id is not null and source_run_id is not null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_social_profiles_lead_owner_fk
    foreign key (lead_id, user_id) references public.leads(id, user_id) on delete cascade,
  constraint lead_social_profiles_source_item_fk
    foreign key (source_item_id, source_dataset_id, source_run_id, user_id)
    references public.collection_items(id, dataset_id, run_id, user_id) on delete set null (source_item_id, source_dataset_id, source_run_id),
  unique (user_id, platform, profile_url),
  unique (id, user_id)
);

create table if not exists public.lead_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null,
  evidence_type text not null check (evidence_type in (
    'audience_fit','typical_reach','engagement','credibility','business_contact',
    'customer_problem','buying_intent','competitor_conflict','reputation','other'
  )),
  source_url text not null check (char_length(source_url) between 8 and 2048),
  source_title text check (source_title is null or char_length(source_title) <= 500),
  excerpt text check (excerpt is null or char_length(excerpt) <= 5000),
  observed_at timestamptz not null default now(),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  source_item_id uuid,
  source_dataset_id uuid,
  source_run_id uuid,
  notes text check (notes is null or char_length(notes) <= 3000),
  check ((source_item_id is null and source_dataset_id is null and source_run_id is null) or (source_item_id is not null and source_dataset_id is not null and source_run_id is not null)),
  created_at timestamptz not null default now(),
  constraint lead_evidence_lead_owner_fk
    foreign key (lead_id, user_id) references public.leads(id, user_id) on delete cascade,
  constraint lead_evidence_source_item_fk
    foreign key (source_item_id, source_dataset_id, source_run_id, user_id)
    references public.collection_items(id, dataset_id, run_id, user_id) on delete set null,
  unique (id, user_id)
);

create index if not exists lead_social_profiles_lead_platform_idx
  on public.lead_social_profiles(user_id, lead_id, platform);
create index if not exists lead_social_profiles_platform_followers_idx
  on public.lead_social_profiles(user_id, platform, follower_count desc);
create index if not exists lead_evidence_lead_observed_idx
  on public.lead_evidence(user_id, lead_id, observed_at desc);
create index if not exists lead_evidence_type_idx
  on public.lead_evidence(user_id, evidence_type, observed_at desc);

alter table public.lead_social_profiles enable row level security;
alter table public.lead_evidence enable row level security;

drop policy if exists lead_social_profiles_owner_all on public.lead_social_profiles;
create policy lead_social_profiles_owner_all on public.lead_social_profiles
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid())
    and (
      source_item_id is null or exists (
        select 1 from public.collection_items ci
        where ci.id = source_item_id and ci.dataset_id = source_dataset_id
          and ci.run_id = source_run_id and ci.user_id = auth.uid()
      )
    )
  );

drop policy if exists lead_evidence_owner_all on public.lead_evidence;
create policy lead_evidence_owner_all on public.lead_evidence
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid())
    and (
      source_item_id is null or exists (
        select 1 from public.collection_items ci
        where ci.id = source_item_id and ci.dataset_id = source_dataset_id
          and ci.run_id = source_run_id and ci.user_id = auth.uid()
      )
    )
  );

drop trigger if exists lead_social_profiles_set_updated_at on public.lead_social_profiles;
create trigger lead_social_profiles_set_updated_at before update on public.lead_social_profiles
  for each row execute function public.set_updated_at();

comment on table public.lead_social_profiles is
  'Owner-scoped public professional/social profile identities for a CRM lead; metrics are nullable and must be evidence-backed.';
comment on table public.lead_evidence is
  'Source-backed lead qualification evidence. Store public/permitted evidence only; do not harvest private messages or sensitive personal data.';


-- END CANONICAL MIGRATION 0021_cross_platform_lead_evidence.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0022_outreach_campaigns.sql
-- ============================================================================

-- Durable, owner-controlled outreach campaign foundation.
-- This stores campaigns and outbound drafts; it does not send email or enable a sender.

create unique index if not exists leads_id_user_unique
  on public.leads(id, user_id);

create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  objective text not null check (char_length(objective) between 1 and 3000),
  audience_definition jsonb not null default '{}'::jsonb check (jsonb_typeof(audience_definition) = 'object'),
  offer_summary text check (offer_summary is null or char_length(offer_summary) <= 5000),
  status text not null default 'draft' check (status in ('draft','awaiting_approval','active','paused','completed','cancelled')),
  approval_status text not null default 'not_requested' check (approval_status in ('not_requested','pending','approved','rejected','revoked')),
  approved_sender_email text,
  approved_sender_name text,
  approved_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(approved_policy) = 'object'),
  max_recipients integer not null default 0 check (max_recipients between 0 and 10000),
  max_messages_per_recipient integer not null default 0 check (max_messages_per_recipient between 0 and 10),
  initial_send_enabled boolean not null default false,
  followups_enabled boolean not null default false,
  followup_delays_days integer[] not null default '{}',
  send_window_start time,
  send_window_end time,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 100),
  quiet_hours_start time,
  quiet_hours_end time,
  approved_at timestamptz,
  approval_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (approval_status <> 'approved' or (
    approved_at is not null and approved_sender_email is not null
    and max_recipients > 0 and max_messages_per_recipient > 0
  )),
  check (cardinality(followup_delays_days) <= 5),
  check (followup_delays_days <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]),
  check (followups_enabled = false or cardinality(followup_delays_days) > 0)
);

create table if not exists public.outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  lead_id uuid,
  email text not null check (char_length(email) between 5 and 320),
  recipient_name text check (recipient_name is null or char_length(recipient_name) <= 240),
  organisation text check (organisation is null or char_length(organisation) <= 240),
  status text not null default 'queued' check (status in ('queued','ready','contacted','replied','bounced','unsubscribed','complained','paused','completed','cancelled')),
  followup_count integer not null default 0 check (followup_count between 0 and 10),
  last_message_at timestamptz,
  next_action_at timestamptz,
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_recipients_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  constraint outreach_recipients_lead_owner_fk
    foreign key (lead_id, user_id) references public.leads(id, user_id) on delete set null (lead_id),
  unique (id, user_id)
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  recipient_id uuid not null,
  sequence_number integer not null check (sequence_number between 0 and 10),
  message_type text not null check (message_type in ('initial','follow_up','reply_draft')),
  to_email text not null check (char_length(to_email) between 5 and 320),
  subject text not null check (char_length(subject) between 1 and 300),
  body_text text not null check (char_length(body_text) between 1 and 20000),
  personalization_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(personalization_evidence) = 'array'),
  status text not null default 'draft' check (status in ('draft','awaiting_approval','queued','sending','sent','failed','cancelled')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_messages_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  constraint outreach_messages_recipient_owner_fk
    foreign key (recipient_id, user_id) references public.outreach_recipients(id, user_id) on delete cascade,
  unique (recipient_id, sequence_number)
);

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  recipient_id uuid,
  message_id uuid,
  event_type text not null check (event_type in (
    'lead_added','message_drafted','message_approved','message_queued','message_sent',
    'message_failed','reply_received','bounce_received','unsubscribe_received',
    'complaint_received','followup_scheduled','sequence_paused','sequence_completed',
    'campaign_approved','campaign_paused','campaign_resumed','campaign_cancelled'
  )),
  detail text check (detail is null or char_length(detail) <= 3000),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  constraint outreach_events_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  constraint outreach_events_recipient_owner_fk
    foreign key (recipient_id, user_id) references public.outreach_recipients(id, user_id) on delete cascade,
  constraint outreach_events_message_owner_fk
    foreign key (message_id, user_id) references public.outreach_messages(id, user_id) on delete cascade
);

create table if not exists public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 320),
  reason text not null check (reason in ('unsubscribe','complaint','manual','hard_bounce','other')),
  source text,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create index if not exists outreach_campaigns_owner_status_idx
  on public.outreach_campaigns(user_id, status, updated_at desc);
create unique index if not exists outreach_recipients_campaign_email_unique
  on public.outreach_recipients(campaign_id, lower(email));
create unique index if not exists outreach_suppressions_email_unique
  on public.outreach_suppressions(user_id, lower(email));
create index if not exists outreach_recipients_due_idx
  on public.outreach_recipients(user_id, campaign_id, status, next_action_at);
create index if not exists outreach_messages_due_idx
  on public.outreach_messages(status, scheduled_for) where status = 'queued';
create index if not exists outreach_events_campaign_time_idx
  on public.outreach_events(user_id, campaign_id, created_at desc);
create index if not exists outreach_suppressions_email_idx
  on public.outreach_suppressions(user_id, lower(email));

alter table public.outreach_campaigns enable row level security;
alter table public.outreach_recipients enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_events enable row level security;
alter table public.outreach_suppressions enable row level security;

drop policy if exists outreach_campaigns_owner_all on public.outreach_campaigns;
create policy outreach_campaigns_owner_all on public.outreach_campaigns
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists outreach_recipients_owner_all on public.outreach_recipients;
create policy outreach_recipients_owner_all on public.outreach_recipients
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    and (lead_id is null or exists (select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid()))
  );

drop policy if exists outreach_messages_owner_all on public.outreach_messages;
create policy outreach_messages_owner_all on public.outreach_messages
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    and exists (select 1 from public.outreach_recipients r where r.id = recipient_id and r.user_id = auth.uid() and r.campaign_id = campaign_id)
  );

drop policy if exists outreach_events_owner_read on public.outreach_events;
create policy outreach_events_owner_read on public.outreach_events for select using (user_id = auth.uid());
drop policy if exists outreach_events_owner_insert on public.outreach_events;
create policy outreach_events_owner_insert on public.outreach_events for insert with check (user_id = auth.uid());

drop policy if exists outreach_suppressions_owner_all on public.outreach_suppressions;
create policy outreach_suppressions_owner_all on public.outreach_suppressions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists outreach_campaigns_set_updated_at on public.outreach_campaigns;
create trigger outreach_campaigns_set_updated_at before update on public.outreach_campaigns
  for each row execute function public.set_updated_at();
drop trigger if exists outreach_recipients_set_updated_at on public.outreach_recipients;
create trigger outreach_recipients_set_updated_at before update on public.outreach_recipients
  for each row execute function public.set_updated_at();
drop trigger if exists outreach_messages_set_updated_at on public.outreach_messages;
create trigger outreach_messages_set_updated_at before update on public.outreach_messages
  for each row execute function public.set_updated_at();

comment on table public.outreach_campaigns is
  'Owner-managed outreach campaigns with explicit bounded authorization. Campaign approval does not imply that a sending provider is configured.';
comment on table public.outreach_messages is
  'Outbound email drafts and durable send queue records. No provider send occurs from this schema alone.';
comment on table public.outreach_suppressions is
  'Owner-scoped do-not-contact list; suppressed addresses must never enter an automated send queue.';


-- END CANONICAL MIGRATION 0022_outreach_campaigns.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0023_outreach_campaign_approval.sql
-- ============================================================================

-- Atomic, explicit owner approval for a bounded outreach campaign.
create or replace function public.gigo_approve_outreach_campaign(
  p_campaign_id uuid,
  p_sender_email text,
  p_sender_name text,
  p_max_recipients integer,
  p_max_messages_per_recipient integer,
  p_initial_send_enabled boolean,
  p_followups_enabled boolean,
  p_followup_delays_days integer[],
  p_send_window_start time,
  p_send_window_end time,
  p_timezone text,
  p_quiet_hours_start time,
  p_quiet_hours_end time
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recipient_total integer;
  campaign_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_sender_email is null or char_length(p_sender_email) > 320
     or p_sender_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_sender_name is null or char_length(p_sender_name) > 200
     or p_max_recipients is null or p_max_recipients < 1 or p_max_recipients > 10000
     or p_max_messages_per_recipient is null or p_max_messages_per_recipient < 1 or p_max_messages_per_recipient > 6
     or p_initial_send_enabled is distinct from true
     or p_followups_enabled is null
     or coalesce(cardinality(p_followup_delays_days),0) > 5
     or not (coalesce(p_followup_delays_days, '{}'::integer[]) <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30])
     or (p_followups_enabled and coalesce(cardinality(p_followup_delays_days),0) = 0)
     or (not p_followups_enabled and coalesce(cardinality(p_followup_delays_days),0) <> 0)
     or p_timezone is null or char_length(p_timezone) > 100
     or p_send_window_start is null or p_send_window_end is null then
    raise exception 'invalid campaign authorization policy' using errcode = '22023';
  end if;

  select c.status into campaign_status
    from public.outreach_campaigns c
    where c.id = p_campaign_id and c.user_id = auth.uid()
    for update;
  if not found then return false; end if;
  if campaign_status not in ('draft','awaiting_approval','paused') then
    raise exception 'campaign cannot be approved in its current state' using errcode = '22023';
  end if;

  select count(*) into recipient_total
    from public.outreach_recipients r
    where r.campaign_id = p_campaign_id and r.user_id = auth.uid()
      and r.status not in ('unsubscribed','complained','bounced','cancelled');
  if recipient_total < 1 or recipient_total > p_max_recipients then
    raise exception 'recipient count is outside the approved campaign limit' using errcode = '22023';
  end if;

  update public.outreach_campaigns
    set approval_status = 'approved',
        approved_sender_email = lower(btrim(p_sender_email)),
        approved_sender_name = btrim(p_sender_name),
        max_recipients = p_max_recipients,
        max_messages_per_recipient = p_max_messages_per_recipient,
        initial_send_enabled = p_initial_send_enabled,
        followups_enabled = p_followups_enabled,
        followup_delays_days = coalesce(p_followup_delays_days, '{}'::integer[]),
        send_window_start = p_send_window_start,
        send_window_end = p_send_window_end,
        timezone = p_timezone,
        quiet_hours_start = p_quiet_hours_start,
        quiet_hours_end = p_quiet_hours_end,
        approved_policy = jsonb_build_object(
          'sender_email', lower(btrim(p_sender_email)),
          'sender_name', btrim(p_sender_name),
          'max_recipients', p_max_recipients,
          'max_messages_per_recipient', p_max_messages_per_recipient,
          'initial_send_enabled', p_initial_send_enabled,
          'followups_enabled', p_followups_enabled,
          'followup_delays_days', to_jsonb(coalesce(p_followup_delays_days, '{}'::integer[])),
          'send_window_start', p_send_window_start,
          'send_window_end', p_send_window_end,
          'timezone', p_timezone,
          'quiet_hours_start', p_quiet_hours_start,
          'quiet_hours_end', p_quiet_hours_end
        ),
        approved_at = now(),
        approval_revoked_at = null,
        status = 'active'
    where id = p_campaign_id and user_id = auth.uid();

  insert into public.outreach_events(user_id, campaign_id, event_type, detail, event_data)
    values (auth.uid(), p_campaign_id, 'campaign_approved',
      'Owner approved a bounded outreach policy.',
      jsonb_build_object('max_recipients',p_max_recipients,'max_messages_per_recipient',p_max_messages_per_recipient));

  return true;
end;
$$;

revoke all on function public.gigo_approve_outreach_campaign(uuid,text,text,integer,integer,boolean,boolean,integer[],time,time,text,time,time) from public, anon;
grant execute on function public.gigo_approve_outreach_campaign(uuid,text,text,integer,integer,boolean,boolean,integer[],time,time,text,time,time) to authenticated;


-- END CANONICAL MIGRATION 0023_outreach_campaign_approval.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0024_outreach_recipient_guard.sql
-- ============================================================================

-- Database-level recipient admission guard. API pre-checks are not a security boundary.
create or replace function public.gigo_guard_outreach_recipient()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  campaign public.outreach_campaigns%rowtype;
  current_count integer;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'authenticated owner context required' using errcode = '42501';
  end if;

  select c.* into campaign
    from public.outreach_campaigns c
    where c.id = new.campaign_id and c.user_id = auth.uid()
    for update;
  if not found then
    raise exception 'campaign not found' using errcode = '23503';
  end if;
  if campaign.status in ('completed','cancelled') then
    raise exception 'campaign is closed to new recipients' using errcode = '22023';
  end if;

  new.email := lower(btrim(new.email));
  if exists (
    select 1 from public.outreach_suppressions s
    where s.user_id = auth.uid() and lower(s.email) = new.email
  ) then
    raise exception 'recipient is on the do-not-contact list' using errcode = '23514';
  end if;

  if campaign.approval_status = 'approved' then
    if campaign.status <> 'active' then
      raise exception 'approved campaign is not active' using errcode = '22023';
    end if;
    select count(*) into current_count
      from public.outreach_recipients r
      where r.campaign_id = new.campaign_id and r.user_id = auth.uid()
        and r.status not in ('unsubscribed','complained','bounced','cancelled');
    if current_count >= campaign.max_recipients then
      raise exception 'approved recipient limit reached' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_recipient_admission_guard on public.outreach_recipients;
create trigger outreach_recipient_admission_guard
  before insert on public.outreach_recipients
  for each row execute function public.gigo_guard_outreach_recipient();

comment on function public.gigo_guard_outreach_recipient() is
  'Enforces owner identity, campaign state, case-normalized email, suppression and approved recipient cap at the database boundary.';


-- END CANONICAL MIGRATION 0024_outreach_recipient_guard.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0025_outreach_templates.sql
-- ============================================================================

-- Campaign-approved email copy templates. Approval freezes the sequence content.
create table if not exists public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  sequence_number integer not null check (sequence_number between 0 and 5),
  message_type text not null check (message_type in ('initial','follow_up')),
  subject_template text not null check (char_length(subject_template) between 1 and 300),
  body_template text not null check (char_length(body_template) between 1 and 20000),
  personalization_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(personalization_fields) = 'array'),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_templates_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  unique (campaign_id, sequence_number),
  unique (id, user_id),
  check ((sequence_number = 0 and message_type = 'initial') or (sequence_number > 0 and message_type = 'follow_up'))
);

create index if not exists outreach_templates_campaign_sequence_idx
  on public.outreach_templates(user_id, campaign_id, sequence_number);
alter table public.outreach_templates enable row level security;
drop policy if exists outreach_templates_owner_all on public.outreach_templates;
create policy outreach_templates_owner_all on public.outreach_templates
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

drop trigger if exists outreach_templates_set_updated_at on public.outreach_templates;
create trigger outreach_templates_set_updated_at before update on public.outreach_templates
  for each row execute function public.set_updated_at();

comment on table public.outreach_templates is
  'Owner-authored initial and follow-up copy. Campaign approval validates the complete sequence and freezes the templates.';


-- END CANONICAL MIGRATION 0025_outreach_templates.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0026_outreach_template_approval_guard.sql
-- ============================================================================

-- Require a complete, explicit email-copy sequence before campaign approval.
create or replace function public.gigo_validate_outreach_template_sequence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  template_count integer;
  first_sequence integer;
  last_sequence integer;
  expected_followups integer;
begin
  if new.approval_status = 'approved'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'approved') then
    expected_followups := coalesce(cardinality(new.followup_delays_days),0);
    select count(*), min(t.sequence_number), max(t.sequence_number)
      into template_count, first_sequence, last_sequence
      from public.outreach_templates t
      where t.campaign_id = new.id and t.user_id = new.user_id;

    if template_count <> expected_followups + 1
       or first_sequence is distinct from 0
       or last_sequence is distinct from expected_followups then
      raise exception 'campaign requires one initial template and one template for each approved follow-up'
        using errcode = '22023';
    end if;

    update public.outreach_templates
      set approved_at = now()
      where campaign_id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_campaign_template_approval_guard on public.outreach_campaigns;
create trigger outreach_campaign_template_approval_guard
  before update on public.outreach_campaigns
  for each row execute function public.gigo_validate_outreach_template_sequence();

comment on function public.gigo_validate_outreach_template_sequence() is
  'Prevents approval unless every initial and follow-up message has an owner-authored template in the approved sequence.';


-- END CANONICAL MIGRATION 0026_outreach_template_approval_guard.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0027_outreach_template_immutability.sql
-- ============================================================================

-- Freeze message templates once campaign approval has approved their exact copy.
create or replace function public.gigo_protect_approved_outreach_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  campaign_approval text;
begin
  if tg_op = 'UPDATE' and old.approved_at is not null then
    raise exception 'approved outreach templates are immutable' using errcode = '22023';
  end if;

  if tg_op = 'DELETE' and old.approved_at is not null then
    raise exception 'approved outreach templates cannot be deleted' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    select c.approval_status into campaign_approval
      from public.outreach_campaigns c
      where c.id = new.campaign_id and c.user_id = new.user_id;
    if campaign_approval = 'approved' then
      raise exception 'templates cannot be changed after campaign approval' using errcode = '22023';
    end if;
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists outreach_template_immutable_guard on public.outreach_templates;
create trigger outreach_template_immutable_guard
  before insert or update or delete on public.outreach_templates
  for each row execute function public.gigo_protect_approved_outreach_template();


-- END CANONICAL MIGRATION 0027_outreach_template_immutability.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0028_outreach_outbox_worker.sql
-- ============================================================================

-- Durable outbox lease, claim and completion functions for a future approved email worker.
-- These RPCs do not connect to or call an email provider.

alter table public.outreach_messages
  add column if not exists template_id uuid,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outreach_messages_template_owner_fk'
      and conrelid = 'public.outreach_messages'::regclass
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_template_owner_fk
      foreign key (template_id, user_id)
      references public.outreach_templates(id, user_id)
      on delete set null (template_id);
  end if;
end;
$$;

create index if not exists outreach_messages_claim_idx
  on public.outreach_messages(status, scheduled_for, created_at)
  where status = 'queued';

create or replace function public.gigo_claim_due_outreach_messages(
  p_limit integer default 1,
  p_lease_seconds integer default 120
)
returns setof public.outreach_messages
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Expired leases are ambiguous: do not blindly resend and risk duplicate email.
  update public.outreach_messages
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error = 'Worker lease expired; delivery outcome is uncertain and requires reconciliation.'
    where status = 'sending'
      and lease_expires_at is not null
      and lease_expires_at <= now();

  return query
    with candidates as (
      select m.id
      from public.outreach_messages m
      join public.outreach_campaigns c
        on c.id = m.campaign_id and c.user_id = m.user_id
      join public.outreach_recipients r
        on r.id = m.recipient_id and r.user_id = m.user_id and r.campaign_id = m.campaign_id
      join public.outreach_templates t
        on t.id = m.template_id and t.user_id = m.user_id and t.campaign_id = m.campaign_id
      where m.status = 'queued'
        and m.scheduled_for <= now()
        and m.attempt_count < 5
        and m.to_email = lower(r.email)
        and c.status = 'active'
        and c.approval_status = 'approved'
        and c.approved_at is not null
        and c.initial_send_enabled = true
        and m.sequence_number < c.max_messages_per_recipient
        and t.approved_at is not null
        and t.sequence_number = m.sequence_number
        and t.message_type = m.message_type
        and (
          (m.message_type = 'initial' and m.sequence_number = 0
            and r.status in ('queued','ready'))
          or
          (m.message_type = 'follow_up' and m.sequence_number > 0
            and c.followups_enabled = true and r.status = 'contacted')
        )
        and not exists (
          select 1 from public.outreach_suppressions s
          where s.user_id = m.user_id and lower(s.email) = lower(r.email)
        )
        and not exists (
          select 1 from public.outreach_messages active
          where active.recipient_id = m.recipient_id
            and active.status = 'sending'
        )
        and (
          case
            when c.send_window_start < c.send_window_end
              then (now() at time zone c.timezone)::time >= c.send_window_start
               and (now() at time zone c.timezone)::time < c.send_window_end
            else (now() at time zone c.timezone)::time >= c.send_window_start
              or (now() at time zone c.timezone)::time < c.send_window_end
          end
        )
        and (
          c.quiet_hours_start is null or c.quiet_hours_end is null
          or not (
            case
              when c.quiet_hours_start < c.quiet_hours_end
                then (now() at time zone c.timezone)::time >= c.quiet_hours_start
                 and (now() at time zone c.timezone)::time < c.quiet_hours_end
              else (now() at time zone c.timezone)::time >= c.quiet_hours_start
                or (now() at time zone c.timezone)::time < c.quiet_hours_end
            end
          )
        )
      order by m.scheduled_for asc, m.created_at asc
      limit greatest(1, least(coalesce(p_limit,1),10))
      for update of m, r skip locked
    )
    update public.outreach_messages m
      set status = 'sending',
          lease_token = gen_random_uuid(),
          lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds,120),600))),
          attempt_count = m.attempt_count + 1,
          last_error = null
      from candidates
      where m.id = candidates.id
      returning m.*;
end;
$$;

create or replace function public.gigo_finish_outreach_message(
  p_message_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null,
  p_retryable boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.outreach_messages%rowtype;
begin
  if p_outcome not in ('sent','failed') then
    raise exception 'invalid message outcome' using errcode = '22023';
  end if;
  select m.* into message_row
    from public.outreach_messages m
    where m.id = p_message_id and m.status = 'sending'
      and m.lease_token = p_lease_token
      and m.lease_expires_at > now()
    for update;
  if not found then return false; end if;

  if p_outcome = 'sent' then
    update public.outreach_messages
      set status = 'sent', sent_at = now(), provider = p_provider,
          provider_message_id = p_provider_message_id,
          lease_token = null, lease_expires_at = null, last_error = null
      where id = p_message_id;

    update public.outreach_recipients
      set status = 'contacted',
          last_message_at = now(),
          followup_count = case when message_row.message_type = 'follow_up' then followup_count + 1 else followup_count end
      where id = message_row.recipient_id and user_id = message_row.user_id;

    insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail,event_data)
      values (message_row.user_id,message_row.campaign_id,message_row.recipient_id,message_row.id,
        'message_sent','Email provider confirmed message delivery acceptance.',
        jsonb_build_object('provider',p_provider,'provider_message_id',p_provider_message_id));
  elsif p_retryable and message_row.attempt_count < 5 then
    update public.outreach_messages
      set status = 'queued', scheduled_for = now() + interval '15 minutes',
          lease_token = null, lease_expires_at = null,
          last_error = left(coalesce(p_error,'Temporary provider failure.'),1000)
      where id = p_message_id;
    insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail)
      values (message_row.user_id,message_row.campaign_id,message_row.recipient_id,message_row.id,
        'message_failed','A confirmed pre-send failure was scheduled for retry.');
  else
    update public.outreach_messages
      set status = 'failed', lease_token = null, lease_expires_at = null,
          last_error = left(coalesce(p_error,'Message delivery failed or is uncertain.'),1000)
      where id = p_message_id;
    insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail)
      values (message_row.user_id,message_row.campaign_id,message_row.recipient_id,message_row.id,
        'message_failed','Message was not automatically retried because delivery may be uncertain.');
  end if;
  return true;
end;
$$;

revoke all on function public.gigo_claim_due_outreach_messages(integer,integer) from public, anon, authenticated;
grant execute on function public.gigo_claim_due_outreach_messages(integer,integer) to service_role;
revoke all on function public.gigo_finish_outreach_message(uuid,uuid,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.gigo_finish_outreach_message(uuid,uuid,text,text,text,text,boolean) to service_role;

comment on function public.gigo_claim_due_outreach_messages(integer,integer) is
  'Service-role-only claim path for a future email worker. Revalidates campaign approval, templates, recipient state, suppressions and sending windows; expired leases fail closed.';


-- END CANONICAL MIGRATION 0028_outreach_outbox_worker.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0029_outreach_campaign_window_guard.sql
-- ============================================================================

-- Validate timezone and ordered follow-up delays before a campaign can be approved.
create or replace function public.gigo_validate_outreach_campaign_window()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  i integer;
begin
  if new.approval_status = 'approved' then
    if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
      raise exception 'campaign timezone is not recognized' using errcode = '22023';
    end if;
    if (new.quiet_hours_start is null) <> (new.quiet_hours_end is null) then
      raise exception 'quiet hours require both a start and end time' using errcode = '22023';
    end if;
    if new.send_window_start = new.send_window_end then
      raise exception 'send window cannot cover the entire day or be empty' using errcode = '22023';
    end if;
    if cardinality(new.followup_delays_days) > 1 then
      for i in 2..cardinality(new.followup_delays_days) loop
        if new.followup_delays_days[i] <= new.followup_delays_days[i-1] then
          raise exception 'follow-up delays must be strictly increasing' using errcode = '22023';
        end if;
      end loop;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_campaign_window_guard on public.outreach_campaigns;
create trigger outreach_campaign_window_guard
  before update on public.outreach_campaigns
  for each row execute function public.gigo_validate_outreach_campaign_window();


-- END CANONICAL MIGRATION 0029_outreach_campaign_window_guard.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0030_outreach_sequence_preparation.sql
-- ============================================================================

-- Deterministic, evidence-backed preparation of approved outreach sequences.
-- Creates queued outbox records only. It does not send email.

create or replace function public.gigo_prepare_outreach_sequence(
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_messages jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  campaign_row public.outreach_campaigns%rowtype;
  recipient_row public.outreach_recipients%rowtype;
  item jsonb;
  template_row public.outreach_templates%rowtype;
  expected_count integer;
  supplied_count integer;
  inserted_count integer := 0;
  sequence_value integer;
  email_value text;
  scheduled_value timestamptz;
  delay_days integer;
  cumulative_days integer := 0;
  message_id uuid;
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_messages is null or jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) < 1 or jsonb_array_length(p_messages) > 6 then
    raise exception 'messages must be an array containing 1 to 6 items' using errcode = '22023';
  end if;

  select * into campaign_row
    from public.outreach_campaigns c
    where c.id = p_campaign_id and c.user_id = owner_id
    for update;
  if not found or campaign_row.status <> 'active' or campaign_row.approval_status <> 'approved'
     or campaign_row.approved_at is null or not campaign_row.initial_send_enabled then
    raise exception 'campaign is not approved and active' using errcode = '42501';
  end if;

  select * into recipient_row
    from public.outreach_recipients r
    where r.id = p_recipient_id and r.campaign_id = p_campaign_id and r.user_id = owner_id
    for update;
  if not found or recipient_row.status not in ('queued','ready') then
    raise exception 'recipient is not eligible for initial outreach' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.outreach_suppressions s
    where s.user_id = owner_id and lower(s.email) = lower(recipient_row.email)
  ) then
    raise exception 'recipient is suppressed' using errcode = '42501';
  end if;

  select count(*) into expected_count
    from public.outreach_templates t
    where t.campaign_id = p_campaign_id and t.user_id = owner_id and t.approved_at is not null;
  supplied_count := jsonb_array_length(p_messages);
  if expected_count < 1 or supplied_count <> expected_count or expected_count > campaign_row.max_messages_per_recipient then
    raise exception 'prepared sequence does not match approved template count' using errcode = '22023';
  end if;
  if expected_count > 1 and not campaign_row.followups_enabled then
    raise exception 'follow-ups are not enabled' using errcode = '42501';
  end if;

  if (select count(distinct (value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> expected_count
    or (select min((value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> 0
    or (select max((value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> expected_count - 1 then
    raise exception 'prepared sequence numbers must be unique and contiguous' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'invalid prepared message' using errcode = '22023';
    end if;
    sequence_value := (item->>'sequence_number')::integer;
    if sequence_value < 0 or sequence_value >= expected_count then
      raise exception 'invalid message sequence' using errcode = '22023';
    end if;
    select * into template_row
      from public.outreach_templates t
      where t.campaign_id = p_campaign_id and t.user_id = owner_id
        and t.sequence_number = sequence_value and t.approved_at is not null;
    if not found or (item->>'template_id')::uuid <> template_row.id
      or item->>'message_type' <> template_row.message_type
      or (item->>'to_email') <> lower(recipient_row.email)
      or char_length(coalesce(item->>'subject','')) not between 1 and 300
      or char_length(coalesce(item->>'body_text','')) not between 1 and 20000
      or jsonb_typeof(coalesce(item->'personalization_evidence','[]'::jsonb)) <> 'array' then
      raise exception 'prepared message does not match approved template or recipient' using errcode = '22023';
    end if;

    if sequence_value = 0 then
      scheduled_value := now();
    else
      cumulative_days := 0;
      for delay_days in 1..sequence_value loop
        cumulative_days := cumulative_days + campaign_row.followup_delays_days[delay_days];
      end loop;
      scheduled_value := now() + make_interval(days => cumulative_days);
    end if;

    insert into public.outreach_messages(
      user_id,campaign_id,recipient_id,sequence_number,message_type,to_email,
      subject,body_text,personalization_evidence,status,scheduled_for,template_id
    ) values (
      owner_id,p_campaign_id,p_recipient_id,sequence_value,template_row.message_type,
      lower(recipient_row.email),item->>'subject',item->>'body_text',
      coalesce(item->'personalization_evidence','[]'::jsonb),'queued',scheduled_value,template_row.id
    )
    on conflict (recipient_id,sequence_number) do nothing
    returning id into message_id;

    if message_id is not null then
      inserted_count := inserted_count + 1;
      insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail,event_data)
      values(owner_id,p_campaign_id,p_recipient_id,message_id,'message_queued',
        'Approved template rendered into the durable outbox; no provider send was performed.',
        jsonb_build_object('sequence_number',sequence_value,'scheduled_for',scheduled_value));
    end if;
    message_id := null;
  end loop;

  return jsonb_build_object(
    'recipient_id',p_recipient_id,
    'inserted_count',inserted_count,
    'already_prepared',inserted_count = 0,
    'messages_queued',supplied_count
  );
end;
$$;

revoke all on function public.gigo_prepare_outreach_sequence(uuid,uuid,jsonb) from public, anon;
grant execute on function public.gigo_prepare_outreach_sequence(uuid,uuid,jsonb) to authenticated;

comment on function public.gigo_prepare_outreach_sequence(uuid,uuid,jsonb) is
  'Atomically inserts an owner-authorized recipient sequence into the durable outbox, matching approved templates and suppressions. It never sends email.';


-- END CANONICAL MIGRATION 0030_outreach_sequence_preparation.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0031_outreach_inbound_event_safety.sql
-- ============================================================================

-- Durable inbound outreach events stop queued follow-ups and enforce suppressions.
-- Provider webhook signature verification belongs in a future provider adapter.

create or replace function public.gigo_record_outreach_recipient_event(
  p_recipient_id uuid,
  p_event_type text,
  p_email text,
  p_detail text default null,
  p_provider text default null,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
  normalized_email text := lower(trim(coalesce(p_email,'')));
  new_status text;
  suppression_reason text;
  cancelled_count integer := 0;
begin
  if p_event_type is null or p_event_type not in ('reply_received','bounce_received','unsubscribe_received','complaint_received') then
    raise exception 'unsupported inbound event type' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'valid recipient email required' using errcode = '22023';
  end if;
  if p_provider is null or length(trim(p_provider)) = 0 or p_provider_event_id is null or length(trim(p_provider_event_id)) = 0 or length(p_provider_event_id) > 300 then
    raise exception 'provider identity and event ID are required for idempotent inbound processing' using errcode = '22023';
  end if;
  if p_detail is not null and char_length(p_detail) > 3000 then
    raise exception 'event detail too long' using errcode = '22023';
  end if;

  select * into recipient_row
    from public.outreach_recipients r
    where r.id = p_recipient_id
    for update;
  if not found or lower(recipient_row.email) <> normalized_email then
    raise exception 'recipient not found or email mismatch' using errcode = 'P0002';
  end if;

  if p_event_type = 'reply_received' then
    new_status := 'replied';
  elsif p_event_type = 'bounce_received' then
    new_status := 'bounced';
    suppression_reason := 'hard_bounce';
  elsif p_event_type = 'unsubscribe_received' then
    new_status := 'unsubscribed';
    suppression_reason := 'unsubscribe';
  else
    new_status := 'complained';
    suppression_reason := 'complaint';
  end if;

  if p_provider_event_id is not null and exists (
    select 1 from public.outreach_events e
    where e.user_id = recipient_row.user_id
      and e.event_data->>'provider' = p_provider
      and e.event_data->>'provider_event_id' = p_provider_event_id
  ) then
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'duplicate_event',true,'cancelled_followups',0);
  end if;

  if suppression_reason is not null then
    insert into public.outreach_suppressions(user_id,email,reason,source)
    values(recipient_row.user_id,normalized_email,suppression_reason,'provider_event:' || p_event_type)
    on conflict do nothing;
  end if;

  if recipient_row.status in ('replied','bounced','unsubscribed','complained','cancelled','completed') then
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'already_terminal',true,'cancelled_followups',0);
  end if;

  update public.outreach_recipients
    set status = new_status,
        stop_reason = p_event_type,
        next_action_at = null
    where id = recipient_row.id and user_id = recipient_row.user_id;

  update public.outreach_messages
    set status = 'cancelled',
        last_error = 'Sequence stopped after ' || p_event_type || '.',
        lease_token = null,
        lease_expires_at = null
    where recipient_id = recipient_row.id
      and user_id = recipient_row.user_id
      and status = 'queued'
      and sequence_number > 0;
  get diagnostics cancelled_count = row_count;

  insert into public.outreach_events(user_id,campaign_id,recipient_id,event_type,detail,event_data)
  values(
    recipient_row.user_id,recipient_row.campaign_id,recipient_row.id,p_event_type,
    left(coalesce(p_detail,'Inbound provider event recorded.'),3000),
    jsonb_build_object('provider',p_provider,'provider_event_id',p_provider_event_id,'cancelled_followups',cancelled_count)
  );

  return jsonb_build_object('recipient_id',recipient_row.id,'status',new_status,'already_terminal',false,'cancelled_followups',cancelled_count);
end;
$$;

revoke all on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) to service_role;

comment on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) is
  'Service-role-only inbound event handler. Provider webhook signature validation must occur before calling it. Replies stop follow-ups; bounces, unsubscribes and complaints also create permanent owner-scoped suppressions.';


-- END CANONICAL MIGRATION 0031_outreach_inbound_event_safety.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0032_outreach_followup_clock.sql
-- ============================================================================

-- Follow-up clocks begin when the previous message is accepted by the provider,
-- not when the sequence was prepared. Claiming also requires the predecessor sent.

create or replace function public.gigo_schedule_next_outreach_followup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.outreach_campaigns%rowtype;
  delay_days integer;
begin
  if old.status is distinct from 'sending' or new.status is distinct from 'sent'
     or new.message_type not in ('initial','follow_up') then
    return new;
  end if;

  select * into campaign_row
    from public.outreach_campaigns c
    where c.id = new.campaign_id and c.user_id = new.user_id;
  if not found or campaign_row.status <> 'active'
     or campaign_row.approval_status <> 'approved'
     or campaign_row.followups_enabled is not true then
    return new;
  end if;

  delay_days := campaign_row.followup_delays_days[new.sequence_number + 1];
  if delay_days is null then
    return new;
  end if;

  update public.outreach_messages next_message
    set scheduled_for = new.sent_at + make_interval(days => delay_days)
    where next_message.recipient_id = new.recipient_id
      and next_message.user_id = new.user_id
      and next_message.sequence_number = new.sequence_number + 1
      and next_message.message_type = 'follow_up'
      and next_message.status = 'queued'
      and next_message.template_id is not null;

  return new;
end;
$$;

drop trigger if exists outreach_schedule_next_followup on public.outreach_messages;
create trigger outreach_schedule_next_followup
  after update of status on public.outreach_messages
  for each row
  when (new.status = 'sent')
  execute function public.gigo_schedule_next_outreach_followup();

create or replace function public.gigo_claim_due_outreach_messages(
  p_limit integer default 1,
  p_lease_seconds integer default 120
)
returns setof public.outreach_messages
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.outreach_messages
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error = 'Worker lease expired; delivery outcome is uncertain and requires reconciliation.'
    where status = 'sending'
      and lease_expires_at is not null
      and lease_expires_at <= now();

  return query
    with candidates as (
      select m.id
      from public.outreach_messages m
      join public.outreach_campaigns c
        on c.id = m.campaign_id and c.user_id = m.user_id
      join public.outreach_recipients r
        on r.id = m.recipient_id and r.user_id = m.user_id and r.campaign_id = m.campaign_id
      join public.outreach_templates t
        on t.id = m.template_id and t.user_id = m.user_id and t.campaign_id = m.campaign_id
      where m.status = 'queued'
        and m.scheduled_for <= now()
        and m.attempt_count < 5
        and m.to_email = lower(r.email)
        and c.status = 'active'
        and c.approval_status = 'approved'
        and c.approved_at is not null
        and c.initial_send_enabled = true
        and m.sequence_number < c.max_messages_per_recipient
        and t.approved_at is not null
        and t.sequence_number = m.sequence_number
        and t.message_type = m.message_type
        and (
          (m.message_type = 'initial' and m.sequence_number = 0
            and r.status in ('queued','ready'))
          or
          (m.message_type = 'follow_up' and m.sequence_number > 0
            and c.followups_enabled = true and r.status = 'contacted'
            and exists (
              select 1 from public.outreach_messages previous
              where previous.recipient_id = m.recipient_id
                and previous.user_id = m.user_id
                and previous.sequence_number = m.sequence_number - 1
                and previous.status = 'sent'
            ))
        )
        and not exists (
          select 1 from public.outreach_suppressions s
          where s.user_id = m.user_id and lower(s.email) = lower(r.email)
        )
        and not exists (
          select 1 from public.outreach_messages active
          where active.recipient_id = m.recipient_id
            and active.status = 'sending'
        )
        and (
          case
            when c.send_window_start < c.send_window_end
              then (now() at time zone c.timezone)::time >= c.send_window_start
               and (now() at time zone c.timezone)::time < c.send_window_end
            else (now() at time zone c.timezone)::time >= c.send_window_start
              or (now() at time zone c.timezone)::time < c.send_window_end
          end
        )
        and (
          c.quiet_hours_start is null or c.quiet_hours_end is null
          or not (
            case
              when c.quiet_hours_start < c.quiet_hours_end
                then (now() at time zone c.timezone)::time >= c.quiet_hours_start
                 and (now() at time zone c.timezone)::time < c.quiet_hours_end
              else (now() at time zone c.timezone)::time >= c.quiet_hours_start
                or (now() at time zone c.timezone)::time < c.quiet_hours_end
            end
          )
        )
      order by m.scheduled_for asc, m.created_at asc
      limit greatest(1, least(coalesce(p_limit,1),10))
      for update of m, r skip locked
    )
    update public.outreach_messages m
      set status = 'sending',
          lease_token = gen_random_uuid(),
          lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds,120),600))),
          attempt_count = m.attempt_count + 1,
          last_error = null
      from candidates
      where m.id = candidates.id
      returning m.*;
end;
$$;

revoke all on function public.gigo_claim_due_outreach_messages(integer,integer) from public, anon, authenticated;
grant execute on function public.gigo_claim_due_outreach_messages(integer,integer) to service_role;

comment on function public.gigo_schedule_next_outreach_followup() is
  'Starts each follow-up delay from the provider-accepted timestamp of its immediate predecessor.';


-- END CANONICAL MIGRATION 0032_outreach_followup_clock.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0033_outreach_contact_eligibility.sql
-- ============================================================================

-- Recipient-level authorization review and marketing-contact registration gate.
-- Public profile discovery alone does not establish permission to send marketing email.

alter table public.outreach_recipients
  add column if not exists contact_authorization_status text not null default 'unreviewed'
    check (contact_authorization_status in ('unreviewed','approved','blocked')),
  add column if not exists contact_authorization_basis text
    check (contact_authorization_basis is null or contact_authorization_basis in ('consent','existing_relationship','legitimate_interest_assessed','other_documented')),
  add column if not exists contact_authorization_evidence_url text
    check (contact_authorization_evidence_url is null or (contact_authorization_evidence_url like 'https://%' and char_length(contact_authorization_evidence_url) <= 2048)),
  add column if not exists contact_authorization_reviewed_at timestamptz,
  add column if not exists marketing_contact_registered boolean not null default false;

alter table public.outreach_recipients
  drop constraint if exists outreach_recipient_authorization_consistency;
alter table public.outreach_recipients
  add constraint outreach_recipient_authorization_consistency
  check (
    contact_authorization_status <> 'approved'
    or (
      contact_authorization_basis is not null
      and contact_authorization_evidence_url is not null
      and contact_authorization_reviewed_at is not null
      and marketing_contact_registered = true
    )
  );

create or replace function public.gigo_guard_outreach_send_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
begin
  if new.status <> 'sending' or old.status = 'sending' then
    return new;
  end if;

  select * into recipient_row
    from public.outreach_recipients r
    where r.id = new.recipient_id and r.user_id = new.user_id
    for update;
  if not found
    or recipient_row.contact_authorization_status <> 'approved'
    or recipient_row.contact_authorization_reviewed_at is null
    or recipient_row.marketing_contact_registered is not true
    or recipient_row.contact_authorization_evidence_url is null then
    raise exception 'recipient lacks reviewed marketing-contact authorization' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists outreach_messages_send_eligibility_guard on public.outreach_messages;
create trigger outreach_messages_send_eligibility_guard
  before update of status on public.outreach_messages
  for each row
  when (new.status = 'sending')
  execute function public.gigo_guard_outreach_send_eligibility();

comment on column public.outreach_recipients.contact_authorization_status is
  'Manual owner review state for the legal/permission basis to contact this address; public profile visibility alone is not approval.';
comment on column public.outreach_recipients.marketing_contact_registered is
  'True only after the recipient is registered in the configured provider marketing audience as required by provider rules.';


-- END CANONICAL MIGRATION 0033_outreach_contact_eligibility.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0034_outreach_outbox_privilege_hardening.sql
-- ============================================================================

-- Close direct authenticated writes to the outreach outbox.
-- Only the trusted GiGo API may prepare messages after verifying the user's session
-- and reading the campaign, approved templates, recipient and evidence under RLS.

drop policy if exists outreach_messages_owner_all on public.outreach_messages;
drop policy if exists outreach_messages_owner_read on public.outreach_messages;
create policy outreach_messages_owner_read on public.outreach_messages
  for select using (user_id = auth.uid());

revoke insert, update, delete on public.outreach_messages from anon, authenticated;

revoke all on function public.gigo_prepare_outreach_sequence(uuid, uuid, jsonb) from public, anon, authenticated;
drop function if exists public.gigo_prepare_outreach_sequence(uuid, uuid, jsonb);

create or replace function public.gigo_prepare_outreach_sequence(
  p_owner_id uuid, p_campaign_id uuid, p_recipient_id uuid, p_messages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.outreach_campaigns%rowtype;
  recipient_row public.outreach_recipients%rowtype;
  item jsonb;
  template_row public.outreach_templates%rowtype;
  expected_count integer;
  supplied_count integer;
  inserted_count integer := 0;
  sequence_value integer;
  scheduled_value timestamptz;
  delay_days integer;
  cumulative_days integer := 0;
  message_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_owner_id is null then
    raise exception 'trusted service execution required' using errcode = '42501';
  end if;
  if p_messages is null or jsonb_typeof(p_messages) is distinct from 'array'
    or jsonb_array_length(p_messages) < 1 or jsonb_array_length(p_messages) > 6 then
    raise exception 'messages must be an array containing 1 to 6 items' using errcode = '22023';
  end if;

  select * into campaign_row from public.outreach_campaigns c
    where c.id = p_campaign_id and c.user_id = p_owner_id for update;
  if not found or campaign_row.status <> 'active' or campaign_row.approval_status <> 'approved'
     or campaign_row.approved_at is null or not campaign_row.initial_send_enabled then
    raise exception 'campaign is not approved and active' using errcode = '42501';
  end if;

  select * into recipient_row from public.outreach_recipients r
    where r.id = p_recipient_id and r.campaign_id = p_campaign_id and r.user_id = p_owner_id for update;
  if not found or recipient_row.status not in ('queued','ready')
     or recipient_row.contact_authorization_status <> 'approved'
     or recipient_row.contact_authorization_reviewed_at is null
     or recipient_row.marketing_contact_registered is not true
     or recipient_row.contact_authorization_evidence_url is null then
    raise exception 'recipient is not eligible for approved marketing outreach' using errcode = '42501';
  end if;
  if exists (select 1 from public.outreach_suppressions s
    where s.user_id = p_owner_id and lower(s.email) = lower(recipient_row.email)) then
    raise exception 'recipient is suppressed' using errcode = '42501';
  end if;

  select count(*) into expected_count from public.outreach_templates t
    where t.campaign_id = p_campaign_id and t.user_id = p_owner_id and t.approved_at is not null;
  supplied_count := jsonb_array_length(p_messages);
  if expected_count < 1 or supplied_count <> expected_count
    or expected_count > campaign_row.max_messages_per_recipient then
    raise exception 'prepared sequence does not match approved template count' using errcode = '22023';
  end if;
  if expected_count > 1 and not campaign_row.followups_enabled then
    raise exception 'follow-ups are not enabled' using errcode = '42501';
  end if;

  if (select count(distinct (value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> expected_count
    or (select min((value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> 0
    or (select max((value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> expected_count - 1 then
    raise exception 'prepared sequence numbers must be unique and contiguous' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'invalid prepared message' using errcode = '22023'; end if;
    sequence_value := (item->>'sequence_number')::integer;
    if sequence_value < 0 or sequence_value >= expected_count then
      raise exception 'invalid message sequence' using errcode = '22023';
    end if;
    select * into template_row from public.outreach_templates t
      where t.campaign_id = p_campaign_id and t.user_id = p_owner_id
        and t.sequence_number = sequence_value and t.approved_at is not null;
    if not found or (item->>'template_id')::uuid <> template_row.id
      or item->>'message_type' <> template_row.message_type
      or item->>'to_email' <> lower(recipient_row.email)
      or char_length(coalesce(item->>'subject','')) not between 1 and 300
      or char_length(coalesce(item->>'body_text','')) not between 1 and 20000
      or jsonb_typeof(coalesce(item->'personalization_evidence','[]'::jsonb)) <> 'array' then
      raise exception 'prepared message does not match approved template or recipient' using errcode = '22023';
    end if;

    if sequence_value = 0 then scheduled_value := now();
    else
      cumulative_days := 0;
      for delay_days in 1..sequence_value loop
        cumulative_days := cumulative_days + campaign_row.followup_delays_days[delay_days];
      end loop;
      scheduled_value := now() + make_interval(days => cumulative_days);
    end if;

    insert into public.outreach_messages(
      user_id,campaign_id,recipient_id,sequence_number,message_type,to_email,
      subject,body_text,personalization_evidence,status,scheduled_for,template_id
    ) values (
      p_owner_id,p_campaign_id,p_recipient_id,sequence_value,template_row.message_type,
      lower(recipient_row.email),item->>'subject',item->>'body_text',
      coalesce(item->'personalization_evidence','[]'::jsonb),'queued',scheduled_value,template_row.id
    ) on conflict (recipient_id,sequence_number) do nothing returning id into message_id;

    if message_id is not null then
      inserted_count := inserted_count + 1;
      insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail,event_data)
      values(p_owner_id,p_campaign_id,p_recipient_id,message_id,'message_queued',
        'Approved template rendered into the durable outbox; no provider send was performed.',
        jsonb_build_object('sequence_number',sequence_value,'scheduled_for',scheduled_value));
    end if;
    message_id := null;
  end loop;

  return jsonb_build_object('recipient_id',p_recipient_id,'inserted_count',inserted_count,
    'already_prepared',inserted_count = 0,'messages_queued',supplied_count);
end;
$$;

revoke all on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb) to service_role;
comment on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb) is
  'Service-role-only outbox preparation. The API must verify the user session and owner-scoped reads before calling. It never sends email.';


-- END CANONICAL MIGRATION 0034_outreach_outbox_privilege_hardening.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0035_outreach_inbound_event_idempotency.sql
-- ============================================================================

-- Make inbound provider-event deduplication race-safe and account-scoped.
alter table public.outreach_events
  add column if not exists provider text,
  add column if not exists provider_account_id text,
  add column if not exists provider_event_id text;

alter table public.outreach_events
  drop constraint if exists outreach_events_provider_identity_consistency;
alter table public.outreach_events
  add constraint outreach_events_provider_identity_consistency
  check (
    (provider is null and provider_account_id is null and provider_event_id is null)
    or
    (provider is not null and char_length(provider) between 1 and 80
      and provider_account_id is not null and char_length(provider_account_id) between 1 and 200
      and provider_event_id is not null and char_length(provider_event_id) between 1 and 300)
  );

create unique index if not exists outreach_events_provider_delivery_unique
  on public.outreach_events(provider, provider_account_id, provider_event_id)
  where provider_event_id is not null;

revoke all on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) from public, anon, authenticated;
drop function if exists public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text);

create or replace function public.gigo_record_outreach_recipient_event(
  p_recipient_id uuid,
  p_event_type text,
  p_email text,
  p_detail text,
  p_provider text,
  p_provider_account_id text,
  p_provider_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
  event_row_id uuid;
  normalized_email text := lower(trim(coalesce(p_email,'')));
  provider_value text := lower(trim(coalesce(p_provider,'')));
  account_value text := trim(coalesce(p_provider_account_id,''));
  event_value text := trim(coalesce(p_provider_event_id,''));
  new_status text;
  suppression_reason text;
  cancelled_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'trusted service execution required' using errcode = '42501';
  end if;
  if p_event_type is null or p_event_type not in ('reply_received','bounce_received','unsubscribe_received','complaint_received') then
    raise exception 'unsupported inbound event type' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'valid recipient email required' using errcode = '22023';
  end if;
  if provider_value = '' or char_length(provider_value) > 80
    or account_value = '' or char_length(account_value) > 200
    or event_value = '' or char_length(event_value) > 300 then
    raise exception 'verified provider account and event identity are required' using errcode = '22023';
  end if;
  if p_detail is not null and char_length(p_detail) > 3000 then
    raise exception 'event detail too long' using errcode = '22023';
  end if;

  select * into recipient_row from public.outreach_recipients r
    where r.id = p_recipient_id for update;
  if not found or lower(recipient_row.email) <> normalized_email then
    raise exception 'recipient not found or email mismatch' using errcode = 'P0002';
  end if;

  insert into public.outreach_events(
    user_id,campaign_id,recipient_id,event_type,detail,provider,provider_account_id,provider_event_id,event_data
  ) values (
    recipient_row.user_id,recipient_row.campaign_id,recipient_row.id,p_event_type,
    left(coalesce(p_detail,'Inbound provider event recorded.'),3000),
    provider_value,account_value,event_value,jsonb_build_object('processing','started')
  )
  on conflict (provider,provider_account_id,provider_event_id) where provider_event_id is not null
  do nothing
  returning id into event_row_id;

  if event_row_id is null then
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'duplicate_event',true,'cancelled_followups',0);
  end if;

  if p_event_type = 'reply_received' then
    new_status := 'replied';
  elsif p_event_type = 'bounce_received' then
    new_status := 'bounced';
    suppression_reason := 'hard_bounce';
  elsif p_event_type = 'unsubscribe_received' then
    new_status := 'unsubscribed';
    suppression_reason := 'unsubscribe';
  else
    new_status := 'complained';
    suppression_reason := 'complaint';
  end if;

  if suppression_reason is not null then
    insert into public.outreach_suppressions(user_id,email,reason,source)
    values(recipient_row.user_id,normalized_email,suppression_reason,'provider_event:' || p_event_type)
    on conflict do nothing;
  end if;

  if recipient_row.status in ('replied','bounced','unsubscribed','complained','cancelled','completed') then
    update public.outreach_events set event_data = jsonb_build_object('already_terminal',true,'cancelled_followups',0)
      where id = event_row_id;
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'already_terminal',true,'cancelled_followups',0);
  end if;

  update public.outreach_recipients
    set status = new_status, stop_reason = p_event_type, next_action_at = null
    where id = recipient_row.id and user_id = recipient_row.user_id;

  update public.outreach_messages
    set status = 'cancelled', last_error = 'Sequence stopped after ' || p_event_type || '.',
        lease_token = null, lease_expires_at = null
    where recipient_id = recipient_row.id and user_id = recipient_row.user_id
      and status = 'queued' and sequence_number > 0;
  get diagnostics cancelled_count = row_count;

  update public.outreach_events
    set event_data = jsonb_build_object('cancelled_followups',cancelled_count,'processed',true)
    where id = event_row_id;

  return jsonb_build_object('recipient_id',recipient_row.id,'status',new_status,
    'already_terminal',false,'cancelled_followups',cancelled_count);
end;
$$;

revoke all on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text,text) to service_role;

comment on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text,text) is
  'Service-role-only inbound event handler. The provider adapter must verify webhook signature and account identity before calling. Unique provider/account/event identity makes duplicate delivery race-safe.';


-- END CANONICAL MIGRATION 0035_outreach_inbound_event_idempotency.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0036_outreach_database_rendering_and_final_guard.sql
-- ============================================================================

-- Trusted, database-side rendering of approved outreach templates.
-- The API supplies only owner/campaign/recipient IDs. It cannot supply message content.
-- This migration also closes PUBLIC table grants and strengthens the final claim-time guard.

revoke all on public.outreach_messages from public, anon, authenticated;
grant select on public.outreach_messages to authenticated;

revoke all on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
drop function if exists public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb);

create or replace function public.gigo_prepare_outreach_sequence(
  p_owner_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.outreach_campaigns%rowtype;
  recipient_row public.outreach_recipients%rowtype;
  template_row public.outreach_templates%rowtype;
  profile_row public.lead_social_profiles%rowtype;
  evidence_row public.lead_evidence%rowtype;
  expected_count integer;
  inserted_count integer := 0;
  sequence_value integer;
  scheduled_value timestamptz;
  cumulative_days integer;
  delay_days integer;
  message_id uuid;
  values_json jsonb;
  evidence_json jsonb;
  subject_value text;
  body_value text;
  placeholder text;
  allowed_fields constant text[] := array['first_name','organisation','niche','specific_observation','offer_summary'];
  first_name_value text;
  organisation_value text;
  niche_value text := '';
  observation_value text := '';
  offer_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_owner_id is null then
    raise exception 'trusted service execution required' using errcode = '42501';
  end if;

  select * into campaign_row
  from public.outreach_campaigns c
  where c.id = p_campaign_id and c.user_id = p_owner_id
  for update;
  if not found or campaign_row.status <> 'active'
    or campaign_row.approval_status <> 'approved'
    or campaign_row.approved_at is null
    or campaign_row.approval_revoked_at is not null
    or campaign_row.initial_send_enabled is not true then
    raise exception 'campaign is not approved and active' using errcode = '42501';
  end if;

  select * into recipient_row
  from public.outreach_recipients r
  where r.id = p_recipient_id and r.campaign_id = p_campaign_id and r.user_id = p_owner_id
  for update;
  if not found or recipient_row.status not in ('queued','ready')
    or recipient_row.contact_authorization_status <> 'approved'
    or recipient_row.contact_authorization_reviewed_at is null
    or recipient_row.contact_authorization_basis is null
    or recipient_row.contact_authorization_evidence_url is null
    or recipient_row.marketing_contact_registered is not true then
    raise exception 'recipient is not eligible for approved marketing outreach' using errcode = '42501';
  end if;

  if exists (select 1 from public.outreach_suppressions s
    where s.user_id = p_owner_id and lower(s.email) = lower(recipient_row.email)) then
    raise exception 'recipient is suppressed' using errcode = '42501';
  end if;

  select count(*) into expected_count
  from public.outreach_templates t
  where t.campaign_id = p_campaign_id and t.user_id = p_owner_id and t.approved_at is not null;
  if expected_count < 1 or expected_count > 6
    or expected_count > campaign_row.max_messages_per_recipient
    or (expected_count > 1 and campaign_row.followups_enabled is not true) then
    raise exception 'approved template sequence is incomplete or not enabled' using errcode = '22023';
  end if;

  first_name_value := left(regexp_replace(split_part(coalesce(recipient_row.recipient_name,''),' ',1), '[[:cntrl:]]', ' ', 'g'), 240);
  organisation_value := left(regexp_replace(coalesce(recipient_row.organisation,''), '[[:cntrl:]]', ' ', 'g'), 240);
  offer_value := left(regexp_replace(coalesce(campaign_row.offer_summary,''), '[[:cntrl:]]', ' ', 'g'), 5000);

  if recipient_row.lead_id is not null then
    select * into profile_row
    from public.lead_social_profiles p
    where p.user_id = p_owner_id and p.lead_id = recipient_row.lead_id
      and nullif(trim(p.niche),'') is not null
    order by p.updated_at desc
    limit 1;

    if found then niche_value := left(regexp_replace(coalesce(profile_row.niche,''), '[[:cntrl:]]', ' ', 'g'), 240); end if;

    select * into evidence_row
    from public.lead_evidence e
    where e.user_id = p_owner_id and e.lead_id = recipient_row.lead_id
      and e.evidence_type in ('audience_fit','credibility','customer_problem','buying_intent','other')
      and nullif(trim(e.excerpt),'') is not null
    order by e.observed_at desc
    limit 1;

    if found then observation_value := left(regexp_replace(coalesce(evidence_row.excerpt,''), '[[:cntrl:]]', ' ', 'g'), 1000); end if;
  end if;

  values_json := jsonb_build_object(
    'first_name', first_name_value,
    'organisation', organisation_value,
    'niche', niche_value,
    'specific_observation', observation_value,
    'offer_summary', offer_value
  );

  for sequence_value in 0..expected_count - 1 loop
    select * into template_row
    from public.outreach_templates t
    where t.campaign_id = p_campaign_id and t.user_id = p_owner_id
      and t.sequence_number = sequence_value and t.approved_at is not null;
    if not found or (sequence_value = 0 and template_row.message_type <> 'initial')
      or (sequence_value > 0 and template_row.message_type <> 'follow_up') then
      raise exception 'approved template sequence must be contiguous and typed' using errcode = '22023';
    end if;

    -- Reject malformed/unknown placeholders and placeholders not declared by the approved template.
    for placeholder in
      select distinct match[1]
      from regexp_matches(template_row.subject_template || E'\n' || template_row.body_template,
        '\{\{([^{}]+)\}\}', 'g') as match
    loop
      if not (placeholder = any(allowed_fields))
        or not (template_row.personalization_fields ? placeholder)
        or coalesce(values_json->>placeholder,'') = '' then
        raise exception 'template contains an unavailable or undeclared personalization field: %', placeholder using errcode = '22023';
      end if;
    end loop;

    if (template_row.subject_template || template_row.body_template) ~ '\{\{[^{}]*\}\}' then
      -- Every well-formed token is checked above; this catches empty/malformed leftovers.
      if regexp_replace(template_row.subject_template || template_row.body_template,
        '\{\{[a-z_]+\}\}', '', 'g') ~ '\{\{|\}\}' then
        raise exception 'template contains malformed personalization syntax' using errcode = '22023';
      end if;
    end if;

    subject_value := template_row.subject_template;
    body_value := template_row.body_template;
    foreach placeholder in array allowed_fields loop
      subject_value := replace(subject_value, '{{' || placeholder || '}}', coalesce(values_json->>placeholder,''));
      body_value := replace(body_value, '{{' || placeholder || '}}', coalesce(values_json->>placeholder,''));
    end loop;
    subject_value := left(trim(regexp_replace(subject_value, '[[:cntrl:]]', ' ', 'g')), 300);
    body_value := left(trim(regexp_replace(body_value, '[[:cntrl:]]', ' ', 'g')), 20000);
    if char_length(subject_value) < 1 or char_length(body_value) < 1
      or subject_value ~ '\{\{|\}\}' or body_value ~ '\{\{|\}\}' then
      raise exception 'rendered message is empty or contains unresolved placeholders' using errcode = '22023';
    end if;

    evidence_json := '[]'::jsonb;
    if position('{{niche}}' in (template_row.subject_template || template_row.body_template)) > 0 then
      evidence_json := evidence_json || jsonb_build_array(jsonb_build_object(
        'field','niche','source_url',profile_row.profile_url,'source_title',profile_row.display_name));
    end if;
    if position('{{specific_observation}}' in (template_row.subject_template || template_row.body_template)) > 0 then
      evidence_json := evidence_json || jsonb_build_array(jsonb_build_object(
        'field','specific_observation','evidence_type',evidence_row.evidence_type,
        'source_url',evidence_row.source_url,'source_title',evidence_row.source_title,
        'observed_at',evidence_row.observed_at,'confidence',evidence_row.confidence));
    end if;

    if sequence_value = 0 then
      scheduled_value := now();
    else
      cumulative_days := 0;
      for delay_days in 1..sequence_value loop
        cumulative_days := cumulative_days + campaign_row.followup_delays_days[delay_days];
      end loop;
      scheduled_value := now() + make_interval(days => cumulative_days);
    end if;

    insert into public.outreach_messages(
      user_id,campaign_id,recipient_id,sequence_number,message_type,to_email,
      subject,body_text,personalization_evidence,status,scheduled_for,template_id
    ) values (
      p_owner_id,p_campaign_id,p_recipient_id,sequence_value,template_row.message_type,
      lower(recipient_row.email),subject_value,body_value,evidence_json,'queued',scheduled_value,template_row.id
    ) on conflict (recipient_id,sequence_number) do nothing returning id into message_id;

    if message_id is not null then
      inserted_count := inserted_count + 1;
      insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail,event_data)
      values(p_owner_id,p_campaign_id,p_recipient_id,message_id,'message_queued',
        'Database-rendered approved template persisted to the outbox; no provider send was performed.',
        jsonb_build_object('sequence_number',sequence_value,'scheduled_for',scheduled_value,'template_id',template_row.id));
    end if;
    message_id := null;
  end loop;

  return jsonb_build_object('recipient_id',p_recipient_id,'inserted_count',inserted_count,
    'already_prepared',inserted_count = 0,'messages_queued',expected_count,'provider_send_performed',false);
end;
$$;

revoke all on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid) to service_role;

-- Revalidate the mutable authorization facts at the final queued -> sending transition.
create or replace function public.gigo_guard_outreach_send_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
  campaign_row public.outreach_campaigns%rowtype;
  recipient_found boolean := false;
  campaign_found boolean := false;
begin
  if new.status <> 'sending' or old.status = 'sending' then return new; end if;

  select * into recipient_row from public.outreach_recipients r
  where r.id = new.recipient_id and r.user_id = new.user_id for update;
  recipient_found := found;
  select * into campaign_row from public.outreach_campaigns c
  where c.id = new.campaign_id and c.user_id = new.user_id for update;
  campaign_found := found;

  if not recipient_found or not campaign_found or campaign_row.status <> 'active'
    or campaign_row.approval_status <> 'approved' or campaign_row.approved_at is null
    or campaign_row.approval_revoked_at is not null or campaign_row.initial_send_enabled is not true
    or recipient_row.contact_authorization_status <> 'approved'
    or recipient_row.contact_authorization_reviewed_at is null
    or recipient_row.contact_authorization_basis is null
    or recipient_row.contact_authorization_evidence_url is null
    or recipient_row.marketing_contact_registered is not true
    or lower(new.to_email) <> lower(recipient_row.email)
    or exists (select 1 from public.outreach_suppressions s
      where s.user_id = new.user_id and lower(s.email) = lower(recipient_row.email))
    or not exists (select 1 from public.outreach_templates t
      where t.id = new.template_id and t.user_id = new.user_id
        and t.campaign_id = new.campaign_id and t.sequence_number = new.sequence_number
        and t.message_type = new.message_type and t.approved_at is not null) then
    raise exception 'message no longer satisfies approved outreach eligibility' using errcode = '42501';
  end if;

  if new.scheduled_for > now()
    or (case when campaign_row.send_window_start < campaign_row.send_window_end
      then (now() at time zone campaign_row.timezone)::time < campaign_row.send_window_start
        or (now() at time zone campaign_row.timezone)::time >= campaign_row.send_window_end
      else (now() at time zone campaign_row.timezone)::time < campaign_row.send_window_start
        and (now() at time zone campaign_row.timezone)::time >= campaign_row.send_window_end end)
    or (campaign_row.quiet_hours_start is not null and campaign_row.quiet_hours_end is not null
      and (case when campaign_row.quiet_hours_start < campaign_row.quiet_hours_end
        then (now() at time zone campaign_row.timezone)::time >= campaign_row.quiet_hours_start
          and (now() at time zone campaign_row.timezone)::time < campaign_row.quiet_hours_end
        else (now() at time zone campaign_row.timezone)::time >= campaign_row.quiet_hours_start
          or (now() at time zone campaign_row.timezone)::time < campaign_row.quiet_hours_end end)) then
    raise exception 'message is outside the approved sending window' using errcode = '42501';
  end if;

  if new.sequence_number = 0 and recipient_row.status not in ('queued','ready')
    or new.sequence_number > 0 and (recipient_row.status <> 'contacted' or campaign_row.followups_enabled is not true
      or not exists (select 1 from public.outreach_messages previous
        where previous.recipient_id = new.recipient_id
          and previous.sequence_number = new.sequence_number - 1 and previous.status = 'sent')) then
    raise exception 'recipient sequence state does not permit this send' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_messages_send_eligibility_guard on public.outreach_messages;
create trigger outreach_messages_send_eligibility_guard
  before update of status on public.outreach_messages
  for each row when (new.status = 'sending')
  execute function public.gigo_guard_outreach_send_eligibility();

comment on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid) is
  'Service-role-only preparation that renders approved template content inside Postgres from owner-scoped recipient and evidence records. It never sends.';


-- Campaign approval must not be forgeable by direct owner-row PATCH requests.
-- Owners may read/create/delete their campaigns; the approval RPC is the only update path.
revoke all on public.outreach_campaigns from public, anon, authenticated;
grant select, insert, delete on public.outreach_campaigns to authenticated;

drop policy if exists outreach_campaigns_owner_all on public.outreach_campaigns;
drop policy if exists outreach_campaigns_owner_select on public.outreach_campaigns;
drop policy if exists outreach_campaigns_owner_insert on public.outreach_campaigns;
drop policy if exists outreach_campaigns_owner_delete on public.outreach_campaigns;
create policy outreach_campaigns_owner_select on public.outreach_campaigns
  for select using (user_id = auth.uid());
create policy outreach_campaigns_owner_insert on public.outreach_campaigns
  for insert with check (
    user_id = auth.uid()
    and status = 'draft'
    and approval_status = 'not_requested'
    and approved_at is null
    and approval_revoked_at is null
    and approved_sender_email is null
    and approved_sender_name is null
    and initial_send_enabled is false
    and max_recipients = 0
    and max_messages_per_recipient = 0
  );
create policy outreach_campaigns_owner_delete on public.outreach_campaigns
  for delete using (user_id = auth.uid());

create or replace function public.gigo_approve_outreach_campaign(
  p_campaign_id uuid,
  p_sender_email text,
  p_sender_name text,
  p_max_recipients integer,
  p_max_messages_per_recipient integer,
  p_initial_send_enabled boolean,
  p_followups_enabled boolean,
  p_followup_delays_days integer[],
  p_send_window_start time,
  p_send_window_end time,
  p_timezone text,
  p_quiet_hours_start time,
  p_quiet_hours_end time
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_total integer;
  campaign_status text;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_sender_email is null or char_length(p_sender_email) > 320
     or p_sender_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_sender_name is null or char_length(p_sender_name) > 200
     or p_max_recipients is null or p_max_recipients < 1 or p_max_recipients > 10000
     or p_max_messages_per_recipient is null or p_max_messages_per_recipient < 1 or p_max_messages_per_recipient > 6
     or p_initial_send_enabled is distinct from true
     or p_followups_enabled is null
     or coalesce(cardinality(p_followup_delays_days),0) > 5
     or not (coalesce(p_followup_delays_days, '{}'::integer[]) <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30])
     or (p_followups_enabled and coalesce(cardinality(p_followup_delays_days),0) = 0)
     or (not p_followups_enabled and coalesce(cardinality(p_followup_delays_days),0) <> 0)
     or p_timezone is null or char_length(p_timezone) > 100
     or p_send_window_start is null or p_send_window_end is null then
    raise exception 'invalid campaign authorization policy' using errcode = '22023';
  end if;

  select c.status into campaign_status
    from public.outreach_campaigns c
    where c.id = p_campaign_id and c.user_id = owner_id
    for update;
  if not found then return false; end if;
  if campaign_status not in ('draft','awaiting_approval','paused') then
    raise exception 'campaign cannot be approved in its current state' using errcode = '22023';
  end if;

  select count(*) into recipient_total
    from public.outreach_recipients r
    where r.campaign_id = p_campaign_id and r.user_id = owner_id
      and r.status not in ('unsubscribed','complained','bounced','cancelled');
  if recipient_total < 1 or recipient_total > p_max_recipients then
    raise exception 'recipient count is outside the approved campaign limit' using errcode = '22023';
  end if;

  update public.outreach_campaigns
    set approval_status = 'approved',
        approved_sender_email = lower(btrim(p_sender_email)),
        approved_sender_name = btrim(p_sender_name),
        max_recipients = p_max_recipients,
        max_messages_per_recipient = p_max_messages_per_recipient,
        initial_send_enabled = p_initial_send_enabled,
        followups_enabled = p_followups_enabled,
        followup_delays_days = coalesce(p_followup_delays_days, '{}'::integer[]),
        send_window_start = p_send_window_start,
        send_window_end = p_send_window_end,
        timezone = p_timezone,
        quiet_hours_start = p_quiet_hours_start,
        quiet_hours_end = p_quiet_hours_end,
        approved_policy = jsonb_build_object(
          'sender_email', lower(btrim(p_sender_email)),
          'sender_name', btrim(p_sender_name),
          'max_recipients', p_max_recipients,
          'max_messages_per_recipient', p_max_messages_per_recipient,
          'initial_send_enabled', p_initial_send_enabled,
          'followups_enabled', p_followups_enabled,
          'followup_delays_days', to_jsonb(coalesce(p_followup_delays_days, '{}'::integer[])),
          'send_window_start', p_send_window_start,
          'send_window_end', p_send_window_end,
          'timezone', p_timezone,
          'quiet_hours_start', p_quiet_hours_start,
          'quiet_hours_end', p_quiet_hours_end
        ),
        approved_at = now(),
        approval_revoked_at = null,
        status = 'active'
    where id = p_campaign_id and user_id = owner_id;

  insert into public.outreach_events(user_id, campaign_id, event_type, detail, event_data)
    values (owner_id, p_campaign_id, 'campaign_approved',
      'Owner approved a bounded outreach policy.',
      jsonb_build_object('max_recipients',p_max_recipients,'max_messages_per_recipient',p_max_messages_per_recipient));

  return true;
end;
$$;

revoke all on function public.gigo_approve_outreach_campaign(uuid,text,text,integer,integer,boolean,boolean,integer[],time,time,text,time,time) from public, anon;
grant execute on function public.gigo_approve_outreach_campaign(uuid,text,text,integer,integer,boolean,boolean,integer[],time,time,text,time,time) to authenticated;


-- END CANONICAL MIGRATION 0036_outreach_database_rendering_and_final_guard.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0037_durable_autonomy_governance.sql
-- ============================================================================

-- Durable owner-controlled autonomy governance.
-- Financial execution is intentionally absent from every configurable scope.

create table if not exists public.autonomy_control_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_paused boolean not null default true,
  pause_reason text,
  paused_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint autonomy_pause_reason_length check (pause_reason is null or char_length(pause_reason) <= 500),
  constraint autonomy_pause_consistency check (
    (is_paused and paused_at is not null) or (not is_paused and paused_at is null)
  )
);

create table if not exists public.autonomy_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('observe','analyse','draft','internal_execute','external_execute')),
  enabled boolean not null default false,
  require_approval boolean not null default true,
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  policy_version integer not null default 1 check (policy_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, scope),
  constraint autonomy_external_always_approved check (scope <> 'external_execute' or require_approval)
);

create table if not exists public.autonomy_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  action_class text not null check (action_class in ('external_execute')),
  target_ref text not null check (char_length(target_ref) between 1 and 500),
  parameters_sha256 text not null check (parameters_sha256 ~ '^[0-9a-f]{64}$'),
  max_actions integer not null default 1 check (max_actions between 1 and 1000),
  used_actions integer not null default 0 check (used_actions between 0 and max_actions),
  expires_at timestamptz not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint autonomy_approval_expiry check (expires_at > approved_at)
);

create table if not exists public.autonomy_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  action_class text not null check (action_class in ('observe','analyse','draft','internal_execute','external_execute','financial','unknown')),
  decision text not null check (decision in ('allowed','denied','approval_required','paused','failed','completed','cancelled')),
  reason_code text not null check (char_length(reason_code) between 1 and 120),
  policy_version integer,
  approval_id uuid references public.autonomy_approvals(id) on delete set null,
  target_ref text,
  intent_sha256 text check (intent_sha256 is null or intent_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text,
  result_summary text,
  created_at timestamptz not null default now(),
  constraint autonomy_event_text_limits check (
    (target_ref is null or char_length(target_ref) <= 500)
    and (result_summary is null or char_length(result_summary) <= 1000)
    and (idempotency_key is null or char_length(idempotency_key) between 1 and 200)
  )
);

create unique index if not exists autonomy_audit_owner_idempotency
  on public.autonomy_audit_events(user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists autonomy_audit_owner_recent
  on public.autonomy_audit_events(user_id, created_at desc);
create index if not exists autonomy_approvals_owner_active
  on public.autonomy_approvals(user_id, expires_at)
  where revoked_at is null;

alter table public.autonomy_control_state enable row level security;
alter table public.autonomy_policies enable row level security;
alter table public.autonomy_approvals enable row level security;
alter table public.autonomy_audit_events enable row level security;

revoke all on public.autonomy_control_state, public.autonomy_policies,
  public.autonomy_approvals, public.autonomy_audit_events from public, anon, authenticated;
grant select on public.autonomy_control_state, public.autonomy_policies,
  public.autonomy_approvals, public.autonomy_audit_events to authenticated;

drop policy if exists autonomy_control_owner_read on public.autonomy_control_state;
create policy autonomy_control_owner_read on public.autonomy_control_state
  for select to authenticated using (user_id = auth.uid());
drop policy if exists autonomy_policies_owner_read on public.autonomy_policies;
create policy autonomy_policies_owner_read on public.autonomy_policies
  for select to authenticated using (user_id = auth.uid());
drop policy if exists autonomy_approvals_owner_read on public.autonomy_approvals;
create policy autonomy_approvals_owner_read on public.autonomy_approvals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists autonomy_audit_owner_read on public.autonomy_audit_events;
create policy autonomy_audit_owner_read on public.autonomy_audit_events
  for select to authenticated using (user_id = auth.uid());

create or replace function public.gigo_set_autonomy_policy(
  p_scope text,
  p_enabled boolean,
  p_require_approval boolean,
  p_limits jsonb default '{}'::jsonb
)
returns public.autonomy_policies
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  result_row public.autonomy_policies%rowtype;
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_scope not in ('observe','analyse','draft','internal_execute','external_execute')
    or p_enabled is null or p_require_approval is null
    or jsonb_typeof(coalesce(p_limits,'{}'::jsonb)) <> 'object'
    or (p_scope = 'external_execute' and p_require_approval is distinct from true) then
    raise exception 'invalid autonomy policy; financial scope is never configurable' using errcode = '22023';
  end if;

  insert into public.autonomy_policies(user_id,scope,enabled,require_approval,limits,policy_version)
  values(owner_id,p_scope,p_enabled,p_require_approval,coalesce(p_limits,'{}'::jsonb),1)
  on conflict(user_id,scope) do update set
    enabled = excluded.enabled,
    require_approval = excluded.require_approval,
    limits = excluded.limits,
    policy_version = public.autonomy_policies.policy_version + 1,
    updated_at = now()
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.gigo_set_autonomy_pause(
  p_is_paused boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_is_paused is null or (p_reason is not null and char_length(p_reason) > 500) then
    raise exception 'invalid pause request' using errcode = '22023';
  end if;
  insert into public.autonomy_control_state(user_id,is_paused,pause_reason,paused_at,updated_at)
  values(owner_id,p_is_paused,case when p_is_paused then nullif(trim(p_reason),'') else null end,
    case when p_is_paused then now() else null end,now())
  on conflict(user_id) do update set
    is_paused = excluded.is_paused,
    pause_reason = excluded.pause_reason,
    paused_at = excluded.paused_at,
    updated_at = now();
  return true;
end;
$$;

create or replace function public.gigo_create_autonomy_approval(
  p_tool_name text,
  p_target_ref text,
  p_parameters_sha256 text,
  p_max_actions integer,
  p_expires_at timestamptz
)
returns public.autonomy_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  result_row public.autonomy_approvals%rowtype;
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_tool_name is null or p_tool_name !~ '^[a-z][a-z0-9_.-]{0,119}$'
    or p_target_ref is null or char_length(p_target_ref) not between 1 and 500
    or p_parameters_sha256 is null or p_parameters_sha256 !~ '^[0-9a-f]{64}$'
    or p_max_actions is null or p_max_actions not between 1 and 1000
    or p_expires_at is null or p_expires_at <= now()
    or p_expires_at > now() + interval '30 days' then
    raise exception 'invalid bounded approval request' using errcode = '22023';
  end if;
  -- A hard deny here is defense in depth; runtime classification remains authoritative.
  if p_tool_name ~* '(^|[._-])(pay|payments?|purchase|buy|checkout|charge|refund|transfer|withdraw|deposit|payout|subscription|subscribe|billing|bank|wallet_send|invest|investment|trade|trading|loan|borrow|lend|donate|spend)([._-]|$)' then
    raise exception 'financial actions cannot be approved for GiGo execution' using errcode = '42501';
  end if;
  insert into public.autonomy_approvals(user_id,tool_name,action_class,target_ref,parameters_sha256,max_actions,expires_at)
  values(owner_id,p_tool_name,'external_execute',p_target_ref,p_parameters_sha256,p_max_actions,p_expires_at)
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on public.autonomy_audit_events from public, anon, authenticated, service_role;
grant select, insert on public.autonomy_audit_events to service_role;

create or replace function public.gigo_revoke_autonomy_approval(p_approval_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  update public.autonomy_approvals set revoked_at = now()
    where id = p_approval_id and user_id = owner_id and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.gigo_revoke_autonomy_approval(uuid) from public, anon;
grant execute on function public.gigo_revoke_autonomy_approval(uuid) to authenticated;

revoke all on function public.gigo_set_autonomy_policy(text,boolean,boolean,jsonb) from public, anon;
revoke all on function public.gigo_set_autonomy_pause(boolean,text) from public, anon;
revoke all on function public.gigo_create_autonomy_approval(text,text,text,integer,timestamptz) from public, anon;
grant execute on function public.gigo_set_autonomy_policy(text,boolean,boolean,jsonb) to authenticated;
grant execute on function public.gigo_set_autonomy_pause(boolean,text) to authenticated;
grant execute on function public.gigo_create_autonomy_approval(text,text,text,integer,timestamptz) to authenticated;

comment on table public.autonomy_policies is
  'Owner-configurable non-financial autonomy scopes. Financial execution is deliberately excluded.';
comment on table public.autonomy_approvals is
  'Owner-approved, expiring, parameter-hash-bound external action grants. Does not authorize financial tools.';
comment on table public.autonomy_audit_events is
  'Append-only service-written audit history for autonomy decisions and action outcomes.';


-- END CANONICAL MIGRATION 0037_durable_autonomy_governance.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0038_outreach_signature_and_partnership_terms.sql
-- ============================================================================

-- Enforce short outbound copy, owner signature, and deterministic 50/50 partnership terms.
-- This does not enable a provider, approve a campaign, or send a message.

create table if not exists public.owner_message_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signature_name text not null check (char_length(signature_name) between 1 and 80),
  updated_at timestamptz not null default now()
);
alter table public.owner_message_settings enable row level security;
revoke all on public.owner_message_settings from public, anon, authenticated;
grant select on public.owner_message_settings to authenticated;
drop policy if exists owner_message_settings_read on public.owner_message_settings;
create policy owner_message_settings_read on public.owner_message_settings
  for select to authenticated using (user_id = auth.uid());

create or replace function public.gigo_set_owner_message_signature(p_signature_name text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid(); clean_name text;
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  clean_name := trim(regexp_replace(coalesce(p_signature_name,''), '[[:cntrl:]]', ' ', 'g'));
  if char_length(clean_name) not between 1 and 80 then
    raise exception 'signature name must be 1 to 80 characters' using errcode = '22023';
  end if;
  insert into public.owner_message_settings(user_id,signature_name,updated_at)
  values(owner_id,clean_name,now())
  on conflict(user_id) do update set signature_name=excluded.signature_name,updated_at=now();
  return true;
end;
$$;
revoke all on function public.gigo_set_owner_message_signature(text) from public, anon;
grant execute on function public.gigo_set_owner_message_signature(text) to authenticated;

alter table public.outreach_campaigns
  add column if not exists campaign_kind text not null default 'general'
  check (campaign_kind in ('general','partnership'));

create or replace function public.gigo_set_outreach_campaign_kind(p_campaign_id uuid,p_campaign_kind text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_campaign_kind not in ('general','partnership') then
    raise exception 'invalid campaign kind' using errcode = '22023';
  end if;
  update public.outreach_campaigns
    set campaign_kind=p_campaign_kind,updated_at=now()
    where id=p_campaign_id and user_id=owner_id
      and status='draft' and approval_status in ('not_requested','rejected');
  if not found then raise exception 'campaign not found or no longer editable' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.gigo_set_outreach_campaign_kind(uuid,text) from public, anon;
grant execute on function public.gigo_set_outreach_campaign_kind(uuid,text) to authenticated;

create or replace function public.gigo_enforce_outreach_copy_policy()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owner_signature text;
  campaign_type text;
  partnership_clause constant text :=
    'We propose a 50/50 split of net revenue attributable to this partnership, after only direct costs we both agree to in writing in advance.';
  body_without_signature text;
  signature_line text;
begin
  if new.status not in ('queued','sending','sent') then return new; end if;

  select s.signature_name into owner_signature
    from public.owner_message_settings s where s.user_id=new.user_id;
  if owner_signature is null or char_length(trim(owner_signature))=0 then
    raise exception 'outbound signature is not configured; sending is blocked' using errcode = '42501';
  end if;

  select c.campaign_kind into campaign_type
    from public.outreach_campaigns c
    where c.id=new.campaign_id and c.user_id=new.user_id;
  if campaign_type is null then
    raise exception 'outreach campaign not found' using errcode = '42501';
  end if;

  if char_length(new.subject)>80 then
    raise exception 'outbound subject exceeds 80 characters' using errcode = '22023';
  end if;

  signature_line := '— ' || trim(owner_signature);
  body_without_signature := regexp_replace(coalesce(new.body_text,''), E'\\n+— [^\\n]*$', '', 'i');

  if campaign_type='partnership' then
    if body_without_signature !~* '50/50 split of net revenue attributable to this partnership' then
      body_without_signature := trim(body_without_signature) || E'\\n\\n' || partnership_clause;
    end if;
  end if;

  new.body_text := trim(body_without_signature) || E'\\n\\n' || signature_line;
  if char_length(new.body_text)>500 then
    raise exception 'outbound body exceeds 500 characters including partnership terms and signature' using errcode = '22023';
  end if;
  if new.body_text ~* '(guaranteed earnings|guaranteed income|you will earn|projected earnings)' then
    raise exception 'unsupported earnings guarantee or projection in outbound copy' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_copy_policy_guard on public.outreach_messages;
create trigger outreach_copy_policy_guard
  before insert or update of subject,body_text,status on public.outreach_messages
  for each row execute function public.gigo_enforce_outreach_copy_policy();

comment on table public.owner_message_settings is
  'Owner-controlled outbound signature. No signature means outbound queue transitions fail closed.';
comment on column public.outreach_campaigns.campaign_kind is
  'Partnership campaigns receive deterministic 50/50 net-attributable-revenue language at message rendering.';


-- END CANONICAL MIGRATION 0038_outreach_signature_and_partnership_terms.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0039_autonomy_initialization_and_approval_consumption.sql
-- ============================================================================

-- Owner initialization and atomic quota consumption for durable autonomy.
-- Initialization starts paused; it never enables external execution.

create or replace function public.gigo_initialize_autonomy_defaults()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  pause_value boolean;
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.autonomy_control_state(user_id,is_paused,pause_reason,paused_at,updated_at)
  values(owner_id,true,'Initial safety pause',now(),now())
  on conflict(user_id) do nothing;

  insert into public.autonomy_policies(user_id,scope,enabled,require_approval,limits)
  values
    (owner_id,'observe',true,false,'{}'::jsonb),
    (owner_id,'analyse',true,false,'{}'::jsonb),
    (owner_id,'draft',true,false,'{}'::jsonb),
    (owner_id,'internal_execute',true,false,'{}'::jsonb),
    (owner_id,'external_execute',false,true,'{}'::jsonb)
  on conflict(user_id,scope) do nothing;

  select is_paused into pause_value from public.autonomy_control_state where user_id = owner_id;
  return jsonb_build_object('initialized',true,'is_paused',coalesce(pause_value,true),'external_execute_enabled',false);
end;
$$;

create or replace function public.gigo_consume_autonomy_approval(
  p_owner_id uuid,
  p_approval_id uuid,
  p_tool_name text,
  p_target_ref text,
  p_parameters_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := coalesce(auth.role(),'');
begin
  if caller_role <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_owner_id is null
    or p_approval_id is null
    or p_tool_name is null
    or char_length(p_tool_name) < 1
    or char_length(p_tool_name) > 120
    or p_target_ref is null
    or char_length(p_target_ref) < 1
    or char_length(p_target_ref) > 500
    or p_parameters_sha256 is null
    or p_parameters_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid approval consumption request' using errcode = '22023';
  end if;

  -- Financial actions are permanently denied, even if a row was mistakenly created.
  if p_tool_name ~* '(^|[._-])(pay(ment|ments)?|purchase|buy|checkout|charge|refund|transfer|withdraw|deposit|payout|subscription|subscribe|billing|invoice_payment|bank|wallet_send|invest|investment|trade|trading|loan|borrow|lend|tip|donate|spend)([._-]|$)' then
    return false;
  end if;

  -- A valid approval cannot bypass global pause or the owner policy.
  if not exists (
    select 1 from public.autonomy_control_state
    where user_id = p_owner_id and is_paused = false
  ) then
    return false;
  end if;
  if not exists (
    select 1 from public.autonomy_policies
    where user_id = p_owner_id and scope = 'external_execute'
      and enabled = true and require_approval = true
  ) then
    return false;
  end if;

  update public.autonomy_approvals
    set used_actions = used_actions + 1
    where id = p_approval_id
      and user_id = p_owner_id
      and tool_name = p_tool_name
      and target_ref = p_target_ref
      and parameters_sha256 = p_parameters_sha256
      and revoked_at is null
      and expires_at > now()
      and used_actions < max_actions;

  return found;
end;
$$;

revoke all on function public.gigo_initialize_autonomy_defaults() from public, anon;
grant execute on function public.gigo_initialize_autonomy_defaults() to authenticated;
revoke all on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) to service_role;

comment on function public.gigo_initialize_autonomy_defaults() is
  'Initializes owner autonomy policy with global pause enabled and external execution disabled.';
comment on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) is
  'Atomically consumes one exact target and parameter-bound external approval; service role only.';


-- END CANONICAL MIGRATION 0039_autonomy_initialization_and_approval_consumption.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0040_marketing_assets.sql
-- ============================================================================

-- Owner-scoped marketing asset drafts. This migration stores content only; it does not publish or send.
create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  asset_type text not null check (asset_type in ('social_post','email_copy','landing_page','advertisement','video_script','blog_article','other')),
  platform text,
  campaign_name text,
  objective text,
  audience text,
  content text not null check (char_length(content) between 1 and 30000),
  status text not null default 'draft' check (status in ('draft','review','approved','archived')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_assets_text_limits check (
    (platform is null or char_length(platform) <= 80)
    and (campaign_name is null or char_length(campaign_name) <= 200)
    and (objective is null or char_length(objective) <= 2000)
    and (audience is null or char_length(audience) <= 1000)
  )
);
create index if not exists marketing_assets_owner_updated_idx
  on public.marketing_assets(user_id, updated_at desc);
alter table public.marketing_assets enable row level security;
drop policy if exists marketing_assets_owner_all on public.marketing_assets;
create policy marketing_assets_owner_all on public.marketing_assets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists marketing_assets_set_updated_at on public.marketing_assets;
create trigger marketing_assets_set_updated_at before update on public.marketing_assets
  for each row execute function public.set_updated_at();
comment on table public.marketing_assets is
  'Owner-private marketing copy drafts and review state. No publishing or external delivery is enabled by this table.';


-- END CANONICAL MIGRATION 0040_marketing_assets.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0041_customer_support_cases.sql
-- ============================================================================

-- Owner-private support case tracking and response drafts; no outbound delivery.
create table if not exists public.customer_support_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null check (char_length(customer_name) between 1 and 200),
  customer_email text,
  subject text not null check (char_length(subject) between 1 and 240),
  issue_description text not null check (char_length(issue_description) between 1 and 10000),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','investigating','waiting_on_customer','resolved','closed')),
  response_draft text,
  internal_notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint customer_support_text_limits check (
    (customer_email is null or char_length(customer_email) <= 320)
    and (response_draft is null or char_length(response_draft) <= 10000)
    and (internal_notes is null or char_length(internal_notes) <= 10000)
    and (source is null or char_length(source) <= 100)
  )
);
create index if not exists customer_support_owner_status_idx
  on public.customer_support_cases(user_id,status,updated_at desc);
alter table public.customer_support_cases enable row level security;
drop policy if exists customer_support_cases_owner_all on public.customer_support_cases;
create policy customer_support_cases_owner_all on public.customer_support_cases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists customer_support_cases_set_updated_at on public.customer_support_cases;
create trigger customer_support_cases_set_updated_at before update on public.customer_support_cases
  for each row execute function public.set_updated_at();
comment on table public.customer_support_cases is
  'Owner-private support case tracker and response drafts. Does not send customer communications.';


-- END CANONICAL MIGRATION 0041_customer_support_cases.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0042_creative_briefs.sql
-- ============================================================================

-- Owner-private creative briefs and generated-asset references. No external publishing.
create table if not exists public.creative_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  asset_type text not null check (asset_type in ('image','video','audio','brand_identity','presentation','other')),
  brief text not null check (char_length(brief) between 1 and 10000),
  generation_prompt text,
  target_platform text,
  aspect_ratio text,
  reference_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(reference_urls) = 'array'),
  status text not null default 'draft' check (status in ('draft','ready','in_progress','complete','archived')),
  output_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_briefs_text_limits check (
    (generation_prompt is null or char_length(generation_prompt) <= 10000)
    and (target_platform is null or char_length(target_platform) <= 100)
    and (aspect_ratio is null or char_length(aspect_ratio) <= 40)
    and (output_url is null or char_length(output_url) <= 2048)
    and (notes is null or char_length(notes) <= 5000)
  )
);
create index if not exists creative_briefs_owner_recent_idx
  on public.creative_briefs(user_id, updated_at desc);
alter table public.creative_briefs enable row level security;
drop policy if exists creative_briefs_owner_all on public.creative_briefs;
create policy creative_briefs_owner_all on public.creative_briefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists creative_briefs_set_updated_at on public.creative_briefs;
create trigger creative_briefs_set_updated_at before update on public.creative_briefs
  for each row execute function public.set_updated_at();
comment on table public.creative_briefs is
  'Owner-private creative briefs, prompts and output references. No publishing or paid asset generation is enabled.';


-- END CANONICAL MIGRATION 0042_creative_briefs.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0043_research_evidence_traceability.sql
-- ============================================================================

-- Research evidence passages and claim-to-source traceability.
-- Stores exact extracted passages and locations; does not assert that a claim is true.

create table if not exists public.research_evidence_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  research_source_id uuid not null references public.research_sources(id) on delete cascade,
  passage_text text not null check (char_length(passage_text) between 1 and 12000),
  locator_type text not null default 'unspecified'
    check (locator_type in ('page','paragraph','section','timestamp','row','cell_range','unspecified')),
  locator_value text check (locator_value is null or char_length(locator_value) <= 300),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  extraction_method text not null default 'manual'
    check (extraction_method in ('manual','pdf_text','html_text','csv_text','transcript','other')),
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed','relevant','irrelevant','disputed')),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (research_source_id, id)
);

create table if not exists public.research_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  claim_text text not null check (char_length(claim_text) between 1 and 3000),
  claim_type text not null default 'finding'
    check (claim_type in ('finding','interpretation','hypothesis','recommendation')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','supported','mixed','contradicted','insufficient_evidence')),
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  passage_id uuid not null references public.research_evidence_passages(id) on delete cascade,
  relationship text not null
    check (relationship in ('supports','contradicts','context')),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 2000),
  created_at timestamptz not null default now(),
  unique (claim_id, passage_id, relationship)
);

create index if not exists research_passages_run_source_idx
  on public.research_evidence_passages(user_id, research_run_id, research_source_id, created_at desc);
create index if not exists research_claims_run_status_idx
  on public.research_claims(user_id, research_run_id, verification_status, updated_at desc);
create index if not exists research_claim_evidence_claim_idx
  on public.research_claim_evidence(user_id, claim_id);

create or replace function public.gigo_check_research_evidence_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_owner uuid;
  source_run uuid;
  claim_owner uuid;
  claim_run uuid;
  passage_owner uuid;
  passage_run uuid;
begin
  if tg_table_name = 'research_evidence_passages' then
    select user_id, research_run_id into source_owner, source_run
      from public.research_sources where id = new.research_source_id;
    if source_owner is distinct from new.user_id or source_run is distinct from new.research_run_id then
      raise exception 'research source ownership or run mismatch' using errcode = '23514';
    end if;
  elsif tg_table_name = 'research_claim_evidence' then
    select user_id, research_run_id into claim_owner, claim_run
      from public.research_claims where id = new.claim_id;
    select user_id, research_run_id into passage_owner, passage_run
      from public.research_evidence_passages where id = new.passage_id;
    if claim_owner is distinct from new.user_id or passage_owner is distinct from new.user_id
      or claim_run is distinct from new.research_run_id or passage_run is distinct from new.research_run_id then
      raise exception 'claim and passage must belong to the same owner and research run' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists research_passages_owner_check on public.research_evidence_passages;
create trigger research_passages_owner_check
  before insert or update of user_id, research_run_id, research_source_id
  on public.research_evidence_passages
  for each row execute function public.gigo_check_research_evidence_ownership();

drop trigger if exists research_claim_evidence_owner_check on public.research_claim_evidence;
create trigger research_claim_evidence_owner_check
  before insert or update of user_id, research_run_id, claim_id, passage_id
  on public.research_claim_evidence
  for each row execute function public.gigo_check_research_evidence_ownership();

drop trigger if exists research_passages_updated_at on public.research_evidence_passages;
create trigger research_passages_updated_at before update on public.research_evidence_passages
  for each row execute function public.set_updated_at();
drop trigger if exists research_claims_updated_at on public.research_claims;
create trigger research_claims_updated_at before update on public.research_claims
  for each row execute function public.set_updated_at();

alter table public.research_evidence_passages enable row level security;
alter table public.research_claims enable row level security;
alter table public.research_claim_evidence enable row level security;

drop policy if exists research_passages_owner_all on public.research_evidence_passages;
create policy research_passages_owner_all on public.research_evidence_passages
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
  );

drop policy if exists research_claims_owner_all on public.research_claims;
create policy research_claims_owner_all on public.research_claims
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
  );

drop policy if exists research_claim_evidence_owner_all on public.research_claim_evidence;
create policy research_claim_evidence_owner_all on public.research_claim_evidence
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_claims c where c.id = claim_id and c.user_id = auth.uid() and c.research_run_id = research_run_id)
    and exists (select 1 from public.research_evidence_passages p where p.id = passage_id and p.user_id = auth.uid() and p.research_run_id = research_run_id)
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_claims c where c.id = claim_id and c.user_id = auth.uid() and c.research_run_id = research_run_id)
    and exists (select 1 from public.research_evidence_passages p where p.id = passage_id and p.user_id = auth.uid() and p.research_run_id = research_run_id)
  );

comment on table public.research_evidence_passages is
  'Exact source passages with optional page/section/timestamp/row locators. Extraction is not verification.';
comment on table public.research_claims is
  'Atomic research claims with explicit verification state; default is unverified.';
comment on table public.research_claim_evidence is
  'Owner-scoped links from claims to exact passages, with support/contradiction/context relationship.';


-- END CANONICAL MIGRATION 0043_research_evidence_traceability.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0044_private_research_documents.sql
-- ============================================================================

-- Private owner-scoped research document metadata. Binary objects live in a private R2 bucket.
create table if not exists public.research_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  object_key text not null unique check (char_length(object_key) between 1 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (content_type in ('text/plain','text/html','text/csv','application/pdf')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  ingestion_status text not null default 'uploaded' check (ingestion_status in ('uploaded','extracted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_documents_owner_run_idx
  on public.research_documents(user_id,research_run_id,created_at desc);
create or replace function public.gigo_check_research_document_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare run_owner uuid;
begin
  select user_id into run_owner from public.research_runs where id=new.research_run_id;
  if run_owner is distinct from new.user_id then
    raise exception 'research document owner/run mismatch' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists research_documents_owner_check on public.research_documents;
create trigger research_documents_owner_check before insert or update of user_id,research_run_id
  on public.research_documents for each row execute function public.gigo_check_research_document_owner();
drop trigger if exists research_documents_updated_at on public.research_documents;
create trigger research_documents_updated_at before update on public.research_documents
  for each row execute function public.set_updated_at();
alter table public.research_documents enable row level security;
revoke all on public.research_documents from public,anon,authenticated;
grant select,insert,delete on public.research_documents to authenticated;
drop policy if exists research_documents_owner_all on public.research_documents;
create policy research_documents_owner_all on public.research_documents for all
  using (user_id=auth.uid() and exists(select 1 from public.research_runs r where r.id=research_run_id and r.user_id=auth.uid()))
  with check (user_id=auth.uid() and exists(select 1 from public.research_runs r where r.id=research_run_id and r.user_id=auth.uid()));
comment on table public.research_documents is 'Private R2-backed research files; object keys are never public URLs.';


-- END CANONICAL MIGRATION 0044_private_research_documents.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0045_research_document_passage_provenance.sql
-- ============================================================================

-- Allow the authenticated owner to update only the extraction lifecycle state.
grant update (ingestion_status) on public.research_documents to authenticated;

-- Connect exact extracted passages to the private uploaded document that produced them.
-- This preserves the existing source -> passage traceability while making document
-- provenance enforceable by the database, not just descriptive JSON metadata.

alter table public.research_evidence_passages
  add column if not exists research_document_id uuid
  references public.research_documents(id) on delete cascade;

create unique index if not exists research_passages_document_locator_uidx
  on public.research_evidence_passages(research_document_id, locator_type, locator_value);

create index if not exists research_passages_document_idx
  on public.research_evidence_passages(user_id, research_document_id, created_at desc)
  where research_document_id is not null;

create or replace function public.gigo_check_research_evidence_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_owner uuid;
  source_run uuid;
  source_url text;
  claim_owner uuid;
  claim_run uuid;
  passage_owner uuid;
  passage_run uuid;
  document_owner uuid;
  document_run uuid;
begin
  if tg_table_name = 'research_evidence_passages' then
    select user_id, research_run_id, url into source_owner, source_run, source_url
      from public.research_sources where id = new.research_source_id;
    if source_owner is distinct from new.user_id or source_run is distinct from new.research_run_id then
      raise exception 'research source ownership or run mismatch' using errcode = '23514';
    end if;
    if source_url like 'gigo://research-document/%' and (
      new.research_document_id is null
      or source_url is distinct from ('gigo://research-document/' || new.research_document_id::text)
    ) then
      raise exception 'private document passages cannot be detached from their source document' using errcode = '23514';
    end if;
    if new.research_document_id is not null then
      select user_id, research_run_id into document_owner, document_run
        from public.research_documents where id = new.research_document_id;
      if document_owner is distinct from new.user_id or document_run is distinct from new.research_run_id
        or source_url is distinct from ('gigo://research-document/' || new.research_document_id::text) then
        raise exception 'research document, source and passage must share owner and run provenance' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'research_claim_evidence' then
    select user_id, research_run_id into claim_owner, claim_run
      from public.research_claims where id = new.claim_id;
    select user_id, research_run_id into passage_owner, passage_run
      from public.research_evidence_passages where id = new.passage_id;
    if claim_owner is distinct from new.user_id or passage_owner is distinct from new.user_id
      or claim_run is distinct from new.research_run_id or passage_run is distinct from new.research_run_id then
      raise exception 'claim and passage must belong to the same owner and research run' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;


drop trigger if exists research_passages_owner_check on public.research_evidence_passages;
create trigger research_passages_owner_check
  before insert or update of user_id, research_run_id, research_source_id, research_document_id
  on public.research_evidence_passages
  for each row execute function public.gigo_check_research_evidence_ownership();

drop policy if exists research_passages_owner_all on public.research_evidence_passages;
create policy research_passages_owner_all on public.research_evidence_passages
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
    and (research_document_id is null or exists (
      select 1 from public.research_documents d
      where d.id = research_document_id and d.user_id = auth.uid() and d.research_run_id = research_run_id
    ))
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
    and (research_document_id is null or exists (
      select 1 from public.research_documents d
      where d.id = research_document_id and d.user_id = auth.uid() and d.research_run_id = research_run_id
    ))
  );

comment on column public.research_evidence_passages.research_document_id is
  'Private uploaded document provenance; must match passage owner/run and the linked gigo://research-document source URL.';


-- END CANONICAL MIGRATION 0045_research_document_passage_provenance.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0046_decodo_web_data_api.sql
-- ============================================================================

-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0046_decodo_web_data_api.sql
-- ============================================================================
-- Decodo Web Data API provider support. Credentials remain in DECODO_API_KEY in the trusted worker environment.
create or replace function public.gigo_create_collection_run(p_actor_key text,p_actor_version integer,p_input jsonb,p_provider_key text,p_dataset_name text default 'Collected data') returns jsonb language plpgsql security invoker set search_path = '' as $$
declare new_job_id uuid; new_run_id uuid; new_dataset_id uuid; safe_actor_key text; safe_provider_key text; safe_dataset_name text; selected_provider_id uuid; selected_capabilities jsonb;
begin
if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
safe_actor_key:=lower(btrim(coalesce(p_actor_key,''))); safe_provider_key:=lower(btrim(coalesce(p_provider_key,''))); safe_dataset_name:=btrim(coalesce(p_dataset_name,'Collected data'));
if safe_actor_key<>'public_page_metadata' or p_actor_version is distinct from 1 or safe_provider_key not in ('crawlee','playwright','gigo_safe_http_batch','decodo') or jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' or octet_length(coalesce(p_input,'{}'::jsonb)::text)>32768 or char_length(safe_dataset_name) not between 1 and 180 then raise exception 'invalid collection run request' using errcode='22023'; end if;
select p.id,p.capabilities into selected_provider_id,selected_capabilities from public.collection_providers p where p.user_id=auth.uid() and p.provider_key=safe_provider_key and p.status='healthy' for share;
if selected_provider_id is null or (coalesce(selected_capabilities,'[]'::jsonb) @> jsonb_build_array('web_fetch')) is not true then raise exception 'provider is not healthy or lacks required actor capability' using errcode='22023'; end if;
insert into public.jobs(user_id,job_type,status,input,progress,run_after,idempotency_key) values(auth.uid(),'collection_run','pending',jsonb_build_object('actor_key',safe_actor_key,'actor_version',p_actor_version,'actor_input',coalesce(p_input,'{}'::jsonb),'provider_key',safe_provider_key),jsonb_build_object('stage','queued'),now(),'collection:'||gen_random_uuid()::text) returning id into new_job_id;
insert into public.collection_runs(user_id,job_id,provider_id,actor_key,actor_version,provider_key,status,input) values(auth.uid(),new_job_id,selected_provider_id,safe_actor_key,p_actor_version,safe_provider_key,'queued',coalesce(p_input,'{}'::jsonb)) returning id into new_run_id;
insert into public.collection_datasets(user_id,run_id,name,metadata) values(auth.uid(),new_run_id,safe_dataset_name,jsonb_build_object('actor_key',safe_actor_key,'actor_version',p_actor_version,'provider_key',safe_provider_key)) returning id into new_dataset_id;
update public.jobs set input=input||jsonb_build_object('collection_run_id',new_run_id,'dataset_id',new_dataset_id,'provider_key',safe_provider_key) where id=new_job_id and user_id=auth.uid();
return jsonb_build_object('job_id',new_job_id,'run_id',new_run_id,'dataset_id',new_dataset_id,'provider_key',safe_provider_key,'status','queued','execution_enabled',false);
end; $$;
revoke all on function public.gigo_create_collection_run(text,integer,jsonb,text,text) from public,anon;
grant execute on function public.gigo_create_collection_run(text,integer,jsonb,text,text) to authenticated;
comment on function public.gigo_create_collection_run(text,integer,jsonb,text,text) is 'Creates a queued public-page metadata run bound to an owner-configured healthy provider. Decodo credentials remain in worker secrets.';

-- END CANONICAL MIGRATION 0046_decodo_web_data_api.sql


-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0047_whop_read_only_sales_events.sql
-- ============================================================================

-- Read-only Whop webhook event ledger. GiGo has no funds, checkout, refund,
-- balance, transfer or payout permissions.

create table if not exists public.whop_webhook_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null unique,
  event_type text not null check (event_type in (
    'payment.succeeded','payment.failed','refund.created','refund.updated',
    'dispute.created','dispute.updated'
  )),
  payment_id text,
  resource_id text,
  product_id text,
  plan_id text,
  partner_id text,
  company_id text,
  amount numeric(18,6),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists whop_webhook_events_owner_received_idx
  on public.whop_webhook_events(owner_id, received_at desc);
create index if not exists whop_webhook_events_owner_payment_idx
  on public.whop_webhook_events(owner_id, payment_id, received_at desc)
  where payment_id is not null;
create index if not exists whop_webhook_events_owner_partner_idx
  on public.whop_webhook_events(owner_id, partner_id, received_at desc)
  where partner_id is not null;

alter table public.whop_webhook_events enable row level security;
drop policy if exists whop_webhook_events_owner_read on public.whop_webhook_events;
create policy whop_webhook_events_owner_read on public.whop_webhook_events
  for select to authenticated using (owner_id = auth.uid());

revoke all on public.whop_webhook_events from anon, authenticated;
grant select on public.whop_webhook_events to authenticated;
grant all on public.whop_webhook_events to service_role;

comment on table public.whop_webhook_events is
  'Immutable, deduplicated, read-only Whop event ledger for owner sales reporting. No payment or payout actions are exposed to GiGo.';

-- ============================================================================
-- END CANONICAL MIGRATION 0047_whop_read_only_sales_events.sql
-- ============================================================================


DO $gigo_postflight$
BEGIN
  IF to_regclass('public.collection_providers') IS NULL
     OR to_regclass('public.outreach_campaigns') IS NULL
     OR to_regclass('public.outreach_templates') IS NULL
     OR to_regclass('public.marketing_assets') IS NULL
     OR to_regclass('public.customer_support_cases') IS NULL
     OR to_regclass('public.creative_briefs') IS NULL
     OR to_regclass('public.research_documents') IS NULL THEN
    RAISE EXCEPTION 'GiGo postflight failed: one or more expected tables are missing. Transaction will roll back.';
  END IF;
END;
$gigo_postflight$;

COMMIT;
