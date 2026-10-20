# Student and parent invitation candidate

Not deployed. PR 248 remains draft. This is local evidence for one part of the
existing all-service readiness scope, not final customer acceptance.

The former student and parent acceptance handlers separately changed account
bindings, group membership and invitation status. Parent acceptance overwrote a
different existing account binding and wrote `consent_granted_at`, although the
installed relationship schema uses `consented_at`. Student invitation preparation
and acceptance could restart paused enrollment. Invitation choices were limited
before filtering and omitted pending parent relationships and parent-liaison
contacts.

Migration `20261014150000_academy_learner_invitation_commands.sql` replaces these
mutations with service-only preparation, acceptance, withdrawal and delivery
commands. The commands validate the current verified recipient and staff
authority, lock the involved records, preserve paused enrollment, reject foreign
bindings and changed email, and commit account binding, consent evidence,
invitation status and audit together. Final principal/expiry checks roll back a
late refusal. Withdrawal affects the pending invitation, not independent student
enrollment or prior parent consent. History and invitation/relationship target
identities cannot be rewritten. No new rights come from delivery completion.

Recipient review shows the student, group and parent information categories.
Acceptance requires the current review fingerprint; parent acceptance also
requires a selected consent checkbox. The review fingerprint is a stale-review
marker; the invitation credential remains a random 256-bit token stored only as
its SHA-256 hash. Errors require fresh review before another acceptance attempt.
An account switch discards the former account's result and cannot retry using
the new account. Staff and learner reference pages use separate capabilities,
filter before limits and expose bounded continuation cursors.

Local verification:

- The complete Academy Edge suite passed, including six new adapter tests,
  199 in-process staff/learner database checks, legacy import handlers and the
  existing import, booking, room, session and assessment suites.
- Native PostgreSQL/PostgREST qualification passed 236 checks. Both acceptance/withdrawal lock
  orders, immutable receipts, audit rollback, stale review, foreign bindings,
  paused membership and filtering past 401 inaccessible contacts were exercised.
  Late expiry and principal closure after the audit trigger rolled back account
  binding, consent evidence and invitation acceptance. Owned containers were
  removed by their verified cleanup handler.
- The pinned-account client suite passed 18 checks, including refresh/account
  changes, malformed parent review data and wrong-recipient acceptance results.
- Four focused browser cases passed: parent review/consent at 320px and 1440px,
  stopped links, staff email retry identity and student destination. The parent
  screen was visually inspected; its checkbox and text now align in one row.
- Academy build, lint, localization, verify:prod, verify:release and 822 product
  readiness checks passed. After moving review resets to the explicit retry
  action, the build/lint and three affected invitation browser cases passed
  again. Protected CI for the committed candidate remains required.

Unclosed release gates include installed-schema/source-preserving qualification,
hosted owned-recipient acceptance and cleanup, full final candidate browser CI,
other legacy imports and multi-resource authorization. The existing student
contact email auto-link helper and parent portal/notification consent expiry must
also be qualified end to end; a secure invitation command alone does not prove
those subsequent access paths. No production database, Edge Function or customer
message was changed for this candidate.
