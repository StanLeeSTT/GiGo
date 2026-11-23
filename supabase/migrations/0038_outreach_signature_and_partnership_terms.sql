-- Enforce short outbound copy, owner signature, and deterministic 50/50 partnership terms.
-- This does not enable a provider, approve a campaign, or send a message.

create table if not exists public.owner_message_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signature_name text not null check (char_length(signature_name) between 1 and 80),
  updated_at timestamptz not null default now()
);
alter table public.owner_message_settings enable row level security;
revoke all on public.owner_message_settings from public, anon, authenticated;
grant select on public.owner_message_settings to authenticated;
drop policy if exists owner_message_settings_read on public.owner_message_settings;
create policy owner_message_settings_read on public.owner_message_settings
  for select to authenticated using (user_id = auth.uid());

create or replace function public.gigo_set_owner_message_signature(p_signature_name text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid(); clean_name text;
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  clean_name := trim(regexp_replace(coalesce(p_signature_name,''), '[[:cntrl:]]', ' ', 'g'));
  if char_length(clean_name) not between 1 and 80 then
    raise exception 'signature name must be 1 to 80 characters' using errcode = '22023';
  end if;
  insert into public.owner_message_settings(user_id,signature_name,updated_at)
  values(owner_id,clean_name,now())
  on conflict(user_id) do update set signature_name=excluded.signature_name,updated_at=now();
  return true;
end;
$$;
revoke all on function public.gigo_set_owner_message_signature(text) from public, anon;
grant execute on function public.gigo_set_owner_message_signature(text) to authenticated;

alter table public.outreach_campaigns
  add column if not exists campaign_kind text not null default 'general'
  check (campaign_kind in ('general','partnership'));

create or replace function public.gigo_set_outreach_campaign_kind(p_campaign_id uuid,p_campaign_kind text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_campaign_kind not in ('general','partnership') then
    raise exception 'invalid campaign kind' using errcode = '22023';
  end if;
  update public.outreach_campaigns
    set campaign_kind=p_campaign_kind,updated_at=now()
    where id=p_campaign_id and user_id=owner_id
      and status='draft' and approval_status in ('not_requested','rejected');
  if not found then raise exception 'campaign not found or no longer editable' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.gigo_set_outreach_campaign_kind(uuid,text) from public, anon;
grant execute on function public.gigo_set_outreach_campaign_kind(uuid,text) to authenticated;

create or replace function public.gigo_enforce_outreach_copy_policy()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owner_signature text;
  campaign_type text;
  partnership_clause constant text :=
    'We propose a 50/50 split of net revenue attributable to this partnership, after only direct costs we both agree to in writing in advance.';
  body_without_signature text;
  signature_line text;
begin
  if new.status not in ('queued','sending','sent') then return new; end if;

  select s.signature_name into owner_signature
    from public.owner_message_settings s where s.user_id=new.user_id;
  if owner_signature is null or char_length(trim(owner_signature))=0 then
    raise exception 'outbound signature is not configured; sending is blocked' using errcode = '42501';
  end if;

  select c.campaign_kind into campaign_type
    from public.outreach_campaigns c
    where c.id=new.campaign_id and c.user_id=new.user_id;
  if campaign_type is null then
    raise exception 'outreach campaign not found' using errcode = '42501';
  end if;

  if char_length(new.subject)>80 then
    raise exception 'outbound subject exceeds 80 characters' using errcode = '22023';
  end if;

  signature_line := '— ' || trim(owner_signature);
  body_without_signature := regexp_replace(coalesce(new.body_text,''), E'\\n+— [^\\n]*$', '', 'i');

  if campaign_type='partnership' then
    if body_without_signature !~* '50/50 split of net revenue attributable to this partnership' then
      body_without_signature := trim(body_without_signature) || E'\\n\\n' || partnership_clause;
    end if;
  end if;

  new.body_text := trim(body_without_signature) || E'\\n\\n' || signature_line;
  if char_length(new.body_text)>500 then
    raise exception 'outbound body exceeds 500 characters including partnership terms and signature' using errcode = '22023';
  end if;
  if new.body_text ~* '(guaranteed earnings|guaranteed income|you will earn|projected earnings)' then
    raise exception 'unsupported earnings guarantee or projection in outbound copy' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_copy_policy_guard on public.outreach_messages;
create trigger outreach_copy_policy_guard
  before insert or update of subject,body_text,status on public.outreach_messages
  for each row execute function public.gigo_enforce_outreach_copy_policy();

comment on table public.owner_message_settings is
  'Owner-controlled outbound signature. No signature means outbound queue transitions fail closed.';
comment on column public.outreach_campaigns.campaign_kind is
  'Partnership campaigns receive deterministic 50/50 net-attributable-revenue language at message rendering.';
