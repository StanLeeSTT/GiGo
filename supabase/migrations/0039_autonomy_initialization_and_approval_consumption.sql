-- Owner initialization and atomic quota consumption for durable autonomy.
-- Initialization starts paused; it never enables external execution.

create or replace function public.gigo_initialize_autonomy_defaults()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  pause_value boolean;
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.autonomy_control_state(user_id,is_paused,pause_reason,paused_at,updated_at)
  values(owner_id,true,'Initial safety pause',now(),now())
  on conflict(user_id) do nothing;

  insert into public.autonomy_policies(user_id,scope,enabled,require_approval,limits)
  values
    (owner_id,'observe',true,false,'{}'::jsonb),
    (owner_id,'analyse',true,false,'{}'::jsonb),
    (owner_id,'draft',true,false,'{}'::jsonb),
    (owner_id,'internal_execute',true,false,'{}'::jsonb),
    (owner_id,'external_execute',false,true,'{}'::jsonb)
  on conflict(user_id,scope) do nothing;

  select is_paused into pause_value from public.autonomy_control_state where user_id = owner_id;
  return jsonb_build_object('initialized',true,'is_paused',coalesce(pause_value,true),'external_execute_enabled',false);
end;
$$;

create or replace function public.gigo_consume_autonomy_approval(
  p_owner_id uuid,
  p_approval_id uuid,
  p_tool_name text,
  p_target_ref text,
  p_parameters_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := coalesce(auth.role(),'');
begin
  if caller_role <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_owner_id is null or p_approval_id is null
    or p_tool_name is null or char_length(p_tool_name) > 120
    or p_target_ref is null or char_length(p_target_ref) > 500
    or p_parameters_sha256 is null or p_parameters_sha256 !~ '^[0-9a-f]{64}
    raise exception 'invalid approval consumption request' using errcode = '22023';
  end if;

  -- Defense in depth: approval consumption cannot bypass the global pause,
  -- the external scope policy, or the permanent financial-action deny.
  if p_tool_name ~* '(^|[._-])(payment|payments|transfer|withdraw|deposit|purchase|checkout|refund|payout|trade|trading|invest|loan|subscription|charge|billing)([._-]|$)' then
    return false;
  end if;
  if not exists (
    select 1 from public.autonomy_control_state
    where user_id = p_owner_id and is_paused = false
  ) then
    return false;
  end if;
  if not exists (
    select 1 from public.autonomy_policies
    where user_id = p_owner_id and scope = 'external_execute'
      and enabled = true and require_approval = true
  ) then
    return false;
  end if;

  update public.autonomy_approvals
    set used_actions = used_actions + 1
    where id = p_approval_id
      and user_id = p_owner_id
      and tool_name = p_tool_name
      and target_ref = p_target_ref
      and parameters_sha256 = p_parameters_sha256
      and revoked_at is null
      and expires_at > now()
      and used_actions < max_actions;

  return found;
end;
$$;

revoke all on function public.gigo_initialize_autonomy_defaults() from public, anon;
grant execute on function public.gigo_initialize_autonomy_defaults() to authenticated;
revoke all on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) to service_role;

comment on function public.gigo_initialize_autonomy_defaults() is
  'Initializes owner autonomy policy with global pause enabled and external execution disabled.';
comment on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) is
  'Atomically consumes one exact target and parameter-bound external approval; service role only.';
 then
    raise exception 'invalid approval consumption request' using errcode = '22023';
  end if;

  update public.autonomy_approvals
    set used_actions = used_actions + 1
    where id = p_approval_id
      and user_id = p_owner_id
      and tool_name = p_tool_name
      and target_ref = p_target_ref
      and parameters_sha256 = p_parameters_sha256
      and revoked_at is null
      and expires_at > now()
      and used_actions < max_actions;

  return found;
end;
$$;

revoke all on function public.gigo_initialize_autonomy_defaults() from public, anon;
grant execute on function public.gigo_initialize_autonomy_defaults() to authenticated;
revoke all on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) to service_role;

comment on function public.gigo_initialize_autonomy_defaults() is
  'Initializes owner autonomy policy with global pause enabled and external execution disabled.';
comment on function public.gigo_consume_autonomy_approval(uuid,uuid,text,text,text) is
  'Atomically consumes one exact target and parameter-bound external approval; service role only.';
