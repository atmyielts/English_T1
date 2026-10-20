# Parent release: deployed acceptance

PR 253 shipped through protected CI 39400457283 and tracked Pages deployment
39401182196. Main is `377ca2b2811e7ad1527a7b96b5c2eb7408d4a905`.
Post-merge CI 39401182119 and Academy Live Smoke 39401949724 also passed for
that exact main. The live-smoke job validated its credentials and executed its
live check step; this was not a skipped job.

Only the two reviewed parent migrations were applied; the linked history now
contains 198 migrations. Academy v83 has 16 runtime modules. A fresh published
source download matches every prepared runtime hash, including the 13 unchanged
installed modules and the gateway whose unrelated sections were preserved.
Importer, staff, invitation and unrelated/proctor migrations were not activated.

Fifty owned signed-in live checks pass: child and sibling selection, actual
announcement schema, debt exclusion, child-bound request history, safe legacy
reads, foreign/forged actor denial, immutable binding targets, expired/revoked
access, inactive accounts, eight private browser table boundaries, direct RPC
impersonation denial and forged Telegram refusal. This is not proof of a real
Telegram identity or Click transaction.

Thirty-five cleanup/retention checks pass. The test accounts were closed through
the installed erasure flow. Their personal scopes were removed and their identity
data erased. Enrollment/consent changes generated immutable institutional history,
so that QA institution and its necessary references were archived with no active
members, students, classes, guardians or family access. Ownership was removed;
names/contact information were replaced or cleared, and owned queued work was
cleared. No provider delivery attempts or parent notification jobs were present.
The evidence explicitly records that these institutional history rows were
retained; it does not claim every fixture row was deleted. Security guards and
immutability were preserved.

Published assets contain all five new parent wording checks and the shared
Academy styles. Both service roots and the parent route return 200. All 19 public
entries reach 200, following only trusted HTTPS canonical redirects. These HTTP
observations do not establish authenticated rendering or browser performance.
The in-app browser hit a QUIC transport error opening the landing page, so the
intermittent CSP/navigation symptom remains unverified here.

Full release evidence and limits: `2026-10-20-parent-production.json`.
The original all-service objective and twelve Academy acceptance rows remain
open. Next reconcile this shipped main into PR 248 before qualifying its pending
import/staff/invitation release; preserve the separate parent transport and the
new binding guard while resolving shared client/test/manifest changes.
