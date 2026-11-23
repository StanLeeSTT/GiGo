-- Owner-private customer feedback records. This module drafts/organises support work only.
create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text,
  contact_email text,
  source text not null check (source in ('email','review','social','survey','call','other')),
  rating smallint check (rating is null or rating between 1 and 5),
  sentiment text not null default 'unclassified' check (sentiment in ('positive','neutral','negative','unclassified')),
  topic text,
  feedback text not null check (char_length(feedback) between 1 and 10000),
  evidence_url text,
  status text not null default 'new' check (status in ('new','reviewing','actioned','closed')),
  response_draft text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_feedback_text_limits check (
    (customer_name is null or char_length(customer_name) <= 200)
    and (contact_email is null or char_length(contact_email) <= 320)
    and (topic is null or char_length(topic) <= 200)
    and (evidence_url is null or char_length(evidence_url) <= 2048)
    and (response_draft is null or char_length(response_draft) <= 5000)
    and (internal_notes is null or char_length(internal_notes) <= 5000)
  )
);
create index if not exists customer_feedback_owner_recent_idx
  on public.customer_feedback(user_id, created_at desc);
alter table public.customer_feedback enable row level security;
drop policy if exists customer_feedback_owner_all on public.customer_feedback;
create policy customer_feedback_owner_all on public.customer_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists customer_feedback_set_updated_at on public.customer_feedback;
create trigger customer_feedback_set_updated_at before update on public.customer_feedback
  for each row execute function public.set_updated_at();
comment on table public.customer_feedback is
  'Owner-private customer feedback and internal response drafts. No customer message is sent by this table.';
