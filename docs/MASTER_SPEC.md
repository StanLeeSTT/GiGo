# GiGo — Master Product Specification

## Mission
GiGo is a personal AI assistant and intelligent business operating system. It helps its owner research opportunities, develop ideas, build products and services, discover customers and partners, manage communications, execute projects, organise personal and professional activities, and grow businesses.

## Product scope
GiGo combines:
- Conversational personal assistance and persistent context.
- Opportunity and market research.
- Lead discovery, qualification, CRM, and compliant outreach.
- Offer creation, pricing research, proposals, and customer onboarding.
- Project, task, calendar, file, and communication management.
- Creative production tools for business and personal use.
- Connected services coordinated through explicit permissions.

## Non-negotiable requirements
1. Build for one owner first; do not add multi-tenant SaaS complexity prematurely.
2. Cloud-first and mobile-first. Core workflows must not depend on a laptop being online.
3. Zero-budget-first. No paid provider, API, or hosting tier without explicit owner approval.
4. Maintain one coherent assistant experience and shared data model across modules.
5. Store durable user data in the application database; integrations are not the sole source of truth.
6. Clearly distinguish recommendations, drafts, queued work, and completed actions.
7. Require explicit approval for sensitive external actions, including campaign sends, spending, and agreements.
8. Record provider confirmation before reporting external actions as successful.
9. Keep source provenance and confidence for research outputs.
10. Protect secrets, apply least privilege, and maintain audit history.

## Core modules
- Assistant: chat, memory, research, planning, tasks, summaries, briefings.
- Opportunity Finder: niche and market discovery, opportunity tracking.
- Lead Engine: source discovery, deduplication, qualification, scoring, CRM handoff.
- Outreach: draft campaigns, approval gates, provider-compliant sending, suppression and event tracking.
- Offer Builder: scope, deliverables, cost assumptions, pricing tiers, margin estimates, proposals.
- Customer Workspace: contacts, files, agreements, communications, projects, invoices and payment records.
- Project Manager: milestones, tasks, deadlines, dependencies, notes and progress.
- Creative Studios: property, ads, short videos, eBooks, courses, websites, social and brand assets.
- Analytics: pipeline, campaign events, project health, revenue and expenses.
- Integrations: provider connections, permissions, health and quota status.

## Delivery milestones
### Milestone 0 — Foundation
Repository conventions, product specification, architecture, environment template, secure configuration, CI checks.

### Milestone 1 — Working application shell
Responsive mobile-first UI, authentication, owner profile, navigation, health endpoint, database migrations.

### Milestone 2 — Assistant foundation
Conversation persistence, project context, memory records, provider adapter interface, safe response handling.

### Milestone 3 — Personal productivity
Projects, tasks, reminders, notes, files, dashboard and daily briefing.

### Milestone 4 — Business research and CRM
Opportunity records, sourced leads, deduplication, qualification, customer records and activity timeline.

### Milestone 5 — Offers and compliant outreach
Offer drafts, pricing assumptions, campaign approvals, consent/lawful-basis records, suppression, provider event tracking.

### Milestone 6 — Creative studios and integrations
Prioritise property, ad, short-video, eBook and website workflows. Add external integrations only after security and free-tier review.

## Definition of done
A feature is not complete merely because a screen exists. It must have validated inputs, persisted data where appropriate, clear loading/error/empty states, permission checks, tests for important behaviour, auditability for external actions, and truthful status reporting.
