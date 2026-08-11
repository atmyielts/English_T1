# Academy Production Cutover

Purpose: prove Academy is live, deployable, and operational for real education centers.

Production app: `https://academy.schood.online`

Production proof is not complete until GitHub, Cloudflare Pages, Supabase migrations/functions, and the live smoke account all agree.

## Current External Gates

The backend production phase completed on 2026-08-11:

- PR `#159` merged as `917f9b9`, and Deploy Pages run `31470480517` completed successfully for every app, including Academy.
- The production migration ledger contains all 13 Academy migrations from `20260810120000` through `20260810240000`.
- A credential-safe production schema dump confirmed RLS on all 303 public tables and all 110 Academy tables.
- The `academy` Edge Function is active at version 63 and `telegram-app` is active at version 9.
- Authenticated owner/student Academy Live Smoke run `31471104282` passed after the migrations and function deployments.

The remaining release gates are frontend-specific:

- Merge the frontend only after its PR and full CI gate are green.
- Verify the final Cloudflare Pages deployment for the merged frontend commit.
- Require a fresh authenticated Academy Live Smoke run after that deployment.

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
deno check supabase/functions/telegram-app/index.ts
npm run verify:prod
npm test
```

Expected evidence:

- `verify:academy` passes and reports the full check count.
- `smoke:academy` passes after the Academy build.
- `test:academy:routes` proves owner, teacher, student, and restricted-route browser flows.
- `test:academy:edge` proves permission contracts for finance, LMS, staff, reports, and uploads.
- `test:academy:edge` also proves curriculum-table RLS, tenant-scoped relationships, safe optional-parent deletion, answer-key privacy, quiz grading, and rubric-total validation.
- `verify:prod` passes with no committed env files or high-confidence secrets.

## GitHub Setup

Configure these repository secrets before treating live smoke as production proof:

- `ACADEMY_EDGE_URL`: Supabase Academy Edge Function URL, for example `https://<project>.supabase.co/functions/v1/academy`.
- Owner smoke auth: either `ACADEMY_SMOKE_TOKEN` or `ACADEMY_SMOKE_EMAIL` + `ACADEMY_SMOKE_PASSWORD`. Prefer email/password so CI can mint fresh JWTs instead of relying on an expiring access token.
- Student smoke auth: either `ACADEMY_STUDENT_SMOKE_TOKEN` or `ACADEMY_STUDENT_SMOKE_EMAIL` + `ACADEMY_STUDENT_SMOKE_PASSWORD`. The account must be an enrolled learner with at least one academy contact.
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
deno check supabase/functions/telegram-app/index.ts
supabase functions deploy telegram-app --project-ref <prod>
```

Expected evidence:

- The production migration list includes `20260617120000_academy_audit_events.sql`.
- The production migration list includes `20260810120000_academy_curriculum_assessments.sql`.
- The production migration list includes `20260810130000_academy_business_os_phase_a.sql`.
- The production migration list includes every Academy release migration from `20260810140000_academy_business_os_phase_b.sql` through `20260810240000_academy_direct_rls_scope_boundary.sql`.
- `academy` Edge Function deploy succeeds.
- `telegram-app` Edge Function deploy succeeds for guardian-scoped access.

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
ACADEMY_APP_URL=https://academy.schood.online ACADEMY_EDGE_URL=https://<project>.supabase.co/functions/v1/academy ACADEMY_SMOKE_EMAIL=<owner-email> ACADEMY_SMOKE_PASSWORD=<owner-password> ACADEMY_STUDENT_SMOKE_EMAIL=<student-email> ACADEMY_STUDENT_SMOKE_PASSWORD=<student-password> npm run smoke:academy:live
```

Expected evidence:

- Production app shell loads.
- Owner token reads academies, summary, classrooms, payments, Education OS, notifications, and audit events.
- Student token reads `student-dashboard`.
- Owner token reads `curriculum`, `quizzes`, `grade_categories`, `rubrics`, and `quiz_attempts`.
- Owner token reads `business_foundation` and receives branches, sources, stages, leads, activities, trials, and conversions.
- Owner token reads `commercial_core` and receives plans, subscriptions, pricing adjustments, charges, payments, allocations, ledger entries, balances, debt cases, promises, and reconciliations.
- Owner token reads `guardian_relationships` without receiving link-token hashes; a guardian token reads `guardian_dashboard` without requiring staff membership.
- Owner/operator token reads `business_intelligence` and academy-scoped `global_search`; teacher access to retention, renewal, and import evidence is rejected.
- Student token reads `student_curriculum` for an enrolled classroom.
- Student token has at least one academy enrollment.
- `Academy Live Smoke` workflow is green for the deployed commit.

## Operational Acceptance

The same acceptance scope is normalized into a numbered 33-scenario matrix, with local and production evidence separated, in `ACADEMY_SERVICE_MAP_AND_33_STEP_PROOF.md`.

Academy can be considered operational only after this evidence exists:

- A real academy owner can open Academy Office.
- A teacher can open Teacher Workspace, see daily LMS operations, create assignments, grade submissions, and mark attendance.
- A teacher can create a draft course with a module, lesson, native quiz, grade category, and rubric; publish and assign the course to a classroom; and grade a rubric-linked assignment.
- A student can open the Student Workplace, view resources, submit work, see grades, attendance, billing, and chat.
- An enrolled student can open the assigned course, encounter prerequisite/date locks, complete a lesson, submit a quiz, and see the resulting attempt state without receiving answer keys.
- Staff can pause and resume a test enrollment, and the audit trail records the lifecycle changes.
- A first-time authenticated owner with no prior membership can create an academy and receive its default branch, 13 localized sources, and eight default pipeline stages.
- Admissions staff can capture and retry one lead idempotently, record a follow-up, advance the lead, schedule and complete a trial, and convert it into one contact and one classroom enrollment.
- A mismatched branch/room trial and a cross-academy reference are rejected by database constraints.
- Finance staff can create a pricing plan and discounted agreement, issue a charge, reconcile a confirmed Academy payment, allocate it, and see the exact derived account/charge balance.
- An over-allocation, cross-contact financial reference, and mutation of ledger/allocation/reconciliation history are rejected.
- A teacher can still read assigned teaching context but receives no direct financial rows and a `403` from `commercial_core`.
- An academic operator can create an actual lesson session, while overlapping teacher, room, and classroom bookings and calendar closures are rejected.
- Staff can record session attendance only for an active classroom enrollee; exceptions, make-ups, substitutions, and quality observations retain actor/reason evidence.
- Completing an actual session writes lesson-delivery evidence, and capacity reports show available, occupied, unused, peak, fill, and attendance metrics.
- Staff can create a pending guardian relationship, issue a one-time link, and prove only a hash is stored; a verified guardian can claim it once and cannot reuse it.
- A guardian sees only explicitly granted child sections; an unrelated guardian sees no rows. Revocation immediately removes access while retaining immutable consent evidence.
- Preference-aware parent notifications respect channel selection and quiet hours, deduplicate retries, and retain immutable sent/failed/skipped delivery attempts.
- A versioned risk evaluation stores four explained factor contributions, creates one deduplicated action at high/critical risk, and can be followed through an intervention to a recorded outcome.
- Renewal work retains offer/contact history and outcome; unified actions retain assignee, SLA, source, recommendation, and outcome.
- A staged import rejects invalid rows, commits valid contact/lead rows exactly once, and preserves job, row, target, count, actor, and audit evidence.
- Click-backed tuition creates Academy payment metadata and paid tuition flows through `apply_academy_payment`.
- Audit trail shows recent sensitive actions.
- Storage-backed resource and submission upload paths work with signed URLs.
- Notification dispatch and at-risk scan can be run and inspected.

Do not mark the goal complete until every item above has direct evidence from commands, deployed workflows, or live UI/API checks.
