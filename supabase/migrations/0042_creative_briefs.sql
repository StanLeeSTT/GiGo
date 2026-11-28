-- Owner-private creative briefs and generated-asset references. No external publishing.
create table if not exists public.creative_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  asset_type text not null check (asset_type in ('image','video','audio','brand_identity','presentation','other')),
  brief text not null check (char_length(brief) between 1 and 10000),
  generation_prompt text,
  target_platform text,
  aspect_ratio text,
  reference_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(reference_urls) = 'array'),
  status text not null default 'draft' check (status in ('draft','ready','in_progress','complete','archived')),
  output_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_briefs_text_limits check (
    (generation_prompt is null or char_length(generation_prompt) <= 10000)
    and (target_platform is null or char_length(target_platform) <= 100)
    and (aspect_ratio is null or char_length(aspect_ratio) <= 40)
    and (output_url is null or char_length(output_url) <= 2048)
    and (notes is null or char_length(notes) <= 5000)
  )
);
create index if not exists creative_briefs_owner_recent_idx
  on public.creative_briefs(user_id, updated_at desc);
alter table public.creative_briefs enable row level security;
drop policy if exists creative_briefs_owner_all on public.creative_briefs;
create policy creative_briefs_owner_all on public.creative_briefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists creative_briefs_set_updated_at on public.creative_briefs;
create trigger creative_briefs_set_updated_at before update on public.creative_briefs
  for each row execute function public.set_updated_at();
comment on table public.creative_briefs is
  'Owner-private creative briefs, prompts and output references. No publishing or paid asset generation is enabled.';
