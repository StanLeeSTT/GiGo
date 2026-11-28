-- Explicit human review transitions and immutable review history for collection insights.
create unique index if not exists collection_insights_id_user_unique
  on public.collection_insights(id, user_id);
create table if not exists public.collection_insight_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_id uuid not null,
  previous_status text not null check (previous_status in ('needs_review','accepted','rejected','superseded')),
  new_status text not null check (new_status in ('accepted','rejected','superseded')),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  constraint collection_insight_reviews_insight_owner_fk
    foreign key (insight_id, user_id)
    references public.collection_insights(id, user_id)
    on delete cascade
);

create index if not exists collection_insight_reviews_owner_time_idx
  on public.collection_insight_reviews(user_id, created_at desc);
create index if not exists collection_insight_reviews_insight_time_idx
  on public.collection_insight_reviews(insight_id, created_at desc);

alter table public.collection_insight_reviews enable row level security;
drop policy if exists collection_insight_reviews_owner_read on public.collection_insight_reviews;
create policy collection_insight_reviews_owner_read on public.collection_insight_reviews
  for select using (user_id = auth.uid());
drop policy if exists collection_insight_reviews_owner_insert on public.collection_insight_reviews;
create policy collection_insight_reviews_owner_insert on public.collection_insight_reviews
  for insert with check (user_id = auth.uid());

create or replace function public.gigo_review_collection_insight(
  p_insight_id uuid,
  p_review_status text,
  p_note text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_review_status not in ('accepted','rejected','superseded')
     or (p_note is not null and char_length(p_note) > 2000) then
    raise exception 'invalid insight review' using errcode = '22023';
  end if;

  select i.review_status into old_status
    from public.collection_insights i
    where i.id = p_insight_id and i.user_id = auth.uid()
    for update;
  if not found then return false; end if;

  if not (
    (old_status = 'needs_review' and p_review_status in ('accepted','rejected'))
    or (old_status = 'accepted' and p_review_status = 'superseded')
    or (old_status = 'rejected' and p_review_status = 'superseded')
  ) then
    raise exception 'review transition not allowed' using errcode = '22023';
  end if;

  update public.collection_insights
    set review_status = p_review_status
    where id = p_insight_id and user_id = auth.uid();

  insert into public.collection_insight_reviews(user_id, insight_id, previous_status, new_status, note)
    values (auth.uid(), p_insight_id, old_status, p_review_status, nullif(btrim(p_note), ''));

  return true;
end;
$$;

revoke all on function public.gigo_review_collection_insight(uuid, text, text) from public, anon;
grant execute on function public.gigo_review_collection_insight(uuid, text, text) to authenticated;

comment on table public.collection_insight_reviews is
  'Owner-only append-only audit trail for explicit collection insight review decisions.';
