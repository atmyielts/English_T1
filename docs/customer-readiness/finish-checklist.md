# Requested-work finish checklist

Fixed acceptance scope, 2026-10-14. This records the work already requested;
it does not add features or replace the original all-service audit objective.
An item closes with current implementation, appropriate tests and deployed
acceptance evidence. Source existence, a green build or an old status document
alone does not close it. Unverified items remain open without implying that
their entire implementation is absent.

## Current verified release state

- PR 249 is merged: legacy import type permissions were released and qualified
  with owned hosted fixtures. Evidence: `2026-10-13-legacy-import-permissions.json`.
- PR 248 remains draft. Import review/resumption/recovery, current authority,
  directory and browser improvements are locally qualified. CI for head
  `cb87e246ec58e59dc1b522ce0ace1ab661150f12` is green (run 38547247773).
  Its new importer and authority migrations are not activated. Subsequent staff
  changes require their own protected CI and qualification.
- PR 250 shipped the seven-table/column ACL boundary; migration installation,
  tracked Pages deploy and owned hosted checks/cleanup passed. Evidence:
  `2026-10-14-private-table-production.json`.
- Atomic staff saves/revocation/physical assignments, explicit managed-profile
  provenance, scoped staff pagination and identity-preserving browser edits are
  locally qualified candidates. They are not deployed. Evidence:
  `2026-10-14-staff-access-candidate.md`.
- Staff invitation preparation, acceptance/autoacceptance, withdrawal, leased
  delivery evidence and filtered reads are now locally qualified candidates;
  `2026-10-14-staff-invitations-candidate.md` records evidence and limits.
- Legacy staff import/recovery and source/effect retention now have owned local
  transactional qualification and a resumable phone/desktop candidate. Academy
  imports, follow-ups and payments have task-oriented English/Uzbek/Russian
  wording. Evidence: `2026-10-14-legacy-staff-import-candidate.md`.
- Student/guardian invitation paths, hosted legacy staff acceptance, remaining
  multi-resource authorization and final installed-schema/hosted acceptance
  remain release gates. The scope above is still open, with no production
  activation of the eleven pending importer/authority/staff/invitation migrations.
- PR 251 shipped frontend-only customer wording and responsive import history.
  Exact-head CI 38558843952 and tracked Pages run 38559622384 passed; main is
  `86ccdaf7b048d4e03d2b151b614cca2314441ab2`. Anonymous route/asset checks confirm
  the published copy and 980px history breakpoint. Evidence:
  `2026-10-14-academy-customer-copy-production.json`. This is not a declaration
  that every signed-in/provider workflow is qualified.
- Concurrent proctor work belongs to the other agent; preserve its source and
  deployed state when reconciling shared files or migrations.

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
The goal stays open while any requested acceptance above is incomplete or
unverified. Additional discovery must attach to an existing requirement and
identify a concrete failure; speculative polishing is not a new feature batch.
