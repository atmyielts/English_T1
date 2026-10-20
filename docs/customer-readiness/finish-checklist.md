# Requested-work finish checklist

Fixed acceptance scope, 2026-10-14. This records the work already requested;
it does not add features or replace the original all-service audit objective.
An item closes with current implementation, appropriate tests and deployed
acceptance evidence. Source existence, a green build or an old status document
alone does not close it. Unverified items remain open without implying that
their entire implementation is absent.

## Initial bounded release state

- PR 248 is live on main `50e63540b6a4ec0318184c7262d538f2bd9083b4`; reviewed head `a7e88496aab01cf252db03a92e1e28be2a8c7ee2`. Exact-head CI 39406012487, post-merge CI 39406869867, tracked Pages deployment 39406869695 and executed Academy live smoke 39407740750 succeeded.
- The twelve importer/authority/staff/invitation migrations are installed: 210 total. Academy Edge v84 matches all 26 prepared modules; 14 installed modules remain unchanged. The deployed parent safeguards from PR 253 and unrelated/proctor source were preserved.
- Full local Edge tests, build/lint, 2,822 localized phrases, 174 browser cases, 822 product checks and 174 local smoke checks passed. One optional browser performance benchmark was skipped. Complete-schema command and parent/privacy/contention checks passed and the owned local containers/volumes were removed.
- The installed database also passed rollback-only import/recovery, staff/learner invitation and 57 parent checks. No fixture transactions from these database canaries were committed.
- Published API acceptance passed 32 checks: a 201-student mapped upload in two batches, exact opening balances, membership creation, replay-safe commit and retained correction, current staff scope, revocation and browser table protections. The single observed 201-student commit took 4,333 ms; this is not a general performance benchmark.
- All 19 public service entrances returned 200 through trusted HTTPS redirects; the published importer and parent wording/styles were found.
- Both test accounts were closed and the QA institution archived; 33 cleanup checks passed. Immutable institutional QA history and balanced financial evidence were retained. No customer records, real payments or provider messages were changed.
- Prior releases 249/250/251/252/253 supplied legacy import permissions, private-table grants, plain language/responsive history and parent privacy/linking. Their dated evidence remains under this directory.
- See `2026-10-20-academy-release-production.json` and `2026-10-20-release-closeout.md`. The user requested the autonomous goal stop after this release. Remaining acceptance below is a handoff, not authorization for continued feature work.

## Resumed parent follow-up release

The user resumed remaining work and authorized safe deployment on 2026-10-20.
PR 254 is deployed on main `a1c1bdd784c2050f2c88c3671c92428f69da629c`,
Academy v85, 213 installed migrations. Parent-originated writes/receipts, twelve
history paging sections and current-consent Academy worker delivery claims are
released. Required CI passed 175 browser cases (one optional benchmark skipped),
post-merge CI/Pages/live smoke passed, and the 96 installed parent assertions
rolled back all fixtures. Owned hosted acceptance passed 237 assertions;
35 cleanup checks verified closed accounts and archived institutional evidence.
Signed-in parent phone/desktop renders were inspected. No real provider delivery
or charge was performed. See `2026-10-20-parent-commands-production.json`.
This advances rows 5/6; their complete provider/payment acceptance and the other
operational, authority, visual and performance rows below remain open.

## The 12 requested Academy additions

Final deployed acceptance is still open for each row. Close each row with its
own source/runtime evidence; do not infer twelve completions from one suite.

| # | Requested capability | Required final acceptance |
|---|---|---|
| 1 | Visual physical-room timetable | Desktop/mobile occupancy grid; room/teacher/time clashes refused atomically; retry/reload preserves the accepted schedule. |
| 2 | CSV/Excel bulk import | Real 200+ student file maps all requested fields, assigns memberships, handles duplicates, resumes/retries without duplication and offers retained correction. |
| 3 | Student wallet and pauses | Exact prepaid/debt ledger, zero-balance alert/freeze policy, audited adjustments and vacation pause without losing paid value. |
| 4 | Quick walk-in/phone lead | Name/phone/subject/shift entry reaches Lead in a short mobile/desktop flow; duplicate/failure/retry behavior is clear. |
| 5 | Parent Telegram/SMS notices | Attendance, score and due-payment triggers honor verified recipient/consent/preferences, retain retry-safe delivery evidence and produce a valid payment link. Prove configured provider behavior with owned recipients only. |
| 6 | Live parent portal | Child-bound attendance/homework/grades/notes and instant Click renewal; foreign child, expired/revoked link and stale payment denied. |
| 7 | Telegram teacher attendance | Verified teacher selects active assigned class, records absences and submits once; dashboard reflects persisted results; unauthorized/replayed calls are refused or safely replayed. |
| 8 | Voice/audio submission feedback | Browser/bot recording, cancel/upload/retry/playback, authorized private storage and accessible text context; no lost or cross-student feedback. |
| 9 | Teacher payroll | Per-lesson, collected-tuition percentage and base-plus-student rules; exact monthly report, valid inputs, approval/payout history and safe recalculation. |
| 10 | Cashier shifts and handover | Open/collect/close/reconcile across cash/Click/card; exact balances, concurrent/retry safety and preserved discrepancy/handover evidence. |
| 11 | Multi-branch selector | One-click permitted branch switch scopes every dependent view/action and compares revenue/headcount/performance without mixing tenants or privileges. |
| 12 | Teacher retention/churn | Correct cohort/period definitions distinguish dropout from pause/transfer/import recovery; populated fixture proves teacher comparisons and empty data stays honest. |

## Cross-service and design acceptance

- Verify every deployed workspace in the current Pages workflow, its public
  entry, applicable sign-in/learner/staff paths, errors and reload recovery.
- Close the known access issues: tenant/resource isolation, independent grant
  capabilities, current account/revocation/expiry checks, staff delegation and
  direct table/RPC bypasses. Preserve legitimate scoped workflows.
- Verify payment/entitlement authority, exact money, callback/retry safety,
  dedicated AI-add-on quotas and the approved retention-aware account deletion.
- Verify the reported landing navigation/reload/CSP symptom without enabling
  unsafe JavaScript evaluation.
- Visually inspect Academy, its landing/related pages and billing against the
  supplied mint/forest/lime reference: compact controls, consistent type/spacing,
  readable density, sensible hierarchy and coherent empty/loading/error states.
- Keep sign-in and other auth pages in the mother Schood service. Verify mobile
  burger navigation, keyboard/focus use, phone/tablet/desktop and overflow.
- Measure initial/navigation loading and expensive operational views with
  populated fixtures. Verify route splitting, bounded queries, stale requests,
  retry behavior and user-visible loading without relying only on bundle size.
- Reconcile existing audit findings and placeholder/dead-end workflows against
  actual current code and rendered behavior, across all services.

## Closure evidence

Each closed item records commit, relevant test/render/runtime evidence and any
provider limitations. Required protected CI, tracked deployment, selected manual
backend steps, owned hosted smoke and verified fixture cleanup must pass.
The initial release stopped at the user's request. The user subsequently resumed
remaining work and authorized safe production deployment. The parent follow-up
is recorded above; the original all-service objective is still incomplete.
