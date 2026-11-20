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