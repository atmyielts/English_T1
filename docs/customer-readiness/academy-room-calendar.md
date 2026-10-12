# Master room calendar

The room calendar is a separate front-desk view: physical rooms by branch-local
day, booked lessons, pending recurring plans, closures and conflict markers.
It uses the supplied mint/forest visual direction with compact white panels,
44px controls and a day view on phones. Desktop supports 7 or 14 days. Ten
rooms render per page; the grid scrolls inside its panel when needed.

## Draft implemented

The draft lives on `codex/academy-room-calendar`. It is not deployed.

- A service-only branch query filters the server-owned branch scope before its
  result cap. A separate service-only snapshot runs in one database snapshot
  for one Academy, physical branch and 1, 7 or 14 local calendar days.
- The reader returns room and teacher display labels, actual lesson records,
  closures, pending active-series occurrences and setup/truncation warnings.
  It does not load contacts, attendance, balances, email addresses or payroll.
- Calendar boundaries use the branch's IANA timezone. A local day can be 23 or
  25 hours. Recurring occurrences use the weekly slot timezone and term/series
  dates, including occurrences starting on a neighboring local date.
- Any recorded series occurrence, including cancellation or rescheduling,
  owns its recurrence identity. The preview does not resurrect its old slot.
  Closures suppress pending occurrences when configured by the series.
- The display flags room, teacher and classroom clashes between shown records.
  A pending occurrence also receives a boolean warning if it collides with an
  actual recorded booking elsewhere in the Academy, without exposing that
  other branch's records.
- Incomplete series and unmapped weekly schedules produce setup warnings.
  Every capped query advertises truncation; an empty cell says there are no
  recorded lessons and does not promise available capacity.
- `viewRoomTimetable` permits operations roles and reception. Teaching, finance,
  parent and student roles do not gain this branch-wide view. Actual branch
  scope is checked before SQL. The legacy frontend fallback denies the new
  permission until the reviewed backend advertises it.
- Scope-keyed responses and effect cleanup prevent an old branch or date
  response from replacing a newer selection. Refresh keeps the selected date
  and issues one snapshot read. The view is loaded in its own lazy bundle.
- English, Russian and Uzbek phrases and known service errors are localized.
- Generation now runs in one service-only database transaction. It identifies
  retained occurrences regardless of status, locks the term/source definitions,
  validates every candidate and writes sessions, assignments, audits and outbox
  records in batches. A failed commit rolls back all those writes while keeping
  a failed-run receipt. Request keys are scoped to actor, term, mode and server
  access bounds; unknown response failures preserve the browser retry key.
- One booking trigger checks new/changed active bookings for physical branch,
  room, teacher, closures, rule-local availability and enrollment capacity.
  Existing accepted bookings can still be cancelled/completed after rules change.
  Room, classroom and teacher exclusion constraints remain the final concurrent
  booking guard. An active recurring plan is explicitly an unbooked intention:
  it is not an invisible reservation. Generation must recheck actual bookings.
- DST gaps are rejected by both recurrence projection and generation. Manual
  lesson/rescheduling/closure forms convert the selected branch, session or
  calendar clock rather than the operator's computer timezone. Ambiguous manual
  DST times require choosing an unambiguous time; choosing an occurrence within
  a repeated hour is not yet supported. Invalid timezone tags are rejected on
  new/changed active lesson bookings.
- Provider SQL error details are withheld from generation responses and saved
  run listings; unknown command outcomes remain retryable. The five original
  service-desk lanes retain input focus while typing, and term selection cannot
  reuse another term's preview or recommit an already completed result.

## Proof and remaining release gates

The isolated PostgreSQL suite exercises tenant/branch filters before caps,
half-open date windows, daylight-saving boundaries, recurring plan ownership,
closures, incomplete configuration, cross-branch teacher conflict flags,
partial-result warnings and service-only execution. API tests cover role
denials, assigned branches, strict untruncated inputs and incomplete responses.
The pure display model covers calendar dates, adjacent and nested overlaps,
teacher/class conflicts across rooms and midnight splits.

The focused browser suite covers desktop, 390px and 320px phones, plan details,
conflicts, reception read access without administration buttons, one-read
refresh, obsolete branch responses and visible partial-result warnings. These
use synthetic API responses and do not prove production permissions or booking.

Current local evidence also includes a complete October 10 schema-only provider
capture restored in a network-isolated Supabase PostgreSQL image, with Auth,
Storage, triggers, foreign keys and captured role attributes. Owned rollback-only
fixtures exercised snapshots, previews, generation, assignments and retries.
This proves compatibility with that captured schema, not current hosted roles.
Separate native PostgreSQL connections observe actual lock contention between
two term generators and between a generator and a manual booking. An injected
outbox failure after lesson/assignment/audit insertion proves complete rollback.
The 40-group, three-day-per-week, year-long local benchmark generated 6,280
lessons in 17,277 ms after batching (previous loop: 51,272 ms). Hosted timeouts,
latency and production-scale capacity remain unverified. A read-only October 12
production catalogue confirms the API authenticator's 8-second statement/lock
timeouts and no explicit service-role override. The generation RPC alone now
declares a 45-second statement budget and a 5-second lock budget; no global or
role timeout is changed. Supabase documents function-level REST timeout support
at https://supabase.com/docs/guides/database/postgres/timeouts. The final 6,280
lesson native benchmark took 14,527 ms with the timezone guard enabled. Actual
REST configuration reload/behavior and hosted capacity must still be qualified.

Before declaring the requested feature complete:

1. Qualify the reader against the complete captured installed schema and actual
   owned branch/class/series fixtures. Refresh source and database identities.
2. Refresh the complete-schema proof after the final migration edits and qualify
   the installed runtime statement/lock budgets before enabling large requests.
3. Qualify actual owned roles, teacher assignment visibility and the published
   booked-versus-unbooked workflow. Local isolation/concurrency evidence does not
   establish authenticated hosted authorization or teacher-day visibility.
4. Complete keyboard/mobile/locale/error and large-calendar performance coverage,
   inspect final renders and run the full Academy suite and release checks.
5. Publish through a protected PR with exact-head CI and tracked Pages. Apply only
   the two isolated reviewed migrations, then deploy a source-preserving Academy Edge
   bundle. No unrelated pending migrations or provider/secret changes belong here.
6. Verify installed identities, owned authenticated roles, published browser
   behavior, generation/booking recovery and fixture cleanup before qualification.

Existing deployed rescheduling repair PR246 remains separate. This work does
not complete the other eleven requested Academy capabilities or the broader
all-service customer-readiness objective.
