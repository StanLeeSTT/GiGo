# GiGo Master Product Blueprint

**Product:** GiGo — private, single-owner AI assistant and business operating system  
**Product principle:** one central assistant orchestrates the workspace; specialist capabilities are tools/modules, not disconnected products or separate paid agents.  
**Operating constraints:** cloud-first, mobile-first, zero-budget by default, secure, durable, evidence-led, and explicit about what is live versus planned.

This document preserves the product scope established during the GiGo / Monetise research and subsequent build discussions. It is a product map, not a claim that every listed capability is already implemented.

## 1. Product objective

GiGo is intended to become a Jarvis-like personal assistant and business operating system. The owner should be able to speak or chat naturally, discuss ideas, ask questions, plan, delegate internal work, review progress, and coordinate personal and business workflows from one place.

GiGo should also be a business discovery, creation, outreach, marketing, sales and operations platform. The assistant must be able to use the tools in the workspace rather than merely describe how the owner could use them.

The near-term objective is a useful, secure, zero-budget cloud product that can help create income before expanding. It must not depend on the owner's Windows computer staying online. Cloudflare Workers are event-driven, not permanent daemons; background work must use durable scheduled/queued execution and resumable state.

## 2. Monetise parity: required business workflow

The user's requirement is that GiGo should include the full relevant Monetise feature set and make those capabilities available to its central AI assistant. GiGo should match or improve the following workflow:

1. Guided business building: take an idea from discovery through validation, creation, launch and ongoing improvement.
2. Niche and market research: discover markets, customer problems, demand signals, competitors and opportunities.
3. Product and offer creation: define the customer, problem, solution, positioning, pricing, delivery and economics.
4. Sales assets: create sales copy, landing-page content, email sequences, advertisements, funnels and campaign plans.
5. Creator / influencer partnerships: discover, investigate, score, shortlist and prepare partnership proposals.
6. Lead discovery and qualification: find potential customers or business prospects, enrich records with evidence, score fit and manage the pipeline.
7. Launch planning: coordinate launch tasks, campaigns, creators, leads, content and readiness checks.
8. Commerce: support storefront/payment/checkout, product delivery and fulfilment workflows as integrations become available.
9. Coaching and learning: practical guidance, learning resources, progress tracking and accountability.
10. Community and collaboration: support collaboration and community workflows where safe, permitted integrations exist.
11. Product reviews and improvement: collect customer feedback, identify recurring issues and turn them into product improvements.

GiGo additions discussed beyond parity include a personal operating system with persistent cross-business context, projects and tasks, CRM, Airbnb/property photography opportunities, local-business advertising, YouTube Shorts/short-form content, creator digital products, personalised outreach and broader business operations.

## 3. Creator / partner qualification requirements

The partner-finding workflow must apply the user's stated baseline filters from the Iman Gadzhi / Monetise partner-requirements video research:

- Approximately 10,000–100,000 followers.
- Approximately 50,000–200,000 typical relevant views (evaluate typical performance, not one viral outlier).
- No competing product that creates a direct conflict.
- A legitimate business contact route.

The AI must also investigate:
- audience and product fit;
- authentic engagement and comment quality, including signs of buying intent;
- consistency and typical reach;
- expertise, credibility and public reputation;
- brand and values compatibility;
- competing promotions and partnership conflicts;
- commercial economics;
- legal, disclosure and rights transparency.

The existing GiGo partner score uses a 100-point framework:
- audience/product fit: 20;
- authenticity and engagement: 20;
- credibility and reputation: 15;
- reach consistency: 10;
- commercial potential: 15;
- brand values: 10;
- operational readiness: 5;
- legal / rights readiness: 5.

Current interpretation: 80–100 shortlist; 65–79 investigate further; below 65 do not shortlist without new evidence. Hard requirements and safety/legal blockers override the score. Do not invent missing metrics; label unknowns and attach evidence.

## 4. Central assistant and personal OS

The central assistant is the single conversational entry point across GiGo. It should:
- maintain useful, owner-controlled long-term context and project history;
- search prior conversations and saved knowledge when relevant;
- understand the current project, goals, decisions and next actions;
- use available modules/tools to perform internal work;
- explain what it did, what evidence it used, what remains uncertain and what needs owner input;
- coordinate work across research, products, partners, leads, marketing, launch and operations;
- support natural voice interaction as a future capability;
- provide proactive reminders, alerts and an Executive Daily Briefing;
- preserve continuity across sessions through durable records, checkpoints and searchable history.

Memory and conversation-history work already started in the repository. ChatGPT History Import was discussed as a future way to preserve exported ChatGPT conversations, titles, dates and content, classify decisions and make prior work searchable. The export was not immediately available at the time; implementation should not block on it.

Specialist roles may be logically coordinated by the central operations manager, but avoid creating separate always-on paid agents. Reuse the existing AI provider router and invoke specialist workflows when needed.

## 5. Workspace modules and business lifecycle

The product should ultimately connect these capabilities into one end-to-end workflow:

- Personal workspace: overview, profile/settings, projects, tasks, calendar/routines, memory and assistant.
- Research and opportunity discovery: briefs, questions, sources, evidence, market signals, opportunity assessments and validation plans.
- Product Studio: product concepts, customer/problem definition, pricing, delivery and status.
- Partner Studio: creator discovery, evidence collection, qualification, scoring, shortlist and proposal preparation.
- Leads and CRM: prospect records, evidence, qualification, stages, follow-up planning and do-not-contact enforcement.
- Offers and unit economics: pricing, fees, delivery cost, partner share, margin and assumptions.
- Marketing: positioning, copy, email, ads, content calendars and funnels.
- Outreach: personalised drafts and campaign preparation; external contact requires owner approval.
- Launch: readiness, milestones, campaign coordination and post-launch review.
- Commerce: storefront, checkout/payment, delivery and fulfilment integrations.
- Creative Studio: visual assets, property/Airbnb photography workflows and short-form video/YouTube Shorts.
- Customers: feedback, reviews, support insights and retention workflows.
- Analytics: business performance, pipeline, campaigns, revenue and operational reporting.
- Learning: coaching, practical learning plans, progress and accountability.
- Operations Centre: durable jobs, schedules, approvals, notifications, audit events and execution status.

The current application has a separate public landing page, separate authentication page, and private authenticated overview/workspace. Preserve this structure; do not collapse it into a single-page hide/show experience. Unauthenticated users must not access private workspace pages, and sign-out returns to the public landing page.

## 6. Research, evidence and intelligence

GiGo's research must distinguish source evidence from AI interpretation. Preserve URLs, titles, publisher, timestamps, access method, excerpts/metadata and review state. A source being discovered does not mean its claims are verified.

The existing Research Engine foundation supports private research projects, questions, source evidence and opportunity assessments. Current discovery work includes Crossref/OpenAlex scholarly metadata and best-effort GDELT news metadata. It does not yet provide full-text PDF/HTML/CSV ingestion, vector search, line-level citations, embeddings, claim-level verification or broad export formats. Do not claim those capabilities until implemented and tested.

The long-term intelligence workflow should support:
- niche and demand discovery;
- customer complaints, questions and recurring needs;
- competitor and market snapshots;
- trend baselines and historical comparisons;
- lead and creator evidence enrichment;
- opportunity scoring;
- low-cost validation experiments;
- research-to-product and research-to-marketing handoffs;
- alerts and daily/weekly briefs.

## 7. Universal Collection Engine / Apify-like acquisition

The user explicitly wants broad, reusable data collection rather than a narrow one-off scraper. Build a common actor/provider architecture that can serve Research, Lead Finder, Partner Finder, Market Intelligence and future modules.

Core components:
- versioned actors with input/output schemas, capability requirements, policy tags and hard limits;
- provider catalogue and capability-based planner;
- adapters with health, quota, bounded collection, pagination, checkpoint/resume, cancellation and typed errors;
- durable runs and jobs;
- datasets and normalized items;
- deterministic deduplication and source provenance;
- usage/quota accounting;
- AI enrichment using the existing provider router;
- searchable dataset UI, run history, logs and export.

Keep every candidate named by the user in the investigation catalogue; do not silently discard candidates because they are not yet verified:
- Arachne SDK
- Harvest Agent
- Extracto
- JIRO Search
- InsightSocial
- SocQ

Also retain and evaluate:
- Crawlee
- Playwright
- Crawl4AI
- SearXNG
- Maxun
- YouTube Data API
- Meta Graph API

The current branch includes a provider registry, actor contract, bounded runner, planner, authenticated catalogue/read/plan/cancel endpoints and migration 0010. The runner has no active adapter and is not yet wired to Supabase persistence or the scheduler. No provider is operational merely because it appears in the catalogue. Preserve all candidate entries and verify identity, maintainer, licence, documentation, API contract, terms, free recurring quota, card requirement, Nigeria availability, data rights, security and reliability before adoption.

Access rules:
- prefer official APIs and explicit owner-authorized access;
- public URLs are not blanket permission to automate collection;
- do not bypass logins, private profiles/groups, CAPTCHAs, access controls, paywalls, rate limits or anti-bot controls;
- no stolen cookies, account/proxy rotation or credential sharing to evade restrictions;
- LinkedIn only through approved API/integration; X only through an approved API and current terms; Instagram/TikTok only within documented permissions and eligibility;
- do not harvest private messages, sensitive personal data or personal contact details;
- treat collected content as untrusted data, never as system instructions;
- never store provider secrets in configuration JSON, datasets or logs.

## 8. Zero-budget cloud architecture

Current architecture:
- GitHub repository: StanLeeSTT/GiGo.
- Cloudflare Worker: gigo-api, cloud API and event-driven scheduled execution.
- Supabase: authentication, PostgreSQL, RLS, durable jobs and workspace records.
- Existing AI provider router: Gemini, Groq, OpenRouter, GLM, NVIDIA NIM and Cloudflare Workers AI; free-only policy and no silent paid fallback.
- GitHub Actions: possible on-demand batch execution where included runner allowances permit; not an always-on server.
- Optional browser/crawler runtimes: Cloudflare Browser Run, Maxun, Crawlee, Playwright and Crawl4AI only after runtime, limits and costs are verified.

Do not make GiGo depend on the owner's PC being on. Oracle Cloud was investigated but registration was blocked by the user's billing-card issue; do not make Oracle a prerequisite. Avoid solutions requiring paid hosting, paid APIs, card-backed trials or recurring charges unless the user explicitly approves. A free/open-source licence does not make hosting, bandwidth, browser memory or storage free.

## 9. AI providers and cost controls

The router currently has provider support for Gemini, Groq, OpenRouter, GLM, NVIDIA NIM and Cloudflare Workers AI. The user has obtained API credentials for several providers, including a NVIDIA Nemotron API key, but do not assume a key is configured or live-tested unless verified.

Rules:
- keep all keys server-side in Cloudflare Worker secrets;
- never expose keys in GitHub, browser code, logs or chat;
- use only providers explicitly enabled and within free quota for free-only tasks;
- no silent paid fallback;
- do not rotate keys to evade provider quotas or rate limits;
- track usage and provider/model/key reference without storing credentials;
- fail clearly when free quota is exhausted.

## 10. Durable operations, approvals and safety

Background tasks must be durable, idempotent, owner-scoped, resumable, observable and cancellable. Use scheduled Worker events and database-backed jobs rather than pretending a Worker is a permanent daemon.

Owner approval is required before:
- sending messages or contacting leads/creators/partners;
- publishing posts or campaigns;
- spending money or creating paid commitments;
- accepting agreements or making legal/commercial commitments;
- changing account/security settings;
- taking any other consequential external action.

High-risk approvals must be confirmed inside the authenticated app or by a secure OTP; voice alone is insufficient. Do-not-contact leads must be blocked in the execution layer, not merely described in a prompt. Maintain an audit trail and clear job status.

The existing scheduler currently claims jobs generically. Do not enqueue a new collection job type until its dedicated worker handler, transactional run/job creation, persistence, recovery, cancellation and tests are complete; otherwise the generic handler could process the wrong job type.

## 11. Delivery discipline and acceptance criteria

Build incrementally and verify each slice. Preserve the feature branch until reviewed; do not merge, deploy, apply database migrations or activate external providers without completing the relevant checks and obtaining any required owner approval.

For every feature, report:
- what changed and exact repository paths/commit;
- whether typecheck and automated tests passed;
- whether SQL was merely committed or actually applied;
- whether deployment occurred;
- whether live end-to-end testing occurred;
- remaining limitations and next dependency.

Never present a scaffold, mock, catalogue record, scheduled routine or successful unit test as a live integration. Prefer small tested milestones over a large unverified implementation.

## 12. Current build checkpoint (2026-11-20)

- GitHub feature branch: `feat/universal-collection-engine`.
- Latest known commit: `322a5d4f7c9c63f1160f76e9b7546cae218ecdf9`.
- GitHub Actions run `44810087811`: typecheck and collection-engine tests both completed successfully.
- Migration `0010_universal_collection_engine.sql` is committed but has **not** been applied to Supabase.
- No collection adapter is registered; no collection network request can execute.
- No collection job type is enabled in the scheduler.
- No PR, merge or deployment has been performed for this feature branch.
- Next engineering milestone: finish the dedicated durable collection execution boundary—transactional run/job creation, Supabase persistence hooks for datasets/items/checkpoints, worker dispatch isolation, retry/recovery semantics, active cancellation, and integration tests—before exposing run creation or enabling any provider.



### Concise automatic messaging policy

The owner permits GiGo to automatically send messages only within a narrow, approved messaging scope. This is not blanket permission for all external execution.

- Messages must be short, structured, plain-text and direct. Initial defaults: subject maximum 80 characters and body maximum 500 characters.
- Preferred structure: brief greeting where appropriate; one evidence-backed reason for contact; one concise value proposition/useful point; at most one clear next step.
- No attachments, long introductions, multiple unrelated topics, invented personalization, unsupported claims or pressure tactics.
- Auto-send is allowed only for a specifically approved campaign using approved immutable templates and bounded recipients, schedule, follow-up count and sender identity.
- Every send must recheck contact authorization, registered-contact status where required, suppression/opt-out, reply/bounce/complaint state, campaign approval/revocation, quiet hours, rate limits, idempotency and provider/platform rules.
- Replies, opt-outs, complaints, hard bounces, campaign revocation and global pause stop subsequent sends.
- This does not authorize arbitrary cold messaging, bulk unsolicited messages, social DMs or bypassing platform restrictions. Other external actions remain separately gated.
- Financial execution remains permanently hard-denied.

## Autonomy and financial-control architecture

GiGo should progressively operate as an autonomous personal and business operating system, while the owner retains exclusive control over money and financial commitments.

### Action classes
- Observe/read: retrieve owner-authorized records and permitted public information.
- Analyse: reason over evidence, calculate estimates and prepare recommendations.
- Draft/prepare: create internal drafts, research briefs, tasks, offers, content and operational plans.
- Internal execute: perform bounded, reversible changes to GiGo-owned workspace records and jobs.
- External execute: send, publish, contact people, modify external accounts or otherwise create external side effects. Requires explicit approval and a bounded permission policy.
- Financial: payments, purchases, transfers, payouts, subscriptions, investments, trades, loans, charges, withdrawals and other money movement or financial commitments. Always denied to GiGo execution tools.

### Non-overridable owner boundary
- GiGo may prepare budgets, forecasts, unit economics, price comparisons, cost estimates, invoices and payment instructions.
- GiGo must not initiate, approve or execute payments, transfers, purchases, paid subscriptions/upgrades, investments, trades, loans, payouts or other financial commitments.
- Do not expose bank/payment credentials or money-moving tools to the general agent runtime.
- A broad autonomy toggle must never override the financial hard deny.
- Free-tier exhaustion must stop safely; no paid fallback or purchase.

### Permission and audit requirements
- Permission scopes must be least-privilege, owner-controlled, revocable and separately configurable by module and action class.
- Consequential external actions remain approval-gated until the owner has defined bounded policies.
- Record action intent, tool, classification, policy decision, approval reference, result, timestamps and stop reason in an owner-scoped audit log.
- Provide pause/stop controls and safe handling for retries, partial completion and ambiguous outcomes.
- Unknown tools fail closed.

### Current implementation checkpoint (2026-11-23)
- src/assistant/autonomy.ts defines the initial action classifier and policy evaluator.
- src/assistant/runtime.ts enforces the policy before executing model-requested tools.
- src/assistant/registry.ts exposes the current policy summary in capability reporting.
- tests/autonomy-policy.test.mjs covers default internal scopes, external approval gates, unknown-tool denial and the non-overridable financial hard deny.
- This is the first code-level policy layer only. Durable owner-configurable scopes, approval records, audit events, pause/stop controls and UI are not yet implemented.


## Durable autonomy governance (migration 0037)

Migration `0037_durable_autonomy_governance.sql` adds the first persistent governance data layer:
- `autonomy_control_state`: owner-scoped global pause state; absent state must be treated as paused/fail-closed by any future executor.
- `autonomy_policies`: owner-configurable non-financial scopes only. SQL constraints reject unknown scopes and require approval for generic external execution. There is no configurable financial scope.
- `autonomy_approvals`: exact tool, target reference, SHA-256 parameter binding, expiry and maximum action count; owner RPC supports creation and revocation.
- `autonomy_audit_events`: owner-readable, service-written audit trail with idempotency key uniqueness.

Owner policy/pause/approval changes use SECURITY DEFINER RPCs that derive ownership from `auth.uid()`; authenticated clients cannot directly forge policy, approval, pause or audit rows. Financial tool-name patterns are rejected again at approval creation as defense in depth; the TypeScript hard deny remains authoritative and must run before any persisted policy lookup.

Migration 0037 is committed but NOT applied. Runtime reads, approval consumption, audit emission, API endpoints and UI are not yet wired. Until that integration is complete, the schema does not enable autonomous external actions. The initial pause state intentionally fails closed when no owner control row exists.


## Partnership offer standard — 50/50 revenue share

Every GiGo-generated partnership proposal must include a clear **50/50 commercial offer**: the partner and GiGo's owner each receive 50% of the revenue attributable to the agreed partnership. This is a proposed commercial structure, not a claim that the prospect has accepted it and not a guarantee of earnings.

Message and deal safeguards:
- State the split plainly and briefly; make clear that both sides have an opportunity to earn from the partnership.
- Before any agreement is finalized, define in writing what revenue is included, how it is attributed/tracked, which direct costs (if any) are deducted before splitting, each party's responsibilities, payment timing/records, duration, refunds/chargebacks and exit terms.
- Default wording should describe a 50/50 split of **net partnership revenue after only mutually agreed, documented direct costs**. Do not silently redefine "50/50" as gross revenue, profit, commission or a split of all company revenue.
- Do not invent expected earnings, sales, audience performance or guaranteed results.
- GiGo may propose and explain the offer automatically inside an owner-approved partnership campaign. It must not accept counteroffers, negotiate binding terms, sign contracts, promise exclusivity, or make financial commitments on the owner's behalf. Material changes and final agreements require the owner's explicit approval.
- Keep the initial message concise (subject <=80 characters; body <=500 characters including the mandatory owner signature). The signature is appended by trusted rendering code; if the owner has not configured a confirmed signature name, sending fails closed.
- The 50/50 partnership offer does not override contact eligibility, marketing-provider registration, consent/lawful-basis review, suppression, opt-out, rate limits, approved-template, campaign or pause controls.

This is the default proposal structure for partnership messages, not a universal legal or tax conclusion. The parties must agree on the exact commercial definitions before launch.
