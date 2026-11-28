-- Validate timezone and ordered follow-up delays before a campaign can be approved.
create or replace function public.gigo_validate_outreach_campaign_window()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  i integer;
begin
  if new.approval_status = 'approved' then
    if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
      raise exception 'campaign timezone is not recognized' using errcode = '22023';
    end if;
    if (new.quiet_hours_start is null) <> (new.quiet_hours_end is null) then
      raise exception 'quiet hours require both a start and end time' using errcode = '22023';
    end if;
    if new.send_window_start = new.send_window_end then
      raise exception 'send window cannot cover the entire day or be empty' using errcode = '22023';
    end if;
    if cardinality(new.followup_delays_days) > 1 then
      for i in 2..cardinality(new.followup_delays_days) loop
        if new.followup_delays_days[i] <= new.followup_delays_days[i-1] then
          raise exception 'follow-up delays must be strictly increasing' using errcode = '22023';
        end if;
      end loop;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_campaign_window_guard on public.outreach_campaigns;
create trigger outreach_campaign_window_guard
  before update on public.outreach_campaigns
  for each row execute function public.gigo_validate_outreach_campaign_window();
