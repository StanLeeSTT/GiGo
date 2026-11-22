-- Deterministic, evidence-backed preparation of approved outreach sequences.
-- Creates queued outbox records only. It does not send email.

create or replace function public.gigo_prepare_outreach_sequence(
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_messages jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  campaign_row public.outreach_campaigns%rowtype;
  recipient_row public.outreach_recipients%rowtype;
  item jsonb;
  template_row public.outreach_templates%rowtype;
  expected_count integer;
  supplied_count integer;
  inserted_count integer := 0;
  sequence_value integer;
  email_value text;
  scheduled_value timestamptz;
  delay_days integer;
  cumulative_days integer := 0;
  message_id uuid;
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) < 1 or jsonb_array_length(p_messages) > 6 then
    raise exception 'messages must be an array containing 1 to 6 items' using errcode = '22023';
  end if;

  select * into campaign_row
    from public.outreach_campaigns c
    where c.id = p_campaign_id and c.user_id = owner_id
    for update;
  if not found or campaign_row.status <> 'active' or campaign_row.approval_status <> 'approved'
     or campaign_row.approved_at is null or not campaign_row.initial_send_enabled then
    raise exception 'campaign is not approved and active' using errcode = '42501';
  end if;

  select * into recipient_row
    from public.outreach_recipients r
    where r.id = p_recipient_id and r.campaign_id = p_campaign_id and r.user_id = owner_id
    for update;
  if not found or recipient_row.status not in ('queued','ready') then
    raise exception 'recipient is not eligible for initial outreach' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.outreach_suppressions s
    where s.user_id = owner_id and lower(s.email) = lower(recipient_row.email)
  ) then
    raise exception 'recipient is suppressed' using errcode = '42501';
  end if;

  select count(*) into expected_count
    from public.outreach_templates t
    where t.campaign_id = p_campaign_id and t.user_id = owner_id and t.approved_at is not null;
  supplied_count := jsonb_array_length(p_messages);
  if expected_count < 1 or supplied_count <> expected_count or expected_count > campaign_row.max_messages_per_recipient then
    raise exception 'prepared sequence does not match approved template count' using errcode = '22023';
  end if;
  if expected_count > 1 and not campaign_row.followups_enabled then
    raise exception 'follow-ups are not enabled' using errcode = '42501';
  end if;

  if (select count(distinct (value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> expected_count
    or (select min((value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> 0
    or (select max((value->>'sequence_number')::integer) from jsonb_array_elements(p_messages)) <> expected_count - 1 then
    raise exception 'prepared sequence numbers must be unique and contiguous' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'invalid prepared message' using errcode = '22023';
    end if;
    sequence_value := (item->>'sequence_number')::integer;
    if sequence_value < 0 or sequence_value >= expected_count then
      raise exception 'invalid message sequence' using errcode = '22023';
    end if;
    select * into template_row
      from public.outreach_templates t
      where t.campaign_id = p_campaign_id and t.user_id = owner_id
        and t.sequence_number = sequence_value and t.approved_at is not null;
    if not found or (item->>'template_id')::uuid <> template_row.id
      or item->>'message_type' <> template_row.message_type
      or (item->>'to_email') <> lower(recipient_row.email)
      or char_length(coalesce(item->>'subject','')) not between 1 and 300
      or char_length(coalesce(item->>'body_text','')) not between 1 and 20000
      or jsonb_typeof(coalesce(item->'personalization_evidence','[]'::jsonb)) <> 'array' then
      raise exception 'prepared message does not match approved template or recipient' using errcode = '22023';
    end if;

    if sequence_value = 0 then
      scheduled_value := now();
    else
      cumulative_days := 0;
      for delay_days in 1..sequence_value loop
        cumulative_days := cumulative_days + campaign_row.followup_delays_days[delay_days];
      end loop;
      scheduled_value := now() + make_interval(days => cumulative_days);
    end if;

    insert into public.outreach_messages(
      user_id,campaign_id,recipient_id,sequence_number,message_type,to_email,
      subject,body_text,personalization_evidence,status,scheduled_for,template_id
    ) values (
      owner_id,p_campaign_id,p_recipient_id,sequence_value,template_row.message_type,
      lower(recipient_row.email),item->>'subject',item->>'body_text',
      coalesce(item->'personalization_evidence','[]'::jsonb),'queued',scheduled_value,template_row.id
    )
    on conflict (recipient_id,sequence_number) do nothing
    returning id into message_id;

    if message_id is not null then
      inserted_count := inserted_count + 1;
      insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail,event_data)
      values(owner_id,p_campaign_id,p_recipient_id,message_id,'message_queued',
        'Approved template rendered into the durable outbox; no provider send was performed.',
        jsonb_build_object('sequence_number',sequence_value,'scheduled_for',scheduled_value));
    end if;
    message_id := null;
  end loop;

  return jsonb_build_object(
    'recipient_id',p_recipient_id,
    'inserted_count',inserted_count,
    'already_prepared',inserted_count = 0,
    'messages_queued',supplied_count
  );
end;
$$;

revoke all on function public.gigo_prepare_outreach_sequence(uuid,uuid,jsonb) from public, anon;
grant execute on function public.gigo_prepare_outreach_sequence(uuid,uuid,jsonb) to authenticated;

comment on function public.gigo_prepare_outreach_sequence(uuid,uuid,jsonb) is
  'Atomically inserts an owner-authorized recipient sequence into the durable outbox, matching approved templates and suppressions. It never sends email.';
