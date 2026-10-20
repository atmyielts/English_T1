# Academy release and stopped-goal handoff

PR [248](https://github.com/atmyielts/English_T1/pull/248) is deployed on main `50e63540b6a4ec0318184c7262d538f2bd9083b4`. Academy Edge is v84; all twelve reviewed migrations are installed (210 total). The primary checkout and the other agent's unpublished proctor work were not included. Fourteen unrelated installed backend modules were retained unchanged.

## Released

Mapped CSV/XLSX student imports, current scoped directories/authority, exact opening balances and memberships, retry-safe import receipts/resumption/retained correction, atomic managed staff changes and staff invitations/legacy staff commands, and reviewed student/parent invitation acceptance. Paused student access and deployed parent consent/account guards are preserved.

## Verified

Both CI runs, tracked Pages deployment and executed live smoke passed. Local Academy build/lint/localization and complete Edge/browser checks passed (174 browser cases; one optional performance benchmark skipped). Full captured-schema qualification caught and corrected the missing nullable membership account field before deployment. Installed production commands also passed rollback-only import, staff/learner invitation and 57 parent checks.

The published API passed 32 checks with 201 synthetic students, exact balances/memberships, commit and correction replay, scoped staff saves/revocation, and private-table denials. The single observed import commit took 4.333 seconds. All 19 public service entrances returned 200, and published importer/parent assets were checked. This does not establish general browser performance.

Both QA accounts are closed and the QA institution is archived. Thirty-three cleanup checks passed. Immutable institutional QA history and balanced ledger evidence remain under the approved retention policy; no customer records or real provider messages/payments were changed.

Evidence: `2026-10-20-academy-release-production.json`.

## What remains

1. Seven other legacy import types need atomic changes and retained correction. Finish the remaining shared-resource authorization and student email auto-linking checks.
2. Finish parent write/dispatch-time consent and history paging; qualify configured Telegram/SMS/email delivery and actual Click renewals/signatures. No provider delivery or real charge was used for this release proof.
3. Close the remaining real-user acceptance for room scheduling, wallet/pauses, quick leads, Telegram attendance, audio feedback, payroll, cashier handover, branch switching and retention analytics. These have existing implementation; see the exact acceptance rows in `finish-checklist.md`. The importer now has hosted 201-student API proof, with final signed-in file/UI acceptance still separate.
4. Finish signed-in visual acceptance against the supplied reference, populated browser loading measurements, the reported landing reload/CSP reproduction, and the remaining all-service audit.
5. Assessment/proctor development remains with the other agent.

The original broad audit is not marked complete. Scope is frozen and the autonomous goal is paused at the user's explicit request after this bounded release.
