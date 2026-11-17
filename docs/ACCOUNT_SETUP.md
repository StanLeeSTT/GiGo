# GiGo Account and Supabase Setup

## What this step enables
The application now contains:
- Email/password sign-up and sign-in screens.
- Server-side calls to Supabase Auth through the GiGo Worker.
- Session verification through `GET /api/v1/me`.
- Refresh-token handling for an active browser tab.
- Sign-out through the Supabase Auth endpoint.

The login flow remains disabled until a Supabase project is configured. No database or authentication provider has been connected or deployed by this commit.

## 1. Create a Supabase project
1. Open the official Supabase dashboard: https://supabase.com/dashboard
2. Sign in or create an account.
3. Create a new project for GiGo.
4. Use a strong database password and keep it private.
5. Select a region appropriate for your expected users.
6. Wait for the project to finish provisioning.

Review the current Supabase free-plan limits before relying on the project for production data.

## 2. Apply the GiGo database migration
1. Open the GiGo project in Supabase.
2. Open the SQL Editor.
3. Open this repository file: `supabase/migrations/0001_initial_schema.sql`.
4. Copy the complete SQL into a new SQL Editor query.
5. Review it, then run it once against the new GiGo project.
6. Confirm that the tables and policies were created.

Do not run this migration against a database containing unrelated tables without reviewing the SQL first.

## 3. Get the project API values
In the Supabase project settings, open the API or API Keys area and copy:
- Project URL.
- The publishable/anon public API key.

The public key is designed to be used by an application with Row Level Security enabled. Never use or expose the service-role/secret key in the browser, GitHub, or this Worker.

## 4. Configure the GiGo Worker
After the Worker is deployed, configure its server-side variables/secrets using Wrangler:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
```

Paste the Project URL when prompted for the first value and the publishable/anon public API key when prompted for the second. Do not commit either value to this repository.

Set `ALLOWED_ORIGINS` to the exact URL of the deployed GiGo frontend. The current local values are only for local development.\n\nSet the Worker variable `OWNER_EMAIL` to the exact email address you will use for your private GiGo owner account. The signup endpoint refuses all account creation until this value is configured, and rejects signup attempts from any other email address.

## 5. Authentication behaviour
- A new account may require email confirmation depending on the Supabase Auth settings.
- If confirmation is enabled, follow the confirmation email, then sign in.
- Access and refresh tokens are held in the current browser tab's session storage.
- The API verifies sessions with Supabase before reporting a user as signed in.
- GiGo does not store the user's password.

## 6. Current limitations
- Password reset and OAuth sign-in are not implemented yet.
- The application has not yet been deployed or tested against a live Supabase project.
- Projects and tasks are not yet connected to database CRUD endpoints.
- The app currently supports one personal owner account by product design, but owner-only signup enforcement still needs to be configured before public deployment. Do not publish the app as an open registration service.

## Security checklist before deployment
- Use a strong, unique database password.
- Never use the service-role key in frontend code.
- Restrict Worker origins to the actual GiGo domain.
- Enable email confirmation if appropriate.
- Configure owner-only access before making the app publicly reachable.
- Keep backups/export options available before entering important business data.
