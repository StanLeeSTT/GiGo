-- Durable, owner-controlled outreach campaign foundation.
-- This stores campaigns and outbound drafts; it does not send email or enable a sender.

create unique index if not exists leads_id_user_unique
  on public.leads(id, user_id);

create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  objective text not null check (char_length(objective) between 1 and 3000),
  audience_definition jsonb not null default '{}'::jsonb check (jsonb_typeof(audience_definition) = 'object'),
  offer_summary text check (offer_summary is null or char_length(offer_summary) <= 5000),
  status text not null default 'draft' check (status in ('draft','awaiting_approval','active','paused','completed','cancelled')),
  approval_status text not null default 'not_requested' check (approval_status in ('not_requested','pending','approved','rejected','revoked')),
  approved_sender_email text,
  approved_sender_name text,
  approved_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(approved_policy) = 'object'),
  max_recipients integer not null default 0 check (max_recipients between 0 and 10000),
  max_messages_per_recipient integer not null default 0 check (max_messages_per_recipient between 0 and 10),
  initial_send_enabled boolean not null default false,
  followups_enabled boolean not null default false,
  followup_delays_days integer[] not null default '{}',
  send_window_start time,
  send_window_end time,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 100),
  quiet_hours_start time,
  quiet_hours_end time,
  approved_at timestamptz,
  approval_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (approval_status <> 'approved' or (
    approved_at is not null and approved_sender_email is not null
    and max_recipients > 0 and max_messages_per_recipient > 0
  )),
  check (cardinality(followup_delays_days) <= 5),
  check (0 < all (followup_delays_days) and 0 < all (array(select unnest(followup_delays_days)))),
  check (followups_enabled = false or cardinality(followup_delays_days) > 0)
);

create table if not exists public.outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  lead_id uuid,
  email text not null check (char_length(email) between 5 and 320),
  recipient_name text check (recipient_name is null or char_length(recipient_name) <= 240),
  organisation text check (organisation is null or char_length(organisation) <= 240),
  status text not null default 'queued' check (status in ('queued','ready','contacted','replied','bounced','unsubscribed','complained','paused','completed','cancelled')),
  followup_count integer not null default 0 check (followup_count between 0 and 10),
  last_message_at timestamptz,
  next_action_at timestamptz,
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_recipients_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  constraint outreach_recipients_lead_owner_fk
    foreign key (lead_id, user_id) references public.leads(id, user_id) on delete set null (lead_id),
  unique (id, user_id),
  unique (campaign_id, email)
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  recipient_id uuid not null,
  sequence_number integer not null check (sequence_number between 0 and 10),
  message_type text not null check (message_type in ('initial','follow_up','reply_draft')),
  to_email text not null check (char_length(to_email) between 5 and 320),
  subject text not null check (char_length(subject) between 1 and 300),
  body_text text not null check (char_length(body_text) between 1 and 20000),
  personalization_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(personalization_evidence) = 'array'),
  status text not null default 'draft' check (status in ('draft','awaiting_approval','queued','sending','sent','failed','cancelled')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_messages_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  constraint outreach_messages_recipient_owner_fk
    foreign key (recipient_id, user_id) references public.outreach_recipients(id, user_id) on delete cascade,
  unique (recipient_id, sequence_number)
);

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  recipient_id uuid,
  message_id uuid,
  event_type text not null check (event_type in (
    'lead_added','message_drafted','message_approved','message_queued','message_sent',
    'message_failed','reply_received','bounce_received','unsubscribe_received',
    'complaint_received','followup_scheduled','sequence_paused','sequence_completed',
    'campaign_approved','campaign_paused','campaign_resumed','campaign_cancelled'
  )),
  detail text check (detail is null or char_length(detail) <= 3000),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  constraint outreach_events_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  constraint outreach_events_recipient_owner_fk
    foreign key (recipient_id, user_id) references public.outreach_recipients(id, user_id) on delete cascade,
  constraint outreach_events_message_owner_fk
    foreign key (message_id, user_id) references public.outreach_messages(id, user_id) on delete cascade
);

create table if not exists public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 320),
  reason text not null check (reason in ('unsubscribe','complaint','manual','hard_bounce','other')),
  source text,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create index if not exists outreach_campaigns_owner_status_idx
  on public.outreach_campaigns(user_id, status, updated_at desc);
create index if not exists outreach_recipients_due_idx
  on public.outreach_recipients(user_id, campaign_id, status, next_action_at);
create index if not exists outreach_messages_due_idx
  on public.outreach_messages(status, scheduled_for) where status = 'queued';
create index if not exists outreach_events_campaign_time_idx
  on public.outreach_events(user_id, campaign_id, created_at desc);
create index if not exists outreach_suppressions_email_idx
  on public.outreach_suppressions(user_id, lower(email));

alter table public.outreach_campaigns enable row level security;
alter table public.outreach_recipients enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_events enable row level security;
alter table public.outreach_suppressions enable row level security;

drop policy if exists outreach_campaigns_owner_all on public.outreach_campaigns;
create policy outreach_campaigns_owner_all on public.outreach_campaigns
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists outreach_recipients_owner_all on public.outreach_recipients;
create policy outreach_recipients_owner_all on public.outreach_recipients
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    and (lead_id is null or exists (select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid()))
  );

drop policy if exists outreach_messages_owner_all on public.outreach_messages;
create policy outreach_messages_owner_all on public.outreach_messages
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    and exists (select 1 from public.outreach_recipients r where r.id = recipient_id and r.user_id = auth.uid() and r.campaign_id = campaign_id)
  );

drop policy if exists outreach_events_owner_read on public.outreach_events;
create policy outreach_events_owner_read on public.outreach_events for select using (user_id = auth.uid());
drop policy if exists outreach_events_owner_insert on public.outreach_events;
create policy outreach_events_owner_insert on public.outreach_events for insert with check (user_id = auth.uid());

drop policy if exists outreach_suppressions_owner_all on public.outreach_suppressions;
create policy outreach_suppressions_owner_all on public.outreach_suppressions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists outreach_campaigns_set_updated_at on public.outreach_campaigns;
create trigger outreach_campaigns_set_updated_at before update on public.outreach_campaigns
  for each row execute function public.set_updated_at();
drop trigger if exists outreach_recipients_set_updated_at on public.outreach_recipients;
create trigger outreach_recipients_set_updated_at before update on public.outreach_recipients
  for each row execute function public.set_updated_at();
drop trigger if exists outreach_messages_set_updated_at on public.outreach_messages;
create trigger outreach_messages_set_updated_at before update on public.outreach_messages
  for each row execute function public.set_updated_at();

comment on table public.outreach_campaigns is
  'Owner-managed outreach campaigns with explicit bounded authorization. Campaign approval does not imply that a sending provider is configured.';
comment on table public.outreach_messages is
  'Outbound email drafts and durable send queue records. No provider send occurs from this schema alone.';
comment on table public.outreach_suppressions is
  'Owner-scoped do-not-contact list; suppressed addresses must never enter an automated send queue.';
