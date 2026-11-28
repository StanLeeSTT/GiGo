-- Recipient-level authorization review and marketing-contact registration gate.
-- Public profile discovery alone does not establish permission to send marketing email.

alter table public.outreach_recipients
  add column if not exists contact_authorization_status text not null default 'unreviewed'
    check (contact_authorization_status in ('unreviewed','approved','blocked')),
  add column if not exists contact_authorization_basis text
    check (contact_authorization_basis is null or contact_authorization_basis in ('consent','existing_relationship','legitimate_interest_assessed','other_documented')),
  add column if not exists contact_authorization_evidence_url text
    check (contact_authorization_evidence_url is null or (contact_authorization_evidence_url like 'https://%' and char_length(contact_authorization_evidence_url) <= 2048)),
  add column if not exists contact_authorization_reviewed_at timestamptz,
  add column if not exists marketing_contact_registered boolean not null default false;

alter table public.outreach_recipients
  drop constraint if exists outreach_recipient_authorization_consistency;
alter table public.outreach_recipients
  add constraint outreach_recipient_authorization_consistency
  check (
    contact_authorization_status <> 'approved'
    or (
      contact_authorization_basis is not null
      and contact_authorization_evidence_url is not null
      and contact_authorization_reviewed_at is not null
      and marketing_contact_registered = true
    )
  );

create or replace function public.gigo_guard_outreach_send_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
begin
  if new.status <> 'sending' or old.status = 'sending' then
    return new;
  end if;

  select * into recipient_row
    from public.outreach_recipients r
    where r.id = new.recipient_id and r.user_id = new.user_id
    for update;
  if not found
    or recipient_row.contact_authorization_status <> 'approved'
    or recipient_row.contact_authorization_reviewed_at is null
    or recipient_row.marketing_contact_registered is not true
    or recipient_row.contact_authorization_evidence_url is null then
    raise exception 'recipient lacks reviewed marketing-contact authorization' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists outreach_messages_send_eligibility_guard on public.outreach_messages;
create trigger outreach_messages_send_eligibility_guard
  before update of status on public.outreach_messages
  for each row
  when (new.status = 'sending')
  execute function public.gigo_guard_outreach_send_eligibility();

comment on column public.outreach_recipients.contact_authorization_status is
  'Manual owner review state for the legal/permission basis to contact this address; public profile visibility alone is not approval.';
comment on column public.outreach_recipients.marketing_contact_registered is
  'True only after the recipient is registered in the configured provider marketing audience as required by provider rules.';
