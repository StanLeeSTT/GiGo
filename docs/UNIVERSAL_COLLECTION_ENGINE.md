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

- Migrations 0011–0016 isolate collection jobs from the generic scheduler, bind each run to one verified provider, add dedicated lease-based claiming, persist checkpoints/items idempotently, and renew worker leases.
- Migration 0017 adds cooperative cancellation for active runs. An owner request sets a cancellation flag while leaving the job processing; the worker observes it on heartbeat, aborts the adapter through AbortSignal, and acknowledges cancellation under the same live lease. Finalization rechecks the flag to close the completion race.
- Heartbeat outcomes are explicit: `renewed`, `cancel_requested`, or `lease_lost`. A cancellation request is never treated as proof that the worker has already stopped.
- The first internal adapter is a bounded public-HTTPS metadata collector. It checks robots.txt, pins validated public IPv4 destinations, revalidates redirects, has request/response limits, uses no credentials, and persists provenance. It is not a social-platform scraper.
- GitHub Actions is currently a manual batch runner, not a continuously running service. It processes at most one durable collection job per invocation.
- The worker's AbortSignal reaches the native HTTPS request. An adapter that ignores AbortSignal cannot be forcibly stopped by JavaScript; adapters must cooperate.
- None of migrations 0010–0017 has been applied to the live Supabase project as part of this implementation. Provider health promotion and real collection remain disabled until migrations, secrets, review and explicit enablement are completed.
