# Academy Operations Runbook

Purpose: keep Academy usable in production for education centers without ad-hoc database repair.

Production app: `https://academy.schood.online`

Primary Edge Function: `supabase/functions/academy/index.ts`

Related payment function: `supabase/functions/click/index.ts`

Production rule: frontend deploys through GitHub Actions after merge to `main`; Supabase migrations and Edge Functions are manual deploys.

Cutover checklist: `ACADEMY_PRODUCTION_CUTOVER.md`

## Pre-Merge Checks

Run before merging Academy work:

```bash
npm run verify:academy
npm --workspace apps/academy run lint
npm run test:academy:routes
npm run test:academy:edge
npm --workspace apps/academy run build
npm run smoke:academy
deno check supabase/functions/academy/index.ts
npm run verify:prod
```

Run `smoke:academy` after the Academy build because it inspects `apps/academy/dist` and bundle chunk sizes. CI and the `deploy-pages.yml` Academy matrix also run the Academy readiness, lint, mocked browser route, Edge contract, Edge typecheck, build, and smoke gates before the Cloudflare Pages deployment. If schema or Edge Function behavior changed, also run the relevant Deno tests and local function checks before deployment.

## Audit Trail

Academy writes append-only audit rows to `academy_audit_events` for center-critical successful actions:

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
- Module, lesson, quiz, question, grade category, and rubric authoring.
- Quiz attempt submission and grading.
- Lesson progress and quiz-attempt starts.
- Enrollment lifecycle changes.

Audit logging is fail-open. If the audit insert fails, the Edge Function logs a warning and the user workflow continues.

Operators can review the latest events in Academy Education OS -> Audit. Use the Audit tab first, then query the table directly only when you need deeper filtering or export.

Use the audit trail when investigating:

- A disputed payment or entitlement.
- A changed grade.
- Attendance corrections.
- Staff access changes.
- Certificate or parent report issuance.

## Storage Uploads

Goal: resources and submissions are stored as controlled media objects, not secret-bearing permanent URLs.

Normal flow:

1. Teacher uploads a classroom resource file from the classroom workspace, or a student attaches a file to an assignment submission.
2. Academy Edge validates file type family and the 50 MiB limit.
3. Edge uploads through the shared S3 media helper.
4. The database stores the non-secret storage ref in `metadata.storage`.
5. Academy Edge signs a short-lived URL when the resource or submission is loaded.

Investigation checklist:

1. Confirm S3 secrets are configured for the Academy Edge Function.
2. Check Edge logs for `media-storage` upload or sign errors.
3. Confirm the row has `metadata.storage.bucket` and `metadata.storage.path`.
4. Do not paste signed URLs into permanent content fields; re-open the LMS screen to regenerate them.

## Post-Deploy Smoke

After production deploy:

1. Open `https://academy.schood.online`.
2. Sign in as an academy owner.
3. Open Academy Office.
4. Confirm these Edge calls return successfully from the UI:
   - Academy summary.
   - Classrooms.
   - Payments.
   - Education OS.
5. If you have smoke account credentials or a smoke user token, run:

```bash
ACADEMY_EDGE_URL=https://<project>.supabase.co/functions/v1/academy ACADEMY_SMOKE_EMAIL=<owner-email> ACADEMY_SMOKE_PASSWORD=<owner-password> npm run smoke:academy
```

For a release-proof smoke, use the strict live command. It checks the public app shell and the live Academy Edge API. `ACADEMY_APP_URL` defaults to `https://academy.schood.online`. Prefer `ACADEMY_SMOKE_EMAIL` + `ACADEMY_SMOKE_PASSWORD` for an owner/admin who can read finance, Education OS, notifications, and audit; the script signs in and mints a fresh JWT. Prefer `ACADEMY_STUDENT_SMOKE_EMAIL` + `ACADEMY_STUDENT_SMOKE_PASSWORD` for an enrolled learner. `ACADEMY_SMOKE_TOKEN` and `ACADEMY_STUDENT_SMOKE_TOKEN` are still supported for one-off checks, but static Supabase access JWTs expire. `ACADEMY_SMOKE_ACADEMY_ID` is optional and overrides the first academy discovered from the owner account.

```bash
ACADEMY_APP_URL=https://academy.schood.online ACADEMY_EDGE_URL=https://<project>.supabase.co/functions/v1/academy ACADEMY_SMOKE_EMAIL=<owner-email> ACADEMY_SMOKE_PASSWORD=<owner-password> ACADEMY_STUDENT_SMOKE_EMAIL=<student-email> ACADEMY_STUDENT_SMOKE_PASSWORD=<student-password> npm run smoke:academy:live
```

GitHub also has a dedicated `Academy Live Smoke` workflow. It can be run manually and automatically runs after a successful `Deploy Pages` workflow on `main`. Configure these repository secrets before treating the workflow as production proof:

- `ACADEMY_EDGE_URL`
- Owner auth: either `ACADEMY_SMOKE_TOKEN` or `ACADEMY_SMOKE_EMAIL` + `ACADEMY_SMOKE_PASSWORD`
- Student auth: either `ACADEMY_STUDENT_SMOKE_TOKEN` or `ACADEMY_STUDENT_SMOKE_EMAIL` + `ACADEMY_STUDENT_SMOKE_PASSWORD`
- `ACADEMY_APP_URL` optional, defaults locally to `https://academy.schood.online`
- `ACADEMY_SMOKE_ACADEMY_ID` optional, pins the academy used by the owner smoke

To check whether GitHub is ready to produce live proof, run:

```bash
npm run check:academy:github
```

That command lists secret names only, confirms the smoke workflow exists on GitHub, and checks whether the latest `Deploy Pages` run succeeded.

6. Open Teacher Workspace.
7. Open Student portal or `https://schood.online/my-academy`.
8. Confirm student classroom tabs load:
   - Resources.
   - Assignments.
   - Grades.
   - Attendance.
   - Billing.
   - Chat.

## Payment Reconciliation

Goal: every paid tuition creates exactly one active entitlement.

Normal Click flow:

1. Student or staff creates checkout from Academy.
2. `click/create-transaction` creates:
   - Platform payment row.
   - Academy payment row.
   - Metadata link through `academy_payment_id`.
3. Provider confirms payment.
4. Click function calls `public.apply_academy_payment`.
5. Academy entitlement is inserted with a unique payment grant key.
6. Payment appears as applied in Academy payments.
7. Provider prepare, cancel, complete, and status-poll events mirror status and provider metadata back to the Academy payment row.

Owner finance screen states:

- `Access applied`: no action required.
- `Awaiting Click`: checkout exists; wait for provider callback.
- `Manual settlement`: legacy/offline payment; finance staff can apply settlement.
- `Payment failed`: student needs a new checkout or provider follow-up.
- `Canceled checkout`: Click canceled or expired the checkout; issue a new link before granting access.
- `Duplicate callback`: Click resent a completion event; keep the original payment as source of truth.
- `Grant mismatch`: provider marked the payment paid, but the entitlement grant failed and needs operator review.
- `Needs attention`: provider or metadata mismatch; investigate before granting access.

Investigation checklist:

1. Check Academy payment row status.
2. Check platform payment row from `metadata.platform_payment_id`.
3. Check `metadata.academy_payment_id` on the platform payment.
4. Confirm provider transaction ID exists.
5. Confirm `apply_academy_payment` has not already produced entitlements.
6. Do not manually grant access until the payment source is known.

Manual settlement rule:

- Use only for verified cash/offline/legacy payments.
- Finance permission is required.
- Prefer `mark_payment_paid` over direct table edits because it calls `apply_academy_payment`.

## Commercial Agreements And Charges

Goal: preserve the commercial promise independently from learning enrollment and cash receipt.

1. Create a pricing plan with an explicit model, billing cycle, amount, currency, and optional branch/classroom scope.
2. Create the learner's commercial agreement. Record list price, approved discount and reason, agreed amount, dates, renewal policy, and classroom separately from membership.
3. Issue one charge per real billing cycle using a stable `cycle_key`. Retrying with the same idempotency key must return the original charge.
4. Confirm that the charge appears in the student account before requesting payment.
5. Do not create a second payment object in the commercial core. Click and legacy/offline Academy payments remain the payment source of truth.

Use **Manage agreement** for lifecycle changes. A freeze requires start and end dates plus a reason; an active freeze pauses the agreement. Resume completes the active freeze, cancellation requires a reason and disables auto-renewal, and renewal creates a new linked agreement without rewriting the original. Every operation is idempotent, audited, and emitted to the domain-event outbox. Do not delete subscriptions or charges to represent cancellation, expiry, or completion.

Learners can open **Billing** in their classroom workspace to inspect their own academy-wide agreements, discounts, charges, allocated payments, credits, and outstanding balance. Provider reconciliation evidence remains finance-only.

## Ledger, Allocation, And Adjustments

Goal: every balance must be reproducible from immutable financial evidence.

- A charge posts a positive ledger entry.
- A confirmed payment posts a negative `payment_received` entry.
- Allocation links a paid payment to a charge without posting the payment twice.
- Refunds and debit adjustments increase the balance.
- Credits, discounts, write-offs, and transferred credits decrease the balance.
- Account credit is the negative portion of a student balance and remains available until applied by policy.

Never update or delete ledger entries, allocations, or reconciliation events. The database rejects those mutations. Post an authorized reversal or adjustment with a reason. A linked discount/write-off cannot exceed the remaining charge balance, and allocations cannot exceed either the payment's unapplied amount or the charge's effective balance.

## Debt And Payment Promises

1. Review outstanding and overdue totals by aging bucket every business day.
2. Open the student's charge history before contacting them; distinguish an unapplied payment from genuine debt.
3. Record each promise with amount, date, responsible staff member, notes, and any allowed restriction state.
4. Preserve reminder, call, message, escalation, restriction, and resolution events in collection history.
5. Do not restrict learning access solely from a raw overdue amount unless the academy's documented policy permits it.

## Provider Reconciliation Evidence

Record provider, transaction ID, unique event ID, amount/currency comparison, result, and a cryptographic payload hash. Never copy API secrets or raw sensitive provider payloads into reconciliation metadata. Duplicate provider event IDs are rejected, and a mismatch must remain visible rather than being silently coerced to matched.

## Cashier Shift And Cashbox

1. Create one currency-specific cashbox for the branch counter.
2. Open exactly one shift per cashbox with a physically counted opening balance.
3. Record incoming and outgoing evidence with method, amount, counterparty, and reason. A Click, bank, or POS movement may be tracked operationally, but only `cash` changes the physical closing expectation.
4. Close with the physically counted amount. Preserve the calculated expectation, count, discrepancy, actor, note, and immutable reconciliation row.
5. Investigate discrepancies; never edit or delete a movement to force the count to match.

This is an operational cashbook, not statutory accounting or a general ledger.

## Expenses, Budgets, And Contribution

Record expense date, category, branch/classroom scope, vendor, payment method, amount, and receipt reference. Budgets are operational limits, not cash balances. Branch contribution is generated charges minus modeled operating expenses and payroll. Classroom contribution includes only teacher cost that can be attributed from delivered-lesson payroll components. Never present these figures as profit when taxes or other costs are not modeled.

## Compensation And Payroll

1. Save a structured compensation rule; executable formula strings are not supported.
2. Verify delivered lessons, minutes, classroom, teacher, and student count evidence.
3. Create a draft period and calculate it once. Each employee row stores the rule version and all calculation inputs.
4. Post bonuses, deductions, or corrections with a reason before approval.
5. Move the period through `calculated → reviewed → approved → paid`. Calculation, approval, and payment use distinct permissions.
6. Marking paid creates immutable payout rows. Later rule edits never change historical payroll snapshots.

## Notification Dispatch

Goal: due-work, class reminders, at-risk nudges, announcements, grades, payments, and reports leave the queue.

Scheduled flow:

1. `academy-dispatch-v1` invokes `public.invoke_academy_worker('dispatch')`.
2. The Academy Edge Function queues due notifications.
3. Pending notifications are dispatched.
4. Failed notifications remain visible for retry/investigation.

Manual recovery:

1. Open Academy Education OS.
2. Go to Engagement or Automations.
3. Run notification dispatch.
4. Review failed or pending notification counts.
5. If dispatch repeatedly fails, check Edge Function logs and Telegram/email provider configuration.

## At-Risk Scan

Goal: staff get action items before learners disappear.

Scheduled flow:

1. `academy-at-risk-v1` invokes `public.invoke_academy_worker('at_risk')`.
2. Academy scans attendance, missing work, inactive contacts, and lifecycle signals.
3. Academy creates or updates action items with dedupe keys.
4. Teachers see the items in Education OS and classroom operations.

Manual recovery:

1. Open Education OS.
2. Select a classroom if needed.
3. Run at-risk scan.
4. Review action queue.
5. Resolve, dismiss, or snooze items only after staff action is actually taken.

## Classroom Daily Run

Goal: a teacher can run today without hunting through admin pages.

Daily teacher flow:

1. Open Teacher Workspace.
2. Open Classrooms.
3. Review LMS operations:
   - Open actions.
   - Urgent actions.
   - Grade backlog.
   - Missing work.
   - Attendance risk.
   - Next event.
4. Open the classroom with the highest operational load.
5. Mark attendance.
6. Grade submissions.
7. Send announcements or chat replies.
8. Resolve action items only after completing the real-world action.

## Admissions, Trials, And Conversion

Goal: preserve a complete, attributable path from first inquiry to enrolled learner.

1. Capture every inquiry in Admissions with at least one reachable channel, a source, responsible staff member, preferred branch, course interest, and next follow-up.
2. Record each call, message, meeting, and follow-up as an activity. Do not overwrite notes to represent a new interaction.
3. Move leads only through the available pipeline transitions. A loss requires a reason; a win is produced by the conversion command rather than a manual stage edit.
4. Schedule trials against the actual branch, room, teacher, and group. The database rejects a room that does not belong to the chosen branch.
5. Mark attendance and feedback after the trial, including recommended level, course, and next step.
6. Convert the lead once. Conversion atomically creates or reuses the contact, enrolls the learner in the selected group, closes pipeline history, records source attribution, and emits the conversion event.
7. Reconcile the new learner against the billing workspace before treating access as paid.

All admissions commands are idempotent. When retrying after a timeout, reuse the same idempotency key so a second lead, activity, trial, or conversion is not created.

## Branch And Room Operations

- Create one branch record per physical or operational location. The default branch supports single-location academies without special cases.
- Keep room capacity and status current; use an `online` room for virtual capacity when a schedule needs a room identity.
- Deactivate retired branches and rooms only after moving future trials and classes. Historical records remain linked.
- Center admins and academy owners can manage branches. Teachers can view branch context but cannot mutate it.

## Curriculum Publishing

Goal: learners only receive coherent, intentionally released course content.

1. Create the course in draft state.
2. Add ordered modules and lessons, including lesson prerequisites and completion rules.
3. Add native quizzes and questions. Confirm every choice question has at least two options and an answer key.
4. Publish the course only after its lessons and assessments have been reviewed.
5. Assign the published course to a classroom and set start/end dates when access must be time-bound.
6. Open the Student Workplace with an enrolled learner and confirm locked and available lessons behave correctly.

Do not query `academy_quiz_questions` from a frontend. Answer keys are staff-only and student-safe question payloads are produced by Academy Edge.

## Assessment And Gradebook

Goal: every reported grade is reproducible from an attempt, submission, or rubric.

1. Create grade categories for the classroom and confirm the intended weights. Category weights are normalized when they do not total exactly 100.
2. Configure `drop_lowest_count` only when the category has enough assignments for that policy to be meaningful.
3. Link assignments to course/module/lesson, category, and rubric as needed; set attempt and late-submission policy explicitly.
4. Review native quiz attempts. Objective questions auto-grade; essay attempts remain in the manual grading queue.
5. For rubric assignments, enter every criterion score. Academy Edge rejects totals that do not match the rubric maximum.
6. Confirm the student sees the final score and stored rubric feedback.

Never override a rubric total by direct table update. Correct the criterion scores through the grading workflow so the audit and feedback remain consistent.

## Enrollment Lifecycle

Goal: classroom access and learner history reflect the real enrollment state.

- `active`: learner participates normally.
- `paused`: temporarily inactive; preserve membership history.
- `completed`: cohort work is complete.
- `withdrawn`: learner left without transfer.
Use the classroom enrollment controls so lifecycle timestamps and audit events are recorded. Do not delete a membership merely to pause or complete a learner.

## Parent Reports And Certificates

Parent report:

1. Open Education OS.
2. Go to Engagement.
3. Select contact.
4. Generate parent report.
5. Share the generated link.

Certificate:

1. Confirm learner completion evidence.
2. Open Education OS.
3. Go to Engagement.
4. Select contact and classroom.
5. Issue certificate.
6. Share the generated certificate link.

Do not issue certificates from incomplete or unverified progress data.

## Academic Calendar, Sessions, And Conflict Recovery

Goal: the timetable represents actual dated lessons and cannot double-book a teacher, room, or classroom.

1. Create an active academic calendar for the academy or branch.
2. Record holidays, closures, exams, and special schedules before creating affected sessions. Events marked as schedule-affecting block new overlapping sessions.
3. Record teacher and room availability windows when the resource has explicit working hours. Once windows exist for an effective date, session creation must fit an available window.
4. Create the actual lesson session with branch, classroom, teacher, mode, room, start, and end. PostgreSQL rejects overlaps and insufficient room/classroom capacity.
5. Confirm, start, and complete the session through controlled transitions. Completion writes one idempotent lesson-delivery record for payroll evidence.
6. To move a planned lesson, use `rescheduled`; the original remains historical and links to the replacement.
7. To cancel, provide a reason. Never delete a session to hide a cancellation or conflict.
8. Assign a substitute with a reason. The prior teacher assignment remains in history, and the replacement teacher is checked for schedule conflicts.

When a conflict is reported, inspect the session register and calendar event first. Move or cancel the conflicting record through its workflow; do not disable the exclusion constraint.

## Attendance Exceptions, Make-ups, And Quality

1. Mark attendance against the actual session. The service rejects a contact who is not actively enrolled in that classroom.
2. For illness, approved absence, technical failure, academy cancellation, or holiday impact, record an exception with a reason and explicit effect.
3. If the effect permits remediation, create a make-up, transferred lesson, holiday extension, or manual-credit decision and retain its source exception.
4. Link the replacement session when scheduled and move the decision through approved, scheduled, delivered, or credited state.
5. Record observations, student/parent feedback, audits, or incident reviews against the session. Scores are 0–100; required follow-up must have an owner and due date operationally.
6. Review room utilization as available, occupied, and unused minutes. Review classroom capacity as enrollment fill and attendance rate. These metrics are operational capacity signals, not profit.

## Guardian Onboarding, Consent, And Revocation

1. Open **Guardians & Parents** and select the student. Adult learners may correctly have no guardian record.
2. Create the real relationship type (mother, father, guardian, sponsor, emergency contact, or other), responsibility flags, and the minimum visibility needed. Financial responsibility requires payment visibility; debt visibility requires payment visibility.
3. Issue a short-lived one-time link. Send it through a trusted channel. The database stores only its SHA-256 hash, and a Telegram username alone never authorizes access.
4. The guardian signs in and claims the link with the verified Telegram user ID and chat ID. Claiming activates consent and consumes the token once.
5. Confirm the Parent Portal exposes only the granted child sections. It must never expose provider reconciliation, payroll, staff notes, answer keys, or another learner.
6. To end access, revoke the relationship with a reason. Revocation invalidates unused links and immediately removes the relationship from guardian reads.
7. Do not edit or delete consent evidence. Consent events and delivery attempts are immutable operational records.

## Parent Notifications And Delivery Recovery

1. Configure per-guardian event, channel, locale, timezone, quiet-hour, and critical-override preferences.
2. Queue messages only against an active, consented relationship. The event must match the relationship visibility grant.
3. Use a stable deduplication key for retryable automation. Reusing the key returns the existing notification rather than creating a duplicate.
4. Telegram targets come from the securely verified chat ID, not a username. Email targets come from the guardian profile. In-app delivery requires no external target.
5. Quiet hours delay ordinary notifications. A critical override works only when the guardian policy permits it and never bypasses child-data visibility.
6. Inspect the retry-safe outbox and immutable attempt history. Resolve invalid targets or disabled preferences before retrying failed delivery.
7. Parent replies stay in the relationship thread and require `can_message_academy` plus active consent.

## Retention Risk And Intervention Loop

1. Activate a versioned risk definition. Review its attendance, missing-homework, overdue-debt, and engagement weights and thresholds; never silently edit a historical version.
2. Evaluate a learner. The stored evaluation must show the score, risk level, each normalized factor, weight, contribution, explanation, and evidence period.
3. High and critical evaluations create one deduplicated SLA action. The score is an operational signal, not an automatic adverse decision.
4. Open an intervention, assign an owner, set the next follow-up, and record every call, Telegram contact, meeting, academic/payment plan, guardian contact, and outcome.
5. Move the case through contacting, agreed plan, monitoring, and a recorded retained or unsuccessful outcome. Do not close it merely to clear the queue.
6. Compare outcomes with the original factor evidence before changing the next model version.

## Renewal And Unified Action Queue

1. Create renewal opportunities before the subscription/course end date with expected amount, likelihood, owner, and next action.
2. Record offers and contacts in renewal activity history. Mark renewed only when a real replacement subscription exists; record decline/expiry reasons.
3. Work one unified action queue across admissions, academic, attendance, retention, renewal, finance, guardian, capacity, quality, and operations.
4. Every action needs a stable dedupe key, priority, category, branch/contact context when relevant, assignee, SLA/due time, recommended action, and final outcome.
5. Review overdue SLA actions daily and branch comparisons weekly. Owner metrics are observations that should lead to assigned work and measured outcomes.

## Global Search And Governed Imports

1. Global search is academy-scoped and permission-filtered across contacts, classrooms, leads, and guardians. Never expose finance, payroll, answer-key, or cross-tenant rows through search.
2. Start a contact or lead import with a source filename, explicit column mapping, and idempotency key.
3. Stage rows first. Review raw data, mapped data, row number, validation status, and errors. Invalid rows are never committed.
4. Commit only a `ready` job. Lead imports require the academy default pipeline and initial stage. Every committed row keeps the job/row provenance and target ID.
5. Retain the import job, row validation, counts, operator, completion timestamp, and audit event. Use a new job to correct source data; do not hide prior evidence.

## Edge Function Deploy

When `supabase/functions/academy/index.ts` changes:

```bash
deno check supabase/functions/academy/index.ts
supabase functions deploy academy --project-ref <prod>
```

If Click tuition behavior changed:

```bash
deno check supabase/functions/click/index.ts
supabase functions deploy click --project-ref <prod>
```

Replace `<prod>` with the linked production project ref. Do not commit service-role keys or secret values.

## Migration Deploy

When migrations change:

```bash
supabase db push --linked
supabase migration list --linked
```

Schema changes must be backward-compatible across one frontend deploy.

## Rollback

Frontend rollback:

1. Use Cloudflare Pages dashboard.
2. Select `schood-academy`.
3. Open Deployments.
4. Roll back to the previous known-good deployment.

Backend rollback:

- Prefer forward fixes for migrations.
- For Edge Functions, redeploy the previous known-good function source.
- Confirm `npm run verify:academy` and post-deploy smoke after recovery.

## Never Do This

- Never push directly to `main`.
- Never manually edit entitlement rows without first checking the payment source.
- Never bypass `apply_academy_payment` for paid tuition.
- Never deploy Cloudflare Pages locally for `schood-*` projects.
- Never put service-role keys in frontend env files.
