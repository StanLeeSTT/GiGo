-- GiGo Autonomous Operations Control Plane.
-- Adds durable schedules, approval requests, notification delivery records and
-- an auditable event stream. This migration does NOT enable external calls or
-- messaging; delivery providers are connected in a later, separately tested phase.

create table if not exists public.operation_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  schedule_type text not null check (schedule_type in ('interval','daily','weekly','event')),
  schedule_config jsonb not null default '{}'::jsonb,
  job_type text not null,
  job_input jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  action_type text not null,
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 5000),
  action_payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
  requested_channels jsonb not null default '["in_app"]'::jsonb,
  decision_note text,
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  approval_request_id uuid references public.approval_requests(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  channel text not null check (channel in ('in_app','email','push','voice_call')),
  event_type text not null,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  status text not null default 'queued' check (status in ('queued','processing','sent','delivered','failed','cancelled','skipped')),
  provider text,
  provider_reference text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','error','critical')),
  title text not null check (char_length(title) between 1 and 200),
  detail text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operation_schedules_due_idx on public.operation_schedules(is_enabled, next_run_at) where is_enabled = true;
create index if not exists operation_schedules_user_idx on public.operation_schedules(user_id, updated_at desc);
create index if not exists approval_requests_user_status_idx on public.approval_requests(user_id, status, created_at desc);
create index if not exists approval_requests_expiry_idx on public.approval_requests(status, expires_at) where status = 'pending';
create index if not exists notification_events_due_idx on public.notification_events(status, scheduled_for) where status in ('queued','failed');
create index if not exists notification_events_user_idx on public.notification_events(user_id, created_at desc);
create index if not exists operation_events_user_idx on public.operation_events(user_id, created_at desc);

alter table public.operation_schedules enable row level security;
alter table public.approval_requests enable row level security;
alter table public.notification_events enable row level security;
alter table public.operation_events enable row level security;

drop policy if exists operation_schedules_owner_all on public.operation_schedules;
create policy operation_schedules_owner_all on public.operation_schedules for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists approval_requests_owner_all on public.approval_requests;
create policy approval_requests_owner_all on public.approval_requests for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()))
);

drop policy if exists notification_events_owner_all on public.notification_events;
create policy notification_events_owner_all on public.notification_events for all using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()))
  and (approval_request_id is null or exists (select 1 from public.approval_requests a where a.id = approval_request_id and a.user_id = auth.uid()))
);

drop policy if exists operation_events_owner_all on public.operation_events;
create policy operation_events_owner_select on public.operation_events for select using (user_id = auth.uid());
create policy operation_events_owner_insert on public.operation_events for insert with check (
  user_id = auth.uid()
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()))
  and (approval_request_id is null or exists (select 1 from public.approval_requests a where a.id = approval_request_id and a.user_id = auth.uid()))
);

drop trigger if exists operation_schedules_set_updated_at on public.operation_schedules;
create trigger operation_schedules_set_updated_at before update on public.operation_schedules for each row execute function public.set_updated_at();
drop trigger if exists approval_requests_set_updated_at on public.approval_requests;
create trigger approval_requests_set_updated_at before update on public.approval_requests for each row execute function public.set_updated_at();
drop trigger if exists notification_events_set_updated_at on public.notification_events;
create trigger notification_events_set_updated_at before update on public.notification_events for each row execute function public.set_updated_at();
