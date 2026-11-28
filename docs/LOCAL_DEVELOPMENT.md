# Local Development and Deployment

## Requirements

- Node.js 22 or newer
- npm
- Cloudflare account for Worker preview/deployment
- Supabase project for Auth and Postgres

## Install and verify

```bash
npm install
npm run typecheck
npm test
find public -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 -n1 node --check
```

## Local Worker configuration

Create a local `.dev.vars` file (never commit it):

```ini
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
OWNER_EMAIL=YOUR_OWNER_EMAIL
ALLOWED_ORIGINS=http://localhost:8787
APP_ENV=development
```

Start the Worker and static frontend:

```bash
npm run dev
```

The local app should be available at the Wrangler development URL. Verify `/healthz`, `/api/v1/status`, authentication and the signed-in owner API.

## Cloudflare Worker configuration

For deployment, configure these server-side values in Cloudflare:

- Variables: `SUPABASE_URL`, `OWNER_EMAIL`, `ALLOWED_ORIGINS`, `APP_ENV`.
- Secrets: `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, and optional AI/provider secrets.

Use `npx wrangler secret put NAME` for each secret. Never put service credentials in the frontend, Git or `wrangler.toml`.

## Database

Before running the application against a real database, reconcile migration history and apply only missing migrations in numeric order. Read `docs/PRODUCTION_READINESS.md`. The current repository contains migrations 0001–0042; committed SQL is not proof of application.

## Deploy

Only deploy after CI passes on the exact commit, database migrations are reconciled, Worker secrets are configured, owner-only signup is set, and the rollback plan is ready:

```bash
npm run typecheck
npm test
npm run deploy
```

After deployment verify `/healthz`, `/api/v1/status`, login, logout, static assets, owner-scoped CRUD and the Settings safety controls.

## Background collection

The Universal Collection Engine has a manual GitHub Actions workflow for a bounded public HTTPS metadata actor. It requires repository secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, applied collection migrations, exactly one correctly configured owner provider row, and a successful manual provider health check before batch dispatch. See `docs/PRODUCTION_READINESS.md`.

## Current external-action limits

- No live outbound email provider is connected.
- Social connectors remain disabled unless an official API integration is configured and verified.
- Message queue preparation does not send messages.
- Financial actions are permanently denied.
- Do not infer production readiness from CI success or a successful health endpoint.
