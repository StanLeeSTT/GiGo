-- Trusted, database-side rendering of approved outreach templates.
-- The API supplies only owner/campaign/recipient IDs. It cannot supply message content.
-- This migration also closes PUBLIC table grants and strengthens the final claim-time guard.

revoke all on public.outreach_messages from public, anon, authenticated;
grant select on public.outreach_messages to authenticated;

revoke all on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
drop function if exists public.gigo_prepare_outreach_sequence(uuid, uuid, uuid, jsonb);

create or replace function public.gigo_prepare_outreach_sequence(
  p_owner_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.outreach_campaigns%rowtype;
  recipient_row public.outreach_recipients%rowtype;
  template_row public.outreach_templates%rowtype;
  profile_row public.lead_social_profiles%rowtype;
  evidence_row public.lead_evidence%rowtype;
  expected_count integer;
  inserted_count integer := 0;
  sequence_value integer;
  scheduled_value timestamptz;
  cumulative_days integer;
  delay_days integer;
  message_id uuid;
  values_json jsonb;
  evidence_json jsonb;
  subject_value text;
  body_value text;
  placeholder text;
  allowed_fields constant text[] := array['first_name','organisation','niche','specific_observation','offer_summary'];
  first_name_value text;
  organisation_value text;
  niche_value text := '';
  observation_value text := '';
  offer_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_owner_id is null then
    raise exception 'trusted service execution required' using errcode = '42501';
  end if;

  select * into campaign_row
  from public.outreach_campaigns c
  where c.id = p_campaign_id and c.user_id = p_owner_id
  for update;
  if not found or campaign_row.status <> 'active'
    or campaign_row.approval_status <> 'approved'
    or campaign_row.approved_at is null
    or campaign_row.approval_revoked_at is not null
    or campaign_row.initial_send_enabled is not true then
    raise exception 'campaign is not approved and active' using errcode = '42501';
  end if;

  select * into recipient_row
  from public.outreach_recipients r
  where r.id = p_recipient_id and r.campaign_id = p_campaign_id and r.user_id = p_owner_id
  for update;
  if not found or recipient_row.status not in ('queued','ready')
    or recipient_row.contact_authorization_status <> 'approved'
    or recipient_row.contact_authorization_reviewed_at is null
    or recipient_row.contact_authorization_basis is null
    or recipient_row.contact_authorization_evidence_url is null
    or recipient_row.marketing_contact_registered is not true then
    raise exception 'recipient is not eligible for approved marketing outreach' using errcode = '42501';
  end if;

  if exists (select 1 from public.outreach_suppressions s
    where s.user_id = p_owner_id and lower(s.email) = lower(recipient_row.email)) then
    raise exception 'recipient is suppressed' using errcode = '42501';
  end if;

  select count(*) into expected_count
  from public.outreach_templates t
  where t.campaign_id = p_campaign_id and t.user_id = p_owner_id and t.approved_at is not null;
  if expected_count < 1 or expected_count > 6
    or expected_count > campaign_row.max_messages_per_recipient
    or (expected_count > 1 and campaign_row.followups_enabled is not true) then
    raise exception 'approved template sequence is incomplete or not enabled' using errcode = '22023';
  end if;

  first_name_value := left(regexp_replace(split_part(coalesce(recipient_row.recipient_name,''),' ',1), '[[:cntrl:]]', ' ', 'g'), 240);
  organisation_value := left(regexp_replace(coalesce(recipient_row.organisation,''), '[[:cntrl:]]', ' ', 'g'), 240);
  offer_value := left(regexp_replace(coalesce(campaign_row.offer_summary,''), '[[:cntrl:]]', ' ', 'g'), 5000);

  if recipient_row.lead_id is not null then
    select * into profile_row
    from public.lead_social_profiles p
    where p.user_id = p_owner_id and p.lead_id = recipient_row.lead_id
      and nullif(trim(p.niche),'') is not null
    order by p.updated_at desc
    limit 1;

    if found then niche_value := left(regexp_replace(coalesce(profile_row.niche,''), '[[:cntrl:]]', ' ', 'g'), 240); end if;

    select * into evidence_row
    from public.lead_evidence e
    where e.user_id = p_owner_id and e.lead_id = recipient_row.lead_id
      and e.evidence_type in ('audience_fit','credibility','customer_problem','buying_intent','other')
      and nullif(trim(e.excerpt),'') is not null
    order by e.observed_at desc
    limit 1;

    if found then observation_value := left(regexp_replace(coalesce(evidence_row.excerpt,''), '[[:cntrl:]]', ' ', 'g'), 1000); end if;
  end if;

  values_json := jsonb_build_object(
    'first_name', first_name_value,
    'organisation', organisation_value,
    'niche', niche_value,
    'specific_observation', observation_value,
    'offer_summary', offer_value
  );

  for sequence_value in 0..expected_count - 1 loop
    select * into template_row
    from public.outreach_templates t
    where t.campaign_id = p_campaign_id and t.user_id = p_owner_id
      and t.sequence_number = sequence_value and t.approved_at is not null;
    if not found or (sequence_value = 0 and template_row.message_type <> 'initial')
      or (sequence_value > 0 and template_row.message_type <> 'follow_up') then
      raise exception 'approved template sequence must be contiguous and typed' using errcode = '22023';
    end if;

    -- Reject malformed/unknown placeholders and placeholders not declared by the approved template.
    for placeholder in
      select distinct match[1]
      from regexp_matches(template_row.subject_template || E'\n' || template_row.body_template,
        '\{\{([^{}]+)\}\}', 'g') as match
    loop
      if not (placeholder = any(allowed_fields))
        or not (template_row.personalization_fields ? placeholder)
        or coalesce(values_json->>placeholder,'') = '' then
        raise exception 'template contains an unavailable or undeclared personalization field: %', placeholder using errcode = '22023';
      end if;
    end loop;

    if (template_row.subject_template || template_row.body_template) ~ '\{\{[^{}]*\}\}' then
      -- Every well-formed token is checked above; this catches empty/malformed leftovers.
      if regexp_replace(template_row.subject_template || template_row.body_template,
        '\{\{[a-z_]+\}\}', '', 'g') ~ '\{\{|\}\}' then
        raise exception 'template contains malformed personalization syntax' using errcode = '22023';
      end if;
    end if;

    subject_value := template_row.subject_template;
    body_value := template_row.body_template;
    foreach placeholder in array allowed_fields loop
      subject_value := replace(subject_value, '{{' || placeholder || '}}', coalesce(values_json->>placeholder,''));
      body_value := replace(body_value, '{{' || placeholder || '}}', coalesce(values_json->>placeholder,''));
    end loop;
    subject_value := left(trim(regexp_replace(subject_value, '[[:cntrl:]]', ' ', 'g')), 300);
    body_value := left(trim(regexp_replace(body_value, '[[:cntrl:]]', ' ', 'g')), 20000);
    if char_length(subject_value) < 1 or char_length(body_value) < 1
      or subject_value ~ '\{\{|\}\}' or body_value ~ '\{\{|\}\}' then
      raise exception 'rendered message is empty or contains unresolved placeholders' using errcode = '22023';
    end if;

    evidence_json := '[]'::jsonb;
    if position('{{niche}}' in template_row.subject_template || template_row.body_template) > 0 then
      evidence_json := evidence_json || jsonb_build_array(jsonb_build_object(
        'field','niche','source_url',profile_row.profile_url,'source_title',profile_row.display_name));
    end if;
    if position('{{specific_observation}}' in template_row.subject_template || template_row.body_template) > 0 then
      evidence_json := evidence_json || jsonb_build_array(jsonb_build_object(
        'field','specific_observation','evidence_type',evidence_row.evidence_type,
        'source_url',evidence_row.source_url,'source_title',evidence_row.source_title,
        'observed_at',evidence_row.observed_at,'confidence',evidence_row.confidence));
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
      p_owner_id,p_campaign_id,p_recipient_id,sequence_value,template_row.message_type,
      lower(recipient_row.email),subject_value,body_value,evidence_json,'queued',scheduled_value,template_row.id
    ) on conflict (recipient_id,sequence_number) do nothing returning id into message_id;

    if message_id is not null then
      inserted_count := inserted_count + 1;
      insert into public.outreach_events(user_id,campaign_id,recipient_id,message_id,event_type,detail,event_data)
      values(p_owner_id,p_campaign_id,p_recipient_id,message_id,'message_queued',
        'Database-rendered approved template persisted to the outbox; no provider send was performed.',
        jsonb_build_object('sequence_number',sequence_value,'scheduled_for',scheduled_value,'template_id',template_row.id));
    end if;
    message_id := null;
  end loop;

  return jsonb_build_object('recipient_id',p_recipient_id,'inserted_count',inserted_count,
    'already_prepared',inserted_count = 0,'messages_queued',expected_count,'provider_send_performed',false);
end;
$$;

revoke all on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid) to service_role;

-- Revalidate the mutable authorization facts at the final queued -> sending transition.
create or replace function public.gigo_guard_outreach_send_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
  campaign_row public.outreach_campaigns%rowtype;
  recipient_found boolean := false;
  campaign_found boolean := false;
begin
  if new.status <> 'sending' or old.status = 'sending' then return new; end if;

  select * into recipient_row from public.outreach_recipients r
  where r.id = new.recipient_id and r.user_id = new.user_id for update;
  recipient_found := found;
  select * into campaign_row from public.outreach_campaigns c
  where c.id = new.campaign_id and c.user_id = new.user_id for update;
  campaign_found := found;

  if not recipient_found or not campaign_found or campaign_row.status <> 'active'
    or campaign_row.approval_status <> 'approved' or campaign_row.approved_at is null
    or campaign_row.approval_revoked_at is not null or campaign_row.initial_send_enabled is not true
    or recipient_row.contact_authorization_status <> 'approved'
    or recipient_row.contact_authorization_reviewed_at is null
    or recipient_row.contact_authorization_basis is null
    or recipient_row.contact_authorization_evidence_url is null
    or recipient_row.marketing_contact_registered is not true
    or lower(new.to_email) <> lower(recipient_row.email)
    or exists (select 1 from public.outreach_suppressions s
      where s.user_id = new.user_id and lower(s.email) = lower(recipient_row.email))
    or not exists (select 1 from public.outreach_templates t
      where t.id = new.template_id and t.user_id = new.user_id
        and t.campaign_id = new.campaign_id and t.sequence_number = new.sequence_number
        and t.message_type = new.message_type and t.approved_at is not null) then
    raise exception 'message no longer satisfies approved outreach eligibility' using errcode = '42501';
  end if;

  if new.scheduled_for > now()
    or (case when campaign_row.send_window_start < campaign_row.send_window_end
      then (now() at time zone campaign_row.timezone)::time < campaign_row.send_window_start
        or (now() at time zone campaign_row.timezone)::time >= campaign_row.send_window_end
      else (now() at time zone campaign_row.timezone)::time < campaign_row.send_window_start
        and (now() at time zone campaign_row.timezone)::time >= campaign_row.send_window_end end)
    or (campaign_row.quiet_hours_start is not null and campaign_row.quiet_hours_end is not null
      and (case when campaign_row.quiet_hours_start < campaign_row.quiet_hours_end
        then (now() at time zone campaign_row.timezone)::time >= campaign_row.quiet_hours_start
          and (now() at time zone campaign_row.timezone)::time < campaign_row.quiet_hours_end
        else (now() at time zone campaign_row.timezone)::time >= campaign_row.quiet_hours_start
          or (now() at time zone campaign_row.timezone)::time < campaign_row.quiet_hours_end end)) then
    raise exception 'message is outside the approved sending window' using errcode = '42501';
  end if;

  if new.sequence_number = 0 and recipient_row.status not in ('queued','ready')
    or new.sequence_number > 0 and (recipient_row.status <> 'contacted' or campaign_row.followups_enabled is not true
      or not exists (select 1 from public.outreach_messages previous
        where previous.recipient_id = new.recipient_id
          and previous.sequence_number = new.sequence_number - 1 and previous.status = 'sent')) then
    raise exception 'recipient sequence state does not permit this send' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_messages_send_eligibility_guard on public.outreach_messages;
create trigger outreach_messages_send_eligibility_guard
  before update of status on public.outreach_messages
  for each row when (new.status = 'sending')
  execute function public.gigo_guard_outreach_send_eligibility();

comment on function public.gigo_prepare_outreach_sequence(uuid, uuid, uuid) is
  'Service-role-only preparation that renders approved template content inside Postgres from owner-scoped recipient and evidence records. It never sends.';
