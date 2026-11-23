-- Allow the authenticated owner to update only the extraction lifecycle state.
grant update (ingestion_status) on public.research_documents to authenticated;

-- Connect exact extracted passages to the private uploaded document that produced them.
-- This preserves the existing source -> passage traceability while making document
-- provenance enforceable by the database, not just descriptive JSON metadata.

alter table public.research_evidence_passages
  add column if not exists research_document_id uuid
  references public.research_documents(id) on delete cascade;

create unique index if not exists research_passages_document_locator_uidx
  on public.research_evidence_passages(research_document_id, locator_type, locator_value);

create index if not exists research_passages_document_idx
  on public.research_evidence_passages(user_id, research_document_id, created_at desc)
  where research_document_id is not null;

create or replace function public.gigo_check_research_evidence_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_owner uuid;
  source_run uuid;
  source_url text;
  claim_owner uuid;
  claim_run uuid;
  passage_owner uuid;
  passage_run uuid;
  document_owner uuid;
  document_run uuid;
begin
  if tg_table_name = 'research_evidence_passages' then
    select user_id, research_run_id, url into source_owner, source_run, source_url
      from public.research_sources where id = new.research_source_id;
    if source_owner is distinct from new.user_id or source_run is distinct from new.research_run_id then
      raise exception 'research source ownership or run mismatch' using errcode = '23514';
    end if;
    if new.research_document_id is not null then
      select user_id, research_run_id into document_owner, document_run
        from public.research_documents where id = new.research_document_id;
      if document_owner is distinct from new.user_id or document_run is distinct from new.research_run_id
        or source_url is distinct from ('gigo://research-document/' || new.research_document_id::text) then
        raise exception 'research document, source and passage must share owner and run provenance' using errcode = '23514';
      end if;
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
  before insert or update of user_id, research_run_id, research_source_id, research_document_id
  on public.research_evidence_passages
  for each row execute function public.gigo_check_research_evidence_ownership();

drop policy if exists research_passages_owner_all on public.research_evidence_passages;
create policy research_passages_owner_all on public.research_evidence_passages
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
    and (research_document_id is null or exists (
      select 1 from public.research_documents d
      where d.id = research_document_id and d.user_id = auth.uid() and d.research_run_id = research_run_id
    ))
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_runs r where r.id = research_run_id and r.user_id = auth.uid())
    and exists (select 1 from public.research_sources s where s.id = research_source_id and s.user_id = auth.uid() and s.research_run_id = research_run_id)
    and (research_document_id is null or exists (
      select 1 from public.research_documents d
      where d.id = research_document_id and d.user_id = auth.uid() and d.research_run_id = research_run_id
    ))
  );

comment on column public.research_evidence_passages.research_document_id is
  'Private uploaded document provenance; must match passage owner/run and the linked gigo://research-document source URL.';
