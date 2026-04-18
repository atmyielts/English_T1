# SAT Simulator

SAT practice and full-exam workspace built on React, Vite, Supabase auth, and Supabase Edge Functions.

## Local Commands

- `npm run dev` starts the SAT app locally.
- `npm run build` runs TypeScript build plus the production Vite build.
- `npm run lint` runs the SAT ESLint config.
- `npm run test` runs the SAT admin permission smoke test.

## Required Environment

The app requires:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Without those values, `src/lib/supabase.ts` and `src/lib/platformClient.ts` will fail fast at runtime.

Use `.env.local.example` as the starting point for local setup.

## Admin Model

SAT admin access now follows the same model as the platform backend:

- `/me` must report `admin.is_admin`
- the session must include `admin.portal.access`
- if the admin security policy requires MFA, the session must be `aal2`
- route-level SAT admin pages also require their own permissions

Current SAT admin route mapping:

- `admin.tests.manage`: `/admin/tests`, `/admin/test/:id`, admin session review/playback routes
- `admin.builder.manage`: `/admin/builder`, `/admin/import`
- `admin.assets.manage`: `/admin/assets` and asset upload actions inside `/admin/import`

## Import Behavior

`supabase/functions/import-experience` now:

- authorizes with the shared admin RBAC + MFA checks
- normalizes imported JSON into builder payload shape
- reuses existing experience/section/part/unit ids when `external_id` metadata or existing UUIDs match
- computes stale rows and removes them during re-import
- saves through `admin_builder_save` so imports create snapshots and versions
- syncs section instances after save

Dry runs still return normalized JSON plus write counts before mutating data.

## Verification

Recent local verification for this workspace:

- `npm run build`
- `npm run lint`
- `npm run test`
- `deno check supabase/functions/import-experience/index.ts`

For release validation, use [PRODUCTION_SMOKE_CHECKLIST.md](./PRODUCTION_SMOKE_CHECKLIST.md).
