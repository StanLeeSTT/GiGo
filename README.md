# GiGo

**GiGo is a private, single-owner AI assistant and business operating system.**

It is being built as a cloud-first, mobile-first personal workspace that can research opportunities, organise work, build products and offers, manage leads and partners, prepare compliant outreach, support customers, create marketing/creative briefs and report on saved business activity.

The long-term direction is a Jarvis-like conversational assistant with persistent context, natural voice interaction and coordinated workflows. The current product is a guarded web application and API; it is not yet a fully autonomous production service.

## Product principles

- Single owner and private workspace first.
- Zero-budget-first: free/open-source tiers only unless the owner explicitly approves a cost.
- Evidence before claims: preserve source URLs and provenance; never fabricate leads, facts, prices, delivery or earnings.
- Separate drafts, internal actions, owner approvals and external side effects.
- Durable jobs, checkpoints, retries and audit history for background work.
- Never bypass platform access controls, authentication, CAPTCHAs, robots policies or provider terms.
- Financial actions are permanently denied: no payments, transfers, purchases, subscriptions, investments, trades, withdrawals, deposits, payouts, charges or other money movement.
- Never claim a task succeeded without confirmation from its authoritative system.

## Current modules

- Personal workspace: overview, projects, tasks and AI Assistant.
- Research Engine: research runs, source discovery, exact evidence passages, owner-reviewed claims, claim/evidence links, private R2-backed document uploads and Markdown evidence report export. PDF OCR/binary extraction is not yet available.
- Product/Partner Studio: product ideas, partner candidates and proposals.
- Leads & CRM: prospect records and evidence.
- Offers: offer drafts and unit-economics notes.
- Marketing and Creative Studio: campaign/creative briefs and saved draft assets.
- Outreach Studio: draft campaigns, recipient eligibility review, approved templates, partnership 50/50 net-revenue terms and message queue preparation. **No live sender is connected; messages are not delivered.**
- Customers: internal support cases and unsent response drafts.
- Analytics: counts and workflow status from saved workspace records. It does not claim revenue, profit, conversion, cost or ROI without transaction data.
- Learning: private learning plans and milestones.
- Settings: AI provider pool, outbound signature and autonomy controls.

## Architecture

- Frontend: responsive static web app in `public/`.
- API/runtime: Cloudflare Worker in `src/index.ts`.
- Database/auth: Supabase Postgres and Auth, with owner-scoped access and row-level security.
- AI: provider router in `src/assistant/providers.ts`; credentials stay in Worker secrets.
- Durable background work: Supabase job tables/RPCs and Worker scheduled trigger.
- Collection engine: provider catalogue, actor schemas, provider planner, bounded runner and durable worker/store contracts. The adapter registry is intentionally empty until a provider passes verification and network-safety review. Social-platform collection is not live.

## Local development

Requirements: Node.js 22+, npm, a Supabase project, and (for Worker preview) Wrangler.

```bash
npm install
npm run typecheck
npm test
find public -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 -n1 node --check
```

Create local Worker secrets in `.dev.vars` (do not commit this file):

```ini
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
OWNER_EMAIL=YOUR_OWNER_EMAIL
ALLOWED_ORIGINS=http://localhost:8787
APP_ENV=development
```

Then run:

```bash
npm run dev
```

For production, configure Worker variables/secrets using Cloudflare's dashboard or `wrangler secret put NAME`. Never put real API keys in Git, browser JavaScript, issue comments or chat. The AI router accepts a server-side `AI_PROVIDER_POOL` JSON secret; only explicitly enabled free-tier provider entries should be used. Do not rotate keys to bypass provider rate limits.

## Database migrations

The canonical, versioned source of truth remains `supabase/migrations/`. Keep every individual migration file; do not delete or replace that history with a generated bundle.

For the **existing GiGo Supabase project only**, a convenience one-file SQL bundle is available at `supabase/GIGO_ONE_FILE_SETUP.sql`. It concatenates canonical migrations `0010` through `0045` in order, inside one transaction with baseline preflight and postflight checks. It assumes the previously confirmed baseline (`0001`, `0004`–`0009`) is already installed and that `0010`–`0045` are still unapplied. The status of `0002`/`0003` remains uncertain and this bundle does not replay them.

**Run the bundle once only, after checking the target project's migration history.** It is not a fresh-project bootstrap and must not be re-run after successful application. If any preflight check fails, stop and reconcile the database rather than removing the guard. Running SQL manually in the Supabase SQL Editor does not automatically record these versions in Supabase's migration ledger; before returning to Supabase CLI migrations, reconcile the ledger with the CLI migration-repair workflow after verifying the actual database state. Never blindly run `db push`.

The bundle creates database objects only. It does not configure Cloudflare/R2, secrets, API providers, sender domains or deployments. External outreach remains disabled. The codebase has not been confirmed fully deployed or production-ready.

## Production readiness — important

The source code and CI are not the same as a live deployment. Before calling GiGo production-ready:

1. Confirm the exact Supabase project and migration history; apply/reconcile pending migrations deliberately.
2. Configure and verify Cloudflare Worker secrets and allowed browser origins.
3. Deploy the Worker and static assets, then verify health, authentication and every owner-scoped API.
4. Initialize the owner autonomy state. It must start globally paused; test pause and fail-closed behavior.
5. Save and verify the owner's outbound signature (`STANLEE`) after its migration is applied.
6. Run end-to-end checks for Research, CRM, offers, projects, support cases, learning, analytics and assistant tool calls.
7. Keep outbound sending disabled until provider policy, sender authentication, registered audience, lawful basis, signed inbound webhooks, suppression checks and explicit owner approvals are all implemented and tested.
8. Keep Universal Collection Engine adapters disabled until each integration has verified permissions, quota accounting, DNS/IP and redirect protections, rate limits and provenance tests.
9. Verify backups, recovery, monitoring, secrets rotation and a rollback plan.

## Outreach terms and controls

Partnership proposals must state a 50/50 split of net revenue attributable to the agreed partnership, after only direct costs both parties approve and document in advance. This is not a split of gross revenue or all company revenue. Attribution, eligible revenue, costs, responsibilities, payment records/timing, refunds, duration and exit terms must be defined before a binding agreement. GiGo cannot accept counteroffers, sign contracts, promise earnings or make financial commitments.

Automatic outreach is not enabled. Campaign preparation does not send messages. A guarded Resend adapter exists as unregistered code only; there is no send worker, webhook route or configured sender. Publicly visible contact details do not automatically create marketing permission. See [outbound provider adapter readiness](docs/OUTBOUND_PROVIDER_ADAPTER_READINESS.md) for the implementation safeguards and activation checklist.

## Decodo Web Data API (optional)

GiGo includes an opt-in Decodo adapter for public-page metadata collection. Add `DECODO_API_KEY` as a trusted GitHub Actions/worker secret; never place it in Supabase tables, source code, browser settings or chat. The provider remains disabled until the owner creates/configures a healthy `decodo` provider record with the `web_fetch` capability. The adapter currently executes the reviewed public-page metadata scrape path; the other official endpoints (`/search`, `/map`, `/crawl`) are exposed by the client helper but are not yet separate GiGo actors. Respect site terms, privacy rules and access restrictions. Decodo advertises up to 10,000 free requests per month, but GiGo does not yet enforce a hard monthly quota; monitor Decodo usage and keep autonomous execution disabled until quota accounting is added. See https://decodo.com/developers.

## CI

GitHub Actions runs TypeScript typecheck, the Node test suite and browser JavaScript syntax checks on the feature branch. Check the latest workflow result rather than assuming every commit is green.

## License and deployment

No production deployment, third-party sender, or external social collector should be assumed from repository contents alone. Review each dependency's licence, current free-tier limits, privacy terms and acceptable-use policy before enabling it.
