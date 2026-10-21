# Academy releases and remaining-work record

Current-attempt grading candidate: staff grading now binds the reviewed learner attempt, submission revision, assignment revision and rubric to current per-resource authority. Student resubmission and staff grading share a database lock; lost replies retain the captured grading intent across reload. Private immutable before/after snapshots, audit and receipts commit together. The captured production schema passed 21 stages with owned-container cleanup ([proof](2026-10-21-current-grading-schema.json)). Installation and published acceptance are pending the protected release workflow; this paragraph is not production proof.

The initial bounded release, PR [248](https://github.com/atmyielts/English_T1/pull/248) is deployed on main `50e63540b6a4ec0318184c7262d538f2bd9083b4`. Academy Edge is v84; all twelve reviewed migrations are installed (210 total). The primary checkout and the other agent's unpublished proctor work were not included. Fourteen unrelated installed backend modules were retained unchanged.

## Released

Mapped CSV/XLSX student imports, current scoped directories/authority, exact opening balances and memberships, retry-safe import receipts/resumption/retained correction, atomic managed staff changes and staff invitations/legacy staff commands, and reviewed student/parent invitation acceptance. Paused student access and deployed parent consent/account guards are preserved.

## Verified

Both CI runs, tracked Pages deployment and executed live smoke passed. Local Academy build/lint/localization and complete Edge/browser checks passed (174 browser cases; one optional performance benchmark skipped). Full captured-schema qualification caught and corrected the missing nullable membership account field before deployment. Installed production commands also passed rollback-only import, staff/learner invitation and 57 parent checks.

The published API passed 32 checks with 201 synthetic students, exact balances/memberships, commit and correction replay, scoped staff saves/revocation, and private-table denials. The single observed import commit took 4.333 seconds. All 19 public service entrances returned 200, and published importer/parent assets were checked. This does not establish general browser performance.

Both QA accounts are closed and the QA institution is archived. Thirty-three cleanup checks passed. Immutable institutional QA history and balanced ledger evidence remain under the approved retention policy; no customer records or real provider messages/payments were changed.

Evidence: `2026-10-20-academy-release-production.json`.

## Follow-up release after work resumed

The user resumed the remaining work and authorized safe production deployment
on 2026-10-20. PR [254](https://github.com/atmyielts/English_T1/pull/254) is now
live on main `a1c1bdd784c2050f2c88c3671c92428f69da629c`, Academy Edge v85,
with 213 installed migrations. All 27 prepared runtime module hashes match the
installed source; 24 installed modules were preserved unchanged.

Parent-originated message, request and preference writes now commit current
account/consent checks, writes, audit and retry receipts together. Twelve
child-bound history sections support keyset paging. The Academy notification
worker claims delivery against current consent, verified parent destinations,
preferences and quiet hours, and retains ambiguous outcomes for review without
automatic resend. Unbound guardian-targeted automation cannot send to a student.

Protected CI, post-merge CI, tracked Pages deployment and executed live smoke
passed. Required CI passed 175 browser cases; the optional performance benchmark
was skipped. The full captured-schema qualification passed eight stages, and
96 installed parent command assertions passed with fixture transactions rolled
back. Owned hosted acceptance passed 237 assertions, including 205-message
paging, write/replay/expiry denial and signed-in rendering at 390/1440px.
Thirty-five cleanup checks passed. Both QA accounts are closed; the institution
and necessary immutable evidence are archived. Temporary browser login state was
removed. No customer records, external provider deliveries or real payments were
used. The legacy central Telegram queue had no pending parent entries at the
read-only inspection time.

All 19 public entrances returned 200. Fresh guest Schood/Academy browser loads
had no failed network requests and did not allow unsafe JavaScript evaluation;
this does not reproduce the intermittent same-tab reload symptom.

Evidence: `2026-10-20-parent-commands-production.json`; native qualification:
`2026-10-20-parent-commands-schema.json`.

## Resumed legacy and staff-parent release

PR [256](https://github.com/atmyielts/English_T1/pull/256) is live on main
`9d7e15c0303cfa0063222651b252876883619951`, Academy Edge v86, with 221
installed migrations. Seven non-staff legacy import types now have bounded atomic
commit and retained recovery. Staff-parent creation, links, revocation, preferences,
messages and notices have current authority/consent checks and durable receipts.
Student auto-linking uses current confirmed Auth email under account locks.
Optional SMS transport requires a current confirmed phone and configured gateway.

Required CI, post-merge CI, tracked Pages and executed live smoke passed. Downloaded
production source matches all 29 prepared modules; 25 installed modules were retained.
Ten complete-schema qualification stages passed, including native expiry/revocation
contention, and four installed command fixtures passed with their transactions rolled
back. Hosted acceptance passed 251 checks; 36 cleanup checks closed both QA accounts
and archived the institution with immutable evidence retained. Signed-in parent phone
and desktop renders were captured. The complete cross-service `npm test` command
passed locally. These checks do not establish real provider delivery or payment.

Evidence: `2026-10-20-remaining-commands-production.json` and the matching schema JSON.

## Collected payroll and financial command release

PR [257](https://github.com/atmyielts/English_T1/pull/257) is deployed on main
`0f0d0d43906a41b03e24b16e1b3273d2206ed956`, Academy v87, with 225 migrations.
All 21 financial actions now enforce independent current capabilities, exact money,
resource locks, atomic audit/receipts and retry recovery. Financial reads scope rows
before bounds and return complete per-currency server totals. Payroll uses net paid
allocations, delivered lessons and current active rosters; the three requested rule
families, approval/payout history and immutable snapshots are qualified. Current-day
vacation resume preserves elapsed paused days. Payroll does not claim a historical
as-of roster, per-day proration or historical refund reconstruction.

PR [258](https://github.com/atmyielts/English_T1/pull/258) adds the financial
table/view and column ACL boundary on main `434976f12c0ab1fc8bec8f93f1a986812eaf371a`:
226 migrations, v87 unchanged. All 30 runtime source hashes remain verified. Protected
CI, post-merge CI, tracked Pages and executed live smoke passed for both releases.
The fresh native qualification passed twelve stages; six installed rollback-only
fixtures passed. No fixture transactions from those canaries were committed.

Hosted acceptance verified all 21 financial actions and direct table/RPC refusals.
The real published 201-row CSV workflow committed exactly 201 students, memberships
and opening balances in two batches, then retained all records while correcting 603
effects and writing 201 compensating balance reversals. The observed commit took
4,464 ms (one sample). Optional guardian mapping has separate API/native/browser
coverage; this specific CSV contained core student/contact/enrollment/balance fields.
The file/API run passed 74 checks before its financial UI test hit an over-strict
accessible-label selector. A separate published UI run passed 40 checks for owner
and mixed branch admin/cashier, both branches and 390/1440px, with no page errors or
horizontal overflow. These are separate evidence runs, not an invented combined
assertion total. The earlier failed source runs remain retained.

Both file and UI fixtures verified 42 cleanup checks each. All owned accounts are
closed and institutions archived; immutable evidence and balanced reversals remain.
Cash, Click and card acceptance here means internal book entries. No real payment
instrument, bank movement or external provider delivery was exercised.

Evidence: `2026-10-20-operational-finance-production.json`,
`2026-10-20-financial-boundary-schema.json`; ignored owned hosted artifacts remain
in the operational worktree under `supabase/.temp/operational-release/hosted-run-five`
and `hosted-finance-ui`.

## Work continuing after these releases

1. Private browser recording/audio feedback is deployed through PR259 and its
   refresh repair through PR260. Current runtime is Academy v90, 228 migrations,
   all 32 source hashes verified, 31 prior runtime modules retained for PR260.
   Eight installed command fixtures passed with their transactions rolled back.
   Live API checks prove ciphertext, exact playback bytes, receipt replay and
   student/teacher/peer scope. The repaired published browser run passed 38 checks:
   actual lost-reply/reload recovery, student/teacher audio decoding and playback,
   feedback for the reviewed attempt, synthetic microphone cancel/stop/upload and
   the final-attempt limit. All four accounts are closed; 60 cleanup checks passed.
   Stale pending-budget and cross-tab draft recovery remain a separate follow-up.
2. PR [260](https://github.com/atmyielts/English_T1/pull/260) is deployed on main
   `710c17ff35aed5caa68fc05d09fb74f47409ce36`. Exact-head protected CI, post-merge
   CI and tracked Pages passed. Fourteen fresh complete-schema stages qualify one
   winning handover receiver, receipt failure, blocked expiry/revocation and bounded
   history. The published owner run passed 83 checks, including actual custody
   lost-reply/reload, exact receiving difference, close/reconcile and populated
   monthly payroll at 390/1440px, before using the wrong administrator URL for a
   cashier. A separate correct office-route run passed all 24 checks, including
   private payroll/expense controls and revoked handover replay. Each completed
   fixture run verified 42 cleanup checks and closed both accounts. These are
   separate evidence runs, not an invented combined total. All Click/card and
   payout evidence is internal book data; no external funds were moved.
   The configurable zero-balance alert/freeze policy is still open. Current manual
   vacation/resume preserves paid time; future scheduling is not claimed.
3. Qualify actual Telegram/email/SMS receipt and Click renewals/signatures. Installed
   metadata has Telegram/Click but no Academy SMS gateway or Gmail SMTP credentials.
   Dummy accounts do not supply an owned phone, Telegram chat or funded instrument.
4. Complete the remaining rows of `finish-checklist.md`, especially actual timetable
   clash/reload acceptance, quick leads, teacher attendance, global branch-dependent
   views/actions, shared-resource authority and defined retention/churn cohorts.
5. Finish populated signed-in performance/design and all-service navigation acceptance.
   Public browser attempts reproduced intermittent transport failures before page load;
   no CSP cause was established. No unsafe-eval workaround or global Cloudflare protocol
   change was made. A prior statement about guest evaluation refusal is not evidence
   that the missing script-src directive prohibits evaluation.
6. Assessment/proctor development remains with its other owner and is preserved.

The user explicitly requested continuation through all remaining work. This is an
intermediate release record, not a stop or a claim that the full audit is complete.
## Recording recovery deployed; wallet release in review

**Current verified production (2026-10-21, Tashkent):** PR264, main `bb0b95dfa7e41a3c6a26696cbb6bd5510da081e0`, Academy v94 and 232 migrations. Remaining work is active; this is not an all-service completion claim.

PR [261](https://github.com/atmyielts/English_T1/pull/261) is deployed on main
`7a5f6d2823d46f08c6327bc81f602a0aa436d31f`, Academy v91, 229 migrations.
Protected CI 39464053751, post-merge CI 39465308861 and tracked Pages 39465308874
passed. Post-activation live smoke 39466870917 passed. All 32 installed source
hashes match the prepared bundle, with 31 modules retained. Nine installed command
fixtures passed with their transactions rolled back. Hosted acceptance passed 51
checks for obsolete reservations, cross-tab frozen drafts, original receipt/bytes
on reload, current teacher feedback, actual audio decoding and resubmitted counts.
All four owned accounts are closed; 60 cleanup checks passed. Original media and
reservation history remain retained. No external provider message or funds moved.

The prior cash handover post-activation smoke 39461160311 is also confirmed passed.
Updated evidence is being published with the next reviewed release.

PR [262](https://github.com/atmyielts/English_T1/pull/262), reviewed head
`a94a06f88bb2a58d18674a3876e61eb065015dee`, adds explicit opt-in prepaid wallet
alerts and learning controls. A zero balance alone never enables a policy or changes
an existing subscription/vacation. Fifteen complete-schema stages passed, including
real credit/debit contention, exact currency separation, mixed branch roles, revoked
replay and receipt failure rollback. Full local Edge/typecheck, 191 browser cases
(one optional benchmark skipped), three final focused wallet cases, 822 product
checks, lint/build and 2,921 localized phrases passed. CI and production activation
remain pending; this does not close the wallet row yet.

Work continues through actual timetable/lead/teacher attendance acceptance,
branch-dependent view/action scope, retention cohort definitions, legacy shared
resource/payment authority and populated signed-in all-service/design/performance
checks. Real Telegram/SMS/email delivery and Click funding still require usable
owned recipients/provider configuration/payment access; dummy records are not
provider receipts. Assessment/proctor work in the primary checkout is preserved.

## Prepaid wallet production acceptance

PR262 is deployed on main `82d38f3a316a32dfc21618ae824c7d3d82991b03`, Academy
v92, 230 migrations. Protected CI 39467649978, post-merge CI 39468446875,
tracked Pages 39468446861 and post-activation live smoke 39470015107 passed.
All 32 installed source hashes match; 30 prior modules are unchanged. Ten installed
command fixtures passed with all transactions rolled back. The published owned run
passed 53 checks: exact policy settings and acknowledgement, real committed/lost
reply/reload recovery, zero-credit restrictions, different currency refusal,
correct-currency restoration, retained playback, teacher grading and alert-only
behavior. All four accounts are closed; 61 cleanup checks passed. The migration
itself enabled no policies and changed no existing subscription or vacation dates.
Internal owned ledger adjustments supplied credit; no external funds were moved.

A separate owned baseline test reproduced an operational permission bug: admin in
branch B plus cashier in branch A could read A's room branches and gradebook through
older endpoints, and its presentation said academy-wide. This is not a new wallet
regression and is not closed by wallet/financial checks. The reproduction passed
19 checks and verified 58 cleanup checks; all four owned accounts are closed. The
next isolated operational-authority worktree is repairing and qualifying those
reads. Other legacy read/write paths, timetable/lead/attendance, retention cohorts
and signed-in all-service/design/performance acceptance remain active work.

## Operational read production closeout — PR 263

Main `be183e69f2e6774947c03da877151a070dd57585`, Academy v93 and 231 installed migrations are verified. All 33 bundle modules match readback; 31 previous modules were retained unchanged. Protected CI, tracked Pages and both post-deploy live smoke runs passed. Eleven installed rollback-only command groups passed. The final owned published run passed 46 API/browser checks and 65 cleanup checks, including mixed admin-B/cashier-A refusals, populated legitimate B timetable refresh, teacher grading, student-specific row limits, revocation, and phone/desktop rendering. All four QA accounts are closed and the institution archived; no customer records or provider payments/messages changed. Earlier fixture/selector failures are retained separately and are not added to the successful totals.

Evidence: `2026-10-20-operational-read-production.json`. Other legacy reads/writes, the misleading Academy-wide header, booking write acceptance, all-field large CSV acceptance and all-service signed-in acceptance remain open. Lead/teacher receipt code is being qualified in a separate feature branch; it is not yet installed.

## Lead and web teacher command closeout — PR264

Main `bb0b95dfa7e41a3c6a26696cbb6bd5510da081e0`, Academy v94 and 232 migrations are verified. Protected exact-head CI (same-head retry after a dependency aged past the 24-hour rule), main CI, tracked Pages and both live smokes passed. All 34 source hashes match; 32 installed modules were retained unchanged. Twelve installed rollback-only fixture groups passed. The final owned production run passed 63 checks and 68 cleanup checks. All four QA accounts are closed; the institution is archived and immutable history retained. No customer records, provider messages or real money changed.

Row 4 now has deployed phone/desktop save, duplicate-phone review, actual lost-reply/reload and exact retry evidence. Web teacher attendance is current-assignment-bound, persists absences once, refreshes the dashboard and safely replays; lesson start/finish and homework receipts are atomic. Row 7 still requires the separate Telegram gateway/provider path. A non-main default branch no longer breaks CRM initialization. The next grading repair is a separate, unshipped candidate; other remaining rows and cross-service acceptance continue. Evidence: `2026-10-21-operational-command-production.json`.
