# Local Development and First Deployment

## Current stage
The repository contains the initial Cloudflare Worker API shell and a Supabase database migration. The frontend, production authentication configuration, and background job runner are not implemented yet.

## Requirements
- Node.js 20 or newer
- npm
- A Cloudflare account for Worker deployment
- A Supabase project for authentication and PostgreSQL

No paid plan is required by this guide. Check current provider limits and terms before deployment; free-tier availability and quotas can change.

## Install and type-check
```bash
npm install
npm run typecheck
npm run dev
```

The local Worker should expose:
- `GET /healthz`
- `GET /api/v1/status`
- `GET /api/v1/me` (requires a valid Supabase access token)

## Configure secrets
Copy `.env.example` to a local environment file for reference. For Cloudflare, configure secrets using Wrangler secret commands rather than committing credentials:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
```

Set `ALLOWED_ORIGINS` to the exact deployed frontend origin(s). Do not use a wildcard for an authenticated application.

## Database
Review and apply `supabase/migrations/0001_initial_schema.sql` to the intended Supabase project. The migration creates owner-scoped tables and row-level security policies. Apply it only to a new GiGo database or after reviewing any existing schema.

## Deploy API
```bash
npm run typecheck
npm run deploy
```

After deployment, verify `/healthz` and `/api/v1/status`. Configure the deployed frontend origin before using browser authentication.

## Important
- Do not put service-role keys in the browser or Git.
- Do not enable email campaigns or other external actions until the approval, consent, suppression, and audit workflows are implemented.
- A successful API health response does not mean the database or authentication is configured.
