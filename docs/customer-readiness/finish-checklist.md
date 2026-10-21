# Requested-work finish checklist

Current accepted production state, 2026-10-21: main `b79a3c0a87e62d15dc4c8c87676fd18217cc72ed`, Academy v95, 235 installed migrations. PR [265](https://github.com/atmyielts/English_T1/pull/265) installed current-attempt grading; PR [266](https://github.com/atmyielts/English_T1/pull/266) supplied the scoped-read revision repair and independent refund/discount permissions. Exact-head/main CI, tracked Pages, 14 installed rollback-only fixture groups and post-activation smoke passed. All 35 runtime hashes matched; 33 installed modules were retained and no secrets changed.

Published grading acceptance passed **50 checks and 67 cleanup checks**: lost real reply/reload replays one captured grade, private before/after history remains singular, learner work is preserved, an actual new student response rejects stale grading, and current staff/explicit-learner revocation refuses saved receipt replay. Four QA accounts closed. [Grading production proof](2026-10-21-current-grading-production.json).

Published refund/discount acceptance passed **38 checks and 60 cleanup checks**: center administrators cannot refund with generic adjustment access, accountants cannot discount, legitimate forms and exact entries remain usable, mixed branch permissions stay separate, and revocation refuses a successful refund replay even while generic adjustment access remains. Four QA accounts closed. These were internal book entries with no external settlement. [Adjustment production proof](2026-10-21-adjustment-subtypes-production.json).

The real **201-row, ten-field CSV** acceptance is complete, including parent names/phones, upload resumption after a hidden committed reply, duplicate skipping and retained correction with 201 balance reversals. No messages or payments were collected. [Import production proof](2026-10-21-ten-field-import-production.json).

The settled **20-surface shared-auth/entry/reload matrix** passed with no JavaScript errors, observed backend 5xx or document overflow. Paid services correctly redirected an unentitled owned account to mother Schood pricing. The QA account closed. This covers entry/guard/reload, not all paid learning workflows or performance at load. [Cross-service production proof](2026-10-21-cross-service-auth-production.json).

Remaining work includes atomic booking acceptance, provider/bot delivery and recording, funded Click renewal, linked cashier collection, remaining legacy branch authority, populated teacher retention and the remaining paid learner/performance/design flows. The operator selected **separate teacher-transfer and academy-departure measures**, excluding pauses and import corrections from dropout totals. This record does not mark the complete checklist finished.

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

## Resumed legacy and staff-parent release

PR256 is deployed on main `9d7e15c0303cfa0063222651b252876883619951`, Academy
v86, 221 installed migrations. Atomic non-staff legacy imports/retained recovery,
current confirmed-email student binding, six staff-parent commands/receipts and optional
verified-phone SMS transport are released. Required/main CI, tracked Pages and live
smoke passed. Ten complete-schema stages and four installed rollback-only fixtures
passed. Hosted acceptance passed 251 checks with 36 cleanup checks; both accounts
are closed and institutional evidence archived. The complete local cross-service
`npm test` passed. Real provider/payment acceptance remains open. Broader financial,
operational and browser acceptance continues; see the release closeout's current list.

## The 12 requested Academy additions

Rows 2 and 4 have accepted published software workflows. Other rows retain their deployed evidence and remain open for the specific acceptance listed below. Do not infer twelve completions from one suite.

| # | Requested capability | Required final acceptance | Current status |
|---|---|---|---|
| 1 | Visual physical-room timetable | Desktop/mobile occupancy grid; room/teacher/time clashes refused atomically; retry/reload preserves the accepted schedule. | Open: scoped grid accepted; booking clash/reload acceptance remains. |
| 2 | CSV/Excel bulk import | Real 200+ student file maps all requested fields, assigns memberships, handles duplicates, resumes/retries without duplication and offers retained correction. | Accepted: actual ten-field 201-row file, resume, duplicate skip and correction; see production proof. |
| 3 | Student wallet and pauses | Exact prepaid/debt ledger, zero-balance alert/freeze policy, audited adjustments and vacation pause without losing paid value. | Software accepted for wallet policy/ledger/vacation; provider funding is separate. |
| 4 | Quick walk-in/phone lead | Name/phone/subject/shift entry reaches Lead in a short mobile/desktop flow; duplicate/failure/retry behavior is clear. | Accepted: published mobile/desktop quick lead, duplicate hint and lost-response reload/replay (PR264). |
| 5 | Parent Telegram/SMS notices | Attendance, score and due-payment triggers honor verified recipient/consent/preferences, retain retry-safe delivery evidence and produce a valid payment link. Prove configured provider behavior with owned recipients only. | Open: real owned provider destinations/configuration and delivery. |
| 6 | Live parent portal | Child-bound attendance/homework/grades/notes and instant Click renewal; foreign child, expired/revoked link and stale payment denied. | Open: portal privacy accepted; real funded Click renewal remains. |
| 7 | Telegram teacher attendance | Verified teacher selects active assigned class, records absences and submits once; dashboard reflects persisted results; unauthorized/replayed calls are refused or safely replayed. | Open: web teacher commands accepted; separate Telegram gateway/provider remains. |
| 8 | Voice/audio submission feedback | Browser/bot recording, cancel/upload/retry/playback, authorized private storage and accessible text context; no lost or cross-student feedback. | Open: browser recording/private playback accepted; bot/provider recording remains. |
| 9 | Teacher payroll | Per-lesson, collected-tuition percentage and base-plus-student rules; exact monthly report, valid inputs, approval/payout history and safe recalculation. | Software rules/report/history accepted; no bank settlement or historical roster reconstruction claimed. |
| 10 | Cashier shifts and handover | Open/collect/close/reconcile across cash/Click/card; exact balances, concurrent/retry safety and preserved discrepancy/handover evidence. | Open: custody/handover accepted; linked manual student collection remains. |
| 11 | Multi-branch selector | One-click permitted branch switch scopes every dependent view/action and compares revenue/headcount/performance without mixing tenants or privileges. | Open: scoped financial/room/grade families accepted; remaining legacy reads/writes and header scope remain. |
| 12 | Teacher retention/churn | Correct cohort/period definitions distinguish dropout from pause/transfer/import recovery; populated fixture proves teacher comparisons and empty data stays honest. | Open: separate teacher transfers and academy departures; pauses/import corrections excluded. |

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

**Current verified production (2026-10-21, Tashkent):** PR264, main `bb0b95dfa7e41a3c6a26696cbb6bd5510da081e0`, Academy v94 and 232 migrations. Remaining work is active; this is not an all-service completion claim.

## Current continuation through PR262

The user explicitly resumed all remaining work and authorized safe production
rollout. Current production is PR261 / main
`7a5f6d2823d46f08c6327bc81f602a0aa436d31f`, Academy v91, 229 migrations.
The release closeout now records PR257 finance/payroll, PR258 financial ACLs,
PR259 private audio, PR260 custody handover/audio refresh, and PR261 pending/cross-tab
recovery and resubmission counts. PR261 hosted acceptance passed 51 checks with
60 cleanup checks and four closed accounts; installed nine command fixtures rolled
back. Exact-head CI, tracked Pages, source readback and post-activation smoke passed.

Row 9 has current native and populated hosted software evidence for the three
requested monthly payroll rules, current inputs, approval/payout and immutable
snapshots. Its scope is current active rosters and net paid allocations; historical
as-of roster reconstruction and external bank settlement are not claimed. Row 10
has current custody, discrepancy and cash/Click/card book evidence, including real
concurrent receiver and lost-reply/reload checks. Linked student collection and
provider movement remain to review. Row 8 has full browser recording, accessible
text, playback and private storage/current-scope evidence; actual Telegram/bot
provider voice remains unverified. Row 2 has a published real 201-row core-field
CSV acceptance and retained correction; optional guardian mapping has separate
native/API/mock evidence rather than this particular real file.

PR262 supplies the missing opt-in wallet policy candidate for row 3. It remains
under exact-head CI; production activation/hosted proof are pending. Rows 1, 4, 7,
11 and 12 still require their listed actual operational acceptance. Rows 5/6 retain
real provider/Click delivery or funding gates. Cross-service signed-in authority,
performance and visual acceptance continue. This is an active continuation record,
not a claim that the twelve rows or original audit are all complete.

PR262's wallet software acceptance is now deployed: Academy v92, 230 migrations,
53 owned hosted checks, 61 cleanup checks, four closed accounts and ten installed
rollback-only fixtures. Exact-head CI, tracked Pages, source readback and the
post-activation smoke passed. Row 3 now has explicit prepaid alert/freeze/current
credit restoration software evidence alongside the earlier audited ledger and
paid-time vacation evidence. No policy was enabled for existing students by the
migration; funded Click/provider acceptance remains separate. The baseline mixed
branch administrator/cashier test also confirmed that older timetable/gradebook
reads still over-promoted scope. Their repair and the remaining rows are continuing.

## Operational read production closeout — PR 263

Main `be183e69f2e6774947c03da877151a070dd57585`, Academy v93 and 231 installed migrations are verified. All 33 bundle modules match readback; 31 previous modules were retained unchanged. Protected CI, tracked Pages and both post-deploy live smoke runs passed. Eleven installed rollback-only command groups passed. The final owned published run passed 46 API/browser checks and 65 cleanup checks, including mixed admin-B/cashier-A refusals, populated legitimate B timetable refresh, teacher grading, student-specific row limits, revocation, and phone/desktop rendering. All four QA accounts are closed and the institution archived; no customer records or provider payments/messages changed. Earlier fixture/selector failures are retained separately and are not added to the successful totals.

Evidence: `2026-10-20-operational-read-production.json`. Other legacy reads/writes, the misleading Academy-wide header, booking write acceptance, all-field large CSV acceptance and all-service signed-in acceptance remain open. Lead/teacher receipt code is being qualified in a separate feature branch; it is not yet installed.

## Lead and web teacher command closeout — PR264

Main `bb0b95dfa7e41a3c6a26696cbb6bd5510da081e0`, Academy v94 and 232 migrations are verified. Protected exact-head CI (same-head retry after a dependency aged past the 24-hour rule), main CI, tracked Pages and both live smokes passed. All 34 source hashes match; 32 installed modules were retained unchanged. Twelve installed rollback-only fixture groups passed. The final owned production run passed 63 checks and 68 cleanup checks. All four QA accounts are closed; the institution is archived and immutable history retained. No customer records, provider messages or real money changed.

Row 4 now has deployed phone/desktop save, duplicate-phone review, actual lost-reply/reload and exact retry evidence. Web teacher attendance is current-assignment-bound, persists absences once, refreshes the dashboard and safely replays; lesson start/finish and homework receipts are atomic. Row 7 still requires the separate Telegram gateway/provider path. A non-main default branch no longer breaks CRM initialization. The next grading repair is a separate, unshipped candidate; other remaining rows and cross-service acceptance continue. Evidence: `2026-10-21-operational-command-production.json`.
