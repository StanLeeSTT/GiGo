# GiGo Durable Job Scheduler

## Current architecture

GiGo uses one Cloudflare Worker with a five-minute Cron Trigger. The trigger is event-driven; it does not keep a process running continuously. Supabase is the durable source of truth for schedules, jobs, approvals, notifications and operation events.

The scheduled handler performs these bounded steps:

1. Dispatch due interval, daily and weekly schedules into durable jobs.
2. Atomically claim at most one due job through the database RPC.
3. Load only the owner's relevant workspace context for the job category.
4. Use the existing free-only AI provider router to prepare an internal report.
5. Save the report, provider metadata, token usage, operation event and an in-app notification.
6. Retry transient failures with a delay, or mark a job failed after five attempts.

The job runner supports internal work only. It cannot send email, contact partners or leads, publish content, spend money, enter agreements or change account settings. Those capabilities remain approval-gated and are not implemented by this worker.

## Required activation steps

The code is intentionally dormant until both requirements are met:

1. Apply `supabase/migrations/0009_durable_job_scheduler.sql` in the Supabase SQL Editor. It creates two SECURITY DEFINER RPC functions and grants execution only to the `service_role`.
2. In Cloudflare Worker `gigo-api`, add the Supabase legacy `service_role` key as a Worker secret named `SUPABASE_SERVICE_ROLE_KEY`. Do not use the anon/publishable key. Do not put this key in GitHub, browser code, a normal Worker variable, screenshots or chat.

The service-role credential bypasses RLS and must remain server-side. The worker explicitly filters owner data by user_id before loading it. Never expose the secret to the browser.

After both steps, deploy the Worker so Wrangler applies the Cron Trigger in `wrangler.toml`. The trigger runs every five minutes. It uses UTC for trigger timing; daily and weekly schedule calculations use each schedule's configured timezone (the Operations Centre currently saves Africa/Lagos).

## Recovery and limits

- Only one job is claimed per five-minute run to keep free-tier work bounded.
- Jobs are claimed atomically with `FOR UPDATE SKIP LOCKED` to avoid two worker invocations taking the same job.
- Jobs abandoned in processing for more than 20 minutes are recovered.
- A job gets at most five attempts.
- Provider quota/rate-limit failures wait one hour before retrying; other transient failures wait five minutes.
- A completed report is saved in the job's `progress.result` field and surfaced through an in-app notification.
- Crossref and OpenAlex results are metadata discovery only. They are not full-text verification.
- A saved schedule is not proof of execution. The Operations Centre should show actual job records and events before reporting that a routine ran.

## Supported job categories

- `research_scan`: fetches public Crossref and OpenAlex metadata for the task prompt and asks the configured model to assess it.
- `business_review`: reads the owner's saved research, products, offers and CRM leads.
- `daily_briefing`: reads the owner's tasks, pending approvals, recent jobs and operation events.
- `lead_review`: reviews the owner's CRM leads and must respect every do-not-contact flag.
- `custom`: performs an internal task described by the owner.

This first runner stores reports for owner review. It does not automatically turn recommendations into external actions.
