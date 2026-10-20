# Academy grant authority

The importer draft retains each tenant, center, staff and explicit role grant
as a separate authority entry. The highest role remains a presentation choice;
it must not widen another grant's branch, classroom or student resources.
`resolveAcademyCapabilityScope` resolves a permission against its original
grants, preserving legitimate lower-role capabilities without promoting their
assignments into a higher-role permission. Explicit classroom and student
limits remain explicit even for an administrative role.

The actual membership loader now rejects a grant or staff record bound to a
different user. Email matching uses the confirmed email returned by Auth.
An invitation becomes authority only after a guarded database update returns
the current accepted row. Concurrent revocation, expiry, email reassignment or
user reassignment cannot be overwritten by the stale invitation read. A role
or scope changed before acceptance is taken from the returned current row.
The loader retains all contributor entries for subsequent capability queries.

Six policy tests and thirteen checks executing the actual loader cover narrow
administrative scope, independent capabilities, inactive/expired/malformed
grants, confirmed email identity, foreign bound identities and invitation
races. The complete existing Academy Edge/import suite and compiler passed
locally. These draft changes are not deployed with the legacy permission
release in PR #249.

The combined importer now has one service-only database command gateway. It
locks current Auth/application identity, tenant membership, explicit grants,
staff assignments and center delegation before deriving resource authority.
Branch assignment dates use the branch clock. Each row receives independent
registration, review and financial checks; a class-scoped administrator's
finance permission cannot be promoted onto a reception assignment elsewhere.
Paused centers cannot establish delegated authority, while explicit child
ownership remains valid. Grant expiry is checked again after writes and rolls
back the whole command when the lease has ended.

The internal write engines and staging/evidence tables are no longer callable
or writable by browser or service roles. Only the guarded command can invoke
them. Reference locks use the ordinary enrollment lock order, including a
classroom fence for membership deletion. Unknown first-upload responses can be
resolved through an actor-bound upload-key lookup. Cancellation stops an
unapplied job; completed jobs use retained logical correction.

The new HTTP endpoints use the Auth actor, stream bounded JSON batches and
return retryable uncertainty without replacing request identity. The browser
transport pins requests and refreshes to the visible account. Other reviewers
without financial visibility receive redacted source balances and summaries.

Local qualification includes 56 database checks, 65 native PostgreSQL/API
checks on the final read-redaction source, and 68 scale PostgreSQL/API
checks with revocation contention and a verified expiry-during-write rollback,
five endpoint tests and five account-pinned browser transport checks. A guarded
5,000-student import with 10,000 existing contacts completed in 26.9 seconds
against an unchanged 45-second caller limit; preview took 8.7 seconds. These
are isolated local timings, not hosted latency promises.

The locked identity/grant/staff/center reader now lives in a separate, private
`academy_current_authorities` function. Import callers use a compatibility
wrapper; directory protections do not depend on importing student data or its
staging/effect tables. Bare teacher or branch roles retain empty resource sets,
not academy-wide rights. The actual membership loader keeps direct child
ownership when center delegation also exists, and only active center profiles
establish delegation.

Contacts, classrooms and classroom memberships now use a service-only scoped
directory command and the verified Auth actor. Resource checks happen before
sorting/page limits, preserve independent branch/classroom/student grants, and
include eligible enrolled contacts which lack a primary branch. Student-only
class access hides private class metadata and full roster counts; membership
reads return only the assigned students. Full counts are computed in the database
instead of inferred from a truncated membership page. The existing 300-record
directory and 1,000-record roster defaults are preserved; bounded search and
stable page cursors are available. The browser labels hidden counts as limited
access and preserves the installed backend's legacy rendering until the new
visibility marker arrives.

Forty isolated directory checks, forty-six native PostgreSQL/PostgREST checks,
six service tests and two UI tests cover this integration. Native contention
qualifies both revocation orders. A selected-row delay and a nontransactional
sequence marker prove read evaluation occurred before an expiring grant was
rejected. The importer still passes 65 native authority checks after adopting
the shared function. These results do not prove hosted activation. The updated
complete-schema qualifier and rollback-only canary include directory definitions,
ACLs and reads; rerun them against the current captured installation before
release.

The lazy student-import view now provides CSV/XLSX parsing, automatic column
suggestions and manual mapping, explicit date and credit/debt conventions,
branch-specific group discovery, bounded batches, partial-upload resumption,
preview/finance gates, paginated rows, immutable receipts and logical correction.
An account/Academy-specific tab stores only request keys, settings and the source
fingerprint. The original spreadsheet and student/parent rows remain in memory.
Reloads require the identical source file for an incomplete upload. Auth changes
abort the current view and remove its retained intent. The navigation requires
the server's dedicated importStudents bit; legacy-role fallbacks keep it false.
The existing installed backend therefore cannot expose the new workflow early.

Browser qualification covers desktop/phone layout, real Excel date cells,
resumption with one upload identity, wrong-file refusal, lost commit response,
changed-preview confirmation, financial approval, retained recovery records
and the server feature gate. Uzbek/Russian translations, build and lint are
checked separately. These browser tests use synthetic mocked API responses;
they do not establish hosted backend or customer-workflow readiness.

The shared branch mutation check no longer returns early for a claimed branch
or the first referenced record. It verifies every recognized resource and its
stored parent inside the selected Academy, checks old update targets and nested
student inputs, and reads IDs in batches of 200. An allowed contact or branch
cannot conceal a forbidden payment, charge, shift, collection case or schedule.
Contact saves separately resolve explicit ID, phone and email matches before
writing; conflicting identities are rejected. The resolved existing contact is
scope-checked, its bound login and original creator are retained, and conditional
updates refuse a concurrently changed branch or login binding. A new contact
receives the operator's sole assigned branch when none was supplied.

Sixteen resource-boundary tests, six contact-policy tests and eight checks of
the actual contact handler cover these changes. The handler fixtures simulate
detached database responses and concurrent branch/binding changes. These are
local application checks, not proof of atomic grant revocation. Existing records
without branch attribution still need correct capability/resource resolution;
the shared check does not make a classroom/student grant branch-wide.

Remaining integration gates:

- Existing multi-resource readers and writes still need capability-specific
  resource resolution. Retaining contributor entries alone does not correct
  every legacy controller's highest-role permission or resource logic.
- Qualify the complete current schema/source identities and owned hosted
  endpoint behavior before activation; local database tests are separate proof.
- Qualify the rendered CSV/XLSX workflow against the hosted guarded API using
  owned fixtures and real permission boundaries before enabling imports.

The legacy boundary migration was released separately and is already installed.
The draft release contains eight remaining authority/import migrations. They must be
qualified against current installed state; an isolated migration dry run must
list exactly those reviewed files. Since some timestamps precede the installed
legacy boundary, use the explicitly reviewed isolated `--include-all` path
when the CLI requires it, never the primary checkout's pending migration set.
