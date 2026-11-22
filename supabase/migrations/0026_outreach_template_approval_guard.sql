-- Require a complete, explicit email-copy sequence before campaign approval.
create or replace function public.gigo_validate_outreach_template_sequence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  template_count integer;
  first_sequence integer;
  last_sequence integer;
  expected_followups integer;
begin
  if new.approval_status = 'approved'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'approved') then
    expected_followups := coalesce(cardinality(new.followup_delays_days),0);
    select count(*), min(t.sequence_number), max(t.sequence_number)
      into template_count, first_sequence, last_sequence
      from public.outreach_templates t
      where t.campaign_id = new.id and t.user_id = new.user_id;

    if template_count <> expected_followups + 1
       or first_sequence is distinct from 0
       or last_sequence is distinct from expected_followups then
      raise exception 'campaign requires one initial template and one template for each approved follow-up'
        using errcode = '22023';
    end if;

    update public.outreach_templates
      set approved_at = now()
      where campaign_id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_campaign_template_approval_guard on public.outreach_campaigns;
create trigger outreach_campaign_template_approval_guard
  before update on public.outreach_campaigns
  for each row execute function public.gigo_validate_outreach_template_sequence();

comment on function public.gigo_validate_outreach_template_sequence() is
  'Prevents approval unless every initial and follow-up message has an owner-authored template in the approved sequence.';
