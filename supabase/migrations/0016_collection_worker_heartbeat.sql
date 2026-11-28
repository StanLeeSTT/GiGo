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
