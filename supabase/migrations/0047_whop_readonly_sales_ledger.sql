-- Whop read-only payment event ledger.
-- GiGo stores verified sales/refund/dispute facts for reporting only.
-- No payout, balance, transfer, withdrawal, checkout-write or account-admin capability is represented here.

create table if not exists public.whop_payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whop_event_id text not null check (char_length(whop_event_id) between 1 and 200),
  event_type text not null check (event_type in (
    'payment.succeeded','payment.failed','refund.created','dispute.created'
  )),
  payment_id text check (payment_id is null or char_length(payment_id) <= 200),
  product_id text check (product_id is null or char_length(product_id) <= 200),
  plan_id text check (plan_id is null or char_length(plan_id) <= 200),
  partner_id text check (partner_id is null or char_length(partner_id) <= 200),
  amount numeric(20,6) check (amount is null or amount >= 0),
  currency text check (currency is null or currency ~ '^[A-Za-z]{3,12}$'),
  payment_status text check (payment_status is null or char_length(payment_status) <= 40),
  occurred_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  received_at timestamptz not null default now(),
  unique (user_id, whop_event_id)
);

create index if not exists whop_payment_events_owner_received_idx
  on public.whop_payment_events(user_id, received_at desc);
create index if not exists whop_payment_events_owner_payment_idx
  on public.whop_payment_events(user_id, payment_id, received_at desc)
  where payment_id is not null;
create index if not exists whop_payment_events_owner_partner_idx
  on public.whop_payment_events(user_id, partner_id, received_at desc)
  where partner_id is not null;

alter table public.whop_payment_events enable row level security;
revoke all on public.whop_payment_events from public, anon, authenticated;
grant select, insert on public.whop_payment_events to service_role;
comment on table public.whop_payment_events is
  'Server-only, idempotent Whop payment event ledger for read-only sales reporting. No customer contact details or payout controls are stored.';
comment on column public.whop_payment_events.partner_id is
  'Whop affiliate/partner attribution identifier when supplied by a verified event; not a payout instruction.';
comment on column public.whop_payment_events.amount is
  'Observed event amount only. Net proceeds and 50/50 shares must not be inferred until fees, refunds and partner attribution rules are confirmed.';
