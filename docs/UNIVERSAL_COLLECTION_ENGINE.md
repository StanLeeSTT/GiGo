# GiGo Universal Collection Engine

## Purpose

The Universal Collection Engine is GiGo's reusable data acquisition layer. It supplies the Research Engine, Lead Finder, Partner Finder, Market Intelligence and future workflows with traceable, permission-aware datasets.

It is designed to grow toward Apify-class breadth: reusable actors, provider adapters, input/output schemas, bounded runs, pagination, retries, checkpoints, datasets, evidence provenance, usage accounting and monitoring. It is not a promise of unrestricted access to every website or social network.

## Architecture

1. **Actor catalogue** — versioned task definitions with input/output schemas, required capabilities and policy tags.
2. **Provider registry** — adapters advertise capabilities, execution mode, verification status, quotas and health. Provider choice is based on capability and policy, not brand preference.
3. **Execution backends** — Cloudflare Worker for lightweight orchestration and permitted HTTP APIs; Cloudflare Browser Run for tightly bounded browser tasks; GitHub Actions for on-demand batch/browser compute; self-hosted Maxun/Crawlee/Playwright/Crawl4AI when suitable compute exists.
4. **Durable orchestration** — existing GiGo jobs scheduler controls bounded work. Each run stores checkpoints and can resume without duplicating already committed records.
5. **Dataset and evidence store** — collection datasets/items preserve canonical source URL, platform, observed/collected timestamps, access method, permission context and raw/normalized metadata.
6. **AI intelligence layer** — existing GiGo AI router classifies, extracts, clusters, scores and drafts validation plans from stored evidence. AI synthesis failure must not cause the collector to repeat successful network requests.
7. **Consumers** — Research, Leads, Partners, Offers and Operations consume the same records; do not create parallel lead or research systems.

## Current implementation in this milestone

- Migration 0010 adds owner-scoped provider, actor, run, dataset and item tables with RLS.
- src/collection/registry.ts adds a provider catalogue and capability lookup functions.
- Catalogue entries default to disabled. A catalogue entry is not a connection, an active adapter or proof of free access.
- The existing Maxun integration remains available as an optional adapter scaffold; Maxun itself is not deployed.
- No platform connector is activated by this migration. Apply the SQL migration before using the new tables.

## Provider catalogue and candidates

### Verified open-source building blocks

- **Crawlee** — crawling framework, best suited to batch/browser execution.
- **Playwright** — browser automation runtime.
- **Crawl4AI** — AI-assisted crawling/extraction.
- **SearXNG** — metasearch engine; self-hosting requires compute.
- **Maxun** — retained optional self-hosted visual/browser collection service; current GiGo integration is a scaffold only.

Open-source software licences do not pay for servers, browser memory, persistent storage, bandwidth or proxy services.

### Official API connectors to implement

- **YouTube Data API** — public search and metadata, with explicit quota accounting.
- **Meta Graph API** — only supported account types, approved permissions, OAuth scopes and Page access.

### User-requested candidate providers retained for investigation

- **InsightSocial**
- **SocQ**
- **Arachne SDK**
- **Harvest Agent**
- **Extracto**
- **JIRO Search**

These are deliberately represented as candidate_unverified until the exact product/repository, maintained documentation, licence, API contract, pricing, recurring free quota, card requirements, regional availability, data rights and security posture are checked. No code should call them just because their catalogue entry exists. Do not treat a marketing claim or a one-time trial credit as a sustainable free tier.

For each candidate, create a verification record with: canonical vendor/repository URL; maintainer identity; last release/commit; licence and dependency audit; documented endpoints; auth method; data coverage; platform terms; quota reset period; overage behaviour; card requirement; Nigeria eligibility; retention policy; export format; latency/reliability test; and a clear adopt/reject/hold decision.

## Actor contract

Every actor should define:

- stable actor_key and integer version;
- validated JSON input schema and output schema;
- required capabilities and policy tags;
- hard limits for pages, records, requests, wall time and quota;
- provider selection constraints;
- estimate before run;
- bounded collect operation with continuation cursor;
- normalization and deterministic deduplication key;
- checkpoint serialization;
- health/error states and retry classification;
- provenance fields on every emitted record.

A provider adapter must implement capability discovery, health check, quota estimate, bounded collection, normalization, checkpoint/resume and cancellation. It must return a typed permission/quota/rate-limit error rather than silently switching to an unapproved scraper.

## Run lifecycle

queued -> validating -> running -> completed | partial | failed | cancelled

waiting_for_quota is a paused state, not success. A partial run preserves successful records and the last checkpoint. Retries use exponential backoff with jitter for transient failures; permission denial, unsupported scope, invalid credentials and policy blocks are non-retryable until configuration changes.

Every run has owner, actor/version, selected provider, input, job reference, timestamps, checkpoint, counters, quota estimate/actual, error and dataset references. Idempotency keys prevent duplicate run dispatch. Dataset items are upserted by deterministic (dataset_id, item_key).

## Data safety and platform access

- Official APIs and documented permissions first.
- Collect public content only where automated collection is permitted, or data the owner explicitly authorized.
- Never bypass login walls, private profiles/groups, CAPTCHAs, access controls, paywalls, rate limits or anti-bot controls.
- Never use stolen cookies, borrowed sessions, proxy/account rotation or credential sharing to evade restrictions.
- Do not harvest private messages, sensitive personal data or personal contact details.
- LinkedIn remains official-API/approved-integration only. X collection must use an approved API and current terms. Instagram and TikTok access is limited by each product's documented permissions and eligibility.
- A public URL is not blanket permission to automate collection.
- Preserve source attribution, collection time, access method and permission context. Apply source deletion and retention rules.
- Do not store API secrets in provider configuration JSON, datasets, logs or browser responses. Keep credentials in encrypted server-side secrets; store only secret references.
- Treat collected page text as untrusted data, never as system instructions. Do not let scraped content trigger tools or external actions.

## Zero-budget execution strategy

- Cloudflare Worker: API orchestration and lightweight official API calls; not a persistent daemon or heavy browser host.
- Cloudflare Browser Run: optional small, quota-limited browser execution. Enforce daily limits and close sessions.
- GitHub Actions: on-demand batch worker where repository visibility and included minutes permit. It is not always-on compute; protect secrets and never execute untrusted pull-request code with privileged credentials.
- Supabase: durable state, checkpoints and datasets within the current plan's limits.
- Existing AI provider pool: analysis only when a provider is enabled and has available free quota. Never silently use paid fallback.
- Maxun/Crawlee/Playwright/Crawl4AI: activate only when a suitable runtime exists. A free licence is not free hosting.

## Delivery roadmap

### 1. Foundation (this milestone)
- Schema and RLS.
- Provider catalogue and capability model.
- Candidate verification register.
- Actor/run lifecycle contract.

### 2. Runtime integration
- Add authenticated APIs for provider status, actor catalogue, run creation, run status, dataset listing and cancellation.
- Validate all inputs against actor schemas.
- Dispatch collection work through existing durable jobs; avoid processing long browser tasks inside the request Worker.
- Add run idempotency, per-provider quotas and usage ledger events.

### 3. First real connectors
- Start with a safe HTTP/search provider and YouTube official API when a key is configured.
- Add Meta Graph API after the owner's OAuth and approved scopes are available.
- Add a generic permitted public-web fetch actor with strict host, redirect, response-size, content-type and timeout controls.
- Keep Maxun/Crawlee/Playwright adapters optional until their runtime is reachable.

### 4. Candidate evaluation and integration
- Evaluate InsightSocial, SocQ, Arachne SDK, Harvest Agent, Extracto and JIRO Search using the verification checklist above.
- Integrate the strongest candidates behind the same adapter contract.
- Reject candidates whose terms, security, provenance, cost or regional access are unsuitable.

### 5. Intelligence products
- Searchable datasets and exports.
- Demand signals, recurring complaints/questions and competitor snapshots.
- Trend baselines and historical metrics.
- Lead enrichment and scoring with evidence links.
- Opportunity scoring and validation experiments.
- Executive alerts and daily/weekly briefs.

## Operational acceptance criteria

A connector is not considered operational until a live test proves: valid configuration; explicit permission/access mode; quota estimate; bounded successful run; stable normalized output; provenance completeness; deduplication; checkpoint/resume; cancellation; quota/rate-limit handling; owner-only access; and no secret leakage. UI badges must reflect measured health, never catalogue presence.

## Current implementation status

The first implementation slice now includes:

- Migration `0010_universal_collection_engine.sql` with owner-scoped provider, actor, run, dataset and item tables.
- Composite dataset/run/owner integrity for collected items, plus owner checks for actor, provider and scheduler-job references.
- Typed actor and adapter contracts in `src/collection/types.ts`.
- A versioned `public_page_metadata` actor definition with bounded input validation.
- An explicit adapter registry. It is intentionally empty until a provider has passed its security and policy review.
- Authenticated read endpoints:
  - `GET /api/v1/collection/providers`
  - `GET /api/v1/collection/actors`
  - `GET /api/v1/collection/runs`
  - `GET /api/v1/collection/datasets`
  - `GET /api/v1/collection/items`
  - `GET /api/v1/collection/catalogue`

The read endpoints require a valid Supabase access token and rely on Supabase row-level security. They will return a migration/storage error until migration 0010 is applied. The catalogue endpoint is static and can report capabilities without implying that a provider is connected.

### Deliberately not enabled yet

No actor can currently execute a network request, and no collection job type is accepted by the general job API. This is deliberate: arbitrary URL fetching needs a separately reviewed SSRF boundary, redirect handling, response limits, DNS/IP protections and site-policy checks. The adapter registry must remain empty until that boundary is implemented and tested. Do not enable cookie-based social automation or private-platform scraping.

A GitHub Actions typecheck workflow has been added for this feature branch. A successful workflow run is still required before considering the TypeScript changes verified.


## Provider planning endpoint

`POST /api/v1/collection/plan` accepts an actor key and actor input, validates the actor's bounded schema, reads only the signed-in owner's configured provider records through Supabase RLS, and returns capability-matched provider candidates.

Planning rules are fail-closed:

- Candidate-unverified providers and integration scaffolds are never marked ready.
- Providers must have an owner-scoped configuration record.
- Provider status must be `healthy`; configured/degraded status is not enough.
- The connected provider record must explicitly include every required capability.
- Quota-exhausted, disabled, permission-required and error states are blocked.
- The endpoint does not enqueue jobs, make external requests or claim execution readiness.

The endpoint currently returns `can_execute: false` even when a provider candidate is healthy. This is intentional until a reviewed adapter and durable collection worker are connected.


## Safe cancellation

`POST /api/v1/collection/runs/{run_id}/cancel` requests cancellation for an owner-scoped run only while it is still queued or waiting for quota. The database function locks the run and its linked job, checks ownership through the caller's RLS context, and cancels both in one transaction. If the scheduler has already claimed the job, cancellation is rejected with a conflict rather than falsely reporting success.

This is queued-work cancellation, not interruption of an active network request. Active execution cancellation will require an adapter worker that propagates an abort signal and persists a terminal state safely.


## Bounded adapter runner

The runtime foundation now includes `src/collection/runner.ts`. It validates actor input and adapter capability coverage, applies an actor-specific deadline, propagates an AbortSignal, enforces the actor item ceiling, validates required provenance fields before persistence, and checks that adapter-reported item counts match the number of items actually persisted. Progress and items are written through injected persistence hooks so the durable worker can bind them to Supabase without coupling the runner to HTTP or database credentials.

Automated tests cover accepted/rejected public URL inputs, fail-closed provider planning, adapter capability mismatch, provenance validation, item-count consistency and timeout cancellation. The GitHub Actions workflow runs both `npm run typecheck` and `npm test`.

**Important boundary:** this runner is a tested execution primitive, not yet a deployed collection worker. No collection job type is enabled, no adapter is registered, and no external collection request is made. The next implementation step is to bind the runner to transactional run/job state, checkpoint persistence, dataset/item upserts and safe worker cancellation; only then can a reviewed connector be activated.


### Runner durability boundary (review update)

The bounded runner now persists a final counter/checkpoint snapshot through its injected progress hook after an adapter returns. Final page/request counters must not move backwards from previously persisted progress, and the final item count must exactly match successful item emissions. Item slots are reserved before awaiting persistence so concurrent adapter emissions cannot exceed the actor limit. Parent cancellation rejects the runner promptly while also propagating the abort signal to the adapter.

These hooks are deliberately storage-agnostic. They are not yet wired to Supabase, and the scheduler does not accept a `collection_run` job type. Do not enqueue collection jobs or apply migration 0010 until the durable worker handler, transactional run/job creation, persistence adapters, recovery semantics and integration tests are complete. The existing scheduler claims supported durable jobs generically, so enabling a new job type prematurely could route it through the wrong handler.


## Generic scheduler isolation guard (migration 0011)

The existing generic job claimant previously considered every queued job type. That is unsafe while new worker categories are being developed: a future `collection_run` job could be claimed and passed to the generic AI operations handler.

Migration `0011_scheduler_job_type_allowlist.sql` replaces the claim function with a fail-closed allowlist containing only the five job types currently handled by `executeDurableJob`: `research_scan`, `business_review`, `daily_briefing`, `lead_review` and `custom`. Unsupported categories remain queued and are not claimed. The allowlist must be expanded only in the same reviewed change that adds a dedicated handler and integration coverage.

The runner test suite now also checks that adapter exceptions, item persistence failures and final checkpoint persistence failures propagate rather than being reported as successful runs.

**Deployment boundary:** migration 0011 is committed but has not been applied to Supabase. Migration 0010 also remains unapplied. Collection execution remains disabled, and no collection job should be enqueued.


## Atomic run creation (migration 0012)

Migration `0012_collection_run_enqueue.sql` adds the authenticated RPC `gigo_create_collection_run`. In one database transaction it creates:
- a `collection_run` job with a unique idempotency key;
- the owner-scoped `collection_runs` row linked to that job;
- an owner-scoped output dataset linked to the run;
- job input references to the run and dataset.

The Worker exposes authenticated `POST /api/v1/collection/runs`. It validates the actor key and actor input against the in-code actor definition before calling the RPC with the user's bearer token. It returns HTTP 202 with the run, job and dataset identifiers.

**Safety boundary:** this only creates durable queued records. Migration 0011's generic scheduler allowlist excludes `collection_run`, so the generic AI worker cannot claim it. The endpoint explicitly returns `execution_enabled: false`. No provider is called and no external network request is made. The RPC and endpoint are not live until migrations 0010, 0011 and 0012 are applied and the Worker is deployed.

## Dedicated collection worker database boundary (migrations 0013–0014)

Migration `0013_collection_worker_claim.sql` adds a separate service-role-only claim function. It claims only `collection_run` jobs, uses `FOR UPDATE SKIP LOCKED`, verifies the owner-linked run and dataset, and issues an expiring lease token. Expired collection leases are recovered by this collection-specific function; migration 0011's generic scheduler recovery was narrowed to its own five supported job types so it cannot reset collection jobs.

Migration `0014_collection_worker_persistence.sql` adds service-role-only RPCs for:
- progress and checkpoint persistence with a matching, unexpired lease;
- provenance-bearing item insertion with dataset/item-key deduplication;
- terminal completion, partial completion, failure or cancellation;
- bounded retry scheduling, with a five-attempt ceiling.

Each mutation checks the job type, processing state, lease token and lease expiry. Item insertion and dataset count changes occur in one transaction. Duplicate item keys are ignored rather than counted as additional stored dataset rows.

**Not yet an executable worker:** these migrations define the trusted database boundary only. No Cloudflare scheduled handler claims collection jobs, no adapter is registered, and no network collection is activated. The SQL migrations are committed to the feature branch but have not been applied to Supabase. The current CI workflow runs TypeScript and Node tests; it does not execute PostgreSQL migrations against a live database. A real PostgreSQL/Supabase integration test is still required before applying these migrations.

### Worker database contract refinements

The claim RPC now binds a job to the exact `collection_run_id` and `dataset_id` stored in its job input, and a unique partial index prevents multiple collection runs from sharing one job. The item persistence RPC returns distinct outcomes (`inserted`, `duplicate`, or `lease_lost`) so a deduplicated record is not confused with an expired worker lease. Item insertion, dataset counts and run counters are kept in one transaction; missing linked rows raise an error and roll back the write.

The SQL contract tests check the scheduler allowlist, worker-only grants, lease checks, exact run/dataset binding, deduplication and balanced SQL function delimiters. These are static contract tests, not a substitute for executing the migrations against PostgreSQL. The dedicated worker still has not been connected to the Cloudflare scheduled handler.

### Service-role persistence client

`src/collection/store.ts` now provides a typed client for the dedicated worker RPCs: claim, progress/checkpoint, item persistence, finish and retry. It supports the current Supabase `sb_secret_*` API key format (sent as `apikey` only) and legacy service-role JWTs (also sent as Bearer), keeps database response bodies out of errors, and uses bounded request timeouts. Mocked-fetch tests cover the request payloads, lease-token forwarding, duplicate-versus-lost-lease outcomes and both key formats.

This is a database client, not a running worker. It is not called by the scheduled handler. No provider has yet passed end-to-end execution verification, so collection jobs remain excluded from automatic claiming.

### Provider-bound run enqueue

Run creation now requires a provider key. The API checks the owner's provider record through RLS and the fail-closed provider planner before calling the database. The enqueue RPC independently rechecks that the provider belongs to the authenticated owner, is marked healthy, and explicitly grants the actor's `web_fetch` capability. It stores the provider ID/key on the run and job. The dedicated claim RPC returns that provider key so a future worker can resolve the correct adapter rather than guessing.

A provider that is merely listed in the catalogue is not enough. Candidate-unverified providers and integration scaffolds remain blocked. The run endpoint returns a conflict when the selected provider is not verified, healthy or capability-compatible.

### Bounded worker orchestrator

`src/collection/worker.ts` now connects the bounded runner to the service-role store abstraction. It claims one bounded batch, resolves the exact actor version and provider-keyed adapter, persists progress/checkpoints and provenance-bearing items, and records completion or retry/failure outcomes. It refuses to claim any jobs when the adapter registry is empty. Missing provider adapters are retried with a delay; permanent actor/adapter output errors are marked failed. Retry RPC outcomes distinguish `retry_scheduled`, `failed` and `lease_lost`.

**Still not scheduled or activated:** the orchestrator is not called from the Cloudflare cron handler. There is no live-verified adapter registered yet, and the worker's database migrations remain unapplied. This keeps queued collection jobs safely isolated until a real provider passes end-to-end tests.


## First manually dispatched safe HTTP batch adapter

The feature branch now contains a GiGo-owned `gigo_safe_http_batch` provider and a manual GitHub Actions runner. It is intentionally separate from Crawlee and Playwright; it is a small native Node HTTPS collector, not a claim that either external framework has been installed.

The runner:
- resolves each hostname to IPv4 and rejects private, loopback, link-local, shared, documentation, benchmark, multicast and reserved ranges;
- pins the checked IPv4 address into the HTTPS request while preserving hostname-based TLS verification;
- accepts HTTPS only on port 443, uses GET only, sends no cookies or credentials, caps response bytes and request time, and manually revalidates every redirect;
- checks `robots.txt` for each origin and evaluates path rules; unsupported wildcard/end-anchor rules fail closed, and robots errors other than 404/410 block collection;
- extracts only page title, description and canonical URL, with source provenance;
- preserves successful URL checkpoints across retryable network/DNS/timeout/429/5xx errors; permanent HTTP/policy blocks are recorded as skipped items;
- processes at most one durable job per manual workflow invocation.

The workflow is `workflow_dispatch` only and is restricted to the trusted feature branch. It requires GitHub repository secrets named `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; do not place these values in source files or chat. The provider remains disabled until the SQL migrations are applied and an owner-scoped provider row is configured as healthy with `web_fetch`.

**Security review still required before live use:** the implementation is a conservative first boundary, not a guarantee against every network or content-parser attack. The tests and CI must pass; SQL migrations need a real PostgreSQL/Supabase integration test; the workflow must be reviewed; and a low-risk owner-controlled test URL should be used first. No public arbitrary-URL collection should be activated before those gates.


## Safe HTTP provider onboarding

The authenticated endpoint `POST /api/v1/collection/providers/register` accepts exactly one field:

```json
{ "provider_key": "gigo_safe_http_batch" }
```

It creates or refreshes the caller's owner-scoped provider row using a fixed server-side definition. The client cannot supply status, capabilities, access mode, endpoint URLs, headers, credentials, or arbitrary configuration. No secret is stored in the provider record. Registration sets status to `configured`, access mode to `public_web_permitted`, and the declared `web_fetch` capability, but this is not an execution approval: the planner requires `healthy`, and the SQL enqueue RPC also requires the provider row to be healthy.

The endpoint is intentionally idempotent through the unique `(user_id, provider_key)` constraint and PostgREST upsert. It requires the caller's authenticated Supabase session and migration 0010.

**Onboarding is not health verification.** The endpoint cannot mark a provider healthy. The next gate is a runner-side verification that checks the configured GitHub Actions environment, confirms the exact adapter is registered, and proves the service-role store can reach the expected database RPCs. Only a separate trusted service-role health transition should promote the provider to `healthy`. Until that transition exists and is verified, do not enqueue a run and do not add GitHub secrets to an unreviewed workflow.

### Durable batch worker and cancellation update

- Migrations 0011–0018 isolate collection jobs from the generic scheduler, bind each run to one verified provider, add dedicated lease-based claiming, persist checkpoints/items idempotently, renew worker leases, and preserve cumulative counters across retries.
- Migration 0017 adds cooperative cancellation for active runs. An owner request sets a cancellation flag while leaving the job processing; the worker observes it on heartbeat, aborts the adapter through AbortSignal, and acknowledges cancellation under the same live lease. Finalization rechecks the flag to close the completion race.
- Heartbeat outcomes are explicit: `renewed`, `cancel_requested`, or `lease_lost`. A cancellation request is never treated as proof that the worker has already stopped.
- The first internal adapter is a bounded public-HTTPS metadata collector. It checks robots.txt, pins validated public IPv4 destinations, revalidates redirects, has request/response limits, uses no credentials, and persists provenance. It is not a social-platform scraper.
- GitHub Actions is currently a manual batch runner, not a continuously running service. It processes at most one durable collection job per invocation.
- The worker's AbortSignal reaches the native HTTPS request. An adapter that ignores AbortSignal cannot be forcibly stopped by JavaScript; adapters must cooperate.
- None of migrations 0010–0019 has been applied to the live Supabase project as part of this implementation. Provider health promotion and real collection remain disabled until migrations, secrets, review and explicit enablement are completed.

- Migration 0018 makes retry counters cumulative: page/request totals are restored from the durable checkpoint, while item totals are derived from the dataset's idempotent item count. This prevents a resumed run from reporting only the final attempt's counts or double-counting duplicate records.

- Migration 0019 adds an evidence-backed intelligence layer: structured insights are kept separate from raw collected records, each insight must cite 1–25 items from the same owner/run/dataset, evidence can be classified as supporting/contradicting/contextual, and new insights default to `needs_review`. This is a storage and integrity foundation, not an AI analyst or automatic opportunity scorer yet.


## Lead sourcing, partner acquisition and autonomous business operations

GiGo's commercial workflow is designed around the user's requested Iman Gadzhi / Monetise-inspired method: **find the right market and people, qualify them with evidence, build a relevant offer, reach out personally, follow up consistently, develop the partnership or customer relationship, and promote/deliver the resulting offer.** This is an operating framework, not a claim of affiliation or a guarantee of results.

The Universal Lead Engine must support permitted discovery across the social platforms relevant to a campaign, including YouTube, Instagram, TikTok, Facebook, X, LinkedIn and other sources as lawful integrations become available. Platform coverage is capability-based: an item in the catalogue is not an active connector. Each platform connector must be checked for official API access, current terms, permissions, free-tier limits, Nigeria availability, data rights and operational reliability. No private-profile or private-message harvesting, login bypass, CAPTCHA evasion, scraping behind access controls, proxy/account rotation or rate-limit circumvention.

The engine should normalize and deduplicate prospects across platforms, retain public source evidence and timestamps, and build a unified prospect profile. It should distinguish creator/partner prospects from customer leads and apply the appropriate qualification rubric. For creator partnerships, retain the researched baseline of roughly 10k–100k followers and 50k–200k typical relevant views as screening signals, not automatic guarantees; verify typical performance rather than viral outliers, audience fit, engagement quality, credibility, competing offers, contact route and commercial readiness. Missing metrics remain unknown, never fabricated.

The end-to-end outreach lifecycle is intended to include:
- campaign objective, ideal prospect profile, offer and exclusions;
- source-backed discovery, enrichment, deduplication and lead scoring;
- personalized partnership/customer email drafts using real prospect evidence;
- owner approval before first contact or any material change to a campaign;
- durable follow-up sequences with configurable intervals, per-recipient caps and quiet hours;
- reply, bounce, unsubscribe, complaint and do-not-contact detection, with immediate sequence suppression on reply or opt-out;
- inbox triage, suggested responses, meeting scheduling and CRM stage updates;
- negotiation/partnership pipeline, deliverables, launch coordination and performance tracking.

GiGo should keep working while the owner is away through scheduled, resumable jobs, persistent campaign state, retry limits, notifications, and daily briefs. It may autonomously perform approved internal work (research, scoring, drafting, scheduling within an approved sequence, monitoring, reminders and reporting). Sending an initial email, sending follow-ups, agreeing to terms, publishing, spending, or making commitments must follow explicit owner-configured authorization. The user can approve a bounded campaign policy in advance—for example, a specific approved message sequence, recipient segment, sender identity, send window, maximum volume and stop conditions—so GiGo can execute that approved policy without asking for each routine follow-up. Any reply, opt-out, complaint, uncertain identity, legal concern, or out-of-policy action pauses the sequence and alerts the owner.

This automation must be durable and auditable, not a continuously running process dependent on a phone or laptop. The present collection system is still a foundation: the current public-page metadata actor/provider is narrow, and broad social-platform connectors, lead qualification, email sending, inbox/reply monitoring and campaign orchestration are not yet implemented or operational.


## Lead profiles and outreach foundation (migrations 0021–0023)

- Migration 0021 adds owner-scoped social profile identities and lead qualification evidence linked to collection provenance. Supported profile labels include YouTube, Instagram, TikTok, Facebook, X and LinkedIn; storing a platform label does not activate a connector.
- Authenticated API routes expose lead profile and evidence reads/writes at `/api/v1/leads/{lead_id}/social-profiles` and `/api/v1/leads/{lead_id}/evidence`. Supplied profile/source URLs must be HTTPS. Follower counts, typical views and engagement remain nullable until verified.
- Migration 0022 adds durable outreach campaigns, recipients, message drafts/queue records, event history and do-not-contact suppressions. It does not connect an email provider or send messages.
- Campaign API supports creating/listing campaigns and adding/listing recipients at `/api/v1/outreach/campaigns` and `/api/v1/outreach/campaigns/{campaign_id}/recipients`. The API checks the suppression list before accepting a recipient.
- Migration 0023 adds an authenticated atomic approval RPC. Approval requires a sender identity, a bounded recipient/message limit, an enabled initial email, explicit follow-up configuration, a timezone and a sending window. Approval is recorded as an event.
- `/api/v1/outreach/campaigns/{campaign_id}/approve` is the explicit owner-initiated approval endpoint. Approval authorizes a bounded campaign policy only; it does not mean an email sender is configured or that messages are sent.
- Reply/bounce/unsubscribe/complaint event types and recipient stop states are modelled for future inbox integration. Actual email provider connection, send worker, inbound reply monitoring, follow-up scheduler and automatic suppression processing remain future work.
- The intended commercial method remains: source prospects from permitted social/platform data, qualify with evidence, craft relevant offers and personalized partnership outreach, then manage a compliant follow-up and relationship pipeline. No scraping behind access controls, private-message harvesting, CAPTCHA/login bypass or rate-limit evasion.


### Outreach message approval and template controls (migrations 0025–0027)

- Campaigns now support owner-authored message templates: sequence 0 is the initial email; each approved follow-up delay requires one matching follow-up template.
- The API exposes `GET/POST /api/v1/outreach/campaigns/{campaign_id}/templates`. Supported personalization fields are allowlisted; campaign approval requires a complete contiguous sequence.
- The approval guard freezes the exact templates at approval time. Approved templates cannot be silently edited, replaced or deleted.
- The campaign approval endpoint therefore approves both the bounded operating policy and the actual copy sequence. This is still authorization metadata and a queue foundation—not a live email integration.
- Before a send worker is enabled, it must re-check campaign approval, recipient state, suppression, message sequence, sending window, quiet hours, per-recipient caps and idempotency at claim and send time.


### Durable email outbox foundations (migrations 0028–0029)

- Outbound messages now have a template reference and lease fields for durable processing.
- The service-role-only claim RPC rechecks campaign approval and active state, approved immutable template sequence, recipient state, do-not-contact suppressions, message limits and local sending/quiet hours before claiming a queued message.
- Claims use row locks and short leases. An expired lease is marked failed for reconciliation rather than blindly resent, because delivery may have happened before a worker crash.
- The completion RPC records provider acceptance or a confirmed pre-send failure. Only confirmed safe failures may be retried; ambiguous outcomes fail closed to avoid duplicate partnership emails.
- Campaign approval validates the timezone, quiet-hours pair and strictly increasing follow-up intervals.
- No email provider is configured and no send worker/workflow is enabled. These are durable safety foundations only.


## Evidence-backed outreach message preparation (migration 0030)

The authenticated endpoint `POST /api/v1/outreach/campaigns/{campaign_id}/prepare` renders a bounded set of up to 25 eligible recipients using only an approved, active campaign and its immutable approved template sequence. An optional `recipient_id` limits preparation to one recipient.

Personalization is deterministic and fail-closed:
- `first_name` comes from the stored recipient name.
- `organisation` comes from the stored recipient record.
- `niche` comes from an owner-scoped social profile.
- `specific_observation` comes from a stored lead-evidence excerpt with its source URL and observed timestamp retained as provenance.
- `offer_summary` comes from the campaign's saved offer summary.
- If a required placeholder has no verified value, that recipient is skipped and the missing field names are returned. GiGo does not invent metrics, facts or observations.

Migration `0030_outreach_sequence_preparation.sql` adds the authenticated, owner-scoped RPC `gigo_prepare_outreach_sequence`. It locks campaign and recipient rows, checks campaign approval, recipient eligibility and suppressions, verifies the complete unique sequence against approved templates, then inserts all messages atomically with `ON CONFLICT DO NOTHING` and audit events. Follow-up schedule offsets are cumulative: follow-up 1 is due after delay 1; follow-up 2 after delay 1 + delay 2, and so on.

**Important boundary:** preparation creates durable `queued` outbox records; it does not send email. No email provider is configured, no sending workflow is enabled, and no campaign has been activated by this code change. Migrations 0022–0030 remain unapplied until the owner explicitly applies them. A provider, inbound reply handling, unsubscribe mechanism and a reviewed sending worker are still required before any real outreach.


## Inbound outreach stop controls (migration 0031)

Migration `0031_outreach_inbound_event_safety.sql` adds the service-role-only RPC `gigo_record_outreach_recipient_event` for a future verified email-provider webhook adapter. It handles replies, hard bounces, unsubscribes and complaints. A reply marks the recipient as replied and cancels queued follow-ups. A bounce, unsubscribe or complaint also inserts an owner-scoped do-not-contact suppression. Repeated provider event IDs are detected to make webhook retries idempotent.

The RPC is deliberately not exposed as an unauthenticated Worker route. A future provider adapter must verify the provider's webhook signature and bind the event to the expected provider account before calling the service-role RPC. The provider worker must also re-check recipient status and suppressions immediately before sending; an already in-flight provider request cannot always be recalled.

No inbound webhook is configured and no provider is connected. This migration is a database safety boundary only.


## Follow-up timing and provider policy (migrations 0032; provider contract)

Migration `0032_outreach_followup_clock.sql` changes follow-up timing so each delay begins only after the immediately preceding message has been accepted by the provider. The claim RPC also requires the previous sequence message to be in `sent` state before a follow-up can be claimed. This prevents a delayed/failed initial message from allowing later follow-ups to run early.

### Free provider research (checked 22 November 2026)

- **Resend:** its current free tier lists 3,000 emails/month with a 100/day cap. It separates transactional `/emails` from marketing broadcasts; broadcasts are limited to existing contacts. Its email API supports idempotency keys, documented as a same-payload retry key with a 24-hour window. Official details: [pricing](https://resend.com/pricing), [email API](https://resend.com/features/email-api), [idempotency](https://www.resend.com/blog/engineering-idempotency-keys).
- **Brevo:** its current free plan lists 300 email sends/day, up to 100,000 stored contacts, and a visible Brevo branding footer. It distinguishes transactional email (non-promotional messages) from marketing email campaigns. Its marketing API can create campaigns and target registered contacts; its transactional API has webhook events. Official details: [free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), [campaign API](https://developers.brevo.com/reference/create-email-campaign), [transactional API](https://developers.brevo.com/docs/send-a-transactional-email).

**Decision:** do not send creator/partnership solicitation through a transactional endpoint. GiGo now has a provider-neutral contract and channel-selection policy in `src/outreach/providers.ts`; marketing and relationship outreach require a marketing channel and, for the currently researched providers, an existing registered contact. No provider adapter is registered and no API key or sender has been configured. A future integration must also confirm the provider's acceptable-use rules, the lawful basis for contacting each recipient, unsubscribe handling, sender/domain authentication and any regional requirements before sending.

The provider contract supports stable per-message idempotency keys and distinguishes explicit pre-send rejection from ambiguous outcomes. Ambiguous outcomes must not be automatically retried. This is still architecture only, not a live sender.


## Recipient contact authorization gate (migration 0033)

New recipients default to `unreviewed`. Before message preparation, the owner must record an explicit recipient-level review through:

`POST /api/v1/outreach/recipients/{recipient_id}/eligibility`

Approval requires:
- A documented basis selected from consent, existing relationship, assessed legitimate interest, or other documented basis.
- An HTTPS evidence URL.
- An explicit confirmation that the recipient is registered in the selected provider's marketing audience.

The endpoint records the review timestamp. The preparation endpoint only selects approved and registered recipients. A database trigger independently blocks any outbox message from entering `sending` unless the recipient has approved contact authorization, evidence and provider-audience registration. This is an operational gate, not legal advice or a declaration that a selected basis is lawful. The owner must assess the applicable jurisdiction, provider acceptable-use terms and evidence for each contact. Public availability of an email address alone is not treated as permission.

Existing recipient records remain unreviewed after migration until individually reviewed. No provider is connected and no messages are being sent.


## Outbox privilege hardening (migration 0034)

Migration `0034_outreach_outbox_privilege_hardening.sql` closes a direct-write gap in the message queue:

- Authenticated owners retain read-only access to their own `outreach_messages`; direct insert, update and delete privileges are revoked.
- The earlier authenticated preparation RPC is removed. Its replacement accepts an explicit owner ID but can execute only under the trusted Supabase `service_role`.
- The trusted API verifies the caller's Supabase session, then reads campaign, templates, recipients and lead evidence with the user's bearer token and RLS. Only after those owner-scoped checks does it call the preparation RPC with the server-only secret key and the verified user ID.
- The SQL function independently checks campaign ownership, approval state, recipient eligibility, provider audience registration, suppressions, approved template sequence and idempotency.
- A new `sb_secret_...` key is sent only in the `apikey` header; legacy JWT-style `service_role` keys also receive the bearer header. The secret key remains server-side and is never returned to the client.

This hardens who can write to the outbox. It does not yet make SQL independently re-render the approved template: correctness of rendered text still depends on the trusted API implementation and its owner-scoped source reads. That remains a review item before any sending worker is enabled.

Migration 0034 is committed but unapplied. No email provider is connected and no message is sent.


## Inbound webhook idempotency hardening (migration 0035)

Migration `0035_outreach_inbound_event_idempotency.sql` adds provider account identity to stored inbound events and a unique database constraint on `(provider, provider_account_id, provider_event_id)`. The service-only event RPC now reserves that unique event identity before applying reply, bounce, unsubscribe or complaint effects. Concurrent duplicate webhook deliveries therefore cannot both cancel sequences or create duplicate suppressions/events. Provider account and event identifiers are stored in dedicated columns rather than relying on JSON-only duplicate checks.

The RPC requires the trusted service role and a provider account ID. This does not itself authenticate a webhook: a future provider adapter must verify the raw-body signature, confirm the expected provider account, map the provider message ID to a GiGo message/recipient, and only then call the RPC. No webhook endpoint or provider adapter is active.


## Database-bound outreach rendering and approval hardening (migration 0036)

Migration `0036_outreach_database_rendering_and_final_guard.sql` supersedes the earlier API-rendering limitation:

- The prepare endpoint accepts only an optional `recipient_id`; callers cannot submit message subject, body, template ID, or personalization evidence.
- The trusted API verifies the caller session and owner-scoped recipient list, then calls a service-role-only RPC with owner, campaign and recipient IDs.
- Postgres loads the immutable approved templates and renders the copy itself from the recipient record, campaign offer summary, owner-scoped social profile and lead-evidence records. Only the five declared personalization fields are allowed. Missing or undeclared placeholder values reject preparation; provenance for niche/observation placeholders is recorded from the exact selected evidence rows.
- Direct `outreach_messages` privileges are reset to read-only for authenticated users, including revoking inherited PUBLIC grants. The service-only preparation RPC is the sole queue-insertion path.
- Direct authenticated updates to campaign rows are revoked. Campaign creation is restricted to draft/unapproved values; the owner approval RPC is now SECURITY DEFINER with an explicit `auth.uid()` owner check and is the only authenticated approval mutation path.
- The final queued-to-sending trigger rechecks campaign approval/revocation, recipient authorization, provider registration, suppression, template identity, sequence state, schedule and quiet hours.

The current endpoint still only prepares messages. No provider send, webhook, provider credential or live sender has been enabled. Migration 0036 is committed but **not applied**. The eventual sender must perform a separate immediate pre-network-send eligibility/suppression recheck to close the race between claiming a message and contacting a provider; there is no sender yet.
