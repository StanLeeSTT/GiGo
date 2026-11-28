-- Database-level recipient admission guard. API pre-checks are not a security boundary.
create or replace function public.gigo_guard_outreach_recipient()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  campaign public.outreach_campaigns%rowtype;
  current_count integer;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'authenticated owner context required' using errcode = '42501';
  end if;

  select c.* into campaign
    from public.outreach_campaigns c
    where c.id = new.campaign_id and c.user_id = auth.uid()
    for update;
  if not found then
    raise exception 'campaign not found' using errcode = '23503';
  end if;
  if campaign.status in ('completed','cancelled') then
    raise exception 'campaign is closed to new recipients' using errcode = '22023';
  end if;

  new.email := lower(btrim(new.email));
  if exists (
    select 1 from public.outreach_suppressions s
    where s.user_id = auth.uid() and lower(s.email) = new.email
  ) then
    raise exception 'recipient is on the do-not-contact list' using errcode = '23514';
  end if;

  if campaign.approval_status = 'approved' then
    if campaign.status <> 'active' then
      raise exception 'approved campaign is not active' using errcode = '22023';
    end if;
    select count(*) into current_count
      from public.outreach_recipients r
      where r.campaign_id = new.campaign_id and r.user_id = auth.uid()
        and r.status not in ('unsubscribed','complained','bounced','cancelled');
    if current_count >= campaign.max_recipients then
      raise exception 'approved recipient limit reached' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_recipient_admission_guard on public.outreach_recipients;
create trigger outreach_recipient_admission_guard
  before insert on public.outreach_recipients
  for each row execute function public.gigo_guard_outreach_recipient();

comment on function public.gigo_guard_outreach_recipient() is
  'Enforces owner identity, campaign state, case-normalized email, suppression and approved recipient cap at the database boundary.';
