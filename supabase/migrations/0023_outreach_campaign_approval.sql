-- Atomic, explicit owner approval for a bounded outreach campaign.
create or replace function public.gigo_approve_outreach_campaign(
  p_campaign_id uuid,
  p_sender_email text,
  p_sender_name text,
  p_max_recipients integer,
  p_max_messages_per_recipient integer,
  p_initial_send_enabled boolean,
  p_followups_enabled boolean,
  p_followup_delays_days integer[],
  p_send_window_start time,
  p_send_window_end time,
  p_timezone text,
  p_quiet_hours_start time,
  p_quiet_hours_end time
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recipient_total integer;
  campaign_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_sender_email is null or char_length(p_sender_email) > 320
     or p_sender_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_sender_name is null or char_length(p_sender_name) > 200
     or p_max_recipients is null or p_max_recipients < 1 or p_max_recipients > 10000
     or p_max_messages_per_recipient is null or p_max_messages_per_recipient < 1 or p_max_messages_per_recipient > 6
     or p_initial_send_enabled is distinct from true
     or p_followups_enabled is null
     or coalesce(cardinality(p_followup_delays_days),0) > 5
     or not (coalesce(p_followup_delays_days, '{}'::integer[]) <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30])
     or (p_followups_enabled and coalesce(cardinality(p_followup_delays_days),0) = 0)
     or (not p_followups_enabled and coalesce(cardinality(p_followup_delays_days),0) <> 0)
     or p_timezone is null or char_length(p_timezone) > 100
     or p_send_window_start is null or p_send_window_end is null then
    raise exception 'invalid campaign authorization policy' using errcode = '22023';
  end if;

  select c.status into campaign_status
    from public.outreach_campaigns c
    where c.id = p_campaign_id and c.user_id = auth.uid()
    for update;
  if not found then return false; end if;
  if campaign_status not in ('draft','awaiting_approval','paused') then
    raise exception 'campaign cannot be approved in its current state' using errcode = '22023';
  end if;

  select count(*) into recipient_total
    from public.outreach_recipients r
    where r.campaign_id = p_campaign_id and r.user_id = auth.uid()
      and r.status not in ('unsubscribed','complained','bounced','cancelled');
  if recipient_total < 1 or recipient_total > p_max_recipients then
    raise exception 'recipient count is outside the approved campaign limit' using errcode = '22023';
  end if;

  update public.outreach_campaigns
    set approval_status = 'approved',
        approved_sender_email = lower(btrim(p_sender_email)),
        approved_sender_name = btrim(p_sender_name),
        max_recipients = p_max_recipients,
        max_messages_per_recipient = p_max_messages_per_recipient,
        initial_send_enabled = p_initial_send_enabled,
        followups_enabled = p_followups_enabled,
        followup_delays_days = coalesce(p_followup_delays_days, '{}'::integer[]),
        send_window_start = p_send_window_start,
        send_window_end = p_send_window_end,
        timezone = p_timezone,
        quiet_hours_start = p_quiet_hours_start,
        quiet_hours_end = p_quiet_hours_end,
        approved_policy = jsonb_build_object(
          'sender_email', lower(btrim(p_sender_email)),
          'sender_name', btrim(p_sender_name),
          'max_recipients', p_max_recipients,
          'max_messages_per_recipient', p_max_messages_per_recipient,
          'initial_send_enabled', p_initial_send_enabled,
          'followups_enabled', p_followups_enabled,
          'followup_delays_days', to_jsonb(coalesce(p_followup_delays_days, '{}'::integer[])),
          'send_window_start', p_send_window_start,
          'send_window_end', p_send_window_end,
          'timezone', p_timezone,
          'quiet_hours_start', p_quiet_hours_start,
          'quiet_hours_end', p_quiet_hours_end
        ),
        approved_at = now(),
        approval_revoked_at = null,
        status = 'active'
    where id = p_campaign_id and user_id = auth.uid();

  insert into public.outreach_events(user_id, campaign_id, event_type, detail, event_data)
    values (auth.uid(), p_campaign_id, 'campaign_approved',
      'Owner approved a bounded outreach policy.',
      jsonb_build_object('max_recipients',p_max_recipients,'max_messages_per_recipient',p_max_messages_per_recipient));

  return true;
end;
$$;

revoke all on function public.gigo_approve_outreach_campaign(uuid,text,text,integer,integer,boolean,boolean,integer[],time,time,text,time,time) from public, anon;
grant execute on function public.gigo_approve_outreach_campaign(uuid,text,text,integer,integer,boolean,boolean,integer[],time,time,text,time,time) to authenticated;
