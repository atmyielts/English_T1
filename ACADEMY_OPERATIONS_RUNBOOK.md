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
- Submission grading.
- Attendance marking.
- Staff upsert and removal.
- Certificate issuing.
- Parent report generation.

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
5. If you have a smoke user token, run:

```bash
ACADEMY_EDGE_URL=https://<project>.supabase.co/functions/v1/academy ACADEMY_SMOKE_TOKEN=<user-jwt> npm run smoke:academy
```

For a release-proof smoke, use the strict live command. It checks the public app shell and the live Academy Edge API. `ACADEMY_APP_URL` defaults to `https://academy.schood.online`. `ACADEMY_SMOKE_TOKEN` must belong to an owner/admin who can read finance, Education OS, notifications, and audit. `ACADEMY_STUDENT_SMOKE_TOKEN` should belong to an enrolled learner; if one account is both owner and enrolled learner, set both tokens to the same JWT. `ACADEMY_SMOKE_ACADEMY_ID` is optional and overrides the first academy discovered from the owner token.

```bash
ACADEMY_APP_URL=https://academy.schood.online ACADEMY_EDGE_URL=https://<project>.supabase.co/functions/v1/academy ACADEMY_SMOKE_TOKEN=<owner-jwt> ACADEMY_STUDENT_SMOKE_TOKEN=<student-jwt> npm run smoke:academy:live
```

GitHub also has a dedicated `Academy Live Smoke` workflow. It can be run manually and automatically runs after a successful `Deploy Pages` workflow on `main`. Configure these repository secrets before treating the workflow as production proof:

- `ACADEMY_EDGE_URL`
- `ACADEMY_SMOKE_TOKEN`
- `ACADEMY_STUDENT_SMOKE_TOKEN`
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
