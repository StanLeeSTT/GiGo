# GiGo Project Memory

> **Living project handover.** Update this file in the same GitHub task/commit sequence whenever work is added, changed, tested, reverted, or its status changes. Record what changed, why, exact paths, commit(s), verification results, unapplied/deployment status, and the next concrete task. Never rely on conversation history alone.

**Last updated:** 2026-11-23  
**Repository:** `StanLeeSTT/GiGo`  
**Active branch:** `feat/universal-collection-engine`  
**Last verified branch HEAD at this update:** `8bf7cee2678bceb5218e941c1aaaff4b25ba3875`  
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
