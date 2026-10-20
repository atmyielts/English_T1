# Academy releases and remaining-work record

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

## Work continuing after this release

1. Finish other shared-resource authority and financial commands. Payroll qualification
   found that percentage compensation uses issued invoices rather than collected tuition;
   a correction, base-plus-student rule and branch/receipt tests are being developed in
   the isolated operational worktree. Legacy source/effect history is retained; changed,
   used, older unproven effects and lead/attendance operational facts require explicit
   audited review instead of deletion.
2. Qualify actual Telegram/email/SMS receipt and Click renewals/signatures. Installed
   secrets have Telegram/Click but no Academy SMS gateway or Gmail SMTP credentials.
   Dummy accounts do not supply a real phone, Telegram chat or payment instrument.
3. Complete all twelve requested operational rows in `finish-checklist.md`, including
   real 200+ file/UI acceptance, room scheduling, wallet/vacation/zero-balance behavior,
   quick leads, teacher attendance, voice recording/audio feedback, payroll, cashier,
   branch isolation and retention semantics. Source existence alone is not acceptance.
4. Finish populated signed-in performance/design and all-service navigation acceptance.
   Public browser attempts reproduced intermittent transport failures before page load;
   these have not been identified as CSP failures. No unsafe-eval workaround or global
   Cloudflare protocol change was made.
5. Assessment/proctor development remains with its other owner.

The user explicitly requested continuation through the remaining work. This is an
intermediate release record, not a stop or a claim that the full audit is complete.
