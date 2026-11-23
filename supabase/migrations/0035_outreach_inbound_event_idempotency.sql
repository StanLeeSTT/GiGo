-- Make inbound provider-event deduplication race-safe and account-scoped.
alter table public.outreach_events
  add column if not exists provider text,
  add column if not exists provider_account_id text,
  add column if not exists provider_event_id text;

alter table public.outreach_events
  drop constraint if exists outreach_events_provider_identity_consistency;
alter table public.outreach_events
  add constraint outreach_events_provider_identity_consistency
  check (
    (provider is null and provider_account_id is null and provider_event_id is null)
    or
    (provider is not null and char_length(provider) between 1 and 80
      and provider_account_id is not null and char_length(provider_account_id) between 1 and 200
      and provider_event_id is not null and char_length(provider_event_id) between 1 and 300)
  );

create unique index if not exists outreach_events_provider_delivery_unique
  on public.outreach_events(provider, provider_account_id, provider_event_id)
  where provider_event_id is not null;

revoke all on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) from public, anon, authenticated;
drop function if exists public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text);

create or replace function public.gigo_record_outreach_recipient_event(
  p_recipient_id uuid,
  p_event_type text,
  p_email text,
  p_detail text,
  p_provider text,
  p_provider_account_id text,
  p_provider_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
  event_row_id uuid;
  normalized_email text := lower(trim(coalesce(p_email,'')));
  provider_value text := lower(trim(coalesce(p_provider,'')));
  account_value text := trim(coalesce(p_provider_account_id,''));
  event_value text := trim(coalesce(p_provider_event_id,''));
  new_status text;
  suppression_reason text;
  cancelled_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'trusted service execution required' using errcode = '42501';
  end if;
  if p_event_type is null or p_event_type not in ('reply_received','bounce_received','unsubscribe_received','complaint_received') then
    raise exception 'unsupported inbound event type' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'valid recipient email required' using errcode = '22023';
  end if;
  if provider_value = '' or char_length(provider_value) > 80
    or account_value = '' or char_length(account_value) > 200
    or event_value = '' or char_length(event_value) > 300 then
    raise exception 'verified provider account and event identity are required' using errcode = '22023';
  end if;
  if p_detail is not null and char_length(p_detail) > 3000 then
    raise exception 'event detail too long' using errcode = '22023';
  end if;

  select * into recipient_row from public.outreach_recipients r
    where r.id = p_recipient_id for update;
  if not found or lower(recipient_row.email) <> normalized_email then
    raise exception 'recipient not found or email mismatch' using errcode = 'P0002';
  end if;

  insert into public.outreach_events(
    user_id,campaign_id,recipient_id,event_type,detail,provider,provider_account_id,provider_event_id,event_data
  ) values (
    recipient_row.user_id,recipient_row.campaign_id,recipient_row.id,p_event_type,
    left(coalesce(p_detail,'Inbound provider event recorded.'),3000),
    provider_value,account_value,event_value,jsonb_build_object('processing','started')
  )
  on conflict (provider,provider_account_id,provider_event_id) where provider_event_id is not null
  do nothing
  returning id into event_row_id;

  if event_row_id is null then
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'duplicate_event',true,'cancelled_followups',0);
  end if;

  if p_event_type = 'reply_received' then
    new_status := 'replied';
  elsif p_event_type = 'bounce_received' then
    new_status := 'bounced';
    suppression_reason := 'hard_bounce';
  elsif p_event_type = 'unsubscribe_received' then
    new_status := 'unsubscribed';
    suppression_reason := 'unsubscribe';
  else
    new_status := 'complained';
    suppression_reason := 'complaint';
  end if;

  if suppression_reason is not null then
    insert into public.outreach_suppressions(user_id,email,reason,source)
    values(recipient_row.user_id,normalized_email,suppression_reason,'provider_event:' || p_event_type)
    on conflict do nothing;
  end if;

  if recipient_row.status in ('replied','bounced','unsubscribed','complained','cancelled','completed') then
    update public.outreach_events set event_data = jsonb_build_object('already_terminal',true,'cancelled_followups',0)
      where id = event_row_id;
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'already_terminal',true,'cancelled_followups',0);
  end if;

  update public.outreach_recipients
    set status = new_status, stop_reason = p_event_type, next_action_at = null
    where id = recipient_row.id and user_id = recipient_row.user_id;

  update public.outreach_messages
    set status = 'cancelled', last_error = 'Sequence stopped after ' || p_event_type || '.',
        lease_token = null, lease_expires_at = null
    where recipient_id = recipient_row.id and user_id = recipient_row.user_id
      and status = 'queued' and sequence_number > 0;
  get diagnostics cancelled_count = row_count;

  update public.outreach_events
    set event_data = jsonb_build_object('cancelled_followups',cancelled_count,'processed',true)
    where id = event_row_id;

  return jsonb_build_object('recipient_id',recipient_row.id,'status',new_status,
    'already_terminal',false,'cancelled_followups',cancelled_count);
end;
$$;

revoke all on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text,text) to service_role;

comment on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text,text) is
  'Service-role-only inbound event handler. The provider adapter must verify webhook signature and account identity before calling. Unique provider/account/event identity makes duplicate delivery race-safe.';
