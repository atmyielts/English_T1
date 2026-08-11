# Academy Product Readiness

Purpose: move Academy from a fragile demo surface into a full LMS and academy operating system, with Supabase Edge Functions as the product boundary.

Production URL: `https://academy.schood.online`

Primary app: `apps/academy`

Primary Edge API: `supabase/functions/academy/index.ts`

Production rule: push to `main` deploys production. All work must go through a feature branch and PR.

Production cutover checklist: `ACADEMY_PRODUCTION_CUTOVER.md`

Current service map and normalized 33-scenario local proof: `ACADEMY_SERVICE_MAP_AND_33_STEP_PROOF.md`

Current requirement-by-requirement expansion verdict: `ACADEMY_BUSINESS_OS_REQUIREMENT_MATRIX.md`. Sections below describing gaps are the historical implementation plan unless the matrix still marks that requirement partial or externally gated.

## Definition Of Done

Academy is product-ready when one real academy can run one cohort for 30 days without manual database repair.

That requires these loops to be complete and verified:

1. Classroom loop
   - Create academy.
   - Create classroom.
   - Add contacts and classroom memberships.
   - Add schedule slots.
   - Publish classroom resources.
   - Create assignments.
   - Student submits work.
   - Teacher grades work.
   - Teacher marks attendance.
   - Student sees resources, assignments, grades, attendance, chat, and billing.

2. Curriculum and assessment loop
   - Teacher authors a course, ordered modules, and lessons with completion and prerequisite rules.
   - Teacher publishes the course and assigns it to a classroom with availability dates.
   - Student opens the assigned course, completes unlocked lessons, and takes native quizzes.
   - Objective quiz questions are auto-graded without exposing answer keys; essays enter a manual grading queue.
   - Teacher links assignments to course content, weighted grade categories, and analytic rubrics.
   - Gradebook applies category weights and drop-lowest rules and preserves rubric feedback.
   - Staff can invite, activate, pause, resume, complete, withdraw, and expire enrollments with lifecycle timestamps.

3. Business loop
   - Owner creates offer.
   - Owner attaches grants to the offer.
   - Student or staff creates a payment.
   - Provider-backed payment confirmation applies the payment.
   - Entitlements are granted exactly once.
   - Sponsored access is reflected through `access-effective`.
   - Renewal or payment action items appear before access expires.

4. Communication loop
   - Teacher sends classroom announcement.
   - Teacher sends direct message.
   - Student replies in classroom chat.
   - Alerts can be created and resolved.
   - Due-work, class-reminder, at-risk, payment, and report notifications are queued and dispatched.

5. Reporting loop
   - Gradebook reflects assignment and submission state.
   - Attendance history is visible.
   - At-risk scan creates actionable items.
   - Parent report token can be generated and rendered.
   - Academy certificate can be issued and verified.

## Current Foundation

The repo already has a broad foundation. Treat these as assets to harden, not as throwaway demo code.

- `apps/academy`
  - Owner/admin/teacher/center route intents.
  - Academy, classrooms, contacts, inbox, announcements, alerts, offers, payments, entitlements.
  - Education OS view for daily operations.
  - Student classroom view with resources, assignments, grades, attendance, billing, and chat.

- `supabase/functions/academy/index.ts`
  - Read actions for academies, summary, contacts, classrooms, gradebook, attendance, staff, notifications, branding, schedule, and Education OS.
  - Student actions for dashboard, classroom chat, assignments, attendance, billing, referrals, and assignment submission.
  - Write actions for academy/classroom/contact management, LMS work, attendance, payments, reporting, notifications, staff, automation, and branding.
  - Permission map for sensitive write actions.

- `supabase/migrations`
  - Academy contacts, classrooms, offers, payments, entitlements, conversations, alerts.
  - Assignments, submissions, attendance, bulk invites, schedules.
  - Staff, notifications, referrals, branding, action items, automation rules.
  - Scheduler for `dispatch` and `at_risk` worker cycles.
  - Tenant-scoped curriculum, modules, lessons, classroom course assignments, learner progress, quizzes, attempts, grade categories, and rubrics.

## Competent LMS Coverage Implemented In This Branch

- Structured curriculum authoring with explicit draft/published states, prerequisites, completion rules, ordering, and classroom availability windows.
- Student curriculum workspace with progress, locked-state handling, lesson completion, quiz attempts, automatic objective grading, and manual essay grading.
- Assignment-to-course/module/lesson links, retry and late-submission policies, weighted categories, drop-lowest calculation, and analytic rubric grading.
- Enrollment lifecycle controls for active, paused, completed, withdrawn, and transferred learners.
- Tenant-scoped composite foreign keys, RLS on all new curriculum tables, and no member-read policy for quiz answer keys.
- Audit events for curriculum publishing, course assignment, curriculum edits, assessment authoring/grading, and enrollment changes.
- Static readiness checks, Edge/schema contract tests, production build checks, and owner/teacher/student browser route tests.

This is implementation evidence, not final production-launch evidence. The schema and Edge Function phase is deployed with authenticated owner/student smoke green; the frontend and final operational acceptance remain governed by `ACADEMY_PRODUCTION_CUTOVER.md`.

## Education Business OS Phase A Implemented In This Branch

- First-academy onboarding atomically creates the academy, owner membership, default branch, localized lead sources, and default admissions pipeline.
- Branch and physical-room management with capacity, activity state, and tenant-safe branch/room relationships.
- First-class leads with contact channels, source and campaign attribution, course and schedule preferences, expected value, ownership, and next follow-up.
- Configured state transitions, immutable stage history, reasoned loss, audit records, and domain events.
- Follow-up activities and a due-work queue across calls, Telegram, SMS, email, meetings, tasks, and notes.
- Trial scheduling against branches, rooms, teachers, and groups, plus attendance, feedback, recommendation, and outcome tracking.
- Idempotent, transactional lead conversion that creates or reuses a contact and optionally enrolls the learner into a real classroom.
- Owner/admin admissions UI, teacher-scoped trial feedback, mobile route coverage, tenant/RLS contracts, and a fresh local database/API lifecycle proof.

Phase A's schema and Edge API are live; its expanded frontend remains gated behind the frontend PR, deployment, and post-deploy acceptance procedure.

## Education Business OS Phase B Implemented In This Branch

- Extensible pricing plans for fixed monthly, calendar month, per-lesson/hour, package, module, course, installment, custom, scholarship, and free models.
- Student commercial agreements separate from classroom enrollment, with lifecycle status, billing cycle, dates, renewal policy, custom amount, discounts, freezes, and optional entitlement linkage. Freeze, resume, cancellation, completion, and renewal are idempotent audited operations; renewal creates a linked agreement instead of rewriting history.
- Invoice-like charges with service periods, due dates, stable cycle keys, original/discount/net amounts, and idempotent issuance.
- Existing Click and Academy payments feed one append-only account ledger; no parallel payment identity was introduced.
- Immutable payment allocation records keep payment receipt and invoice settlement separate, reject over-allocation, and preserve unapplied credit.
- Derived student balances, charge balances, overdue days, and current/1-7/8-14/15-30/31-60/60+ aging buckets.
- Audited account credits, discounts, write-offs, refunds, debit/credit adjustments, and transferred credit; sensitive write-offs/refunds are owner/admin-only.
- Debt cases, payment promises, restriction state, collection history, and provider reconciliation evidence stored by payload hash rather than provider secrets.
- Finance-specific RLS blocks ordinary teachers from direct charge, ledger, and payment reads while preserving their normal branch/LMS access.
- Functional Commercial Core UI, Edge commands, schema contracts, responsive browser route coverage, fresh-database proof, and live local finance-RLS proof.
- Learner Billing exposes only the signed-in learner's agreements, net charges, allocations, credits, ledger history, and outstanding balance; provider reconciliation remains finance-only.

Phase B's backward-compatible schema and Edge API are deployed. The new commercial workspace remains gated behind the frontend release and post-deploy acceptance.

## Education Business OS Phase C Implemented In This Branch

- Branch cashboxes, one-open-shift enforcement, opening/incoming/outgoing/closing evidence, physical cash reconciliation, and explicit discrepancies.
- Categorized expenses, branch/classroom scope, receipt references, and operating budgets kept separate from the commercial payment ledger.
- Structured compensation rules for fixed, lesson/hour/student, revenue percentage, fixed-plus-commission, performance bonus, tiered, and manual-adjustment models; no executable formulas.
- Verified lesson-delivery evidence, payroll periods, immutable rule/input snapshots, bonuses/deductions, controlled review/approval/payment transitions, and immutable payouts.
- Branch and classroom contribution views with explicit formulas. The product deliberately does not label contribution as profit.
- Separate cashier, economics, payroll calculation, payroll approval, and payroll payment permissions; ordinary teachers cannot read finance/payroll tables directly.
- Functional Operations Finance UI plus live local proof for variance reconciliation, expense capture, payroll calculation, snapshot integrity, payout, cost attribution, RLS denial, and immutable history.

Phase C's backward-compatible schema and Edge API are deployed; its Operations Finance UI remains gated. It is an operational finance and payroll layer, not a replacement for statutory accounting.

## Product Gaps To Close

### P0: Make The Existing Loops Prove Themselves

Add executable verification before expanding the feature set.

Required:

- `npm run verify:academy` must pass locally.
- `npm --workspace apps/academy run lint` must pass locally.
- `npm run test:academy:routes` must pass locally.
- `npm run test:academy:edge` must pass locally.
- `npm --workspace apps/academy run build` must pass locally.
- `npm run smoke:academy` must pass locally after the Academy build.
- `deno check supabase/functions/academy/index.ts` must pass locally.
- GitHub CI must run Academy readiness, lint, mocked browser route, Edge contract, build, smoke, and Edge typecheck gates.
- Cloudflare Pages deployment must run the Academy readiness, lint, mocked browser route, Edge contract, build, smoke, and Edge typecheck gates before deploying `schood-academy`.
- GitHub must provide an `Academy Live Smoke` workflow that runs after successful production deploys and can be manually dispatched.
- Add browser tests that exercise owner, teacher, and student routes with mocked Edge responses.
- Add Edge action tests for the payment, assignment, attendance, reporting, staff, and notification actions.

Correction points:

- `scripts/verify-academy-product-readiness.mjs`
- `scripts/smoke-academy-product.mjs`
- `apps/academy/tests/academy-routes.spec.ts`
- `apps/academy/playwright.config.ts`
- `supabase/functions/academy/academy-contract.test.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-pages.yml`
- `.github/workflows/academy-live-smoke.yml`
- `apps/academy`
- `supabase/functions/academy/index.ts`
- `supabase/functions/_shared`

Current Edge contract coverage:

- `supabase/functions/academy/academy-contract.test.ts` pins the role permission matrix for owner and teacher access.
- It pins the sensitive write-action permission map for payment, assignment, grading, attendance, staff, notification, reporting, certificate, and branding operations.
- It verifies Academy upload limits and unsupported file type rejection.
- It verifies the Edge handler remains importable and responds to CORS preflight without requiring live environment variables.

### P0: Payment Must Become Provider-Backed

Manual `mark_payment_paid` is useful as an emergency admin fallback, but it cannot be the main production settlement path.

Required:

- Click tuition payment creation from Academy must write an `academy_payments` row with provider metadata.
- Click callback/webhook must reconcile provider status to the matching Academy payment.
- `apply_academy_payment` must remain the only entitlement creation path for paid tuition.
- Payment reconciliation UI must expose pending, paid, failed, canceled, duplicate, and grant-mismatch states.
- Manual settlement must require finance permission and leave audit metadata.

Current payment coverage:

- Academy payment creation has moved to Click checkout; the old `create_payment` action returns `410` for new manual rows.
- Click checkout creates a platform `payments` row and the matching `academy_payments` row with `platform_payment_id` metadata.
- Click prepare, cancel, complete, and status polling sync provider state back to the matching Academy payment row.
- Paid Click tuition still flows through `apply_academy_payment`; failed entitlement application is surfaced as a grant mismatch for finance review.
- Academy finance exposes pending, paid, failed, canceled, duplicate callback, provider mismatch, grant mismatch, manual settlement, and applied-access states.

Correction points:

- `apps/academy/src/lib/client.ts`
- `apps/academy/src/components/office/PaymentsView.tsx`
- `apps/academy/src/components/students/StudentClassroomView.tsx`
- `supabase/functions/academy/index.ts`
- `supabase/functions/click/index.ts`
- `supabase/migrations/20260212010000_teacher_studio_payment_engine.sql`

### P0: LMS Daily Work Must Feel Complete

Teachers should not need to jump between unrelated panels to run class.

Required:

- Classroom detail must show a daily roster, attendance, assignments due, grading backlog, recent chat, and resources.
- Assignment detail must show instructions, due date, linked resource, submissions, grades, and missing students.
- Student submission must support text and URL now, then storage-backed files/audio/images next.
- Gradebook must show weighted scores and missing/late/submitted/graded states.
- Attendance must support bulk roll-call for a selected session date.

Current LMS coverage:

- Classroom detail includes a daily operations cockpit with roster, student stage, score, attendance, missing work, and next action.
- Education OS Learning includes assignment detail with instructions, due date, linked task, missing/submitted/late/graded counts, and per-student submission state.
- Student classroom includes next-best actions, resources, assignment submission, grades, attendance, billing, and chat.
- Education OS includes structured curriculum, native quizzes, grading categories, analytic rubrics, weighted gradebook results, and enrollment lifecycle controls.
- Student classroom includes assigned courses, prerequisite/date locks, lesson progress, and native quiz attempts.

Correction points:

- `apps/academy/src/components/office/ClassroomDetailView.tsx`
- `apps/academy/src/components/office/EducationOSView.tsx`
- `apps/academy/src/components/students/StudentClassroomView.tsx`
- `apps/academy/src/lib/client.ts`
- `supabase/functions/academy/index.ts`

### P1: Storage-Backed Resources And Submissions

URL-only resources are fragile.

Required:

- Define storage buckets and object naming for academy resources and student submissions.
- Add signed upload URL flow through Edge Functions.
- Store resource/submission file references in metadata, not raw secret-bearing URLs.
- Add file size/type limits and malware-safe content policy.
- Teacher resource uploads and student submission uploads must work from the app.

Current storage coverage:

- Academy Edge accepts multipart uploads for classroom resources and student submissions.
- Files use shared S3 media storage helpers with `academy/<academy_id>/classrooms/<classroom_id>/...` object paths.
- Database rows store non-secret storage refs in `metadata.storage`; signed URLs are generated only in Edge responses.
- The app exposes teacher resource file upload and student submission file upload.
- Current file limit is 50 MiB and allowed content families are application, audio, image, text, and video.

Correction points:

- `supabase/functions/academy/index.ts`
- `supabase/functions/_shared/media-storage.ts`
- `apps/academy/src/App.tsx`
- `apps/academy/src/components/office/ClassroomDetailView.tsx`
- `apps/academy/src/components/students/StudentClassroomView.tsx`

### P1: Observability And Audit

Academy is operational software. Every critical action needs an audit trail.

Required:

- Audit events for staff, finance, entitlement, grade, attendance, notification, report, certificate, and branding actions.
- Operator-visible audit trail in Education OS for recent sensitive actions.
- Edge Function error logging for failed writes and failed external provider calls.
- Dashboard visibility for failed notification dispatch and payment reconciliation.

Correction points:

- `supabase/migrations/20260617120000_academy_audit_events.sql`
- `supabase/functions/academy/index.ts`
- `apps/academy/src/components/office/EducationOSView.tsx`
- `apps/platform/src/pages/admin/AdminFunctionErrorsPage.tsx`

Current audit coverage:

- Education OS exposes an Audit tab backed by the `audit_events` Edge read action.
- Manual payment settlement.
- Manual entitlement grant.
- Assignment creation.
- Assignment update and learner submission.
- Submission grading.
- Attendance marking.
- Staff upsert and removal.
- Certificate issuing.
- Parent report generation.
- Course creation, update, assignment, and publishing.
- Module, lesson, quiz question, grade category, and rubric authoring.
- Quiz submission and manual quiz grading.
- Lesson progress and quiz-attempt starts.
- Enrollment lifecycle changes.

### P1: Production Runbooks

Single-operator production needs boring recovery paths.

Required:

- Academy payment reconciliation runbook.
- Notification dispatch runbook.
- At-risk scheduler runbook.
- Manual entitlement repair runbook.
- Rollback checklist for frontend-only changes.

Correction points:

- `ACADEMY_START.md`
- `SECURITY_RUNBOOK.md`
- New `ACADEMY_OPERATIONS_RUNBOOK.md`

## Verification Plan

Static verification:

- `npm run verify:academy`
- `npm run verify:prod`

Build verification:

- `npm --workspace apps/academy run build`

Edge verification:

- `deno check supabase/functions/academy/index.ts`
- `npm run test:academy:edge`
- `deno test supabase/functions/_shared/academy-scoring.test.ts`

Browser verification:

- Owner can create and configure classroom.
- Teacher can create assignment, mark attendance, grade work, and resolve action item.
- Student can open classroom, submit assignment, mark resource complete, chat, and start payment.
- Restricted teacher cannot open finance/admin-only routes.
- Teacher can open structured curriculum and see linked grade-category and rubric controls.
- Student can open an assigned course, lesson, and native quiz.

Production smoke after merge:

- Visit `https://academy.schood.online`.
- Sign in as owner.
- Open Academy Office.
- Open Teacher Workspace.
- Open Student portal.
- Confirm Academy Edge calls return 200 for summary, classrooms, student dashboard, and Education OS.
- Run `npm run smoke:academy:live` with `ACADEMY_APP_URL`, `ACADEMY_EDGE_URL`, `ACADEMY_SMOKE_TOKEN`, and `ACADEMY_STUDENT_SMOKE_TOKEN`.
- Strict live smoke must prove the production app shell loads, owner reads for academies, summary, classrooms, payments, Education OS, notifications, and audit events, plus a student dashboard with at least one academy enrollment.
- Confirm the `Academy Live Smoke` GitHub workflow is green for the deployed commit.
- Run `npm run check:academy:github` to verify the required GitHub smoke secrets, workflow presence, and latest Deploy Pages status without revealing secret values.

## Business OS Phase D: Academic Operations

Implemented locally:

- Actual dated lesson sessions with branch, classroom, teacher, room/mode, calendar, status, and source/reschedule links.
- PostgreSQL exclusion constraints prevent overlapping active sessions for a teacher, room, or classroom.
- Calendar closures, explicit teacher/room availability, and classroom/room capacity are validated before session creation.
- Controlled confirmation, start, completion, cancellation, missed, and reschedule transitions; cancellation requires a reason.
- Substitute history, session-bound attendance for active enrollees, attendance exceptions and effects, make-up/transfer/extension/credit records, and session quality observations.
- Completing a session creates idempotent lesson-delivery evidence for compensation/payroll.
- Room available/occupied/unused/utilization/peak reporting and classroom enrollment-fill/attendance reporting.
- Dedicated Academic Operations workspace plus Edge, schema-contract, route, readiness, and smoke coverage.

Local proof does not mean production is updated. The Phase D migration, Academy Edge function, frontend release, credentialed production flows, and cross-role live acceptance remain manual release gates.

## Business OS Phase E: Guardian And Parent Relationships

Implemented locally:

- First-class guardian profiles and student relationships for mother, father, guardian, sponsor, emergency contact, or other, while allowing adult learners to have no guardian.
- Explicit primary, financial, emergency, messaging, and per-domain visibility grants with immutable consent history and reasoned revocation.
- Hashed, expiring, one-time links; secure claim requires verified Telegram user/chat IDs and never treats a username as authorization.
- Parent Portal limited to authorized status, attendance, grades, homework, schedule, account-facing payments/debt, messages, announcements, resources, and progress reports.
- Per-event channel, locale, timezone, quiet-hour, and critical-override preferences; deduplicated notification outbox and immutable provider delivery attempts.
- Separate `manageGuardians` and `communicateGuardians` permissions, guardian RLS, administrator relationship console, route contracts, and schema/security contracts.

Local proof does not mean production is updated. The Phase E migration, Academy Edge function, frontend release, Telegram bot configuration, credentialed guardian flow, cross-guardian negative tests, and live delivery acceptance remain manual release gates.

## Business OS Phase F: Retention, Renewal, And Intelligence

Implemented locally:

- Versioned explainable risk definitions and immutable evaluations/signals combining attendance, missing homework, overdue debt, and engagement factors.
- Assigned intervention cases with contact/activity history, next follow-ups, plan/outcome states, and deduplicated high-risk actions.
- Subscription/course renewal opportunities with expected value, likelihood, assignee, next action, offer/contact history, and outcome fields.
- The existing Education OS action queue extended into one category/branch/contact/assignee/SLA/source/dedupe/outcome work queue.
- Owner and branch intelligence for admissions, active students/subscriptions, collections, debt, risk, interventions, renewals, open actions, and overdue SLA.
- Permission-filtered global search and staged, validated, idempotent, audited contact/lead CSV imports with row-level commit evidence.
- Dedicated Retention & Intelligence workspace, operator-only RLS, separate retention/intelligence/import permissions, route coverage, and schema contracts.

The Phase F schema and Academy Edge API are deployed. Production acceptance still requires the frontend release, real-data metric validation, credentialed operator/teacher negative tests, an import rollback exercise, and observed intervention/renewal outcomes.

## Release Order

1. Completed: local readiness, route, Edge, build, RLS, lifecycle, invariant, and automation proof.
2. Completed: backend PR and CI, 13 production migrations, `academy` and `telegram-app` deployments, and authenticated owner/student smoke.
3. Current: complete the frontend PR and CI gate.
4. Next: merge the frontend, watch the exact Pages deployment, and run fresh authenticated live smoke.
5. Then: complete credentialed owner, teacher, guardian, and enrolled-student acceptance, including one controlled write-path fixture course.
6. Monitor audit, notification, payment, grading, automation, and intervention queues through the first real cohort.
