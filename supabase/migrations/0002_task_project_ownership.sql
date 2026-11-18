-- Keep tasks attached only to projects owned by the same account.
-- Runs with the caller's auth context and relies on projects RLS.
create or replace function public.check_task_project_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
    select 1
    from public.projects p
    where p.id = new.project_id
      and p.user_id = new.user_id
  ) then
    raise exception 'The selected project does not belong to this account.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_check_project_owner on public.tasks;
create trigger tasks_check_project_owner
before insert or update of project_id, user_id on public.tasks
for each row execute function public.check_task_project_owner();

create index if not exists tasks_user_created_idx
  on public.tasks(user_id, created_at desc);
