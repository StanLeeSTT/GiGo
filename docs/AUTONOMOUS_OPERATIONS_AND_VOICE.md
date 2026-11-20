# GiGo Autonomous Operations & Voice Communication

## Product goal
GiGo should behave like a persistent, owner-controlled assistant and coordinated team. It should continue approved background work while the owner is away, resume safely after interruptions, report meaningful developments, and request owner decisions through the workspace and eventually voice calls.

## Architecture principles
- Cloud-first and zero-budget-first: Cloudflare Workers, Cron Triggers and Queues where available; Supabase remains the durable source of truth.
- No assumption that one Worker process remains alive. Work is event-driven, scheduled, checkpointed and resumable.
- AI agents are logical roles coordinated by an operations manager, not separate always-on paid model processes.
- Use the existing AI provider router and free quotas. Quota exhaustion pauses/retries work; never silently fall back to a paid provider.
- Every job is owner-scoped, idempotent where possible, observable and cancellable.
- External side effects require explicit owner approval. This includes sending messages, publishing, contacting partners, making purchases, payments, agreements and account changes.
- Do-not-contact leads must be blocked by the outreach execution layer, not merely hidden in the UI.
- Phone calls are a notification/conversation channel, not an authentication shortcut. A call cannot approve a high-risk action solely because a voice sounds familiar; require a secure in-app confirmation or one-time approval code.
- Never store provider secrets in database rows, browser storage, assistant messages or Git.

## Existing foundation
- public.jobs already stores durable work with pending/processing/completed/failed/paused/waiting_for_quota/waiting_for_worker/awaiting_approval/cancelled states, input, progress, checkpoints, attempts and idempotency key.
- Migration 0008_autonomous_operations.sql adds operation_schedules, approval_requests, notification_events and operation_events.
- The migration does not turn on a scheduler, connect a telephony provider, or send messages.

## Delivery sequence
1. Control plane (current): durable schedules, approval requests, notification queue records and operation event history.
2. Worker execution: authenticated APIs to create/list jobs, schedules and approvals; claim/lease jobs safely; checkpoints, retry/backoff, idempotency, cancellation and audit events.
3. Cron/Queue orchestration: scheduled dispatcher and queue consumer. Cron wakes the system; it does not run an infinite loop. Queue work is bounded and resumable.
4. Approval inbox: dashboard and assistant tools for pending decisions, approve/reject, expiry and immutable decision trail.
5. Notification adapters: in-app first, then email/push if a free and secure route is available.
6. Voice operations: investigate providers that support Nigerian mobile numbers and inbound/outbound calling, verify pricing and free-tier limits before integration. No provider selected yet.
7. Executive briefing: scheduled daily summary and priority-based interruption policy (critical/high/normal), with quiet hours and retry rules.

## Notification policy
- Critical: immediate notification attempts, but only through configured and consented channels.
- High: prompt notification, grouped when appropriate.
- Normal: digest or next briefing.
- Quiet hours and call-frequency caps prevent nuisance calls.
- If no delivery channel is configured, keep the item in the in-app queue and show it in the workspace.

## Voice-call approval safety
- A voice call may explain an approval request and capture a non-binding response.
- High-risk approvals must be confirmed in the authenticated GiGo app.
- The system must read back the exact action, recipient, content/amount and consequences before confirmation.
- Expired or rejected requests cannot execute. Approval is scoped to one exact action payload and expires.
- Record decision timestamp, channel and confirmation method.

## Current limitations
- No telephony provider has been selected or connected.
- No 24/7 daemon is promised. The intended design is continuously available event-driven cloud operation.
- No scheduled execution is enabled until the worker scheduler/queue consumer and Supabase policies are implemented and tested.
