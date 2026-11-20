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
as $
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
returns boolean
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

  if not found then return false; end if;
  retry_allowed := current_attempts < 5;

  update public.collection_runs
    set status = case when retry_allowed then 'queued' else 'failed' end,
        error = p_error,
        finished_at = case when retry_allowed then null else now() end
    where id = target_run_id and user_id = owner_id and job_id = p_job_id and status = 'running';

  if not found then return false; end if;

  update public.jobs
    set status = case when retry_allowed then 'waiting_for_worker' else 'failed' end,
        run_after = case when retry_allowed then now() + make_interval(secs => greatest(30, least(coalesce(p_delay_seconds,300),86400))) else run_after end,
        finished_at = case when retry_allowed then null else now() end,
        last_error = left(coalesce(p_error->>'message','Collection worker requested a retry.'), 1000),
        progress = (coalesce(progress, '{}'::jsonb) - 'collection_lease_token' - 'collection_lease_expires_at') ||
          jsonb_build_object('stage',case when retry_allowed then 'retry_scheduled' else 'failed' end,'retry_scheduled_at',now())
    where id = p_job_id;
  return true;
end;
$;

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
