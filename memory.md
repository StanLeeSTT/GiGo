# GiGo Project Memory

> **Living project handover.** Update this file in the same GitHub task/commit sequence whenever work is added, changed, tested, reverted, or its status changes. Record what changed, why, exact paths, commit(s), verification results, unapplied/deployment status, and the next concrete task. Never rely on conversation history alone.

**Last updated:** 2026-11-23  
**Repository:** `StanLeeSTT/GiGo`  
**Active branch:** `feat/universal-collection-engine`  
**Latest governance-schema commit:** `3b39983655f5bf880adfb8ba919d7ae07897f74b`  
**Main branch:** do not merge into it unless explicitly requested.

---

## 1. Product purpose and operating rules

GiGo is a private, single-user, cloud-first, mobile-first AI assistant and business operating system, inspired by a Jarvis-style assistant. It is intended to support both personal assistance and business discovery, creation, outreach, customer/partner management, marketing, research, analytics, reminders, and eventually voice conversations and proactive work.

The current priority is to build a zero-budget foundation that can help discover business opportunities and generate income before expanding. The user works from Android and prefers direct implementation with simple, actionable instructions only when their action is actually required.

### Non-negotiable constraints

1. **Zero budget:** prefer free/open-source tools and free tiers. Never silently introduce paid dependencies or paid fallbacks.
2. **Private and single-user for now:** all user data, jobs, leads, campaigns, events and evidence must be owner-scoped.
3. **Security:** never commit secrets, ask the user to paste secrets into chat, expose service keys to the browser, or log credentials.
4. **No false completion claims:** distinguish committed, tested, applied, deployed, connected and live states.
5. **No external side effects without authorization:** sending messages, publishing, spending, contacting prospects, modifying external accounts or starting campaigns requires explicit approval. Campaign-level approval must bound sender, approved templates, recipients cap, schedule, follow-up policy and stop conditions.
6. **Durable automation:** jobs must be owner-scoped, idempotent, resumable, observable, rate-limited, cancellable and safe after worker restarts.
7. **Evidence before conclusions:** preserve source provenance and exact evidence. Do not fabricate follower counts, engagement, audience details, business claims or personalisation.
8. **Platform compliance:** do not bypass login barriers, CAPTCHAs, access controls, platform rate limits, robots restrictions or terms through proxies, cookies, account rotation or other evasion.
9. **Update this file after every meaningful GitHub task.** Include the exact commit and CI outcome, and leave the next task clear. If a task is still in progress, record that honestly.
10. The user has repeatedly said “continue/go on” and asked not to be stopped with routine questions. Continue implementation autonomously where safe; ask only for essential decisions or explicit authorization for external side effects.

---

## 2. Infrastructure and current Git state

- GitHub repository: `StanLeeSTT/GiGo`
- Active branch: `feat/universal-collection-engine`
- Branch URL: https://github.com/StanLeeSTT/GiGo/tree/feat/universal-collection-engine
- Cloudflare Worker: `gigo-api`
- Worker URL: https://gigo-api.thegreatmind601.workers.dev
- Supabase project URL: https://evluebrvgleewebddhjl.supabase.co
- A Supabase secret key with `sb_secret_` prefix is configured in Cloudflare server environment (never expose it).
- GitHub Actions secrets for worker jobs are not confirmed configured.
- Do not apply Supabase migrations, deploy, merge, create a PR, add secrets, or manually dispatch secret-dependent workflows unless the user explicitly asks.

### Latest verified commit at this update

`8bf7cee2678bceb5218e941c1aaaff4b25ba3875` — initial GiGo autonomy policy enforcement and financial hard-deny.

Latest verified Actions run on that commit:
- Typecheck: PASS
- Collection engine tests: PASS
- Run ID: `45103961661`
- The test suite reported 75 tests, 75 passed, 0 failed.

Earlier verification:
- Commit `9138f95dff150942066be0491368618b25445bb5`: typecheck and collection engine tests PASS.
- Commit `0b111333c665e1e028c33c93934bd738ff8ea189`: typecheck and collection engine tests PASS.
- Some intermediate commits failed only in collection-engine test assertions; subsequent correction commits passed. Do not treat intermediate failures as current branch status.

Always fetch latest branch HEAD and relevant file SHA before editing. Always specify `branch: "feat/universal-collection-engine"` when creating/updating files. A create-file call without branch may write to `main`.

---

## 3. GiGo architecture and long-term modules

### Core platform
- Authenticated API on Cloudflare Workers.
- Supabase Postgres as durable data layer with RLS and owner scoping.
- Durable scheduler and resumable worker jobs.
- Multi-provider AI router.
- Research and evidence store.
- Collection/discovery engine.
- CRM, offers, partner/product studio.
- Outreach and inbox workflow.
- Future marketing, business operations, voice, notifications and proactive assistant.

### Master blueprint
- `docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md`
- Commit: `8b896f828bcc6cf16d09897b2a7c87c2fc59375a`
- Includes full product scope, Monetise comparison, business modules, Iman Gadzhi-inspired creator qualification research, candidate collection tools, free/cloud-first constraints, provider router, memory, background jobs, approvals and future voice/proactive assistance.

### Previously applied migrations (known)
- `0001` initial schema.
- `0004` AI usage ledger.
- `0005` Research Engine.
- `0006` Product/Partner Studio.
- `0007` Leads/Offers.
- `0008` Autonomous Operations.
- `0009` Durable Job Scheduler.
- `0002`/`0003` status uncertain.

Migrations `0010` onward in this development stream are **not applied** unless separately verified. In particular, migrations `0010–0035` must be treated as committed code only, not live database state.

---

## 4. Research, business and scheduling foundation

### Research Engine — migration 0005
Tables:
- `research_runs`
- `research_sources`
- `research_opportunities`

Current capability includes Crossref/OpenAlex discovery and GDELT recent-news metadata. Still missing/unfinished: full-text evidence verification, PDF/HTML/CSV ingestion, vector search, citations, embeddings and exports. Research should consume accepted collection insights with provenance; do not convert every collected item automatically into an opportunity.

### Product/Partner Studio — migration 0006
- Products and partner candidates.
- 100-point scoring with hard stops.
- Manual evidence; no autonomous scraping/outreach by default.

### Leads/Offers — migration 0007
- CRM and do-not-contact foundation.
- Offer/unit-economics support.

### Autonomous Operations — migration 0008
- Schedules, approvals, notifications and operation events.

### Durable Scheduler — migration 0009
- `gigo_dispatch_due_schedules`, `gigo_claim_due_jobs`.
- Scheduled Cloudflare handler claims at most one job per minute.
- Generic job types include `research_scan`, `business_review`, `daily_briefing`, `lead_review`, `custom`.
- A custom job was tested successfully; do not assume research_scan has been tested.

---

## 5. Universal Collection Engine

Migrations `0010–0019` build the collection foundation:

- `0010`: owner-scoped provider/actor/run/dataset/item tables, RLS, cancel-run RPC.
- `0011`: generic scheduler recovery and allowlist; excludes collection_run.
- `0012`: collection-run creation RPC; currently only `public_page_metadata v1`.
- `0013`: service-role collection-specific claim RPC.
- `0014`: worker progress/item/finish/retry RPCs.
- `0015`: worker health and provider-promotion RPC.
- `0016`: heartbeat lease.
- `0017`: cooperative cancellation.
- `0018`: cumulative progress.
- `0019`: evidence-backed `collection_insights` and `collection_insight_evidence`, confidence and review status. Insights default to `needs_review`; no automatic acceptance. Review status transitions still need implementation.

### Collection TypeScript and worker
- `src/collection/registry.ts`: static provider catalogue; typed capabilities/execution modes/verification status; disabled by default; free tiers unknown.
- `src/collection/actors.ts`: `public_page_metadata` v1. Accepts 1–10 HTTPS URLs; validates domains/ports and rejects credentials, localhost/internal hosts, IP literals, malformed/duplicate URLs. Public-web-only policy; robots/terms required. URL validation alone is not full SSRF protection.
- `src/collection/adapters.ts`: explicit adapter registry, initially empty.
- `src/collection/planner.ts`: capability-based provider selection; only configured, healthy, granted and sufficiently verified providers can run. Blocks unverified/scaffold providers and disabled/quota-exhausted/permission-required/error states.
- `scripts/collection-batch-worker.mjs`: native Node HTTPS collector. Resolves and pins checked IPv4, preserves TLS hostname/SNI, HTTPS 443 GET only, no cookies/auth, bounded bytes/time, validates redirects (max 3), checks robots for each destination, fails closed on unsupported robots syntax. Network/DNS/timeouts/429/5xx retry; permanent HTTP/policy blocks skip. One durable job maximum per invocation.
- `--health-check` checks env/adapter/RPC/provider config and promotes provider using service_role, claims zero jobs.
- `.github/workflows/collection-batch.yml` and `collection-provider-health.yml`: manual only, trusted feature branch only, Node 22, require GitHub secrets `SUPABASE_URL`, `SUPABASE_SECRET_KEY`; not triggered.

### Social profiles and lead evidence — migration 0021
- Owner-scoped social profile identities and lead qualification evidence linked to collection provenance.
- Supported platforms: YouTube, Instagram, TikTok, Facebook, X, LinkedIn.
- Metrics are nullable; never invent followers/views/engagement.
- APIs:
  - `GET/POST /api/v1/leads/{lead_id}/social-profiles`
  - `GET/POST /api/v1/leads/{lead_id}/evidence`
- URLs must be HTTPS.

### Cross-platform limitations
Do not claim universal scraping is ready. Current collector has only one public-page metadata actor. Platform APIs are restricted differently:
- TikTok Research API is restricted.
- Instagram API access is primarily for Professional Business/Creator accounts and permitted use cases.
- YouTube public metadata is quota-limited.
- Facebook public Page data requires permissions/feature approval.
- LinkedIn is permission-based; scraping is prohibited.
- X API access and pricing must be verified against current official policy before implementation.

Build authorized platform-specific adapters and permissions. Never evade access controls.

---

## 6. Creator and partnership prospecting strategy

The user wants an Iman Gadzhi-inspired creator/business prospecting and partnership model. This is a strategy reference, not an official relationship or permission to copy private methods.

GiGo should eventually:
- Find suitable creators, businesses and potential partners across relevant social platforms.
- Evaluate niche, audience alignment, audience size/growth where authorized, typical views/engagement, credibility, consistency, offer/partnership fit, evidence quality/confidence, and red flags.
- Score prospects using explainable, evidence-backed criteria.
- Keep follower count from dominating the score.
- Preserve URLs, timestamps, collection provenance and source excerpts.
- Identify email/contact routes only where legitimately public/authorized.
- Draft individually relevant partnership proposals from verified observations.
- Use CRM pipeline stages and manage responses/follow-ups.
- Stop immediately on reply, opt-out, hard bounce, complaint or suppression.
- Never invent personalisation, claim relationships that do not exist, or send without authorization.

---

## 7. Outreach campaign system — migrations 0022–0035

### Campaign foundations
- `0022_outreach_campaigns.sql`: owner-scoped campaigns, recipients, messages, events, suppressions; RLS and statuses.
- `0023_outreach_campaign_approval.sql`: `gigo_approve_outreach_campaign(...)`, explicit approval and validation of sender, recipient/message caps, follow-up settings, timezone, quiet hours and send windows. API approval endpoint.
- `0024_outreach_recipient_guard.sql`: owner context, active campaign, suppression and recipient cap trigger.
- `0025_outreach_templates.sql`: owner-scoped templates; initial sequence 0 and follow-ups 1–5; allowed personalization fields: `first_name`, `organisation`, `niche`, `specific_observation`, `offer_summary`.
- `0026_outreach_template_approval_guard.sql`: campaign approval requires complete contiguous template sequence; sets template `approved_at`.
- `0027_outreach_template_immutability.sql`: protects approved template content from insert/update/delete. Possible cascade-delete issue remains unreviewed; no delete API currently.
- `0028_outreach_outbox_worker.sql`: message template ID, lease token/expiry, service-only claim/finish RPCs; uncertain outcomes fail closed; only confirmed safe pre-send failures retry.
- `0029_outreach_campaign_window_guard.sql`: timezone, quiet-hour and send-window/follow-up validation.
- `0030_outreach_sequence_preparation.sql`: prepares approved-template message snapshots into durable outbox. API route `POST /api/v1/outreach/campaigns/{campaign_id}/prepare`. Up to 25 recipients per request. Uses verified lead data; missing personalization causes skip, never fabrication. Preparation does not send.
- `0031_outreach_inbound_event_safety.sql`: service-only event RPC for reply, bounce, unsubscribe, complaint. Stops queued follow-ups; hard bounce/unsubscribe/complaint create suppression. Original provider webhook signature verification was future work.
- `0032_outreach_followup_clock.sql`: follow-up clock starts after previous message is provider-accepted (`sent_at`), not when sequence is prepared. Claim requires predecessor sent. Expired leases fail closed as uncertain; no blind retry. Service-role only.
- `0033_outreach_contact_eligibility.sql`: recipient contact authorization status/basis/evidence/review time and marketing-contact registration. Sending gate requires approved contact basis, evidence and provider registration. Existing recipients remain unreviewed. API endpoint `POST /api/v1/outreach/recipients/{recipient_id}/eligibility`.
- `0034_outreach_outbox_privilege_hardening.sql`: removes authenticated direct writes to `outreach_messages`; owners retain read-only access. Removes the authenticated preparation RPC and replaces it with service-role-only RPC. API verifies caller identity and performs owner-scoped reads with user's bearer token, then invokes RPC with server-side Supabase secret key and verified owner ID. Modern `sb_secret_` is sent as `apikey`; only legacy JWT-style service-role keys get bearer header. SQL rechecks ownership, approval, recipient eligibility, suppression, template sequence and idempotency.
- `0035_outreach_inbound_event_idempotency.sql`: dedicated provider, provider-account and provider-event ID columns on events; unique index on that triple; service-only inbound RPC reserves unique event identity before applying effects, making concurrent duplicate delivery race-safe.

### Outreach APIs and tests
Current routes are in `src/index.ts` for campaigns, recipients, templates, approval, preparation and eligibility.
Test suite: `tests/outreach-api.test.mjs` includes API and SQL safety assertions for preparation, inbound events, follow-up timing, provider policy, eligibility and migrations 0034/0035.

### Critical remaining outreach risks before any sending
1. **Approved-template rendering integrity is now implemented in migration 0036.** The API can no longer submit message copy; the service-only SQL function renders from approved immutable templates and owner-scoped stored data/evidence. This migration is committed but unapplied. The future sender must still perform a separate immediate pre-network-send recheck to close the claim-to-send suppression race.
2. Review RLS and all status-transition paths for `outreach_messages`, not only direct authenticated message table writes.
3. Provider adapters are empty. No provider API key, sender, verified domain, webhook or sender integration is configured.
4. Inbound webhook must verify raw-body signature, expected provider account and message/recipient correlation before service-role RPC call.
5. Re-check suppressions and eligibility immediately before provider send, including events arriving while a message is in-flight.
6. Add safe unsubscribe links/footer and opt-out processing.
7. Provider acceptable-use terms, local law, lawful basis, sender authentication and provider audience rules must be assessed before any outreach. This is not legal advice.
8. Do not use transactional email endpoints to disguise marketing or partnership outreach.

---

## 8. Email provider research and policy

Research checked 2026-11-22:

### Resend
- Free tier researched: 3,000 emails/month, 100/day.
- Marketing broadcasts separate from transactional API and limited to existing contacts.
- Official pages:
  - https://resend.com/pricing
  - https://resend.com/features/email-api
  - https://www.resend.com/blog/engineering-idempotency-keys
  - https://resend.com/features/webhooks

### Brevo
- Free tier researched: 300 sends/day, up to 100k contacts, branding footer; marketing and transactional are distinct.
- Official pages:
  - https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
  - https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans
  - https://developers.brevo.com/reference/create-email-campaign
  - https://developers.brevo.com/docs/send-a-transactional-email
  - https://developers.brevo.com/docs/transactional-webhooks
  - https://developers.brevo.com/docs/secured-webhooks

### Other
- Gmail API/account quotas were checked; do not assume Gmail is an appropriate marketing sender.
- Marketing/relationship outreach must use an approved marketing channel and current provider rules; both researched providers require registered contacts for their marketing channels.
- `src/outreach/providers.ts` defines provider-neutral contract, provider catalogue, channel selection, stable idempotency key and conservative retry logic. `OUTBOUND_PROVIDER_ADAPTERS` is empty.
- Resend idempotency key window researched as 24 hours; same key must be reused with same payload. Unknown/ambiguous outcomes are never automatically retried.

---

## 9. AI provider router

`src/assistant/providers.ts` includes Gemini, Groq, OpenRouter, GLM, NVIDIA NIM and Cloudflare Workers AI.
- User has API keys for Gemini, Groq, OpenRouter, GLM and NVIDIA; do not assume every provider is configured or tested.
- Groq successfully tested once; others unconfirmed.
- Cloudflare default Workers AI model: `@cf/zai-org/glm-4.7-flash`; free allocation researched at 10k Neurons/day, excess fails on Free.
- No paid fallback.

---

## 10. Immediate next tasks (continue in order)

### Task A — outreach security audit before any send path — COMPLETED IN CODE (migration 0036)
- Audited migrations 0022–0035, outreach RLS, grants, triggers, APIs and message status transitions.
- Replaced caller-supplied message content with database-side rendering from approved templates and owner-scoped recipient/profile/evidence records.
- Revoked authenticated/PUBLIC direct outbox writes and reset message privileges to read-only for authenticated owners.
- Closed direct campaign-row approval forgery: direct campaign UPDATE is revoked; inserts must be draft/unapproved; approval uses a SECURITY DEFINER RPC with explicit auth.uid() ownership check.
- Final queued-to-sending trigger rechecks campaign approval/revocation, recipient authorization, provider registration, suppression, approved template identity, recipient sequence state, schedule and quiet hours.
- Added tests for API identifier-only preparation, SQL-bound rendering, client read-only access, final guard and campaign approval bypass.
- CI PASS on commit 029c4f656a6f18913600d016df0261a1e528a94b: typecheck PASS; 68/68 tests PASS; Actions run 45103534399.
- Migration 0036 is committed but NOT applied. SQL was not executed against Supabase/Postgres in this task; CI tests are source-level/static tests plus TypeScript/unit checks, not a live migration validation.
- No provider adapter, webhook endpoint, send worker, sender credential or live send is enabled.
- Remaining send-specific gap: future worker must call a separate service-only just-in-time authorization/suppression check immediately before the provider network request, since a new suppression can arrive after claim but before send.

### Task A2 — central GiGo autonomy and permission engine — INITIAL V1 COMPLETED IN CODE
- Added src/assistant/autonomy.ts with action classification, default observe/analyse/draft/internal_execute scopes, approval-gated external execution, unknown-tool fail-closed behavior and a non-overridable financial hard deny.
- Integrated authorizeToolAction into src/assistant/runtime.ts before every model-requested tool execution.
- Exposed current policy summary through src/assistant/registry.ts capability reporting.
- Added tests/autonomy-policy.test.mjs for internal scopes, external approval, financial hard deny, unknown tools and runtime enforcement.
- Updated docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md.
- CI PASS on commit 8bf7cee2678bceb5218e941c1aaaff4b25ba3875: typecheck PASS; 75/75 tests PASS; Actions run 45103961661.
- Limitations: policy scopes are currently code-defaults, not yet stored as owner-configurable settings. External approval is represented by a policy evaluator input but no durable approval workflow is wired to it. No action audit table, pause/stop UI, or financial-data connections exist.

### Task A3 — durable owner-configurable autonomy policies and action audit — NEXT
- Add owner-scoped policy records and audit events with migration(s), RLS and service/API access.
- Preserve non-overridable financial hard deny in code and SQL; never make financial execution a configurable scope.
- Persist explicit approval records with bounded action, target, schedule, expiry, limits and revocation.
- Add pause/stop controls and audit every decision/result; unknown tools remain denied.
- No money-moving integration or external action activation.

### Task B — provider-neutral inbox correlation
- Map provider account, provider message ID, GiGo message ID, recipient and campaign.
- Inbound event mapping must verify account and provider signature before processing.
- Store only necessary metadata; avoid unnecessary full email bodies.
- Reply stops follow-ups; bounce/unsubscribe/complaint suppresses as applicable.
- Add tests for spoofed account, mismatched recipient, duplicate and concurrent duplicate webhook events.

### Task C — provider adapter dry-run only
- Build a provider-neutral adapter with mock/dry-run implementation first.
- Evaluate Brevo marketing campaign path against registered-contact and unsubscribe rules. Resend is another possible option; verify current official policy before implementing.
- No live sending until explicit user approval and sender/legal/provider prerequisites are complete.

### Task D — cross-platform prospect discovery
- Implement capability/permission model first; do not pretend all platforms are available.
- Build one authorized adapter at a time, based on official API/permission routes.
- Add evidence-backed creator qualification and explainable score.
- Preserve platform limits, quotas, user authorization and provenance.

### Task E — business operations
- CRM pipeline, offer/product workflows, campaign analytics, reply management, customer onboarding/support, scheduled business reviews, content operations, proactive reports and voice assistant.
- All external actions remain bounded by explicit approvals.

---

## 11. File and change ledger

| Date | Change | Files / migrations | Verification / state |
|---|---|---|---|
| 2026-11-22 | Message preparation engine | migration 0030; API route; tests/docs | Prepared only; no send |
| 2026-11-22 | Inbound event handling and follow-up cancellation | migration 0031; tests/docs | Service-role RPC; webhook not active |
| 2026-11-22 | Follow-up timing correction | migration 0032; tests/docs | Delay starts after provider acceptance |
| 2026-11-22 | Provider policy contract and research | `src/outreach/providers.ts`; tests/docs | No adapters or credentials |
| 2026-11-22 | Contact authorization and marketing registration gate | migration 0033; API route; tests/docs | Existing recipients unreviewed |
| 2026-11-23 | Outbox privilege hardening | migration 0034; `src/index.ts`; `tests/outreach-api.test.mjs`; `docs/UNIVERSAL_COLLECTION_ENGINE.md` | Commit chain culminated in 9138f95; typecheck/tests PASS |
| 2026-11-23 | Atomic inbound webhook deduplication | migration 0035; tests; docs | Commit 9f91d26; typecheck/tests PASS |
| 2026-11-23 | Outreach security audit and database-side rendering | migration 0036; src/index.ts; tests/outreach-api.test.mjs; docs/UNIVERSAL_COLLECTION_ENGINE.md | Commits 4c6fecb, 51d7881, 3563e31, 1ec5b2e, c5c34bc, 2b4caf7, 5ebe257, 802ec66, fb863f0, 029c4f6; final CI PASS run 45103534399; migration unapplied |
| 2026-11-23 | Central autonomy policy V1 | src/assistant/autonomy.ts; src/assistant/runtime.ts; src/assistant/registry.ts; tests/autonomy-policy.test.mjs; docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md | Commits 01c4c75, 5a1b170, 0b92f49, 36d47b9, dc218be, 16b5c33, 8bf7cee; typecheck PASS and 75/75 tests PASS; Actions run 45103961661 |
| 2026-11-23 | Create living project memory | `memory.md` | Commit `0524db569ad0e90d23b919360f5930aa5cd3af3d`; documentation-only commit; no new Actions run was triggered. Earlier code verification on `9f91d26` remains PASS. |

**Important:** this ledger records code committed to the feature branch. Migrations 0030–0035 are not applied to Supabase, and none of the email provider/webhook/send functionality is live.

---

## 12. How to continue this project in a fresh conversation

1. Read this `memory.md` first.
2. Fetch current branch HEAD from GitHub; do not assume the last recorded commit is still latest.
3. Inspect the exact current file(s) and SHA before edits.
4. Continue from **Task A: outreach security audit and approved-template rendering integrity**.
5. After each task, update this file in the same branch with:
   - date and purpose;
   - exact files and migrations changed;
   - security/architecture decisions;
   - commit SHA(s);
   - tests run and exact outcomes;
   - unapplied/deployment status;
   - remaining risks and next task.
6. If any test fails, record it, diagnose and fix it before describing the work as complete.
7. Never say a migration was applied, a worker deployed, an email sent, or an integration connected unless directly verified.

This file is the durable project handover, but it is not a substitute for checking live GitHub state, CI, Cloudflare or Supabase before making operational claims.


---

## 13. Product direction update — broad GiGo autonomy, human retains monetary authority (2026-11-23)

The user is considering giving GiGo broad capabilities across the personal-assistant and business-operating-system vision, with the monetary part remaining under the user's personal control. Treat this as a core product direction for future architecture.

### Design interpretation
- GiGo should be designed as a capable operating agent, not merely a chatbot or a dashboard of manual tools.
- It should be able to research, reason, plan, create and maintain work, coordinate workflows, monitor progress, manage internal records, prepare business operations, and report outcomes across the approved modules.
- The user retains control of money and financial commitments. GiGo must not independently initiate or approve money movement, purchases, paid subscriptions, paid API/service upgrades, investments/trades, loans, payouts, transfers, or other actions that create a financial obligation.
- GiGo may prepare financial information (budgets, forecasts, comparisons, cost estimates, invoices, payment instructions and decision briefs) for the user, but preparation is not authorization to pay or commit funds.
- Do not give GiGo bank/payment credentials or payment execution capability as part of the default architecture. Any future read-only financial-data connection would require a separate explicit decision and least-privilege design.
- Preserve an auditable approval boundary for all external side effects. The user has expressed a broad autonomy goal, but has not yet explicitly defined which non-financial external actions GiGo may execute without per-action approval. Until a configurable permission model is implemented and approved, keep existing approval gates for sending, publishing, contacting people, changing external accounts and other consequential external actions.
- Implement autonomy as explicit capability scopes and policies: observe/read, analyse, draft/prepare, execute, and spend. Spending/financial execution remains disabled and human-controlled.
- Record each delegated action, policy basis, result, timestamps and any approval. Provide pause/stop controls and a clear activity log.

### Architecture implications
- Add a central autonomy/permission policy layer rather than scattering ad hoc confirmation checks across modules.
- Separate financial data preparation from payment execution; no money-moving tool should be exposed to the general agent tool registry.
- Add a hard-deny financial action category that cannot be overridden by ordinary task instructions or a general autonomy toggle.
- Add configurable per-module scopes for non-financial actions, with least privilege, bounded limits, revocation, audit logging and safe failure.
- Future agent planning must identify actions that incur cost or financial liability before attempting them. Free-tier quota exhaustion must stop safely rather than silently falling back to paid services.

### Status
This is a product/architecture decision recorded from the user's stated direction; no new autonomy code, financial integration, payment permission or external-action authorization has been implemented by this note.

### Next implementation sequence
1. Outreach security audit is complete in code (Task A); do not activate any sender or apply migration 0036 without separate approval.
2. Initial central autonomy policy V1 is implemented and tested (Task A2), including the non-overridable financial hard-deny.
3. Next build durable owner-configurable scopes, approval records, audit events and pause/stop controls (Task A3).
4. Then continue provider-neutral inbox/webhook work and dry-run adapters.


---

## 14. Outreach security audit completion — migration 0036 (2026-11-23)

### Exact changes
- supabase/migrations/0036_outreach_database_rendering_and_final_guard.sql
- src/index.ts
- tests/outreach-api.test.mjs
- docs/UNIVERSAL_COLLECTION_ENGINE.md

### Security changes
1. Database-side template rendering: API preparation accepts only optional recipient_id; subject/body/template/evidence cannot be supplied by the client or API caller. A service-role-only RPC receives verified owner, campaign and recipient IDs and renders from approved template rows inside Postgres.
2. Trusted personalization provenance: rendering reads recipient name/organisation, campaign offer summary, the selected owner's social profile niche and selected lead-evidence excerpt. It permits only first_name, organisation, niche, specific_observation, offer_summary; requires each placeholder to be declared in the approved template's personalization fields and rejects missing, undeclared, unknown or unresolved placeholders. Evidence references for niche and specific observation are stored with the message.
3. Outbox privileges: direct PUBLIC, anon and authenticated privileges on outreach_messages are revoked; authenticated owners receive SELECT only. The service-only preparation RPC is the only queue insertion path.
4. Campaign approval boundary: direct campaign UPDATE privileges are revoked from PUBLIC/anon/authenticated. Owners can read/create/delete their campaigns; insert policy only accepts draft/unapproved records with no sender/approval caps enabled. Campaign approval is performed by the authenticated owner RPC, now SECURITY DEFINER with explicit auth.uid() owner verification and bounded input validation.
5. Final claim-time guard: the queued-to-sending trigger rechecks campaign active/approved/not revoked, recipient contact authorization and review evidence, provider marketing registration, matching email, suppression list, approved template identity, sequence state, send window, quiet hours and due time.

### Commit chain
- 4c6fecbb399c3d2558a1634d0eb5187b748629f8 — initial migration 0036.
- 51d78813ff6fe862f5581105cba18f31b64f63c7 — API now delegates rendering to trusted SQL.
- 3563e31c7b50d04f7ba6d2557d3099d6ad642a06 — rendering and guard tests.
- 1ec5b2e2396f57c7c1cc65b96f27563fd9e79555 — SQL regex escaping and independent row-found checks.
- c5c34bc6b06e21cc3beb042d8f0a37348ffaf0fb — prevent direct campaign approval mutation; secure approval RPC.
- 2b4caf78445043ca22044a518622d17bd89f181d — campaign approval bypass test.
- 5ebe257d5bf0681c2c3acaddab0aa3540bb9b653 — constrain direct campaign creation to draft/unapproved.
- 802ec6666641cc1784fd4842c744b16f161062ba — corrected suppression test assertion; 68/68 tests PASS and typecheck PASS.
- fb863f024b88cd4be27c0e190b17bd81d4a60024 — documentation update; CI PASS.
- 029c4f656a6f18913600d016df0261a1e528a94b — explicit SQL expression grouping; typecheck PASS and 68/68 tests PASS; Actions run 45103534399.

### Verification and deployment state
- Latest branch HEAD when recorded: 029c4f656a6f18913600d016df0261a1e528a94b.
- Actions run 45103534399: TypeScript typecheck PASS; test suite 68 passed, 0 failed.
- SQL migration has not been applied or executed against Supabase/Postgres. Static SQL-source assertions are not a substitute for live migration validation.
- No worker deployed, provider connected, webhook activated, or email sent.
- Future sender still requires a service-only just-in-time eligibility/suppression recheck immediately before network send to close the in-flight suppression race.

### Next task
Implement Task A3 — durable owner-configurable autonomy policies and action audit. Preserve the non-overridable financial hard deny and keep consequential external actions gated until bounded permissions are explicitly designed.


---

## 15. Central GiGo autonomy policy V1 (2026-11-23)

### Implemented files
- src/assistant/autonomy.ts — central action classification, default scopes, policy evaluation and financial hard deny.
- src/assistant/runtime.ts — every model-requested tool call is authorized before executeTool is called.
- src/assistant/registry.ts — current autonomy policy summary is exposed in capability reporting.
- tests/autonomy-policy.test.mjs — policy and runtime enforcement tests.
- docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md — architecture and owner financial-control boundary.

### Current V1 rules
- Default allowed scopes: observe, analyse, draft and internal_execute.
- External execution is disabled by default. Even if the external scope is enabled, explicit approval is required by the default policy.
- Financial execution is a hard deny and is not an available policy scope. It cannot be overridden by an ordinary approval boolean or broader non-financial scope list.
- Unknown tool names fail closed.
- Current registered internal tools are explicitly classified; any new tool must be classified before it can run.

### Verification
- Commit 8bf7cee2678bceb5218e941c1aaaff4b25ba3875.
- GitHub Actions run 45103961661: TypeScript typecheck PASS; 75 tests PASS; 0 failures.
- Current feature branch head at the time of this memory update is being advanced by documentation-only commits; the latest code-verified commit remains 8bf7cee.
- No deployment or database migration was performed.

### Not yet implemented
- Durable owner-configurable permission settings.
- Persisted approval records and bounded approval scopes.
- Owner-scoped autonomy audit event table and API.
- Global pause/stop controls or UI.
- Any payment, bank, wallet or money-moving integration.

### Next task
Task A3: implement durable owner-configurable autonomy policies and action audit, preserving the hard financial deny in both runtime and database policy design.


## 16. User clarification — concise automatic messaging policy (2026-11-23)

The user explicitly permits GiGo to send messages automatically, provided outbound messages are very short, structured, simple and direct. This is a narrow messaging permission, not blanket permission for all external actions.

### Product requirements
- GiGo may automatically send eligible messages after the relevant campaign/template and recipient scope have been explicitly approved and all runtime safety checks pass.
- Message format should be compact and predictable: brief greeting (when appropriate), one verified reason for contact, one concise value proposition or useful point, and at most one clear next step.
- Default content limits for the first implementation: subject up to 80 characters; plain-text body up to 500 characters. No attachments, long introductions, multiple topics, excessive claims, pressure tactics or invented personalization.
- Use approved, immutable templates and evidence-backed personalization only. If required facts are missing, do not send.
- Automatic send remains bounded by campaign approval, recipient cap, contact authorization/registered-contact requirements, suppression and opt-out checks, quiet hours/send windows, provider rules, rate limits, idempotency and audit logging.
- A reply, unsubscribe, complaint, hard bounce, revoked campaign approval or global pause must stop subsequent sends/follow-ups.
- This permission does not authorize arbitrary cold messaging, bulk unsolicited messages, social DMs or bypassing platform restrictions. Each channel requires its own lawful/authorized eligibility checks.
- External publishing, account changes, commitments and other external actions remain separately gated.
- Financial actions remain permanently hard-denied.

### Implementation impact
- Task A3 durable autonomy policy must model a narrowly scoped message_send permission separately from generic external_execute; it may support auto-send only for a pre-approved campaign and bounded recipients/templates/window/caps.
- The database and runtime must reject any attempt to broaden message permission beyond that campaign's immutable approval.
- Add tests for message length/structure, approval binding, opt-out/suppression, campaign revocation, pause, quotas and no arbitrary external-send bypass.
- No provider adapter, webhook or live sender is configured. No messages have been sent by this code.


## 2026-11-23 — concise automatic messaging and mandatory sender signature

User clarified outbound messaging behavior:
- GiGo may automatically send messages within an explicitly authorized, bounded campaign; it does not need per-message approval once the campaign-level authorization and all policy checks are satisfied.
- Outbound messages must be short, structured and direct. Default structure: brief greeting (when appropriate), one specific reason for contact, one concise value proposition, and one simple next step.
- Default limits: subject at most 80 characters; body at most 500 characters, including the sender signature. Avoid long introductions, unnecessary explanations, multiple topics and attachments by default.
- **Every outbound message must end with the owner's confirmed name as the writer/sender**, especially partnership messages, and this applies to other message types too. The signature is mandatory and must be appended by the trusted message-rendering layer, not left to the language model to remember. The actual signature name has not been confirmed by the owner; do not infer it from an account/profile name or hardcode a guess. Store the owner's confirmed display/signature name in owner-controlled profile settings. Until configured, external message rendering/sending must fail closed rather than omit or invent the signature. The signature counts toward the body character limit.
- These rules do not weaken recipient authorization, consent/contact eligibility, suppression/opt-out, provider/platform compliance, approved-template, schedule, rate-limit, audit, campaign-boundary or pause controls. Do not send arbitrary unsolicited messages or bypass restrictions.
- Financial execution remains permanently hard-denied.

Implementation status: requirement recorded in project handover and product blueprint; not yet implemented in the message-rendering code. The next outreach implementation must make the signature deterministic and test that every rendered message ends with the configured owner signature, including partnership templates and short-message length enforcement. No database migration was applied and no deployment or live sending occurred.


## 17. Task A3 — durable autonomy governance schema (2026-11-23)

### Committed
- `supabase/migrations/0037_durable_autonomy_governance.sql`
- `docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md`

### Database structures
- `autonomy_control_state`: one owner-scoped global pause state. A missing row must be interpreted as paused/fail-closed by the runtime integration.
- `autonomy_policies`: owner-scoped non-financial scopes only: observe, analyse, draft, internal_execute, external_execute. Financial is absent from the SQL allowlist. Generic external execution must always require approval.
- `autonomy_approvals`: expiring approval bound to exact tool name, target reference, SHA-256 canonical-parameter hash and max action count; includes owner revocation RPC.
- `autonomy_audit_events`: owner-readable, service-written audit log with a per-owner idempotency-key unique index.

### Security
- RLS enabled on all four tables.
- Authenticated owners have read-only table access. Policy/pause/approval changes use SECURITY DEFINER RPCs deriving the owner from `auth.uid()`.
- Authenticated clients cannot directly write pause, policy, approval or audit rows.
- Audit events are not updateable/deletable by authenticated users; service role receives only SELECT/INSERT.
- SQL rejects financial scope configuration and rejects financial-looking tool names when creating an approval. This is defense in depth; the TypeScript financial hard deny must remain first and non-overridable.
- No generic message_send scope was added. The user's automatic short-message permission must remain tied to separately approved outreach campaigns, exact eligible recipients/templates and provider checks—not a broad external-execution toggle.

### Commits
- `184ed3537f232abb261472089054bf8762f6ddfa` — initial migration 0037.
- `3b39983655f5bf880adfb8ba919d7ae07897f74b` — harden audit grants, add approval revocation and tighten financial tool-name boundary.
- Blueprint documentation commit is the immediately preceding commit in this branch sequence; fetch branch HEAD to obtain its SHA before future edits.

### Verification and status
- Migration is committed only; it has NOT been applied to Supabase.
- No runtime policy lookup, pause enforcement, approval consumption, audit event emission, API endpoints or UI are wired yet.
- No deployment or live test.
- This schema milestone is not permission to send messages. Outreach still has no provider adapter or live sender.
- Automated CI for the latest commits has not yet been checked in this task.

### Sender signature requirement (pending owner display-name confirmation)
- Every outbound message must end with the owner's name on a separate final line, particularly partnership messages.
- Signature must be appended by trusted rendering code and included within the 500-character body limit.
- Do not hardcode a guessed account/profile name. Store the owner's confirmed signature/display name in owner-controlled profile settings. Until configured, external message rendering/sending must fail closed rather than omit or invent the signature.
- Short message defaults remain subject <=80 characters and plain-text body <=500 characters including signature.
- No message has been sent.

### Next implementation slice
1. Add owner signature/display-name setting with a safe update path and test validation.
2. Wire policy and pause reads into runtime; fail closed on missing/unavailable policy storage.
3. Add service-only approval consumption and audit RPCs with atomic quota/idempotency enforcement.
4. Add owner API endpoints for policy, pause, approval and audit reads.
5. Add integration tests for owner isolation, forged rows, pause, expiry, revocation, quotas, fail-closed DB outage and immutable financial hard deny.
6. Keep the message_send grant campaign-bound and do not enable any sender until provider/webhook/pre-send suppression controls are implemented.


## 18. Partnership commercial offer requirement (2026-11-23)

The user requires every partnership message/proposal generated by GiGo to include a **50/50 deal offer**, so the partner and the owner's side can both earn from the partnership.

### Default offer definition
- Default wording: propose that each party receives 50% of **net revenue attributable to the agreed partnership, after only direct costs that both parties agreed and documented in advance**.
- Do not leave "50/50" ambiguous: before a deal is finalized, specify included revenue, attribution/tracking, agreed deductible direct costs, each party's responsibilities, payment timing/records, duration, refunds/chargebacks and exit terms.
- This is a proposal, not accepted terms, guaranteed income, a claim of prospect agreement or a promise of results.
- GiGo must not invent projected earnings or claim that either party will definitely make money.
- GiGo may present the standard offer in an owner-approved partnership campaign. It must not accept counteroffers, negotiate binding terms, sign contracts, grant exclusivity or make financial commitments for the owner. Final agreement and material changes require explicit owner approval.
- Keep partnership messages concise and within existing limits: subject <=80 characters, body <=500 characters including the mandatory owner signature.
- All partnership messages end with the owner's confirmed signature, appended by trusted rendering code. Until the owner confirms/configures the signature name, external sending fails closed.
- Existing contact authorization, provider marketing registration, opt-out/suppression, approved campaign/template, schedule, rate limits, pause and audit safeguards remain mandatory.

### Files and commit
- Updated `docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md` with the partnership revenue-share standard.
- Blueprint commit: `1ec1e6f9cbede3024f07784a58e35f6b87f4c091`.
- Updated `memory.md` in the following commit to preserve this requirement.
- This is a product requirement/documentation milestone; it does not activate a sender or create a legally binding offer. No migration applied, no deployment and no message sent.


## 2026-11-23 — Task: deterministic outbound signature and partnership terms

- Added `supabase/migrations/0038_outreach_signature_and_partnership_terms.sql` (migration commit `2e3cdc9d71fc15a6e06852640c7bab2c764bc219`).
- Added `tests/outreach-signature-partnership.test.mjs` (test commit `0401d2036f62492bf3240c3ff69095aee10eb4d0`).
- The migration creates owner-scoped `owner_message_settings`; the owner sets the exact signature through `gigo_set_owner_message_signature(text)`. No signature is assumed or prefilled. Queued/sending/sent message persistence fails closed until a valid signature exists.
- Adds `campaign_kind` (general/partnership) and owner-only `gigo_set_outreach_campaign_kind(uuid,text)`, editable only while the campaign remains draft and not approved.
- Trusted database trigger appends the signature as the final line; enforces subject <=80 chars and body <=500 chars including signature; partnership campaigns receive deterministic 50/50 language over net revenue attributable to that partnership, less only direct costs agreed in writing in advance. Unsupported earnings guarantees/projections are rejected.
- Trigger runs on insert and relevant updates, so later status transitions cannot bypass the rule. This is a content guard, not a provider sender; it does not send or enable messages.
- **Not applied/deployed:** migration 0038 is committed only. No provider adapter, webhook, send worker or live campaign is enabled. Signature remains unset pending the owner's exact chosen display name. CI has not yet been checked for these two commits.
- Important remaining partnership terms for a binding agreement: define included revenue, attribution/tracking, mutually approved direct costs, responsibilities, payment timing/records, refunds/chargebacks, duration and exit. GiGo must not accept counteroffers, sign or bind the owner; material changes/final agreements require explicit owner approval.
- Next: verify CI and static SQL tests; inspect and wire campaign-kind and signature settings into the owner UI/API; implement bounded automatic campaign sending only after contact/provider compliance, campaign approval, stop controls, pause/audit and final owner policy checks are complete. Continue durable autonomy runtime integration. Financial actions remain hard-denied.


## 2026-11-23 — Signature confirmed and authenticated settings API

- Owner explicitly confirmed the outbound sender signature as `STANLEE`.
- Added authenticated `GET/POST /api/v1/settings/message-signature` in `src/index.ts` (commit `6d8d1e1e4cc5c2cb252614bbb6c307c9da36adaa`). GET reads only the verified owner's setting; POST accepts only a plain-text signature name and calls the owner-authenticated `gigo_set_owner_message_signature` RPC. It never trusts a caller-supplied owner ID.
- Added API assertions in `tests/outreach-api.test.mjs` (commit `367a56dbc2df712c086743964a1abd6982b998e9`).
- The owner's exact confirmed value is `STANLEE`. The API endpoint is ready in source, but it has not been called against production because migration 0038 is not applied and deployment was not authorized. Do not claim the database profile is populated yet.
- Migration 0038 remains unapplied; no provider sender or live campaign is enabled. The existing database trigger remains the final fail-closed signature/length/partnership guard.
- Next: expose campaign-kind selection via authenticated API; inspect and wire UI; then verify CI. Continue durable autonomy persistence/runtime and the remaining GiGo workflows. Keep financial hard deny and campaign-level external-action boundaries intact.


## 2026-11-23 — CI investigation and autonomy test correction

- The earlier CI run `45107401543` failed in one pre-existing governance test, not the new partnership tests. The assertion incorrectly prohibited every `INSERT INTO autonomy_control_state`, although the migration correctly uses an owner-authenticated pause RPC upsert; it did not distinguish a dangerous global seed from a user-triggered pause update.
- Corrected `tests/autonomy-governance-sql.test.mjs` to reject a global seed before the owner RPC definitions while explicitly requiring the owner RPC upsert (commit `21f3dcb18bb3b372544c23b61790b3f38510f655`).
- Signature settings API and test commits: `6d8d1e1e4cc5c2cb252614bbb6c307c9da36adaa`, `367a56dbc2df712c086743964a1abd6982b998e9`. CI on the latter was still in progress at the time of this note.
- Signature value confirmed as `STANLEE`; API not yet invoked and migration 0038 not applied. No deployment or live sending.
- Next: verify latest CI; continue campaign-kind API/UI and durable autonomy runtime integration. Do not treat the corrected test as proof that the SQL migration is deployed or runtime governance is integrated.

## 2026-11-23 — Campaign-kind API integration

- Added authenticated POST /api/v1/outreach/campaigns/{campaign_id}/kind in src/index.ts (commit 49b9d58c3a9de86e34997beec42e4646cecabf06).
- The route verifies the bearer session with Supabase, accepts only campaign_kind: general or partnership, rejects extra fields, and invokes gigo_set_outreach_campaign_kind using the caller's authenticated JWT. It does not accept an owner ID or use service-role credentials.
- The database RPC in migration 0038 remains the authority: it only changes campaigns owned by the caller while draft and not approved/rejected as allowed by the migration.
- Added source-level API tests in tests/outreach-api.test.mjs (commit 6f94aaa66596aadb70979795f1ee44745b1522cf).
- CI for these commits has not yet been checked. Migration 0038 remains committed but unapplied; no API deployment or campaign change has occurred.
- Next: check CI; inspect the actual UI structure and wire signature/campaign kind controls where a secure authenticated UI exists. Continue durable autonomy enforcement: fail-closed pause/policy reads before every tool execution, exact-bound approval consumption, audit logging and owner endpoints. Then continue remaining research/lead/business workflows. No paid services, live sending, payment execution or deployment without explicit owner authorization.

## 2026-11-23 — Campaign settings, SQL repair and signature UI

- Added authenticated POST /api/v1/outreach/campaigns/{campaign_id}/kind (commit 49b9d58c3a9de86e34997beec42e4646cecabf06) and source-level tests (6f94aaa66596aadb70979795f1ee44745b1522cf). The route verifies the owner session and calls the owner-authenticated migration 0038 RPC; only general/partnership values are accepted. No owner ID is trusted from the request.
- CI exposed an invalid regular-expression literal in the new route. Fixed it in commit 1f500b4ebb3dad170944a474ca2fd2053478fa0b. The earlier CI failures on commits 49b9d58 and 6f94aaa are therefore known syntax failures, not successful verification; check the post-fix run.
- Audited migration 0037 and found its final function/grant section contained literal escaped newline text and an invalid dollar-quote delimiter. Rewrote that tail with actual SQL line breaks and a valid $$ function body in commit 7b673cb7d84ae0ed14dd03be21ca0ffcc5ec6687. Added a regression test in commit 15e157e5459a1dd5f64d506667e22279f6299500. The earlier run on 7b673cb was checked out before the route regex fix and failed on the same index.ts parse error; the SQL regression test is awaiting CI.
- Added owner signature controls to public/settings.html and connected public/settings.js to GET/POST /api/v1/settings/message-signature (commits cab5a50944c9b715607083088c5aa3875bc39fc7 and 5628a284940a6da121515037ad6a4403054ab77c). The field defaults to the user-confirmed STANLEE value, but the UI reports database state accurately and only confirms saved after the API succeeds. This is not yet live because migration 0038 remains unapplied and no deployment occurred.
- Current latest commits include 15e157e5459a1dd5f64d506667e22279f6299500; CI runs for the regex fix and later UI/test commits were queued or in progress at last check. Do not claim pass until confirmed.
- Remaining major work is substantial: durable autonomy runtime must read pause and policy state before every tool, fail closed on missing/unavailable state, atomically consume exact target/parameter approvals, and write audit events; add owner APIs/UI; complete research ingestion/evidence verification; authorized platform discovery; CRM/offers/marketing/launch/customer/analytics/learning workflows; and production operations. Existing module placeholder pages are not complete implementations.
- No migrations applied, no Worker deployment, no live outreach, no external campaigns and no payment execution. Financial actions remain permanently hard-denied. Preserve zero-budget constraints and update this memory after each meaningful implementation task.
## 2026-11-23 — Durable autonomy runtime and owner controls

- Added migration 0039_autonomy_initialization_and_approval_consumption.sql (commit 4f4f326a1a3056f3ef84ab9fe8f663898c28814d). Owner initialization creates safe default scopes but starts the global pause enabled and external execution disabled. A service-role-only RPC atomically consumes one approval only when owner, tool, target, parameter SHA-256, expiry, revocation state and remaining quota all match.
- Repaired the malformed SQL tail in migration 0037 (commit 7b673cb7d84ae0ed14dd03be21ca0ffcc5ec6687). Its prior generated tail contained literal backslash-n text and an invalid dollar-quote delimiter. A regression test was added and its assertion corrected in commit d2eb8a78bf5b6b63591e833beaee68e34b861266. CI for d2eb8a78 is still in progress at this note.
- Runtime now classifies financial/unknown actions before database access; for known tools it reads owner-scoped global pause and scope policy before execution, treats missing/unavailable state as denied, and records a service-role audit decision before allowing execution. It records a result event afterward. If the required pre-execution audit cannot be written, the tool is not executed. Runtime commits: 3d26931d793ddf642220beb6986fee24a1ab4b2d and 543ce7bc8c9598ecc8e043df3464c357d98222cb.
- Added owner APIs GET /api/v1/autonomy, POST /api/v1/autonomy/initialize, POST /api/v1/autonomy/pause and POST /api/v1/autonomy/policies in commit bddb97bd13340398e04e61bb4082217d6fee0a3e. These use the verified owner's JWT and owner-authenticated RPCs; no caller-supplied owner ID.
- Added settings UI for global pause, safe initialization and toggling only the four internal scopes; external execution is explicitly shown as blocked. Commits f75c518ec1a84605ce9e9e170e26769dcd73aa2b and a6b6a48eddd5b2045125f122d246d33047dd65cf. Added API/UI tests in 26505c061b34d7c381ed36b21f2f2cd27faa619d.
- The previous CI failures were due to: (1) the campaign-kind route regex escaping, now corrected in 1f500b4ebb3dad170944a474ca2fd2053478fa0b; (2) the new SQL regression test using over-escaped regex assertions, now corrected in d2eb8a78bf5b6b63591e833beaee68e34b861266. Do not report success until the latest run is green.
- Security boundary: external execution still has no approval consumption wired into the runtime and remains denied regardless of policy settings. Financial execution remains permanently hard-denied. Global pause row missing means paused. Missing policy or audit credentials means tool execution fails closed. This means after deployment, migration 0037/0039 and the Worker secret must be present before assistant tools can execute; do not apply/deploy without explicit owner authorization.
- Signature UI is also in place (commits cab5a50944c9b715607083088c5aa3875bc39fc7 and 5628a284940a6da121515037ad6a4403054ab77c), using the confirmed STANLEE signature, but migration 0038 and deployment remain pending.
- Next: verify latest CI; add owner audit-log and approval management endpoints/UI; add runtime integration tests and DB-failure tests; then build actual outreach campaign UI/provider-safe dry-run/webhook path. Broader incomplete modules remain research full-text/evidence, authorized cross-platform discovery, business launch, commerce (financial execution prohibited), creative, customer, analytics, learning, scheduler operations and voice. No migrations applied, no Worker deployment, no live sends.

## 2026-11-23 — CI repair and current continuation checkpoint

- Re-checked the branch rather than relying on the previous handover: the authenticated campaign-kind endpoint already exists in `src/index.ts` at `POST /api/v1/outreach/campaigns/{id}/kind`, wrapping the owner-authenticated `gigo_set_outreach_campaign_kind` RPC. It validates the verified session, accepts only `general` or `partnership`, and relies on the database RPC to restrict changes to an editable owner draft. Do not duplicate this endpoint.
- Durable autonomy work is also further along than the earlier checkpoint: migration 0039 initializes safe scopes with global pause enabled and external execution disabled; it adds service-role-only atomic exact-approval consumption. Runtime reads pause and scope policy before each known internal tool, writes a service-role audit decision before execution and a result event afterward, and denies when policy/pause/audit is unavailable. External execution remains blocked in runtime; financial and unknown actions are hard-denied.
- Verified CI run `45108569479` on commit `4a56827ba99cdd6667e213b02c2a9ca7ec6c52c5`: TypeScript typecheck passed; tests failed 1/94. The sole failure was a bad test expectation in `tests/autonomy-governance-sql.test.mjs`: it expected the SQL function terminator `$;` although migration 0037 correctly uses PostgreSQL `$$;`. This was a test assertion defect, not a typecheck or SQL runtime verification.
- Corrected the assertion to expect the complete `end;\\n$$;` delimiter in commit `ce02007f954675dcbb24d55995dc26d61aa72360`. The preceding attempt `720e14d` did not change the file because JavaScript replacement-string escaping collapsed `$$`; the successful correction uses a replacement callback. Await and inspect CI for `ce02007f...` before declaring green.
- The current `public/outreach.html` is still a placeholder and does not expose campaign creation, campaign kind, recipient review, template management, approval, or outbox state. The API and database layers exist, but the owner-facing Outreach Studio remains unfinished. Do not represent it as a complete UI.
- Signature settings UI and autonomy pause/policy settings UI already exist in `public/settings.html` / `public/settings.js`; the owner-confirmed signature is `STANLEE`. Database migration 0038 is still not applied, so the setting is not yet live.
- No migrations have been applied, no Worker deployment has been performed, and no live messages have been sent. Do not apply migrations or deploy without explicit owner authorization. Financial execution remains permanently denied.
- Next sequence: (1) verify CI after commit `ce02007f...`; (2) implement actual owner-facing Outreach Studio against the existing authenticated campaign/recipient/template/eligibility/prepare/approve APIs, including campaign-kind selection and clear status; (3) add owner audit/approval visibility and runtime failure tests; (4) complete provider-neutral dry-run sender and signed webhook only after verifying provider compliance and never enable live sending without explicit approval; (5) audit Research Engine, Universal Collection Engine, CRM, offers, product/partner workflows, scheduler, and module pages against real end-to-end capability; remove misleading placeholders or implement them; (6) document all remaining external prerequisites, then ask for explicit authorization before applying migrations or deploying.

## 2026-11-23 — Autonomy approvals and audit visibility

- Fixed the SQL regression test to assert complete PostgreSQL dollar-quote delimiters. The previous failure at migration test line 56 was a test expectation bug: the migration correctly ends the function with `$$;`, while the test expected `$;`. Fix commit: 64f89aec47dfec0672bd6edfb1ac707081967635. CI for that commit is queued/in progress and must be checked.
- Added owner-scoped GET /api/v1/autonomy/audit, GET/POST /api/v1/autonomy/approvals and POST /api/v1/autonomy/approvals/{id}/revoke in src/index.ts (commit 2a66cc8ba80792ec4513b1c50a9b3ee89d5ca14a). Every route verifies the Supabase session; approval creation is exact-tool/target/parameter-hash bound, limited to 1–1000 actions and expires within 30 days; the database RPC rejects financial-looking tools. Revocation uses the owner-authenticated RPC.
- Added a recent audit history panel to Settings (commits d0a5e27014839d798b17a4334c81689c2b855e93 and 9d295dda4b46da9b3da72d89dcedfcf2643b1ba4) and API/UI tests (commit 41963442f36ba2e68b0b2e28a089b0d0404f3b58).
- Durable runtime remains fail-closed: it does not yet consume approvals for external tools; all external execution is denied even if a row is approved. The atomic service-only consumption RPC exists in migration 0039 but is not wired to any external sender. Financial actions remain hard-denied.
- The latest successful CI has not yet been established for the new commits. No migrations applied or Worker deployed. Migration 0037/0038/0039 remain code only. Settings UI can only become functional after the corresponding migrations are applied and Worker deployment occurs.
## 2026-11-23 — Blueprint synchronization

- Updated docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md with the durable autonomy runtime, owner API/UI, safe initialization, exact approval consumption, audit history, campaign-kind API and current unapplied/deployment status (commit ce310f72caf010b5719a2e34ca8ea9bf9ae4a1e2).
- Confirmed CI run 45108697698 on commit 41963442f36ba2e68b0b2e28a089b0d0404f3b58 passed typecheck and the complete collection-engine test workflow. Subsequent audit/approval and blueprint commits are awaiting their own run completion.
- Current implementation is materially safer but not production-live: migrations 0037–0039 are not applied, Worker not deployed, and no external sender exists. Do not claim the app is complete. External execution stays blocked; financial execution is permanently denied.

## 2026-11-23 — Outreach Studio owner workflow implementation

- Replaced placeholder `public/outreach.html` with a working owner-facing campaign workspace (commit `876d15f050f8551566bd1f25202962d114cb0d02`). It includes campaign creation/listing, general vs partnership type, recipient entry and eligibility review, template authoring, bounded campaign-policy approval and queue preparation. It prominently states that no message is sent from this interface.
- Added `public/outreach.js` (commit `741c8390178d8d160dc60d83f8be1ff93a94b03a`) using the existing authenticated `GIGO_API` client. It connects to the existing owner-authenticated campaign, recipient, eligibility, template, approval, prepare and campaign-kind APIs. Eligibility approval requires the owner to enter a documented basis and HTTPS evidence URL and explicitly confirm provider marketing-audience registration. Blocking a contact remains available.
- Updated the campaign list query in `src/index.ts` to return `campaign_kind` (commit `d3e27a709b953b1c444146402444b26331e62f82`).
- Added a regression test for the Outreach Studio UI and its no-live-delivery boundary in `tests/outreach-api.test.mjs` (commit `ee88db5ba23944cf0e47cf9ae7640e9404ab66eb`).
- Important: the page only prepares database-rendered messages. No outbound provider adapter, live sender or delivery confirmation is connected. The UI's policy approval is not a legal determination that the contact is lawful; owner must independently verify consent/lawful basis, local law, provider terms and sender authentication. Migration 0038 signature enforcement remains unapplied, and migrations 0022–0039 are still code only unless separately verified.
- CI after these commits must be checked before claiming tests pass. No deployment, migration application or live send occurred.

## 2026-11-23 — Outreach Studio UI completion checkpoint

- Outreach Studio is no longer a placeholder: commit 876d15f050f8551566bd1f25202962d114cb0d02 created the campaign workspace; commit 741c8390178d8d160dc60d83f8be1ff93a94b03 connected forms to the authenticated APIs; commit d3e27a709b953b1c444146402444b26331e62f82 added campaign kind to the list query.
- The page supports draft campaigns, recipient entry, manual eligibility review with documented basis/evidence and provider registration attestation, template authoring (initial + follow-up sequence), campaign policy approval, campaign type selection (general/partnership) and database-only queue preparation. It explicitly states no messages are sent. No sender adapter or webhook is connected.
- Tightened template UI constraints to subject <=80 and body template <=340 before placeholder expansion/signature/partnership terms (commit 1ba8e465a1b026f612123dc5516ca4086aa077a5). The database remains the final 500-character rendered-body guard.
- Added tests/outreach-ui.test.mjs (commit 4bebb63c8795054079ad0077d5920360384986bd). CI for that commit failed only because a separate existing outreach-api assertion used lowercase text while the UI correctly used capitalized 'Provider send performed: no'. Fixed the assertion in commit 0470f18a85c9b78929b875a4845155e4d75d510e; its CI run is still in progress.
- The UI's owner confirmation for provider marketing registration is an attestation, not an automatic provider-side verification. The owner must independently verify contact eligibility, lawful basis, provider marketing registration, sender authentication and applicable rules.
- No migration application, deployment, external send or financial execution occurred. Migrations 0022–0039 remain code-only unless separately verified. External execution remains disabled.
- Synchronized the master blueprint with the actual Outreach Studio workflow and the no-live-delivery boundary (commit e9658368ad20262c9513a86cdbe6192c7598b2fb).

## 2026-11-23 — Research evidence assessment controls

- Added owner-facing evidence assessment controls in public/research.js (commit 011cfbe325bceb4be9fe6d7e060be1bc0afac548). For each saved source the owner can label it unreviewed, supports, contradicts, context or rejected through the existing owner-authenticated PATCH API. The UI explicitly explains that this is a human review label, not automatic fact-checking.
- Added tests/research-evidence-ui.test.mjs (commit 489c33e6bd557c83f1a9b1e4f137caf280f87b0a) to assert the accepted evidence states, PATCH path and non-verification wording.
- Research Engine still stores source metadata/excerpts and manually reviewed evidence. It does not yet ingest PDFs/HTML/CSV, extract page/line citations, perform robust full-text claim verification, index semantic/vector embeddings or export complete research reports. Do not claim those features exist.
- Outreach Studio workflow test initially failed only because the expected phrase capitalization differed from the UI string; corrected in commit 0470f18a85c9b78929b875a4845155e4d75d510e, whose CI run completed successfully. The UI build, JS wiring and campaign kind API had their own successful runs. The newer research evidence UI/test run is still pending and must be checked.
- No migrations applied, no Worker deployment, no sender adapter, no live delivery. Financial execution remains permanently denied. Continue with provider-safe dry-run design, platform-authorized collection and module-by-module audit; never claim a placeholder page is a completed workflow.

## 2026-11-23 — Research evidence regression-test correction

- Research evidence UI commit 011cfbe passed CI (run 45108915723). The follow-up test file initially failed because its static regex omitted the actual `resource === "research_sources"` qualifier in the API guard. Corrected the test to match the implementation in commit 901685f082358e3ef46c5c39e302632ea413fd18.
- The latest run for 901685f is in progress at this note. Previous failed runs 45108928175, 45108963144 and 45108967275 all trace to that same assertion failure; the UI code and typecheck were successful on run 45108915723. Verify the new run before reporting all tests green.

## 2026-11-23 — Evidence-based Analytics dashboard

- Replaced the Analytics placeholder with a live read-only workspace snapshot in public/analytics.html and public/analytics.js (commits 315e7ed616fffd3977eeda5660bc4b4125e6463b and e57970f640136ca2000d6ee1b69b6430bc930a6f). It queries saved projects, tasks, research briefs, partner candidates, leads, offers and outreach campaigns through the authenticated API client, then derives simple counts and links back to each module.
- The dashboard explicitly does not invent revenue, profit, conversion rates or ROI because transaction data is not connected. It reports incomplete module queries rather than fabricating counts.
- Added tests/analytics-ui.test.mjs (commit 671c887249df4ebead8c3c12d595d2aec175bfca). CI for these changes is pending.
- Other current branch work also added owner evidence-status assessment controls in Research Studio (commit 011cfbe...; its CI passed) and Outreach Studio UI is now connected to existing campaign APIs. No migrations or deployment occurred.
- Updated docs/GIGO_MASTER_PRODUCT_BLUEPRINT.md with the read-only Analytics snapshot and its no-invented-financial-metrics boundary (commit db6410aa5c0e9e1a1d57a9a906ab36f8930ec34b).

## 2026-11-23 — Launch Planner implementation

- Replaced the Launch Planner placeholder with a functional internal project/milestone workspace (public/launch.html commit 785d9ebcfb1fa6537fbde23df6605b2d968afabe; public/launch.js commit 0400d9b9fae938264d1b7596f740b33b0ee19713). It creates launch projects, selects existing projects, adds a standard launch checklist, adds custom milestones and updates task statuses through the existing owner-scoped Projects/Tasks APIs.
- The standard checklist covers customer problem validation, offer/economics review, product completion, sales assets, launch content, authorized distribution/partner planning, customer support and post-launch measurement. It creates internal tasks only; it does not publish, send, purchase or pay.
- Added tests/launch-ui.test.mjs (commit d66a3defa61d171c94f532fc5bfbea617c7d6888). CI pending.
- Analytics dashboard has also been implemented as a read-only count snapshot (commits 315e7ed..., e57970f..., test 671c887...). It deliberately does not invent revenue/ROI.
- Updated the master blueprint with the Launch Planner checklist and its internal-only execution boundary (commit 214d6f84ecd9425385bf04fe7d5bd095ad567e2c).

## 2026-11-23 — Analytics, Launch Planner and Marketing Studio

- Analytics dashboard is implemented in public/analytics.html and public/analytics.js. It reads owner-scoped project, task, research, partner, lead, offer and outreach records and shows record counts/status only. It does not invent revenue/profit/ROI. Tests: tests/analytics.test.mjs. CI run 45109041932 for commit 147662c5ac61d46b3e1f2a774b43af1a2b89efe2 passed.
- Launch Planner now uses existing owner-scoped Projects and Tasks APIs for launch project creation, standard checklist generation, custom milestones and task status tracking. UI/JS commits: 0400d9b9fae938264d1b7596f740b33b0ee19713 and tests/launch.test.mjs commit d66a3defa61d171c94f532fc5bfbea617c7d6888. Blueprint synchronization commit 216a532312390f99e5094ae64edcfe64a21fd700. These are internal tasks only; no publishing, outreach, purchases or payments.
- Marketing Studio draft storage added with migration 0040_marketing_assets.sql (commit 729e84783f9b7ad05a4caf6daeaa85923ff38bc0). It creates an owner-scoped RLS table for content drafts and status. API resource /api/v1/marketing/assets added to src/index.ts (commit 398564bca241fc54632241f61d1b94ca94ea65c0).
- Replaced public/marketing.html placeholder with a content draft form/list (commit d9c1a0a92d6841eddd0f4568a1e5853d5873c097); added public/marketing.js to create, list and update internal review status (commit d6f6ca7f337d045c855b5cc3979d4bced72a36c8); added tests/marketing-assets.test.mjs (commit 1c455659709149838cc30a4232ef6ff1d35d8af7). UI and API commit CI runs passed; test commit run 45109173405 is still in progress at this note.
- Marketing asset approval is internal review status only. No social publishing, ad purchasing, email sending or external distribution is connected. Migration 0040 is committed only and has not been applied.
- Research evidence review test fix 901685f082358e3ef46c5c39e302632ea413fd18 passed CI (run 45108993026).
- No Worker deployment or database migration application occurred. Financial execution remains hard-denied. Continue with Customer Success, Creative Studio and Learning modules, then collection/research full-text and external provider integration only within documented platform rules.

## 2026-11-23 — Marketing Studio draft workflow

- Added migration 0040_marketing_assets.sql (commit 729e847...) for owner-private marketing asset drafts with types social post, email copy, landing page, advertisement, video script, blog article and other; status is draft/review/approved/archived. The table stores copy and metadata only; it does not publish or send.
- Added /api/v1/marketing/assets through the owner-scoped business-resource handler (commit 398564b...). Hardened validation in src/index.ts to require title, supported asset type and content on create, bound optional text fields, validate metadata as an object and restrict statuses (commit b455b33b616478ecc1a0cea900a270482bc5c8b6).
- Replaced Marketing Studio placeholder with a draft editor and saved-asset review/status UI in public/marketing.html and public/marketing.js (commits d9c1a0a... and d6f6ca7...). It clearly states draft storage only; internal approval does not publish.
- Added/extended tests/marketing-assets.test.mjs (commit 9cf95aaa54e81c743576c0319accb818ec4e68f9) for owner scope, draft-only boundary and field validation. CI is pending.
- Migration 0040 remains unapplied. No social publisher, email delivery, ad-buying or external campaign execution is connected.
- Synchronized the master blueprint with Marketing Studio draft storage and its no-publishing boundary (commit 794acb443055c201030d0788d05f84403558b66c).

## 2026-11-23 — Customer Success support-case workflow

- The branch now contains migration 0041_customer_support_cases.sql and a Customer Success UI/API workflow using the customer_support_cases table. It stores owner-private support cases, priority/status, internal notes and response drafts; no customer messages are sent and no refunds/payments/account changes are executed.
- public/customers.html and public/customers.js provide case creation, queue listing, status updates, response-draft editing and internal notes. src/index.ts exposes /api/v1/customers/cases through the owner-scoped business resource handler. tests/customer-support.test.mjs covers owner scope and the no-delivery boundary.
- I initially created a separate customer_feedback migration with the same 0041 version prefix while another task was creating customer_support_cases. To avoid duplicate Supabase migration versions, I deleted my redundant customer_feedback migration (deletion commit 8636d17690343e42d4054e75b4dff36de2f158da) and removed its unused API validation branch. Corrected customer support email validation in commit c9a7e2117b56f60de57ad766ac98a83a3f2ffc26.
- Migration 0041_customer_support_cases.sql remains the single 0041 migration. It is not applied; no deployment or customer contact occurred. CI for the latest integration is pending.
- Synchronized the master blueprint with Customer Success support-case tracking and its no-send/no-payment boundary (commit c6e9bafeff46e498ab23ee8128a2c30c8097108f).

- Follow-up compile check found one stale defaulting line for the discarded customer_feedback table. Removed it from src/index.ts in commit 1cc0bf8270b5623ea38fddb9c6882a4922b8d215. Customer Success now uses only customer_support_cases; re-check CI on the corrected head.

## 2026-11-23 — Creative Studio brief and output tracking

- Added migration 0042_creative_briefs.sql (commit b2870ad2d3b3b8616fcd2d7d848d90a2b849fa6f) for owner-private image/video/audio/brand/presentation briefs, prompts, HTTPS references, status, output URL and notes.
- Added /api/v1/creative/briefs through the owner-scoped business resource handler in src/index.ts (commits f550fb3416a5b32fa32fdad1634dbf508449c878 and c4820e08336906cc59be4c1858ef9c2cbc079273). Validation restricts asset type, status, text lengths and HTTPS reference/output URLs.
- Replaced the Creative Studio placeholder with a brief editor and production board in public/creative.html (the page was updated by the parallel branch workflow) and public/creative.js (commit ce693770543ad49543792f3e171aece6efd02149). Owners can save briefs and prompts, manage production status, add output links and notes. The UI explicitly says it does not generate or publish media.
- Added tests/creative-studio.test.mjs (commit 4bf0df5308e2d8bfdcb0176e30eb134061a2e953). CI pending. Migration 0042 remains unapplied; no paid media generation or external publishing is connected.
- Synchronized the master blueprint with Creative Studio brief storage and its no-generation/no-publishing boundary (commit 75dca425842211661438f3889be732c229bac1af).

## 2026-11-23 — Learning Planner and Commerce Planning

- Replaced Learning & Accountability placeholder with a usable Learning Planner using existing owner-scoped Projects and Tasks APIs. Owners can create Learning: projects, generate an eight-step study path, add custom milestones and track task status. UI: public/learning.html and public/learning.js. Tests: tests/learning.test.mjs; CI run 45109516981 passed. Automatic reminders, course enrollment and adaptive learning integrations are not connected.
- Replaced Commerce & Fulfilment placeholder with a financial planning view over saved products and offers (public/commerce.html and public/commerce.js). It shows saved price/cost assumptions and indicative net-before-tax estimates only. It explicitly preserves the permanent financial hard deny: no payments, refunds, transfers, purchases, subscriptions, investments or other financial execution. Commerce UI test commit 6c79796cd93fe21b0b43db66c8b85cc1df45c2b9 is still running CI.
- Customer Success code and UI are in place, with migration 0041 and API/UI/tests. The earlier failures were due to an invalid email-validation escape and a stale customer_feedback branch/default. The stale branch was removed in commit 1cc0bf8270b5623ea38fddb9c6882a4922b8d215; Customer Success uses only customer_support_cases. Re-check the latest CI head before reporting it green.
- Creative Studio migration 0042, owner API, brief UI, production status, HTTPS output URL and notes are implemented. Tests 4bf0df5308e2d8bfdcb0176e30eb134061a2e953 and a7a181162af89dc5e1d12f3e61efabd2383bea44 passed their runs. It does not generate media or publish assets.
- No migrations 0040–0042 have been applied. No Worker deployment, external publishing, customer messages or financial actions occurred.

## 2026-11-23 — Workspace module verification update

- Commerce Planning dashboard test passed CI run 45109704229. It reads existing product and offer assumptions only and keeps all money movement/financial commitments hard-denied.
- Creative Studio output tracking test passed CI run 45109682373; the UI now records HTTPS output URLs and production notes alongside owner-private briefs.
- Customer Success stale feedback-schema default was removed in commit 1cc0bf8270b5623ea38fddb9c6882a4922b8d215; CI run 45109491884 passed. Customer Success uses only migration 0041_customer_support_cases.sql and the customer_support_cases API resource.
- Learning Planner UI/test passed CI run 45109516981. Marketing draft UI/test passed CI run 45109173405. Research evidence UI test passed CI run 45108993026. Analytics dashboard test passed CI run 45109041932. Launch Planner test passed CI run 45109122940.
- The latest memory/blueprint synchronization commits are 33defa86f4593d371c85c41e1651e9b53d3c9692 and 7e6ad8ef9ddc4dfcf8f4edc1faf06cde74e22c03; their CI runs are in progress at this checkpoint.
- No migrations 0040–0042 were applied and no Worker deployment occurred. No external send/publish or money movement occurred.

## 2026-11-23 — Autonomy approval-consumption hardening

- Hardened migration 0039 so the atomic service-role approval consumption RPC also refuses to consume any approval if the owner's global pause row is missing/paused, if external_execute policy is missing/disabled/not approval-required, or if the tool name matches the permanent financial deny patterns. Tool/target lengths are bounded.
- The initializer now returns the actual persisted pause state on repeated calls rather than always claiming paused=true. It still never unpauses or enables external execution.
- Added regression assertions in tests/autonomy-governance-sql.test.mjs (commit 81ac42f3e95507753bc5a73be314b73cf1a45427); SQL hardening commit 85a5abd764ee763cfb822ebeae22af25ebe57ea3. CI pending.
- Runtime continues to block external tools entirely until a sender-specific path consumes an exact approval and performs immediate pre-side-effect policy, recipient, suppression, provider and pause rechecks.
- Updated the master blueprint with the approval-consumption pause/policy/financial hard-deny checks (commit 2e4f216e036570071a3faee119dc58324f977be8).

## 2026-11-23 — Assistant Marketing Studio tools

- Added assistant tools marketing_list_assets and marketing_create_asset in src/assistant/runtime.ts (commit eaf07b4cebf555b4268e972daf42417da45199e3). The assistant can read owner-private marketing drafts and save new draft copy with bounded type/field validation. The create result explicitly returns published=false and sent=false.
- Registered the tools as observe/draft in src/assistant/autonomy.ts (commit 256e4be7401f8d415635af7d0b5929a4f88c4d49) and marked Marketing Studio tools available in src/assistant/registry.ts (commit 54d6c92a88c4a6aeb9c598abc379a6901d9e4e04). Added autonomy/runtime regression coverage in tests/autonomy-policy.test.mjs (commit 041caf4ce6e56ba47a1b12a55f826d14f6163091).
- This adds internal draft creation only; no publishing, email sending, ad buying or external side effects are exposed. Migration 0040 remains unapplied. CI pending.
- Updated the master blueprint with the new Assistant Marketing draft tools and no-publishing boundary (commit 76e696ca916ae3aba364ff35d861e7cb763fbe2a).

## 2026-11-23 — Assistant Customer Success tools

- Added assistant tools customers_list_cases, customers_create_case and customers_update_case in src/assistant/runtime.ts (commit 3cfc1bda137057bec8c7626865b1470be0d55ba8). They read owner-private support cases, create internal cases and update status/response drafts/notes. Results explicitly state customer_contacted=false and response_sent=false.
- Registered the tools as observe/draft/internal_execute in src/assistant/autonomy.ts (commit 7adbc996b1736cdd30ae11e2b6c6fd6fbf02df9b) and marked Customer Success tools available in src/assistant/registry.ts (commit b5333bcfde980a0f6891f0f67365dba8e572f004). Added tests in tests/autonomy-policy.test.mjs (commit df913cb1e664396c67006f754aa9e8d89065bc6b).
- This enables internal support workflow only. No outbound customer messages, refunds, account changes or payments are possible. Migration 0041 remains unapplied; CI pending.
- Updated the master blueprint with Assistant Customer Success case tools and the no-contact/no-payment boundary (commit 3408d0dbddaad6a3723bb0dc83b15817cd9a32a0).

## 2026-11-23 — Assistant Creative Studio tools

- Added creative_list_briefs, creative_create_brief and creative_update_brief to src/assistant/runtime.ts (commit e946e6fafc3453f186dab5c61f82baafa145c76e). GiGo can read owner-private briefs, save a new brief/prompt with up to 20 HTTPS references, and update production status/output URL/notes.
- Registered observe/draft/internal_execute scope classifications in src/assistant/autonomy.ts (commit abd555b53a99f2af64aa093164d1ec35c59369cc) and marked the tools available in src/assistant/registry.ts (commit 7e3e34ea853923fe9515ea386b42f2dc5cd39dc0). Added tests in tests/autonomy-policy.test.mjs (commit 66658a05da127fdb1c30f4d71eb3ddf01ccf479a).
- Tools explicitly report media_generated=false and published=false. This is brief/prompt/output tracking only, not an image/video generation integration. Migration 0042 remains unapplied; CI pending.