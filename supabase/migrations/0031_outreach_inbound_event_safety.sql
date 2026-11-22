-- Durable inbound outreach events stop queued follow-ups and enforce suppressions.
-- Provider webhook signature verification belongs in a future provider adapter.

create or replace function public.gigo_record_outreach_recipient_event(
  p_recipient_id uuid,
  p_event_type text,
  p_email text,
  p_detail text default null,
  p_provider text default null,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
  normalized_email text := lower(trim(coalesce(p_email,'')));
  new_status text;
  suppression_reason text;
  cancelled_count integer := 0;
begin
  if p_event_type is null or p_event_type not in ('reply_received','bounce_received','unsubscribe_received','complaint_received') then
    raise exception 'unsupported inbound event type' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'valid recipient email required' using errcode = '22023';
  end if;
  if p_detail is not null and char_length(p_detail) > 3000 then
    raise exception 'event detail too long' using errcode = '22023';
  end if;

  select * into recipient_row
    from public.outreach_recipients r
    where r.id = p_recipient_id
    for update;
  if not found or lower(recipient_row.email) <> normalized_email then
    raise exception 'recipient not found or email mismatch' using errcode = 'P0002';
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

  if p_provider_event_id is not null and exists (
    select 1 from public.outreach_events e
    where e.user_id = recipient_row.user_id
      and e.event_data->>'provider' = p_provider
      and e.event_data->>'provider_event_id' = p_provider_event_id
  ) then
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'duplicate_event',true,'cancelled_followups',0);
  end if;

  if suppression_reason is not null then
    insert into public.outreach_suppressions(user_id,email,reason,source)
    values(recipient_row.user_id,normalized_email,suppression_reason,'provider_event:' || p_event_type)
    on conflict (user_id,email) do nothing;
  end if;

  if recipient_row.status in ('replied','bounced','unsubscribed','complained','cancelled','completed') then
    return jsonb_build_object('recipient_id',recipient_row.id,'status',recipient_row.status,'already_terminal',true,'cancelled_followups',0);
  end if;

  update public.outreach_recipients
    set status = new_status,
        stop_reason = p_event_type,
        next_action_at = null
    where id = recipient_row.id and user_id = recipient_row.user_id;

  update public.outreach_messages
    set status = 'cancelled',
        last_error = 'Sequence stopped after ' || p_event_type || '.',
        lease_token = null,
        lease_expires_at = null
    where recipient_id = recipient_row.id
      and user_id = recipient_row.user_id
      and status = 'queued'
      and sequence_number > 0;
  get diagnostics cancelled_count = row_count;

  insert into public.outreach_events(user_id,campaign_id,recipient_id,event_type,detail,event_data)
  values(
    recipient_row.user_id,recipient_row.campaign_id,recipient_row.id,p_event_type,
    left(coalesce(p_detail,'Inbound provider event recorded.'),3000),
    jsonb_build_object('provider',p_provider,'provider_event_id',p_provider_event_id,'cancelled_followups',cancelled_count)
  );

  return jsonb_build_object('recipient_id',recipient_row.id,'status',new_status,'already_terminal',false,'cancelled_followups',cancelled_count);
end;
$$;

revoke all on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) to service_role;

comment on function public.gigo_record_outreach_recipient_event(uuid,text,text,text,text,text) is
  'Service-role-only inbound event handler. Provider webhook signature validation must occur before calling it. Replies stop follow-ups; bounces, unsubscribes and complaints also create permanent owner-scoped suppressions.';
