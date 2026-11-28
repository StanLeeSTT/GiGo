-- Durable outbox lease, claim and completion functions for a future approved email worker.
-- These RPCs do not connect to or call an email provider.

alter table public.outreach_messages
  add column if not exists template_id uuid,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outreach_messages_template_owner_fk'
      and conrelid = 'public.outreach_messages'::regclass
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_template_owner_fk
      foreign key (template_id, user_id)
      references public.outreach_templates(id, user_id)
      on delete set null (template_id);
  end if;
end;
$$;

create index if not exists outreach_messages_claim_idx
  on public.outreach_messages(status, scheduled_for, created_at)
  where status = 'queued';

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
  -- Expired leases are ambiguous: do not blindly resend and risk duplicate email.
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
            and c.followups_enabled = true and r.status = 'contacted')
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

create or replace function public.gigo_finish_outreach_message(
  p_message_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null,
  p_retryable boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.outreach_messages%rowtype;
begin
  if p_outcome not in ('sent','failed') then
    raise exception 'invalid message outcome' using errcode = '22023';
  end if;
  select m.* into message_row
    from public.outreach_messages m
    where m.id = p_message_id and m.status = 'sending'
      and m.lease_token = p_lease_token
      and m.lease_expires_at > now()
    for update;
  if not found then return false; end if;

  if p_outcome = 'sent' then
    update public.outreach_messages
      set status = 'sent', sent_at = now(), provider = p_provider,
          provider_message_id = p_provider_message_id,
          lease_token = null, lease_expires_at = null, last_error = null
      where id = p_message_id;

    update public.outreach_recipients
      set status = 'contacted',
          last_message_at = now(),
          followup_count = case when message_row.message_type = 'follow_up' then followup_count + 1 else followup_count end
      where id = message_row.recipient_id and user_id = message_row.user_id;

    insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail,event_data)
      values (message_row.user_id,message_row.campaign_id,message_row.recipient_id,message_row.id,
        'message_sent','Email provider confirmed message delivery acceptance.',
        jsonb_build_object('provider',p_provider,'provider_message_id',p_provider_message_id));
  elsif p_retryable and message_row.attempt_count < 5 then
    update public.outreach_messages
      set status = 'queued', scheduled_for = now() + interval '15 minutes',
          lease_token = null, lease_expires_at = null,
          last_error = left(coalesce(p_error,'Temporary provider failure.'),1000)
      where id = p_message_id;
    insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail)
      values (message_row.user_id,message_row.campaign_id,message_row.recipient_id,message_row.id,
        'message_failed','A confirmed pre-send failure was scheduled for retry.');
  else
    update public.outreach_messages
      set status = 'failed', lease_token = null, lease_expires_at = null,
          last_error = left(coalesce(p_error,'Message delivery failed or is uncertain.'),1000)
      where id = p_message_id;
    insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail)
      values (message_row.user_id,message_row.campaign_id,message_row.recipient_id,message_row.id,
        'message_failed','Message was not automatically retried because delivery may be uncertain.');
  end if;
  return true;
end;
$$;

revoke all on function public.gigo_claim_due_outreach_messages(integer,integer) from public, anon, authenticated;
grant execute on function public.gigo_claim_due_outreach_messages(integer,integer) to service_role;
revoke all on function public.gigo_finish_outreach_message(uuid,uuid,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.gigo_finish_outreach_message(uuid,uuid,text,text,text,text,boolean) to service_role;

comment on function public.gigo_claim_due_outreach_messages(integer,integer) is
  'Service-role-only claim path for a future email worker. Revalidates campaign approval, templates, recipient state, suppressions and sending windows; expired leases fail closed.';
