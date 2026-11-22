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

  select p_counters || jsonb_build_object('items', d.item_count)
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
      jsonb_build_object('stage','collection_running','counters',cumulative_counters,'checkpoint',p_checkpoint,
        'heartbeat_at',now(),'collection_lease_expires_at',now() + interval '120 seconds')
    where id = p_job_id;
  return true;
end;
$$;

revoke all on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) to service_role;

comment on function public.gigo_collection_worker_progress(uuid, uuid, jsonb, jsonb) is
  'Persists cumulative page/request checkpoints and derives item totals from the idempotent dataset count across retries.';
