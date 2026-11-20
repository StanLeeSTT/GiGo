-- GiGo Research Engine foundation.
-- Stores research runs, source evidence and opportunity assessments per owner.
-- Public-source discovery and AI synthesis are implemented in later stages.

create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  research_question text not null check (char_length(research_question) between 1 and 5000),
  market_scope text,
  status text not null default 'draft'
    check (status in ('draft','queued','running','completed','failed','cancelled')),
  summary text,
  findings jsonb not null default '[]'::jsonb,
  methodology jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  source_type text not null default 'web'
    check (source_type in ('web','paper','dataset','report','social','other')),
  title text not null check (char_length(title) between 1 and 500),
  url text not null check (char_length(url) <= 2048),
  publisher text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  excerpt text,
  relevance_score numeric(5,2) check (relevance_score between 0 and 100),
  evidence_status text not null default 'unreviewed'
    check (evidence_status in ('unreviewed','supports','contradicts','context','rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_run_id, url)
);

create table if not exists public.research_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  customer_problem text not null,
  target_customer text,
  proposed_solution text,
  revenue_model text,
  validation_score numeric(5,2) check (validation_score between 0 and 100),
  risks jsonb not null default '[]'::jsonb,
  validation_steps jsonb not null default '[]'::jsonb,
  status text not null default 'discovered'
    check (status in ('discovered','investigating','validated','rejected','pursuing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_runs_user_updated_idx
  on public.research_runs(user_id, updated_at desc);
create index if not exists research_sources_run_created_idx
  on public.research_sources(research_run_id, created_at desc);
create index if not exists research_opportunities_user_status_idx
  on public.research_opportunities(user_id, status, updated_at desc);

alter table public.research_runs enable row level security;
alter table public.research_sources enable row level security;
alter table public.research_opportunities enable row level security;

drop policy if exists research_runs_owner_all on public.research_runs;
create policy research_runs_owner_all on public.research_runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists research_sources_owner_all on public.research_sources;
create policy research_sources_owner_all on public.research_sources
  for all using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research_runs r
      where r.id = research_run_id and r.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research_runs r
      where r.id = research_run_id and r.user_id = auth.uid()
    )
  );

drop policy if exists research_opportunities_owner_all on public.research_opportunities;
create policy research_opportunities_owner_all on public.research_opportunities
  for all using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research_runs r
      where r.id = research_run_id and r.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research_runs r
      where r.id = research_run_id and r.user_id = auth.uid()
    )
  );

drop trigger if exists research_runs_set_updated_at on public.research_runs;
create trigger research_runs_set_updated_at before update on public.research_runs
  for each row execute function public.set_updated_at();

drop trigger if exists research_opportunities_set_updated_at on public.research_opportunities;
create trigger research_opportunities_set_updated_at before update on public.research_opportunities
  for each row execute function public.set_updated_at();
