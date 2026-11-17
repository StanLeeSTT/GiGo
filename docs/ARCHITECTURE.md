# GiGo — Technical Architecture

## Initial shape
Use a modular monolith with clear domain boundaries. Keep deployment simple until real workload proves a separate service is necessary.

Proposed zero-budget-first stack (subject to current free-tier and terms verification):
- Frontend: responsive web app hosted on a free static hosting tier.
- API: serverless request handlers for short operations.
- Database/auth: PostgreSQL with row-level security and managed authentication.
- File storage: managed object storage; optional user-authorised Drive integration.
- Background jobs: database-backed queue with resumable state and checkpoints.
- AI: provider adapter interface; no provider is assumed free or available until verified.

## Domain boundaries
- identity: owner profile, sessions, permissions.
- assistant: conversations, messages, memory and tool requests.
- workspace: projects, tasks, notes, files and activity.
- research: sources, findings, opportunities and evidence.
- crm: organisations, contacts, leads and interactions.
- offers: service definitions, scopes, pricing assumptions and proposals.
- outreach: campaigns, recipients, approvals, suppressions and provider events.
- creative: generation jobs, assets and revisions.
- integrations: encrypted connection metadata, scopes, quota and health.
- audit: append-only record of sensitive operations and state transitions.

## Data principles
- The database is the source of truth for GiGo-owned records.
- External services are integrations, not the only storage location.
- Keep timestamps in UTC and render in the user's locale.
- Store provenance, timestamps, and confidence for research claims.
- Store money as integer minor units plus ISO currency code; never use floating point for balances.
- Do not store provider secrets in browser code or source control.
- Apply row-level security to every owner-scoped table.

## Durable jobs
Every asynchronous job should include:
- id, type, status, created_at, updated_at
- input reference and validated configuration
- progress and current step
- attempt count, next retry time and last safe error
- checkpoint data and idempotency key
- cancellation request and audit reference

Supported states:
pending, processing, completed, failed, paused, waiting_for_quota, waiting_for_worker, awaiting_approval, cancelled.

Workers must claim jobs safely, use idempotency keys for external side effects, checkpoint progress, and retry transient errors with bounded exponential backoff. A timed-out request must not lose the job.

## API conventions
- Validate all input at the boundary.
- Return predictable JSON envelopes and appropriate HTTP status codes.
- Use request IDs for tracing.
- Never return stack traces, secrets, or raw provider credentials.
- Enforce authentication and ownership checks on every private resource.
- Rate-limit expensive or externally visible operations.

## External action safety
Sending messages, spending money, accepting agreements, or publishing content requires explicit approval. Persist the approved payload and its version so later edits cannot silently change what is sent. Report success only after a provider confirms it.

## Security baseline
- Server-side secrets only.
- Least-privilege provider scopes.
- Strict CORS allowlist.
- Secure cookies and CSRF protections where applicable.
- Input validation and output encoding.
- RLS and automated ownership tests.
- Audit log for sensitive actions.
- Export, backup, and restore procedure before storing important user data.

## Architecture decision rule
Prefer the simplest free and reliable option that meets the requirement. Verify current free-tier limits, data retention, acceptable-use policies, and regional availability before adopting a provider. Do not add a paid fallback without owner approval.
