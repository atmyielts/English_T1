# Academy Product Readiness

Purpose: move Academy from a fragile demo surface into a full LMS and academy operating system, with Supabase Edge Functions as the product boundary.

Production URL: `https://academy.schood.online`

Primary app: `apps/academy`

Primary Edge API: `supabase/functions/academy/index.ts`

Production rule: push to `main` deploys production. All work must go through a feature branch and PR.

Production cutover checklist: `ACADEMY_PRODUCTION_CUTOVER.md`

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

2. Business loop
   - Owner creates offer.
   - Owner attaches grants to the offer.
   - Student or staff creates a payment.
   - Provider-backed payment confirmation applies the payment.
   - Entitlements are granted exactly once.
   - Sponsored access is reflected through `access-effective`.
   - Renewal or payment action items appear before access expires.

3. Communication loop
   - Teacher sends classroom announcement.
   - Teacher sends direct message.
   - Student replies in classroom chat.
   - Alerts can be created and resolved.
   - Due-work, class-reminder, at-risk, payment, and report notifications are queued and dispatched.

4. Reporting loop
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
- Submission grading.
- Attendance marking.
- Staff upsert and removal.
- Certificate issuing.
- Parent report generation.

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

Browser verification to add:

- Owner can create and configure classroom.
- Teacher can create assignment, mark attendance, grade work, and resolve action item.
- Student can open classroom, submit assignment, mark resource complete, chat, and start payment.
- Restricted teacher cannot open finance/admin-only routes.

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

## Development Order

1. Keep this document and `verify:academy` green.
2. Add route-level mocked browser tests for Academy.
3. Add Edge tests around permission and idempotency.
4. Complete provider-backed Academy payment reconciliation.
5. Convert classroom work into a daily LMS cockpit.
6. Add storage-backed resource/submission uploads.
7. Add audit events and runbooks.

Do not add new LMS feature families until the P0 loops are verified end to end.
