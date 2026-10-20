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

## What remains

1. Seven other legacy import types need atomic changes and retained correction. Finish the remaining shared-resource authorization and student email auto-linking checks.
2. Finish remaining staff-originated guardian writes/shared-resource authority and configured SMS delivery; qualify actual Telegram/email delivery and Click renewals/signatures. Parent-originated writes, history paging and the Academy worker delivery claim are released. No external provider delivery or real charge was used for either release proof.
3. Close the remaining real-user acceptance for room scheduling, wallet/pauses, quick leads, Telegram attendance, audio feedback, payroll, cashier handover, branch switching and retention analytics. These have existing implementation; see the exact acceptance rows in `finish-checklist.md`. The importer now has hosted 201-student API proof, with final signed-in file/UI acceptance still separate.
4. Finish signed-in visual acceptance against the supplied reference, populated browser loading measurements, the reported landing reload/CSP reproduction, and the remaining all-service audit.
5. Assessment/proctor development remains with the other agent.

The original broad audit remains incomplete. The earlier stop was superseded by the user's request to resume. The remaining items above have not been accepted as complete; assessment/proctor work retains its separate ownership.
