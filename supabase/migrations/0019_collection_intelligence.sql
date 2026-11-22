-- Evidence-backed intelligence derived from collected records.
-- Insights are separate from raw collection items and always retain explicit evidence links.

create table if not exists public.collection_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  dataset_id uuid not null,
  insight_key text not null check (char_length(insight_key) between 1 and 160),
  insight_type text not null check (insight_type in (
    'market_signal','customer_problem','competitor','product_opportunity',
    'lead_candidate','trend','risk','fact','other'
  )),
  title text not null check (char_length(title) between 1 and 240),
  summary text not null check (char_length(summary) between 1 and 8000),
  structured_data jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_data) = 'object'),
  confidence numeric(5,4) check (confidence between 0 and 1),
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review','accepted','rejected','superseded')),
  created_by text not null default 'assistant'
    check (created_by in ('assistant','user','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, insight_key),
  unique (id, run_id, dataset_id, user_id),
  constraint collection_insights_dataset_run_owner_fk
    foreign key (dataset_id, run_id, user_id)
    references public.collection_datasets(id, run_id, user_id)
    on delete cascade
);

create table if not exists public.collection_insight_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  insight_id uuid not null,
  run_id uuid not null,
  dataset_id uuid not null,
  item_id uuid not null,
  evidence_role text not null default 'supports'
    check (evidence_role in ('supports','contradicts','context')),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (insight_id, item_id),
  constraint collection_insight_evidence_insight_fk
    foreign key (insight_id, run_id, dataset_id, user_id)
    references public.collection_insights(id, run_id, dataset_id, user_id)
    on delete cascade,
  constraint collection_insight_evidence_item_fk
    foreign key (item_id, dataset_id, run_id, user_id)
    references public.collection_items(id, dataset_id, run_id, user_id)
    on delete cascade
);

create index if not exists collection_insights_user_status_idx
  on public.collection_insights(user_id, review_status, updated_at desc);
create index if not exists collection_insights_run_type_idx
  on public.collection_insights(run_id, insight_type, created_at desc);
create index if not exists collection_insight_evidence_item_idx
  on public.collection_insight_evidence(item_id);

alter table public.collection_insights enable row level security;
alter table public.collection_insight_evidence enable row level security;

drop policy if exists collection_insights_owner_all on public.collection_insights;
create policy collection_insights_owner_all on public.collection_insights
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists collection_insight_evidence_owner_all on public.collection_insight_evidence;
create policy collection_insight_evidence_owner_all on public.collection_insight_evidence
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.collection_insights i
      where i.id = insight_id and i.run_id = run_id
        and i.dataset_id = dataset_id and i.user_id = auth.uid()
    )
    and exists (
      select 1 from public.collection_items ci
      where ci.id = item_id and ci.dataset_id = dataset_id
        and ci.run_id = run_id and ci.user_id = auth.uid()
    )
  );

drop trigger if exists collection_insights_set_updated_at on public.collection_insights;
create trigger collection_insights_set_updated_at before update on public.collection_insights
  for each row execute function public.set_updated_at();

create or replace function public.gigo_create_collection_insight(
  p_run_id uuid,
  p_dataset_id uuid,
  p_insight_key text,
  p_insight_type text,
  p_title text,
  p_summary text,
  p_structured_data jsonb,
  p_confidence numeric,
  p_evidence_item_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_insight_id uuid;
  safe_evidence_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_insight_key is null or char_length(p_insight_key) not between 1 and 160
     or p_insight_type not in ('market_signal','customer_problem','competitor','product_opportunity','lead_candidate','trend','risk','fact','other')
     or p_title is null or char_length(p_title) not between 1 and 240
     or p_summary is null or char_length(p_summary) not between 1 and 8000
     or jsonb_typeof(coalesce(p_structured_data, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_structured_data, '{}'::jsonb)::text) > 16384
     or (p_confidence is not null and (p_confidence < 0 or p_confidence > 1))
     or coalesce(cardinality(p_evidence_item_ids),0) not between 1 and 25 then
    raise exception 'invalid collection insight' using errcode = '22023';
  end if;

  if (select count(distinct x) from unnest(p_evidence_item_ids) as x)
       <> cardinality(p_evidence_item_ids) then
    raise exception 'duplicate evidence item ids' using errcode = '22023';
  end if;

  select count(*) into safe_evidence_count
    from public.collection_items ci
    where ci.id = any(p_evidence_item_ids)
      and ci.run_id = p_run_id
      and ci.dataset_id = p_dataset_id
      and ci.user_id = auth.uid();

  if safe_evidence_count <> cardinality(p_evidence_item_ids) then
    raise exception 'evidence items must belong to this owner's dataset and run' using errcode = '42501';
  end if;

  insert into public.collection_insights(
    user_id, run_id, dataset_id, insight_key, insight_type, title,
    summary, structured_data, confidence, created_by
  ) values (
    auth.uid(), p_run_id, p_dataset_id, p_insight_key, p_insight_type, p_title,
    p_summary, coalesce(p_structured_data, '{}'::jsonb), p_confidence, 'assistant'
  )
  on conflict (run_id, insight_key) do update
    set insight_type = excluded.insight_type,
        title = excluded.title,
        summary = excluded.summary,
        structured_data = excluded.structured_data,
        confidence = excluded.confidence
    where public.collection_insights.user_id = auth.uid()
  returning id into new_insight_id;

  if new_insight_id is null then
    raise exception 'insight key already exists outside this owner scope' using errcode = '23505';
  end if;

  insert into public.collection_insight_evidence(
    user_id, insight_id, run_id, dataset_id, item_id, evidence_role
  )
  select auth.uid(), new_insight_id, p_run_id, p_dataset_id, ci.id, 'supports'
  from public.collection_items ci
  where ci.id = any(p_evidence_item_ids)
    and ci.run_id = p_run_id
    and ci.dataset_id = p_dataset_id
    and ci.user_id = auth.uid()
  on conflict (insight_id, item_id) do nothing;

  return new_insight_id;
end;
$$;

revoke all on function public.gigo_create_collection_insight(uuid, uuid, text, text, text, text, jsonb, numeric, uuid[]) from public, anon;
grant execute on function public.gigo_create_collection_insight(uuid, uuid, text, text, text, text, jsonb, numeric, uuid[]) to authenticated;

comment on table public.collection_insights is
  'Structured interpretations of collected data. Every insight must link to evidence items from the same owner, run and dataset.';
comment on table public.collection_insight_evidence is
  'Explicit supporting, contradicting or contextual links between an insight and its raw collected evidence.';
