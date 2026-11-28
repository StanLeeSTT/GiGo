# GiGo Owner Account and Supabase Setup

GiGo is designed as a private single-owner application. Do not deploy it as open public registration.

## 1. Supabase project

1. Open the official Supabase dashboard: https://supabase.com/dashboard
2. Create or select the dedicated GiGo project.
3. Save the database password securely.
4. Record the Project URL, publishable/anon key and server-only secret key.
5. Review the current free-plan limits and region availability.

## 2. Reconcile migrations before using the app

All schema files are in `supabase/migrations/`, numbered 0001 through 0042. Previously confirmed applied versions are 0001 and 0004–0009; 0002 and 0003 status is uncertain. Do not assume the remaining migrations have been applied.

Use `docs/PRODUCTION_READINESS.md` to inspect migration history, back up data and apply only missing migrations in numeric order. Never disable RLS to get a page working.

## 3. Configure owner-only signup

The Worker signup handler checks `OWNER_EMAIL` and rejects signup for any other email. Set this variable to the exact email address that will own GiGo before exposing the application.

Configure Worker variables/secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (server-side only; never expose to browser)
- `OWNER_EMAIL`
- `ALLOWED_ORIGINS` (exact frontend origin, no wildcard)
- `APP_ENV=production`

Use Cloudflare Dashboard or `wrangler secret put NAME` for secrets. The anon/publishable key is designed for browser-facing Auth/RLS flows; the secret key is privileged and must stay server-side.

## 4. Create the owner account

1. Deploy only after migrations and Worker configuration are reconciled.
2. Open the deployed GiGo frontend.
3. Sign up with the exact configured owner email.
4. Complete email confirmation if Supabase Auth requires it.
5. Sign in and confirm `GET /api/v1/me` identifies the authenticated owner.
6. Verify a different email cannot create an account and cannot access owner data.

The app uses Supabase Auth sessions; it does not store the owner's password.

## 5. First-run safety configuration

After the required autonomy and outreach migrations are applied:

1. Open Settings.
2. Initialize autonomy defaults. Confirm the initial state is globally paused.
3. Verify external execution remains disabled.
4. Save the outbound signature exactly as `STANLEE`.
5. Read it back from Settings and confirm database rendering appends it as the final line.
6. Keep outbound sending disabled. No provider sender is connected.

## 6. Verify the owner workspace

Test Projects, Tasks, Assistant, Research, Products, Partners, Leads, Offers, Marketing, Outreach, Launch, Commerce planning, Creative Studio, Customers, Analytics, Learning and Operations. Confirm records persist and remain private to the owner.

## 7. Important limitations

- The application is not production-ready merely because it builds or a Worker returns a health response.
- AI provider keys must be configured as Worker secrets. See `docs/PROVIDER_CONFIGURATION_CHECKLIST.md`.
- Universal Collection Engine uses a manual GitHub Actions batch runner for bounded public HTTPS metadata collection; it is not a general social scraper.
- Outreach creates campaign/message drafts and prepares the database queue; it does not send messages.
- Password reset/OAuth, full research document ingestion, vector search, signed provider webhooks, and several external integrations remain incomplete.
- GiGo must never execute payments, purchases, transfers, subscriptions, investments, trading, payouts or other financial actions.
