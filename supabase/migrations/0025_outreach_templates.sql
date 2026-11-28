-- Campaign-approved email copy templates. Approval freezes the sequence content.
create table if not exists public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  sequence_number integer not null check (sequence_number between 0 and 5),
  message_type text not null check (message_type in ('initial','follow_up')),
  subject_template text not null check (char_length(subject_template) between 1 and 300),
  body_template text not null check (char_length(body_template) between 1 and 20000),
  personalization_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(personalization_fields) = 'array'),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_templates_campaign_owner_fk
    foreign key (campaign_id, user_id) references public.outreach_campaigns(id, user_id) on delete cascade,
  unique (campaign_id, sequence_number),
  unique (id, user_id),
  check ((sequence_number = 0 and message_type = 'initial') or (sequence_number > 0 and message_type = 'follow_up'))
);

create index if not exists outreach_templates_campaign_sequence_idx
  on public.outreach_templates(user_id, campaign_id, sequence_number);
alter table public.outreach_templates enable row level security;
drop policy if exists outreach_templates_owner_all on public.outreach_templates;
create policy outreach_templates_owner_all on public.outreach_templates
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

drop trigger if exists outreach_templates_set_updated_at on public.outreach_templates;
create trigger outreach_templates_set_updated_at before update on public.outreach_templates
  for each row execute function public.set_updated_at();

comment on table public.outreach_templates is
  'Owner-authored initial and follow-up copy. Campaign approval validates the complete sequence and freezes the templates.';
