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
-- Lock the run and job rows in one transaction to avoid cancelling a job
-- after the scheduler has already claimed it.
create or replace function public.gigo_cancel_collection_run(p_run_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_job_id uuid;
  target_job_status text;
begin
  select r.job_id
    into target_job_id
    from public.collection_runs r
    where r.id = p_run_id
      and r.user_id = auth.uid()
      and r.status in ('queued','waiting_for_quota')
    for update;

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
