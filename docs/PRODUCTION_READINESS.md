# GiGo Production Readiness and Owner Handover

This checklist separates committed source code from a working deployment. Complete it in order. Do not paste credentials into chat, GitHub issues, source files or browser storage.

## 1. Current verified state

- Repository: `StanLeeSTT/GiGo`.
- Working branch: `feat/universal-collection-engine`.
- Cloudflare Worker name: `gigo-api`.
- Supabase project URL currently recorded in project context: `https://evluebrvgleewebddhjl.supabase.co`.
- Worker source and frontend are in this repository.
- CI typechecks TypeScript, runs Node tests and syntax-checks browser JavaScript.
- The source branch has not been confirmed merged to `main` or deployed from its latest commit.
- The exact live database migration history must be checked in Supabase. Previously confirmed applied migrations were 0001 and 0004–0009; status of 0002 and 0003 is uncertain. Do not assume later migrations are applied.
- No outbound email provider or social-network adapter is enabled. No external message or post has been sent by this work.
- GiGo must never execute money movement or financial commitments.

## 2. Reconcile the Supabase migration history

There are 44 ordered migration files, from `0001_initial_schema.sql` through `0044_private_research_documents.sql`. The repository files are source-of-truth proposals, not proof of database state.

1. Open the intended GiGo Supabase project and inspect its migration history.
2. If using Supabase CLI history, inspect `supabase_migrations.schema_migrations` (if present) and compare each version against the filenames in `supabase/migrations/`.
3. Confirm whether 0002 and 0003 were applied.
4. Identify the highest contiguous migration version applied. Investigate gaps rather than blindly applying later files.
5. Review each pending migration for compatibility with the live schema and data. Back up/export the database before applying schema changes.
6. Apply missing migrations in numeric order, one controlled batch at a time. Run the SQL from the repository exactly once per version and record the result.
7. Verify the resulting tables, RLS policies, grants and RPC functions before proceeding.

Later migration groups include:

- 0010–0021: Universal Collection Engine, worker leases, persistence, intelligence and lead evidence.
- 0022–0036: Outreach campaigns, approvals, recipient eligibility, templates, queue preparation, inbound safety and final send guards.
- 0037–0039: Durable autonomy governance, owner initialization, exact approval consumption and outbound signature/partnership rules.
- 0040–0042: Marketing assets, Customer Support cases and Creative Studio briefs.\n- 0043–0044: Research evidence traceability, private research document metadata and owner/run constraints.

Do not disable RLS to make an API request work. Fix the owner-scoped policy or RPC boundary.

## 3. Configure the Cloudflare Worker

Set exact browser origins. Never use wildcard CORS for this authenticated application.

Required Worker variables/secrets:

| Name | Kind | Purpose |
|---|---|---|
| `SUPABASE_URL` | Variable | Supabase project URL |
| `SUPABASE_ANON_KEY` | Variable/secret | Supabase publishable/anon key used for Auth and owner-scoped API calls |
| `SUPABASE_SECRET_KEY` | Secret | Server-only service access for controlled worker/RPC operations |
| `OWNER_EMAIL` | Variable | Exact owner email allowed to create the single owner account |
| `ALLOWED_ORIGINS` | Variable | Exact deployed GiGo frontend origin(s) |
| `AI_PROVIDER_POOL` | Secret, optional | JSON array of approved free-only model providers |

Optional dedicated AI secrets: `NVIDIA_NIM_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`. Optional Maxun settings remain scaffolding and must not be enabled without a deployed, reviewed service.

Use Cloudflare Dashboard or `wrangler secret put NAME`. Keep secrets out of `wrangler.toml`, `.env.example`, frontend files and GitHub source. Check `docs/PROVIDER_CONFIGURATION_CHECKLIST.md` before adding models. Only free-tier entries explicitly enabled by the owner may be used; never use key rotation to bypass quotas.

## 4. Verify authentication and owner isolation

- Configure the exact `OWNER_EMAIL` allowlist before public exposure.
- Create the single owner account and complete any email confirmation.
- Verify login, session refresh, `GET /api/v1/me` and logout.
- Verify a second unrelated account cannot sign up or read/write owner records.
- Verify unauthenticated and malformed requests fail closed.
- Verify browser origins match the deployed frontend exactly.
- Verify service credentials are never returned by provider status or API responses.

## 5. Initialize safety controls and signature

Only after the corresponding migrations are verified applied:

1. Sign in as the owner.
2. Initialize autonomy defaults. The database must create a globally paused state; external execution remains disabled.
3. Confirm the global pause, observe/analyse/draft/internal policy states and audit record.
4. Test pause/resume and policy changes. A missing autonomy row must remain paused/fail closed.
5. In Settings, save the exact outbound signature `STANLEE`.
6. Read the signature back from the authenticated settings API and verify it is the single final line appended by database rendering.
7. Never create an arbitrary owner ID or bypass owner-authenticated RPCs.

## 6. Verify core owner workflows

Run an authenticated smoke test for each page/API:

- Projects and tasks
- Assistant conversations and AI provider status
- Research runs, source URLs and evidence review
- Product and Partner Studio
- Leads and CRM
- Offers
- Marketing assets
- Creative briefs
- Outreach campaign draft, recipient staging, eligibility and template preparation
- Customer support cases and unsent response drafts
- Learning plans and milestones
- Analytics snapshot
- Operations and durable jobs
- Settings and autonomy audit

Confirm each record is owner-scoped, persists after refresh, and cannot be accessed by a different user. Confirm error states do not claim success.

## 7. Universal Collection Engine

The manual GitHub Actions batch workflow registers the reviewed `gigo_safe_http_batch` adapter. It uses DNS A-record resolution and pins the selected public IPv4 address, rejects non-public IPv4 ranges, validates each redirect, checks robots policy, caps response bytes, request time, redirects, pages and batch size, and persists progress through lease-protected RPCs.

Before using it:

1. Confirm migrations 0010–0021 are applied.
2. Add GitHub Actions secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to the repository. Never add these as repository variables or source.
3. Create exactly one owner-scoped `gigo_safe_http_batch` provider registration using the onboarding route and inspect its configuration.
4. Run the manual `GiGo safe collection provider health check` workflow. It probes public HTTPS egress and the database worker RPC, then promotes provider health only if checks pass.
5. Create a small test run with public pages that permit automated access.
6. Manually dispatch `GiGo safe collection batch` and inspect the dataset, provenance, counters, checkpoint and audit results.
7. Verify cancellation, lease loss, retry and duplicate item behaviour.

This adapter collects only metadata from explicitly supplied public HTTPS URLs. It is not a general social scraper. YouTube, Meta and other social connectors require their official API permissions, owner tokens, quotas and platform-policy checks. Candidate providers remain disabled until independently verified.

## 8. Outreach and external communications

Outreach currently supports campaign drafting, partner 50/50 net-revenue terms, contact eligibility review, approved templates and DB-side queue preparation. Queue preparation is not delivery.

Do not enable live sending until all of the following exist and pass end-to-end tests:

- Provider-specific sender adapter and authenticated sender identity.
- Current provider terms and lawful marketing basis confirmed for the target audience and region.
- Provider marketing contact registration verified.
- Approved campaign/template and final recipient eligibility recheck immediately before the network call.
- Suppression, unsubscribe, bounce and complaint enforcement.
- Signed inbound webhook validation, provider-account verification and message correlation.
- Idempotent send/retry semantics, audit events, rate limits, quiet hours and emergency pause.
- Explicit owner approval to activate the sender.

GiGo cannot negotiate binding counteroffers, sign agreements, promise earnings or make financial commitments.

## 9. Deployment and rollback

1. Confirm the latest CI run on the exact commit intended for deployment is green.
2. Review the diff and ensure no secrets or generated artifacts are committed.
3. Confirm migrations and secrets are correct.
4. Deploy only the reviewed branch/commit with Wrangler.
5. Verify `/healthz`, `/api/v1/status`, login, static asset loading and all smoke tests.
6. Keep the previous Worker version available for rollback.
7. Monitor Worker errors, Supabase logs, quota and scheduled job outcomes.
8. Do not activate external sends, publishing or financial integrations as part of the deployment.

## 10. Owner action boundary

GiGo can prepare budgets, estimates, invoices, payment instructions and reports. The owner alone performs all payments, purchases, subscriptions, transfers, investments, trading, payouts, charges, deposits and withdrawals. No future approval or policy setting may override this permanent financial deny.


## Research evidence traceability (migration 0043)

Migration `0043_research_evidence_traceability.sql` adds owner-scoped exact passages, source locators, optional content hashes, atomic claims and claim-to-passage support/contradiction/context links. Claims default to `unverified`. Database triggers require every linked claim, passage and source to belong to the same owner and research run, and RLS protects all new tables.

This schema does not itself upload or extract PDF/HTML/CSV files, perform OCR, create embeddings, or verify claims automatically. Those remain future application/worker work. A saved passage is traceable evidence, not an automatic truth determination. Apply migration 0043 only after reconciling and applying all earlier migrations in order.


## 11. Private research documents (migration 0044 + R2)

Research uploads require both migration `0044_private_research_documents.sql` and a private Cloudflare R2 bucket. The Worker binding is declared as `RESEARCH_FILES` and points to bucket `gigo-research-private`.

1. Create the R2 bucket named `gigo-research-private` in the intended Cloudflare account. Do not enable public access or a public custom domain.
2. Confirm the Worker has the `RESEARCH_FILES` binding after deployment.
3. Apply migrations 0044 and 0045 only after all prior migrations are reconciled and applied in numeric order. Migration 0045 links extracted passages to the private document and adds the idempotent locator constraint.
4. Verify authenticated owner upload, listing and download. Test with a second account and confirm it cannot see or retrieve the first owner's file.
5. Upload limits: 5 MiB; accepted MIME types: TXT, HTML, CSV and PDF. SHA-256 is stored with private metadata. Objects use owner/run/document-scoped keys and are not public URLs.
6. The upload endpoint stores the original document privately. Use the authenticated `POST /api/v1/research/documents/extract` endpoint or the Research workspace's **Extract evidence** action for TXT, HTML and CSV files. Extraction rechecks the stored SHA-256, decodes UTF-8 strictly, uses bounded parsing (500,000 characters and at most 50 passages), creates a provenance-linked research source and exact passages, and leaves every passage unreviewed. Repeated extraction upserts by document/locator and is safe to retry. HTML is stripped to text; scripts and markup are never executed. PDF files are stored and signature-checked but binary PDF extraction/OCR is not implemented.

If the bucket or migration is missing, upload fails closed with a configuration/storage error. Do not treat a file upload as evidence extraction or claim verification.
