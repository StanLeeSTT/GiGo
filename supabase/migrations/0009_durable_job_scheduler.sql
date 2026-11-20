-- GiGo durable scheduler and atomic job claiming.
-- Only the server-side service_role may call these SECURITY DEFINER functions.
-- Keep the service role key exclusively in Cloudflare Worker secrets.

create or replace function public.gigo_dispatch_due_schedules(p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  schedule_row public.operation_schedules%rowtype;
  local_now timestamp;
  target_local timestamp;
  target_time time;
  tz text;
  target_day integer;
  minutes integer;
  next_at timestamptz;
  run_key text;
  dispatched integer := 0;
begin
  for schedule_row in
    select *
    from public.operation_schedules
    where is_enabled = true
      and schedule_type in ('interval','daily','weekly')
      and coalesce(next_run_at, now()) <= now()
    order by coalesce(next_run_at, created_at), created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 20))
  loop
    run_key := 'schedule:' || schedule_row.id::text || ':' ||
      to_char(coalesce(schedule_row.next_run_at, now()), 'YYYYMMDDHH24MISS');

    insert into public.jobs (user_id, job_type, status, input, run_after, idempotency_key)
    values (
      schedule_row.user_id,
      schedule_row.job_type,
      'pending',
      coalesce(schedule_row.job_input, '{}'::jsonb),
      now(),
      run_key
    )
    on conflict (user_id, idempotency_key) do nothing;

    if schedule_row.schedule_type = 'interval' then
      minutes := greatest(5, least(coalesce((schedule_row.schedule_config->>'interval_minutes')::integer, 60), 10080));
      next_at := coalesce(schedule_row.next_run_at, now()) + make_interval(mins => minutes);
      if next_at <= now() then next_at := now() + make_interval(mins => minutes); end if;
    else
      tz := coalesce(nullif(schedule_row.schedule_config->>'timezone', ''), 'UTC');
      local_now := now() at time zone tz;
      target_time := coalesce(nullif(schedule_row.schedule_config->>'time', ''), '08:00')::time;
      target_local := local_now::date + target_time;

      if schedule_row.schedule_type = 'daily' then
        if target_local <= local_now then target_local := target_local + interval '1 day'; end if;
      else
        target_day := greatest(1, least(coalesce((schedule_row.schedule_config->>'day_of_week')::integer, 1), 7));
        target_local := target_local + ((target_day - extract(isodow from local_now)::integer + 7) % 7) * interval '1 day';
        if target_local <= local_now then target_local := target_local + interval '7 days'; end if;
      end if;
      next_at := target_local at time zone tz;
    end if;

    update public.operation_schedules
      set last_run_at = now(), next_run_at = next_at
      where id = schedule_row.id and user_id = schedule_row.user_id;

    dispatched := dispatched + 1;
  end loop;

  return dispatched;
end;
$$;

create or replace function public.gigo_claim_due_jobs(p_limit integer default 5)
returns setof public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Recover work abandoned by a terminated worker after a conservative timeout.
  update public.jobs
    set status = case when attempts >= 5 then 'failed' else 'waiting_for_worker' end,
        run_after = now(),
        finished_at = case when attempts >= 5 then now() else null end,
        last_error = 'Recovered after an interrupted worker execution.'
    where status = 'processing'
      and updated_at < now() - interval '20 minutes';

  return query
    with candidates as (
      select id
      from public.jobs
      where status in ('pending','waiting_for_worker','waiting_for_quota')
        and run_after <= now()
        and attempts < 5
      order by run_after asc, created_at asc
      for update skip locked
      limit greatest(1, least(coalesce(p_limit, 5), 10))
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

revoke all on function public.gigo_dispatch_due_schedules(integer) from public, anon, authenticated;
revoke all on function public.gigo_claim_due_jobs(integer) from public, anon, authenticated;
grant execute on function public.gigo_dispatch_due_schedules(integer) to service_role;
grant execute on function public.gigo_claim_due_jobs(integer) to service_role;
