-- GiGo Lead CRM and Offer Builder foundation.
-- Apply after migrations 0001-0006.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  organisation text,
  email text,
  website text,
  source text,
  source_url text,
  customer_problem text,
  fit_score numeric(5,2) check (fit_score is null or fit_score between 0 and 100),
  stage text not null default 'new'
    check (stage in ('new','qualified','contacted','proposal','won','lost','do_not_contact')),
  do_not_contact boolean not null default false,
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  target_customer text,
  promised_outcome text,
  deliverables jsonb not null default '[]'::jsonb,
  exclusions text,
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  price_currency char(3) not null default 'NGN',
  delivery_cost numeric(12,2) check (delivery_cost is null or delivery_cost >= 0),
  payment_fee_percent numeric(5,2) check (payment_fee_percent is null or payment_fee_percent between 0 and 100),
  partner_share_percent numeric(5,2) check (partner_share_percent is null or partner_share_percent between 0 and 100),
  status text not null default 'draft'
    check (status in ('draft','validating','ready','active','archived')),
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_user_stage_updated_idx
  on public.leads(user_id, stage, updated_at desc);
create index if not exists leads_user_email_idx
  on public.leads(user_id, lower(email));
create index if not exists offers_user_status_updated_idx
  on public.offers(user_id, status, updated_at desc);

alter table public.leads enable row level security;
alter table public.offers enable row level security;

drop policy if exists leads_owner_all on public.leads;
create policy leads_owner_all on public.leads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists offers_owner_all on public.offers;
create policy offers_owner_all on public.offers
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (product_id is null or exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid()
    ))
  );

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at before update on public.offers
  for each row execute function public.set_updated_at();
