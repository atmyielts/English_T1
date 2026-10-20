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
  `835e26206b9a2de8305dd63426d077948e724326` passed (run 39399202335).
  The candidate has since reconciled deployed parent protections from main.
  Its twelve importer/authority/staff/invitation migrations are not activated;
  the reconciled head requires its own CI and deployment qualification.
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
  activation of the twelve pending importer/authority/staff/invitation migrations.
- PR 251 shipped frontend-only customer wording and responsive import history.
  Exact-head CI 38558843952 and tracked Pages run 38559622384 passed; main is
  `86ccdaf7b048d4e03d2b151b614cca2314441ab2`. Anonymous route/asset checks confirm
  the published copy and 980px history breakpoint. Evidence:
  `2026-10-14-academy-customer-copy-production.json`. This is not a declaration
  that every signed-in/provider workflow is qualified.
- PR 252 shipped additional plain English/Uzbek/Russian wording for staff access,
  lesson scheduling, invitations and parent payments. Exact-head CI 39386967944
  and tracked Pages deployment 39387583914 passed for main
  `5051205bd5fe70fe721c2a49f0818476a9e768fe`. Eleven published wording checks,
  four anonymous Academy routes and both service roots passed. Evidence:
  `2026-10-20-academy-plain-language-production.json`.
- Student/parent invitation atomicity, identity/consent review, preservation of
  paused enrollment and filtering before page limits now have local candidate
  implementation and tests. They remain undeployed; evidence and remaining
  downstream-access gates: `2026-10-20-learner-invitations-candidate.md`.
- PR 253 shipped parent dashboard/request privacy, signed Telegram linking and
  account/relationship binding guards on main
  `377ca2b2811e7ad1527a7b96b5c2eb7408d4a905`: Pages 39401182196, Academy
  v83 and both parent migrations installed (198 total). Full-schema checks,
  50 hosted checks, 35 retention-safe cleanup checks, post-merge CI and executed
  live smoke passed. Immutable closed QA institutional history was retained;
  customer records were untouched. See `2026-10-20-parent-production.md` and
  `2026-10-20-parent-production.json`. Parent writes, dispatch-time consent,
  complete history paging and live payment/provider acceptance remain open.
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
The user froze scope and requested testing/release of existing changes, a
remaining-work report and an end to autonomous work on 2026-10-20. Unclosed
acceptance remains recorded here; it does not authorize continued discovery or
feature work after the release closeout. Pause the goal without claiming the
original all-service objective is complete.
