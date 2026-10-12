# Academy session transition integrity

Moving a lesson into a time overlapping its original slot previously failed
against the original lesson's own exclusion constraint. The old transition
outbox key also ignored the Academy and session: a reused key could acknowledge
a cancellation while leaving another Academy's lesson scheduled.

The replacement RPC retains its signature and locks the original lesson.
Rescheduling releases its old slot inside the same transaction before creating
the replacement. A conflicting destination rolls back the status change,
replacement, teacher assignment, audit and event writes together. Room, teacher
and classroom overlap constraints remain authoritative.

New transition and replacement identities include the Academy, original lesson
and normalized caller key. Recorded request inputs reject changed destinations,
teachers, rooms, actors or cancellation reasons on a retry. Timestamp identities
use UTC, so equivalent timestamps or a connection timezone change do not create
a different command. Replacement results are checked before linking: creation
keys cannot make the RPC accept an unrelated pre-existing lesson. Repeated
rescheduling returns the same replacement and records one transition event.

Existing events without recorded request inputs retain their legacy retry
behavior, restricted to their actual Academy and session and matching action.
Those old events cannot establish whether an old caller changed its inputs.
The function remains executable only by `service_role`; existing Edge
authorization remains required. This repair does not alter tables or customer
rows during installation and does not deploy an Edge Function.

## Validation and activation

- `npm run test:academy:sessions` reproduces the old failures and executes
  33 behavior checks using isolated PostgreSQL and the actual migration SQL.
- `npm run test:academy:sessions:native` repeats those cases in a new,
  network-isolated PostgreSQL 17 container and exercises separate connections.
  Its 52 checks observe the competing connection waiting on a database lock before
  releasing the first transaction. Concurrent room, teacher and classroom
  bookings admit one lesson; concurrent identical rescheduling creates one
  replacement; a competing move rolls back its original lesson and writes.
- The native test requires Docker and the pinned image named in the adapter.
  It publishes no port and mounts no workspace or database. Cleanup checks
  ownership before removing only its newly-created fixture container.
- A production metadata-only capture confirmed both old RPC bodies match the
  SQL being reproduced, all three exclusion constraints exist, and both RPCs
  are service-only. This reads definitions and permissions, not customer rows.
- Restore the captured installed schema in an isolated Supabase database and
  verify the migration installs without changing constraints, function owner
  or execution privileges. Record the capture date and exact migration hash;
  historical schema compatibility is distinct from a current hosted workflow.

CI includes the single-connection behavior suite in Academy Edge checks.
Independent-connection validation is a separate local gate. A source merge
does not activate the migration. Before activation, compare current installed
RPC identities and migration history, prepare only this migration through the
reviewed isolated release path, and qualify owned Academy fixtures and cleanup.
Never apply unrelated pending migrations as part of this repair.

After activation, verify the installed function and privileges, then exercise
owned overlapping rescheduling, conflicting destination rollback and retry
recovery. Keep proof separate from the future master room calendar and from
real customer usage. The timetable reader/grid and recurring-schedule coverage
are still required for the requested room-calendar feature.

Rollback replaces only this function with the exact captured prior definition
and privileges. It leaves completed replacement records and scoped events in
place; it cannot safely undo already accepted lesson moves. A forward repair
is preferred because the prior function reintroduces the reproduced defects.
