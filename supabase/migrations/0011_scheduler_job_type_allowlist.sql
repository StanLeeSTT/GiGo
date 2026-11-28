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
