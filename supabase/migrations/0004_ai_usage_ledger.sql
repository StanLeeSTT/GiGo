-- GiGo AI provider usage ledger.
-- API keys remain in Cloudflare Worker secrets; this table stores only safe key identifiers and token counts.

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 80),
  model text not null check (char_length(model) between 1 and 160),
  key_id text not null default 'default' check (char_length(key_id) between 1 and 120),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  completion_tokens bigint not null default 0 check (completion_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);
create index if not exists ai_usage_events_user_provider_key_idx
  on public.ai_usage_events (user_id, provider, key_id, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "Users can view their own AI usage" on public.ai_usage_events;
create policy "Users can view their own AI usage"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own AI usage" on public.ai_usage_events;
create policy "Users can insert their own AI usage"
  on public.ai_usage_events for insert
  with check (auth.uid() = user_id);
