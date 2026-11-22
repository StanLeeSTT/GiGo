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
