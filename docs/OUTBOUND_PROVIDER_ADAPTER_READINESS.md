# Outbound provider adapter readiness

## Current status

GiGo contains a guarded Resend adapter implementation in `src/outreach/providers.ts`. It is intentionally **not registered** in `OUTBOUND_PROVIDER_ADAPTERS`. The registry remains empty, so no production sender is selectable through GiGo.

The adapter is a transport component, not an authorization system. It must not be connected to a live worker until the full campaign execution path and owner controls have been completed and tested.

## Implemented safeguards

- Validates message and recipient UUIDs, sender/recipient/reply-to email addresses, sender name, subject length, body length, required final `— STANLEE` signature and exact idempotency key before network access.
- Enforces channel/purpose matching. Marketing and relationship outreach cannot be sent through the transactional channel.
- Requires the recipient to be a registered contact before the Resend marketing channel can be used. This provider check does not replace GiGo's consent, lawful-basis, suppression, opt-out, registration or campaign-approval checks.
- Sends through the Resend email API using a stable `gigo-outreach/<message-uuid>` idempotency key.
- Treats explicit HTTP 429 rejection as retryable. Treats network errors and ambiguous server responses as unknown outcomes; they must not be automatically retried because acceptance may have occurred.
- Verifies Resend/Svix webhook signatures over the raw request body, requires a five-minute timestamp window and compares signatures without early exit.

## Not implemented / not activated

- The adapter is not registered. Do not add it to `OUTBOUND_PROVIDER_ADAPTERS` until the campaign worker has a reviewed authorization gate.
- No Resend API key, verified sender domain, sender identity or webhook signing secret is configured.
- No inbound webhook route exists. Signature verification alone does not provide event correlation, deduplication, replay persistence or safe status transitions.
- No durable worker dispatches approved outbox rows to the adapter.
- No end-to-end provider tests against a real sender are performed.
- No automatic marketing or cold outreach is permitted by this adapter. Publicly available email addresses are not evidence of consent.

## Activation checklist — owner action and engineering gates

1. Confirm current provider terms, regional availability, free-tier limits and acceptable-use requirements directly with Resend. Do not rely on historical quota numbers.
2. Verify a sender domain and configure SPF, DKIM and DMARC in the provider dashboard.
3. Store the provider API key and webhook signing secret only as Cloudflare Worker secrets. Never commit them, place them in browser code or paste them into chat.
4. Implement a server-only provider registry that is enabled only after explicit owner configuration.
5. Complete the durable outbox worker: claim rows atomically, re-check campaign approval, recipient consent and eligibility, suppression, registration, schedule/quiet hours, per-recipient and campaign limits, and the mandatory signature immediately before sending.
6. Persist the provider message ID and delivery outcome idempotently. Keep unknown outcomes in a reconciliation state; do not retry them automatically.
7. Implement a signed webhook endpoint that reads the raw body, verifies the signature before parsing, persists provider event IDs with a unique constraint, rejects stale/replayed events and correlates only to known GiGo messages. Webhook events must never override a suppression or owner pause.
8. Add a global pause, campaign-level pause, emergency kill switch, audit trail, rate limits and a dry-run mode.
9. Test owner isolation, duplicate dispatch, timeout-after-acceptance, rate-limit retry, provider outage, unsubscribe, complaint, bounce, webhook replay and signature tampering before enabling a real send.
10. Obtain explicit owner approval for any campaign and sender configuration. Do not enable sending merely because secrets exist.

## Permanent boundaries

GiGo must never initiate or approve payments, transfers, purchases, paid upgrades, investments, trades, loans, payouts or other financial commitments. Partnership proposals must preserve the approved 50/50 net revenue attribution rule and GiGo cannot accept counteroffers, sign agreements or make binding commitments. Outbound content must remain short, truthful, permission-based and end with the exact `— STANLEE` signature appended by trusted code.
