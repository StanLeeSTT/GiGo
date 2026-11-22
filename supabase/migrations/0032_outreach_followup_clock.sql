-- Follow-up clocks begin when the previous message is accepted by the provider,
-- not when the sequence was prepared. Claiming also requires the predecessor sent.

create or replace function public.gigo_schedule_next_outreach_followup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.outreach_campaigns%rowtype;
  delay_days integer;
begin
  if old.status is distinct from 'sending' or new.status is distinct from 'sent'
     or new.message_type not in ('initial','follow_up') then
    return new;
  end if;

  select * into campaign_row
    from public.outreach_campaigns c
    where c.id = new.campaign_id and c.user_id = new.user_id;
  if not found or campaign_row.status <> 'active'
     or campaign_row.approval_status <> 'approved'
     or campaign_row.followups_enabled is not true then
    return new;
  end if;

  delay_days := campaign_row.followup_delays_days[new.sequence_number + 1];
  if delay_days is null then
    return new;
  end if;

  update public.outreach_messages next_message
    set scheduled_for = new.sent_at + make_interval(days => delay_days)
    where next_message.recipient_id = new.recipient_id
      and next_message.user_id = new.user_id
      and next_message.sequence_number = new.sequence_number + 1
      and next_message.message_type = 'follow_up'
      and next_message.status = 'queued'
      and next_message.template_id is not null;

  return new;
end;
$$;

drop trigger if exists outreach_schedule_next_followup on public.outreach_messages;
create trigger outreach_schedule_next_followup
  after update of status on public.outreach_messages
  for each row
  when (new.status = 'sent')
  execute function public.gigo_schedule_next_outreach_followup();

create or replace function public.gigo_claim_due_outreach_messages(
  p_limit integer default 1,
  p_lease_seconds integer default 120
)
returns setof public.outreach_messages
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.outreach_messages
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error = 'Worker lease expired; delivery outcome is uncertain and requires reconciliation.'
    where status = 'sending'
      and lease_expires_at is not null
      and lease_expires_at <= now();

  return query
    with candidates as (
      select m.id
      from public.outreach_messages m
      join public.outreach_campaigns c
        on c.id = m.campaign_id and c.user_id = m.user_id
      join public.outreach_recipients r
        on r.id = m.recipient_id and r.user_id = m.user_id and r.campaign_id = m.campaign_id
      join public.outreach_templates t
        on t.id = m.template_id and t.user_id = m.user_id and t.campaign_id = m.campaign_id
      where m.status = 'queued'
        and m.scheduled_for <= now()
        and m.attempt_count < 5
        and m.to_email = lower(r.email)
        and c.status = 'active'
        and c.approval_status = 'approved'
        and c.approved_at is not null
        and c.initial_send_enabled = true
        and m.sequence_number < c.max_messages_per_recipient
        and t.approved_at is not null
        and t.sequence_number = m.sequence_number
        and t.message_type = m.message_type
        and (
          (m.message_type = 'initial' and m.sequence_number = 0
            and r.status in ('queued','ready'))
          or
          (m.message_type = 'follow_up' and m.sequence_number > 0
            and c.followups_enabled = true and r.status = 'contacted'
            and exists (
              select 1 from public.outreach_messages previous
              where previous.recipient_id = m.recipient_id
                and previous.user_id = m.user_id
                and previous.sequence_number = m.sequence_number - 1
                and previous.status = 'sent'
            ))
        )
        and not exists (
          select 1 from public.outreach_suppressions s
          where s.user_id = m.user_id and lower(s.email) = lower(r.email)
        )
        and not exists (
          select 1 from public.outreach_messages active
          where active.recipient_id = m.recipient_id
            and active.status = 'sending'
        )
        and (
          case
            when c.send_window_start < c.send_window_end
              then (now() at time zone c.timezone)::time >= c.send_window_start
               and (now() at time zone c.timezone)::time < c.send_window_end
            else (now() at time zone c.timezone)::time >= c.send_window_start
              or (now() at time zone c.timezone)::time < c.send_window_end
          end
        )
        and (
          c.quiet_hours_start is null or c.quiet_hours_end is null
          or not (
            case
              when c.quiet_hours_start < c.quiet_hours_end
                then (now() at time zone c.timezone)::time >= c.quiet_hours_start
                 and (now() at time zone c.timezone)::time < c.quiet_hours_end
              else (now() at time zone c.timezone)::time >= c.quiet_hours_start
                or (now() at time zone c.timezone)::time < c.quiet_hours_end
            end
          )
        )
      order by m.scheduled_for asc, m.created_at asc
      limit greatest(1, least(coalesce(p_limit,1),10))
      for update of m, r skip locked
    )
    update public.outreach_messages m
      set status = 'sending',
          lease_token = gen_random_uuid(),
          lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds,120),600))),
          attempt_count = m.attempt_count + 1,
          last_error = null
      from candidates
      where m.id = candidates.id
      returning m.*;
end;
$$;

revoke all on function public.gigo_claim_due_outreach_messages(integer,integer) from public, anon, authenticated;
grant execute on function public.gigo_claim_due_outreach_messages(integer,integer) to service_role;

comment on function public.gigo_schedule_next_outreach_followup() is
  'Starts each follow-up delay from the provider-accepted timestamp of its immediate predecessor.';
