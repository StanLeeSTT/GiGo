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

revoke all on public.autonomy_audit_events from public, anon, authenticated, service_role;\ngrant select, insert on public.autonomy_audit_events to service_role;\n\ncreate or replace function public.gigo_revoke_autonomy_approval(p_approval_id uuid)\nreturns boolean\nlanguage plpgsql\nsecurity definer\nset search_path = ''\nas $\ndeclare owner_id uuid := auth.uid();\nbegin\n  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;\n  update public.autonomy_approvals set revoked_at = now()\n    where id = p_approval_id and user_id = owner_id and revoked_at is null;\n  return found;\nend;\n$;\n\nrevoke all on function public.gigo_revoke_autonomy_approval(uuid) from public, anon;\ngrant execute on function public.gigo_revoke_autonomy_approval(uuid) to authenticated;\n\nrevoke all on function public.gigo_set_autonomy_policy(text,boolean,boolean,jsonb) from public, anon;
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
