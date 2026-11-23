-- Owner-scoped marketing asset drafts. This migration stores content only; it does not publish or send.
create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  asset_type text not null check (asset_type in ('social_post','email_copy','landing_page','advertisement','video_script','blog_article','other')),
  platform text,
  campaign_name text,
  objective text,
  audience text,
  content text not null check (char_length(content) between 1 and 30000),
  status text not null default 'draft' check (status in ('draft','review','approved','archived')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_assets_text_limits check (
    (platform is null or char_length(platform) <= 80)
    and (campaign_name is null or char_length(campaign_name) <= 200)
    and (objective is null or char_length(objective) <= 2000)
    and (audience is null or char_length(audience) <= 1000)
  )
);
create index if not exists marketing_assets_owner_updated_idx
  on public.marketing_assets(user_id, updated_at desc);
alter table public.marketing_assets enable row level security;
drop policy if exists marketing_assets_owner_all on public.marketing_assets;
create policy marketing_assets_owner_all on public.marketing_assets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists marketing_assets_set_updated_at on public.marketing_assets;
create trigger marketing_assets_set_updated_at before update on public.marketing_assets
  for each row execute function public.set_updated_at();
comment on table public.marketing_assets is
  'Owner-private marketing copy drafts and review state. No publishing or external delivery is enabled by this table.';
