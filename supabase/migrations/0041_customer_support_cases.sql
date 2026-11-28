-- Owner-private support case tracking and response drafts; no outbound delivery.
create table if not exists public.customer_support_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null check (char_length(customer_name) between 1 and 200),
  customer_email text,
  subject text not null check (char_length(subject) between 1 and 240),
  issue_description text not null check (char_length(issue_description) between 1 and 10000),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','investigating','waiting_on_customer','resolved','closed')),
  response_draft text,
  internal_notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint customer_support_text_limits check (
    (customer_email is null or char_length(customer_email) <= 320)
    and (response_draft is null or char_length(response_draft) <= 10000)
    and (internal_notes is null or char_length(internal_notes) <= 10000)
    and (source is null or char_length(source) <= 100)
  )
);
create index if not exists customer_support_owner_status_idx
  on public.customer_support_cases(user_id,status,updated_at desc);
alter table public.customer_support_cases enable row level security;
drop policy if exists customer_support_cases_owner_all on public.customer_support_cases;
create policy customer_support_cases_owner_all on public.customer_support_cases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists customer_support_cases_set_updated_at on public.customer_support_cases;
create trigger customer_support_cases_set_updated_at before update on public.customer_support_cases
  for each row execute function public.set_updated_at();
comment on table public.customer_support_cases is
  'Owner-private support case tracker and response drafts. Does not send customer communications.';
