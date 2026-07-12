# Academy Production Cutover

Purpose: prove Academy is live, deployable, and operational for real education centers.

Production app: `https://academy.schood.online`

Production proof is not complete until GitHub, Cloudflare Pages, Supabase migrations/functions, and the live smoke account all agree.

## Current External Blockers

As of the latest GitHub readiness check, production proof is blocked by:

- Missing GitHub secret `ACADEMY_EDGE_URL`.
- Missing GitHub secret `ACADEMY_SMOKE_TOKEN`.
- Missing GitHub secret `ACADEMY_STUDENT_SMOKE_TOKEN`.
- `Academy Live Smoke` workflow is not on GitHub until this branch is merged.
- Latest `Deploy Pages` run on `main` failed at commit `a79fd23e330498a3d529210432d5ffb69614d5dc`.
- Latest `Deploy Pages` Academy matrix job for `schood-academy` also failed for that run.

Verify the current status with:

```bash
npm run check:academy:github
```

## Pre-Merge Evidence

Before opening or merging the Academy release PR, collect green local evidence:

```bash
npm run verify:academy
npm --workspace apps/academy run lint
npm run test:academy:routes
npm run test:academy:edge
npm --workspace apps/academy run build
npm run smoke:academy
deno check supabase/functions/academy/index.ts
deno check supabase/functions/click/index.ts
npm run verify:prod
npm test
```

Expected evidence:

- `verify:academy` passes and reports the full check count.
- `smoke:academy` passes after the Academy build.
- `test:academy:routes` proves owner, teacher, student, and restricted-route browser flows.
- `test:academy:edge` proves permission contracts for finance, LMS, staff, reports, and uploads.
- `verify:prod` passes with no committed env files or high-confidence secrets.

## GitHub Setup

Configure these repository secrets before treating live smoke as production proof:

- `ACADEMY_EDGE_URL`: Supabase Academy Edge Function URL, for example `https://<project>.supabase.co/functions/v1/academy`.
- `ACADEMY_SMOKE_TOKEN`: owner/admin JWT that can read finance, Education OS, notifications, and audit.
- `ACADEMY_STUDENT_SMOKE_TOKEN`: enrolled learner JWT with at least one academy contact.
- `ACADEMY_APP_URL`: optional override; default is `https://academy.schood.online`.
- `ACADEMY_SMOKE_ACADEMY_ID`: optional pin for the academy used by owner smoke checks.

After secrets are configured, run:

```bash
npm run check:academy:github
```

Expected evidence:

- All required GitHub secrets are present by name.
- `Deploy Pages` workflow exists.
- `Academy Live Smoke` workflow exists after merge.
- Latest `Deploy Pages` run is successful.
- Latest `Deploy Pages` Academy matrix job for `schood-academy` is successful.

## Manual Supabase Deploy

CI deploys frontends only. Apply backend changes manually after merge:

```bash
supabase db push --linked
supabase migration list --linked
deno check supabase/functions/academy/index.ts
supabase functions deploy academy --project-ref <prod>
deno check supabase/functions/click/index.ts
supabase functions deploy click --project-ref <prod>
```

Expected evidence:

- The production migration list includes `20260617120000_academy_audit_events.sql`.
- `academy` Edge Function deploy succeeds.
- `click` Edge Function deploy succeeds when payment reconciliation code changed.

## Production Deploy

After the PR merges to `main`, watch the production deploy:

```bash
gh run list --workflow=deploy-pages.yml --limit 5
gh run watch <run-id>
```

Expected evidence:

- `Deploy Pages` succeeds for `schood-academy`.
- No matrix app blocks the production deploy.
- `https://academy.schood.online` returns HTTP 200 and title `Academy | Schood`.

The `Academy Live Smoke` workflow runs after every completed `Deploy Pages` workflow and verifies the `schood-academy` matrix job from the triggering run. This prevents a non-Academy post-deploy job from hiding Academy proof, while still keeping the overall `Deploy Pages` failure visible in `npm run check:academy:github`.

## Live Smoke

Run strict live smoke locally or through GitHub Actions:

```bash
ACADEMY_APP_URL=https://academy.schood.online ACADEMY_EDGE_URL=https://<project>.supabase.co/functions/v1/academy ACADEMY_SMOKE_TOKEN=<owner-jwt> ACADEMY_STUDENT_SMOKE_TOKEN=<student-jwt> npm run smoke:academy:live
```

Expected evidence:

- Production app shell loads.
- Owner token reads academies, summary, classrooms, payments, Education OS, notifications, and audit events.
- Student token reads `student-dashboard`.
- Student token has at least one academy enrollment.
- `Academy Live Smoke` workflow is green for the deployed commit.

## Operational Acceptance

Academy can be considered operational only after this evidence exists:

- A real academy owner can open Academy Office.
- A teacher can open Teacher Workspace, see daily LMS operations, create assignments, grade submissions, and mark attendance.
- A student can open the Student Workplace, view resources, submit work, see grades, attendance, billing, and chat.
- Click-backed tuition creates Academy payment metadata and paid tuition flows through `apply_academy_payment`.
- Audit trail shows recent sensitive actions.
- Storage-backed resource and submission upload paths work with signed URLs.
- Notification dispatch and at-risk scan can be run and inspected.

Do not mark the goal complete until every item above has direct evidence from commands, deployed workflows, or live UI/API checks.
