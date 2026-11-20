-- GiGo business foundation: Product Studio and Partner Finder.
-- Apply after migrations 0001-0005. All records are private to their owner.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid references public.research_runs(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  summary text,
  target_customer text,
  customer_problem text,
  proposed_solution text,
  product_type text not null default 'other'
    check (product_type in ('ebook','course','workbook','template','membership','software','service','other')),
  outline jsonb not null default '[]'::jsonb,
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  price_currency char(3) not null default 'NGN',
  status text not null default 'draft'
    check (status in ('draft','validating','building','ready','launched','archived')),
  validation_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  platform text not null check (char_length(platform) between 1 and 80),
  profile_url text not null check (char_length(profile_url) <= 2048),
  niche text,
  follower_count bigint check (follower_count is null or follower_count >= 0),
  average_views bigint check (average_views is null or average_views >= 0),
  business_email text,
  has_competing_offer boolean,
  score_components jsonb not null default '{}'::jsonb,
  total_score numeric(5,2) check (total_score is null or total_score between 0 and 100),
  recommendation text not null default 'investigate'
    check (recommendation in ('shortlist','investigate','not_recommend','hard_stop')),
  evidence jsonb not null default '[]'::jsonb,
  due_diligence jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new','reviewing','shortlisted','contacted','negotiating','partnered','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_user_updated_idx
  on public.products(user_id, updated_at desc);
create index if not exists products_user_status_idx
  on public.products(user_id, status);
create index if not exists partner_candidates_user_updated_idx
  on public.partner_candidates(user_id, updated_at desc);
create index if not exists partner_candidates_user_recommendation_idx
  on public.partner_candidates(user_id, recommendation, total_score desc);

alter table public.products enable row level security;
alter table public.partner_candidates enable row level security;

drop policy if exists products_owner_all on public.products;
create policy products_owner_all on public.products
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (research_run_id is null or exists (
      select 1 from public.research_runs r
      where r.id = research_run_id and r.user_id = auth.uid()
    ))
  );

drop policy if exists partner_candidates_owner_all on public.partner_candidates;
create policy partner_candidates_owner_all on public.partner_candidates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists partner_candidates_set_updated_at on public.partner_candidates;
create trigger partner_candidates_set_updated_at before update on public.partner_candidates
  for each row execute function public.set_updated_at();
