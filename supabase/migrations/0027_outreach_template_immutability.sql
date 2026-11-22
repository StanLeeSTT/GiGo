-- Freeze message templates once campaign approval has approved their exact copy.
create or replace function public.gigo_protect_approved_outreach_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  campaign_approval text;
begin
  if tg_op = 'UPDATE' and old.approved_at is not null then
    raise exception 'approved outreach templates are immutable' using errcode = '22023';
  end if;

  if tg_op = 'DELETE' and old.approved_at is not null then
    raise exception 'approved outreach templates cannot be deleted' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    select c.approval_status into campaign_approval
      from public.outreach_campaigns c
      where c.id = new.campaign_id and c.user_id = new.user_id;
    if campaign_approval = 'approved' then
      raise exception 'templates cannot be changed after campaign approval' using errcode = '22023';
    end if;
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists outreach_template_immutable_guard on public.outreach_templates;
create trigger outreach_template_immutable_guard
  before insert or update or delete on public.outreach_templates
  for each row execute function public.gigo_protect_approved_outreach_template();
