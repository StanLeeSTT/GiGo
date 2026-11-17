-- GiGo initial schema.
-- Apply with the Supabase SQL editor or Supabase CLI after creating a project.
-- All user-owned rows are isolated by auth.uid().

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general',
  content text not null,
  source text not null default 'user',
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','paused','waiting_for_quota','waiting_for_worker','awaiting_approval','cancelled')),
  input jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  checkpoint jsonb not null default '{}'::jsonb,
  idempotency_key text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  resource_type text,
  resource_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx on public.projects(user_id, updated_at desc);
create index if not exists tasks_user_status_due_idx on public.tasks(user_id, status, due_at);
create index if not exists conversations_user_updated_idx on public.assistant_conversations(user_id, updated_at desc);
create index if not exists messages_conversation_created_idx on public.assistant_messages(conversation_id, created_at);
create index if not exists memory_user_active_idx on public.memory_items(user_id, is_active, updated_at desc);
create index if not exists jobs_status_run_after_idx on public.jobs(status, run_after);
create index if not exists jobs_user_created_idx on public.jobs(user_id, created_at desc);
create index if not exists audit_user_created_idx on public.audit_events(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.memory_items enable row level security;
alter table public.jobs enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "projects_owner_all" on public.projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_owner_all" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conversations_owner_all" on public.assistant_conversations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "messages_owner_all" on public.assistant_messages for all using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.assistant_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);
create policy "memory_owner_all" on public.memory_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "jobs_owner_all" on public.jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audit_owner_select" on public.audit_events for select using (user_id = auth.uid());
create policy "audit_owner_insert" on public.audit_events for insert with check (user_id = auth.uid());

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.assistant_conversations
for each row execute function public.set_updated_at();
create trigger memory_set_updated_at before update on public.memory_items
for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
