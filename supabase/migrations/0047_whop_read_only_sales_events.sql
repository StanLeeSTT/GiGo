-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0047_whop_read_only_sales_events.sql
-- ============================================================================
-- Read-only Whop webhook event ledger. GiGo has no funds, checkout, refund,
-- balance, transfer or payout permissions. Whop remains the payment authority.

create table if not exists public.whop_webhook_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null unique,
  event_type text not null check (event_type in (
    'payment.succeeded','payment.failed','refund.created','refund.updated',
    'dispute.created','dispute.updated'
  )),
  payment_id text,
  resource_id text,
  product_id text,
  plan_id text,
  partner_id text,
  company_id text,
  amount numeric(18,6),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists whop_webhook_events_owner_received_idx
  on public.whop_webhook_events(owner_id, received_at desc);
create index if not exists whop_webhook_events_owner_payment_idx
  on public.whop_webhook_events(owner_id, payment_id, received_at desc)
  where payment_id is not null;
create index if not exists whop_webhook_events_owner_partner_idx
  on public.whop_webhook_events(owner_id, partner_id, received_at desc)
  where partner_id is not null;

alter table public.whop_webhook_events enable row level security;
drop policy if exists whop_webhook_events_owner_read on public.whop_webhook_events;
create policy whop_webhook_events_owner_read on public.whop_webhook_events
  for select to authenticated using (owner_id = auth.uid());

revoke all on public.whop_webhook_events from anon, authenticated;
grant select on public.whop_webhook_events to authenticated;
grant all on public.whop_webhook_events to service_role;

comment on table public.whop_webhook_events is
  'Immutable, deduplicated, read-only Whop event ledger for owner sales reporting. No payment or payout actions are exposed to GiGo.';
-- ============================================================================
-- END CANONICAL MIGRATION 0047_whop_read_only_sales_events.sql
-- ============================================================================
