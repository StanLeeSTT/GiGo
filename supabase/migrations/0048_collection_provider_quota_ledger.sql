-- Durable, owner-controlled monthly request quotas for paid collection providers.
-- Reservations are made under the live collection-job lease before every external call.
create table if not exists public.collection_provider_quota_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null check (provider_key in ('apify','decodo')),
  enabled boolean not null default false,
  monthly_request_limit integer not null default 0 check (monthly_request_limit between 0 and 100000),
  max_cost_per_run_usd numeric(10,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_key),
  check (max_cost_per_run_usd is null or max_cost_per_run_usd between 0.0001 and 100),
  check (not enabled or monthly_request_limit > 0),
  check (not enabled or provider_key <> 'apify' or max_cost_per_run_usd is not null),
  check (provider_key <> 'decodo' or max_cost_per_run_usd is null)
);
create table if not exists public.collection_provider_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null check (provider_key in ('apify','decodo')),
  period_start date not null,
  requests_reserved integer not null default 0 check (requests_reserved >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_key, period_start)
);
alter table public.collection_provider_quota_policies enable row level security;
alter table public.collection_provider_usage_monthly enable row level security;
drop policy if exists collection_provider_quota_owner_all on public.collection_provider_quota_policies;
create policy collection_provider_quota_owner_all on public.collection_provider_quota_policies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists collection_provider_usage_owner_read on public.collection_provider_usage_monthly;
create policy collection_provider_usage_owner_read on public.collection_provider_usage_monthly
  for select using (user_id = auth.uid());
revoke all on public.collection_provider_quota_policies from public, anon;
revoke all on public.collection_provider_usage_monthly from public, anon, authenticated;
grant select, insert, update, delete on public.collection_provider_quota_policies to authenticated;
grant select on public.collection_provider_usage_monthly to authenticated;
grant all on public.collection_provider_usage_monthly to service_role;
grant all on public.collection_provider_quota_policies to service_role;
create or replace function public.gigo_reserve_collection_provider_usage(p_job_id uuid,p_lease_token uuid,p_units integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid; target_provider_key text; policy_row public.collection_provider_quota_policies%rowtype; target_period date := date_trunc('month', now())::date; new_total integer;
begin
  if p_job_id is null or p_lease_token is null or p_units is null or p_units < 1 or p_units > 100 then raise exception 'invalid collection quota reservation' using errcode = '22023'; end if;
  select r.user_id,r.provider_key into target_user_id,target_provider_key
    from public.collection_runs r join public.jobs j on j.id=r.job_id and j.user_id=r.user_id
    where r.job_id=p_job_id and j.status='processing'
      and j.progress->>'collection_lease_token'=p_lease_token::text
      and coalesce((j.progress->>'collection_lease_expires_at')::timestamptz,'-infinity'::timestamptz)>now()
    for update of j;
  if target_user_id is null or target_provider_key not in ('apify','decodo') then raise exception 'collection lease is invalid or provider is not quota-managed' using errcode = '42501'; end if;
  select * into policy_row from public.collection_provider_quota_policies where user_id=target_user_id and provider_key=target_provider_key for update;
  if not found or not policy_row.enabled or policy_row.monthly_request_limit<1 then raise exception 'provider monthly quota is not enabled' using errcode = '55000'; end if;
  insert into public.collection_provider_usage_monthly(user_id,provider_key,period_start,requests_reserved) values(target_user_id,target_provider_key,target_period,0) on conflict(user_id,provider_key,period_start) do nothing;
  update public.collection_provider_usage_monthly set requests_reserved=requests_reserved+p_units,updated_at=now()
    where user_id=target_user_id and provider_key=target_provider_key and period_start=target_period
      and requests_reserved+p_units<=policy_row.monthly_request_limit returning requests_reserved into new_total;
  if new_total is null then raise exception 'provider monthly request quota exhausted' using errcode = '54000'; end if;
  return jsonb_build_object('reserved',true,'provider_key',target_provider_key,'period_start',target_period,
    'requests_reserved',new_total,'requests_remaining',policy_row.monthly_request_limit-new_total,
    'max_cost_per_run_usd',policy_row.max_cost_per_run_usd);
end; $$;
revoke all on function public.gigo_reserve_collection_provider_usage(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.gigo_reserve_collection_provider_usage(uuid,uuid,integer) to service_role;
comment on table public.collection_provider_quota_policies is 'Owner-controlled monthly hard request limits. Providers remain disabled until the owner explicitly enables a quota policy.';
comment on function public.gigo_reserve_collection_provider_usage(uuid,uuid,integer) is 'Atomically reserves monthly provider request capacity under a live collection job lease. Apify also receives a per-run USD cap.';
