-- Private owner-scoped research document metadata. Binary objects live in a private R2 bucket.
create table if not exists public.research_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  object_key text not null unique check (char_length(object_key) between 1 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (content_type in ('text/plain','text/html','text/csv','application/pdf')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  ingestion_status text not null default 'uploaded' check (ingestion_status in ('uploaded','extracted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_documents_owner_run_idx
  on public.research_documents(user_id,research_run_id,created_at desc);
create or replace function public.gigo_check_research_document_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare run_owner uuid;
begin
  select user_id into run_owner from public.research_runs where id=new.research_run_id;
  if run_owner is distinct from new.user_id then
    raise exception 'research document owner/run mismatch' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists research_documents_owner_check on public.research_documents;
create trigger research_documents_owner_check before insert or update of user_id,research_run_id
  on public.research_documents for each row execute function public.gigo_check_research_document_owner();
drop trigger if exists research_documents_updated_at on public.research_documents;
create trigger research_documents_updated_at before update on public.research_documents
  for each row execute function public.set_updated_at();
alter table public.research_documents enable row level security;
revoke all on public.research_documents from public,anon,authenticated;
grant select,insert,delete on public.research_documents to authenticated;
drop policy if exists research_documents_owner_all on public.research_documents;
create policy research_documents_owner_all on public.research_documents for all
  using (user_id=auth.uid() and exists(select 1 from public.research_runs r where r.id=research_run_id and r.user_id=auth.uid()))
  with check (user_id=auth.uid() and exists(select 1 from public.research_runs r where r.id=research_run_id and r.user_id=auth.uid()));
comment on table public.research_documents is 'Private R2-backed research files; object keys are never public URLs.';
