-- Cross-platform lead identity and source-backed qualification evidence.
-- This migration enriches the existing Leads CRM without enabling any platform scraping.

create unique index if not exists leads_id_user_unique
  on public.leads(id, user_id);

create table if not exists public.lead_social_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null,
  platform text not null check (platform in ('youtube','instagram','tiktok','facebook','x','linkedin','other')),
  profile_url text not null check (char_length(profile_url) between 8 and 2048),
  handle text check (handle is null or char_length(handle) <= 200),
  display_name text check (display_name is null or char_length(display_name) <= 240),
  account_type text check (account_type is null or char_length(account_type) <= 100),
  follower_count bigint check (follower_count is null or follower_count >= 0),
  typical_views bigint check (typical_views is null or typical_views >= 0),
  engagement_rate numeric(8,5) check (engagement_rate is null or engagement_rate between 0 and 100),
  niche text check (niche is null or char_length(niche) <= 240),
  public_contact_route text check (public_contact_route is null or char_length(public_contact_route) <= 500),
  verified_at timestamptz,
  source_item_id uuid,
  source_dataset_id uuid,
  source_run_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_social_profiles_lead_owner_fk
    foreign key (lead_id, user_id) references public.leads(id, user_id) on delete cascade,
  constraint lead_social_profiles_source_item_fk
    foreign key (source_item_id, source_dataset_id, source_run_id, user_id)
    references public.collection_items(id, dataset_id, run_id, user_id) on delete set null,
  unique (user_id, platform, profile_url),
  unique (id, user_id)
);

create table if not exists public.lead_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null,
  evidence_type text not null check (evidence_type in (
    'audience_fit','typical_reach','engagement','credibility','business_contact',
    'customer_problem','buying_intent','competitor_conflict','reputation','other'
  )),
  source_url text not null check (char_length(source_url) between 8 and 2048),
  source_title text check (source_title is null or char_length(source_title) <= 500),
  excerpt text check (excerpt is null or char_length(excerpt) <= 5000),
  observed_at timestamptz not null default now(),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  source_item_id uuid,
  source_dataset_id uuid,
  source_run_id uuid,
  notes text check (notes is null or char_length(notes) <= 3000),
  created_at timestamptz not null default now(),
  constraint lead_evidence_lead_owner_fk
    foreign key (lead_id, user_id) references public.leads(id, user_id) on delete cascade,
  constraint lead_evidence_source_item_fk
    foreign key (source_item_id, source_dataset_id, source_run_id, user_id)
    references public.collection_items(id, dataset_id, run_id, user_id) on delete set null,
  unique (id, user_id)
);

create index if not exists lead_social_profiles_lead_platform_idx
  on public.lead_social_profiles(user_id, lead_id, platform);
create index if not exists lead_social_profiles_platform_followers_idx
  on public.lead_social_profiles(user_id, platform, follower_count desc);
create index if not exists lead_evidence_lead_observed_idx
  on public.lead_evidence(user_id, lead_id, observed_at desc);
create index if not exists lead_evidence_type_idx
  on public.lead_evidence(user_id, evidence_type, observed_at desc);

alter table public.lead_social_profiles enable row level security;
alter table public.lead_evidence enable row level security;

drop policy if exists lead_social_profiles_owner_all on public.lead_social_profiles;
create policy lead_social_profiles_owner_all on public.lead_social_profiles
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid())
    and (
      source_item_id is null or exists (
        select 1 from public.collection_items ci
        where ci.id = source_item_id and ci.dataset_id = source_dataset_id
          and ci.run_id = source_run_id and ci.user_id = auth.uid()
      )
    )
  );

drop policy if exists lead_evidence_owner_all on public.lead_evidence;
create policy lead_evidence_owner_all on public.lead_evidence
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = auth.uid())
    and (
      source_item_id is null or exists (
        select 1 from public.collection_items ci
        where ci.id = source_item_id and ci.dataset_id = source_dataset_id
          and ci.run_id = source_run_id and ci.user_id = auth.uid()
      )
    )
  );

drop trigger if exists lead_social_profiles_set_updated_at on public.lead_social_profiles;
create trigger lead_social_profiles_set_updated_at before update on public.lead_social_profiles
  for each row execute function public.set_updated_at();

comment on table public.lead_social_profiles is
  'Owner-scoped public professional/social profile identities for a CRM lead; metrics are nullable and must be evidence-backed.';
comment on table public.lead_evidence is
  'Source-backed lead qualification evidence. Store public/permitted evidence only; do not harvest private messages or sensitive personal data.';
