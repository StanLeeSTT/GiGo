-- Research evidence passages and claim-to-source traceability.
-- Stores exact extracted passages and locations; does not assert that a claim is true.

create table if not exists public.research_evidence_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  research_source_id uuid not null references public.research_sources(id) on delete cascade,
  passage_text text not null check (char_length(passage_text) between 1 and 12000),
  locator_type text not null default 'unspecified'
    check (locator_type in ('page','paragraph','section','timestamp','row','cell_range','unspecified')),
  locator_value text check (locator_value is null or char_length(locator_value) <= 300),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  extraction_method text not null default 'manual'
    check (extraction_method in ('manual','pdf_text','html_text','csv_text','transcript','other')),
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed','relevant','irrelevant','disputed')),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (research_source_id, id)
);

create table if not exists public.research_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  claim_text text not null check (char_length(claim_text) between 1 and 3000),
  claim_type text not null default 'finding'
    check (claim_type in ('finding','interpretation','hypothesis','recommendation')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','supported','mixed','contradicted','insufficient_evidence')),
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  passage_id uuid not null references public.research_evidence_passages(id) on delete cascade,
  relationship text not null
    check (relationship in ('supports','contradicts','context')),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 2000),
  created_at timestamptz not null default now(),
  unique (claim_id, passage_id, relationship)
);

create index if not exists research_passages_run_source_idx
  on public.research_evidence_passages(user_id, research_run_id, research_source_id, created_at desc);
create index if not exists research_claims_run_status_idx
  on public.research_claims(user_id, research_run_id, verification_status, updated_at desc);
create index if not exists research_claim_evidence_claim_idx
  on public.research_claim_evidence(user_id, claim_id);

create or replace function public.gigo_check_research_evidence_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_owner uuid;
  source_run uuid;
  claim_owner uuid;
  claim_run uuid;
  passage_owner uuid;
  passage_run uuid;
begin
  if tg_table_name = 'research_evidence_passages' then
    select user_id, research_run_id into source_owner, source_run
      from public.research_sources where id = new.research_source_id;
    if source_owner is distinct from new.user_id or source_run is distinct from new.research_run_id then
      raise exception 'research source ownership or run mismatch' using errcode = '23514';
    end if;
  elsif tg_table_name = 'research_claim_evidence' then
    select user_id, research_run_id into claim_owner, claim_run
      from public.research_claims where id = new.claim_id;
    select user_id, research_run_id into passage_owner, passage_run
      from public.research_evidence_passages where id = new.passage_id;
    if claim_owner is distinct from new.user_id or passage_owner is distinct from new.user_id
      or claim_run is distinct from new.research_run_id or passage_run is distinct from new.research_run_id then
      raise exception 'claim and passage must belong to the same owner and research run' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists research_passages_owner_check on public.research_evidence_passages;
create trigger research_passages_owner_check
  before insert or update of user_id, research_run_id, research_source_id
  on public.research_evidence_passages
  for each row execute function public.gigo_check_research_evidence_ownership();

drop trigger if exists research_claim_evidence_owner_check on public.research_claim_evidence;
create trigger research_claim_evidence_owner_check
  before insert or update of user_id, research_run_id, claim_id, passage_id
  on public.research_claim_evidence
  for each row execute function public.gigo_check_research_evidence_ownership();

drop trigger if exists research_passages_updated_at on public.research_evidence_passages;
create trigger research_passages_updated_at before update on public.research_evidence_passages
  for each row execute function public.set_updated_at();
drop trigger if exists research_claims_updated_at on public.research_claims;
create trigger research_claims_updated_at before update on public.research_claims
  for each row execute function public.set_updated_at();

alter table public.research_evidence_passages enable row level security;
alter table public.research_claims enable row level security;
alter table public.research_claim_evidence enable row level security;

drop policy if exists research_passages_owner_all on public.research_evidence_passages;
create policy research_passages_owner_all on public.research_evidence_passages
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
  );

drop policy if exists research_claims_owner_all on public.research_claims;
create policy research_claims_owner_all on public.research_claims
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
  );

drop policy if exists research_claim_evidence_owner_all on public.research_claim_evidence;
create policy research_claim_evidence_owner_all on public.research_claim_evidence
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_claims c where c.id = claim_id and c.user_id = auth.uid() and c.research_run_id = research_claim_evidence.research_run_id)
    and exists (select 1 from public.research_evidence_passages p where p.id = passage_id and p.user_id = auth.uid() and p.research_run_id = research_claim_evidence.research_run_id)
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_claims c where c.id = claim_id and c.user_id = auth.uid() and c.research_run_id = research_claim_evidence.research_run_id)
    and exists (select 1 from public.research_evidence_passages p where p.id = passage_id and p.user_id = auth.uid() and p.research_run_id = research_claim_evidence.research_run_id)
  );

comment on table public.research_evidence_passages is
  'Exact source passages with optional page/section/timestamp/row locators. Extraction is not verification.';
comment on table public.research_claims is
  'Atomic research claims with explicit verification state; default is unverified.';
comment on table public.research_claim_evidence is
  'Owner-scoped links from claims to exact passages, with support/contradiction/context relationship.';
