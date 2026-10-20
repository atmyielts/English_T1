# Frozen Academy release scope

The user requested testing and release of existing work, a remaining-work report, and a stop to the autonomous goal. No additional product features are included.

## Local release checks

- Complete Academy Edge suite passed.
- Browser suite: 174 passed; one optional performance benchmark intentionally skipped.
- Academy build, lint and 2,822 English/Uzbek/Russian phrase checks passed.
- Product checks: 822 passed; local smoke: 174 passed. These are not hosted acceptance.
- Gateway Deno typecheck and production/release checks passed.
- Complete 413-table captured schema restored with actual roles, extensions, Auth/business triggers and foreign keys. All twelve pending migrations installed. Import commit/replay/retained correction, staff save/invite/accept, paused learner binding, parent consent/replay, 57 parent checks and independent revocation/account-close/expiry contention passed. The isolated database and its volume were removed. See 2026-10-20-final-candidate-schema.json.
- The full-schema test caught the missing membership account column before production activation. The pending learner migration now adds the nullable user_id foreign key, retaining contact_id and compatibility with existing clients. Focused learner and parent suites passed again.
- Both installed and pending identity guards refuse moving a parent relationship. Their different refusal codes are accepted by the compatibility fixture; the mutation must still fail.

## Production evidence and pending activation

PR 253 is already live on main 377ca2b2811e7ad1527a7b96b5c2eb7408d4a905, Academy v83 and 198 migrations. Its Pages deployment, main CI and executed live smoke succeeded; 50 hosted checks and 35 retention-safe cleanup checks passed. See 2026-10-20-parent-production.md.

The reconciled PR 248 still requires exact-head CI, tracked Pages deployment, only the twelve listed migrations, a source-preserving overlay on installed v83, and owned hosted acceptance. Until that evidence exists, its features are not described as live.

## Remaining work after this bounded release

- Finish the seven other legacy import types' atomic operations and retained correction; complete remaining shared-resource authorization and student email auto-linking.
- Complete parent write/dispatch-time consent and full history paging; prove configured Telegram/SMS and Click renewal behavior with owned recipients.
- Close end-to-end acceptance for the twelve requested Academy workflows. Most have existing implementation; this checklist does not claim they are all absent or fully customer-ready.
- Complete signed-in visual acceptance across Academy landing, related pages and billing, the reported landing reload/CSP reproduction, and populated loading-time measurements.
- Complete the remaining all-service audit. Concurrent assessment/proctor changes belong to the other agent and are excluded from this release.

After release verification and the final report, pause the goal at the user's request without marking the broader audit complete.
