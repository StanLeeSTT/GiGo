# Whop, Apify and Decodo integration status

This document records the current guarded implementation. Neither external integration is considered production-ready merely because its code is present.

## Whop: read-only sales monitoring

The Worker route is:

`POST /api/v1/webhooks/whop`

Configure these as Cloudflare Worker secrets/variables (never commit them):

- `WHOP_WEBHOOK_SECRET`: the signing secret for the specific Whop webhook endpoint.
- `WHOP_OWNER_USER_ID`: the UUID of the single GiGo owner in Supabase Auth.
- `WHOP_ACCOUNT_ID`: the expected Whop business/account ID (for example, the `biz_...` identifier), stored as a Worker variable.
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: existing server-side database configuration.

Subscribe only to the payment events handled by the receiver:

- `payment.succeeded`
- `payment.failed`
- `refund.created`
- `dispute.created`

The receiver verifies the signed raw request body and a five-minute timestamp window, uses the signed `webhook-id` as its deduplication key, and rejects events unless their account/company ID (including the nested `data.company.id` form) matches `WHOP_ACCOUNT_ID`. It then inserts an idempotent event record. Unsupported but valid events are acknowledged and ignored. Only allow-listed sales fields are stored; customer contact details and raw webhook bodies are not stored.

The Analytics workspace includes a read-only Whop sales monitor. The owner-only report endpoint is:

`GET /api/v1/whop/sales`

It reports observed sales, failed payments, refunds, disputes and attributed partner sales from the latest 500 events. Amounts are grouped by currency. It does not calculate distributable net proceeds or 50/50 shares yet because Whop fees, refund treatment and the intended gross-versus-net split have not been confirmed.

**Permanent boundary:** GiGo has no checkout-write, payout, withdrawal, transfer, balance-management or Whop account-administration capability. Whop itself remains responsible for checkout and any configured affiliate/partner payout. A future API reconciliation key, if needed, must be read-only and payment-scoped.

## Apify: bounded, quota-capped collection adapter

A bounded adapter exists in `src/collection/apify.ts`. It calls only the fixed official `apify~web-scraper` Actor, accepts only credential-free public HTTPS URLs, caps a run at ten pages, limits returned data and preserves checkpoints.

Apify is registered by the trusted batch worker when `APIFY_API_TOKEN` is present, but a job cannot make an Actor call unless its owner has enabled a monthly quota policy. The reservation RPC supplies a mandatory `maxTotalChargeUsd` cap and `maxItems` limit to the fixed `apify~web-scraper` Actor. Keep the provider record disabled/unhealthy until the owner has configured and reviewed the policy. Apify documents `maxTotalChargeUsd` as a per-run spending limit and `maxItems` as a cap on billable results for pay-per-result Actors. The monthly reservation counts each Actor invocation conservatively; the per-run charge cap limits provider-side spend for that invocation.

## Decodo: Web Data API

Decodo is a separate supported provider, not a replacement for Apify. Its adapter uses the official bearer-authenticated Web Data API `/scrape` endpoint and collects bounded public-page evidence. The trusted batch worker registers it only when `DECODO_API_KEY` is present. Every outbound scrape first reserves one request against the owner's monthly quota policy; if no enabled policy exists or the ceiling is exhausted, the request is rejected before leaving GiGo.

Decodo currently advertises a free tier of up to 10,000 requests/pages per month with no credit card required. Account entitlements and usage must still be checked in the Decodo dashboard. GiGo counts attempted calls conservatively, even though Decodo's pricing page says failed requests are not charged. Search, map and crawl endpoints are not yet enabled by GiGo's adapter; the current registered capability is only `web_fetch`.

## Database setup

The new server-only ledger is migration:

`supabase/migrations/0048_collection_provider_quota_ledger.sql` (monthly Apify/Decodo limits) and `supabase/migrations/0047_whop_readonly_sales_ledger.sql` (Whop event ledger)

Both are included in `supabase/GIGO_ONE_FILE_SETUP.sql`. Run `npm run db:bundle` after adding any migration; `npm run db:bundle:check` verifies that the combined file exactly matches canonical migrations 0010-0048. CI runs this check. The migration has **not** been applied to the user's Supabase project by this code change. Apply the bundle only after verifying the existing database's migration history against the documented preflight requirements; do not run it against a fresh or mismatched database.

## Not yet completed

- No live Whop webhook has been delivered to this Worker.
- No Whop API reconciliation call has been made.
- No live affiliate/50-50 configuration has been verified in the Whop dashboard.
- No Apify Actor run has been made with the user's account.
- No Decodo live request has been made with the user's account.
- Monthly quota policies remain disabled by default and must be explicitly configured by the owner.
- No deployment or Supabase SQL application is claimed.
