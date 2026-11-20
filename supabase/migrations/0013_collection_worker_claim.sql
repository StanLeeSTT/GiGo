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
