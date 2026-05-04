# Deployment Readiness

This project is prepared for production deployment with mock/demo runtime fallbacks removed from active flows.

## 1) What was hardened

- Removed mock persistence runtime fallback in:
  - `apps/ielts-simulator/src/services/persistence.ts`
  - `apps/sat-simulator/src/services/persistence.ts`
- Removed demo JSON defaults in admin import pages:
  - `apps/ielts-simulator/src/pages/AdminImportPage.tsx`
  - `apps/sat-simulator/src/pages/AdminImportPage.tsx`
- Removed localhost redirect fallback in platform candidate flow:
  - `apps/platform/src/pages/CandidateEntryPage.tsx`
- Removed localhost academy fallback in student workspace:
  - `apps/platform/src/pages/StudentWorkspacePage.tsx`
- Hardened cookie attributes (adds `Secure` on HTTPS) in:
  - `apps/platform/src/lib/cookieStorage.ts`
  - `apps/ielts-simulator/src/lib/cookieStorage.ts`
  - `apps/sat-simulator/src/lib/cookieStorage.ts`
  - `apps/academy/src/lib/cookieStorage.ts`
  - `apps/english-reading/src/lib/cookieStorage.ts`
- Removed browser-unsafe `x-request-id` response-header read:
  - `apps/ielts-simulator/src/lib/platformClient.ts`
- Added migration to archive seeded demo tests/plans:
  - `supabase/migrations/20260226190000_archive_seed_examples_for_deploy.sql`

## 2) Build verification completed

These builds pass:

- `npm run verify:prod`
- `npm audit --omit=dev`
- `npm --workspace apps/platform run build`
- `npm --workspace apps/ielts-simulator run build`
- `npm --workspace apps/sat-simulator run build`
- `npm --workspace apps/academy run build`
- `npm --workspace apps/english-reading run build`

## 2.1) GitHub push guardrails

- Added CI workflow: `.github/workflows/ci.yml`
  - installs dependencies
  - runs production readiness checks
  - runs runtime dependency audit
  - builds all frontend apps
- Added production sanity script: `scripts/verify-production-readiness.mjs`
  - blocks tracked `.env*` secret files (except `*.example`)
  - scans tracked text files for common key leaks
  - blocks `localhost` references in committed env example templates

## 3) Production env requirements

Set these before deploy (no localhost defaults):

- Platform app:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_IELTS_URL` (required for candidate handoff)
  - `VITE_ALLOWED_RETURN_HOSTS`
  - optional `VITE_AUTH_COOKIE_DOMAIN`
  - optional `VITE_AUTH_SHARED_COOKIE`
- IELTS app:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_PLATFORM_URL`
  - optional `VITE_AUTH_COOKIE_DOMAIN`
  - optional `VITE_AUTH_SHARED_COOKIE`
- IELTS Practice app:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_PLATFORM_URL`
  - optional `VITE_AUTH_COOKIE_DOMAIN`
  - optional `VITE_AUTH_SHARED_COOKIE`
- SAT app:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_PLATFORM_URL`
  - optional `VITE_AUTH_COOKIE_DOMAIN`
  - optional `VITE_AUTH_SHARED_COOKIE`
- Academy app:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_PLATFORM_URL` (required in production)
- English Reading app:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_PLATFORM_URL` (required in production)

## 4) Supabase deploy sequence

```powershell
supabase db push
supabase functions deploy
```

After deploy, confirm migrated seed cleanup ran:

```sql
select id, name, is_active, metadata->>'archived_seed_example' as archived_seed_example
from public.experiences
where id in (
  '33333333-3333-3333-3333-333333333333',
  '77777777-7777-7777-7777-777777777777'
);
```

## 5) Security checks (API/domain/DB)

### API

- Ensure production callers always send `Authorization: Bearer <access_token>`.
- Functions in this repo use `verify_jwt = false` and validate JWT with `auth.getUser(...)` in function code.
- Verify admin endpoints still require admin membership in DB:
  - `admin-builder`
  - `admin-tests`
  - `admin-assets`
  - `admin-billing`
  - `admin-coupons`
  - `admin-payments`

### Domain

- Enforce HTTPS on all domains/subdomains.
- Set HSTS at CDN/hosting layer.
- Use shared cookie domain only when needed (example: `.schood.online`).
- Keep frontend env URLs on your real domains only (no localhost in production env).

### DB

Run these checks in SQL editor:

```sql
-- RLS must be enabled on all public tables
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Review policies table-by-table
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## 6) Post-deploy smoke tests

1. Sign in on platform and open IELTS.
2. Start a session and submit answers.
3. Use admin import with real JSON payload (empty template is expected by default).
4. Open pricing and complete payment redirect path.
5. Verify subscribed services appear in platform landing.
