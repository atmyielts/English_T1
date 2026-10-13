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

Six policy tests and ten checks executing the actual loader cover narrow
administrative scope, independent capabilities, inactive/expired/malformed
grants, confirmed email identity, foreign bound identities and invitation
races. The complete existing Academy Edge/import suite and compiler passed
locally. These draft changes are not deployed with the legacy permission
release in PR #249.

Remaining integration gates:

- Existing multi-resource readers and writes still need capability-specific
  resource resolution. Retaining contributor entries alone does not correct
  every legacy controller's highest-role permission or resource logic.
- The combined import API must derive the principal from Auth and resolve
  current branch/classroom/student references. A classroom or student grant
  cannot silently become authority over its entire branch.
- Import staging, preview, commit and recovery must recheck current database
  authority under locks, including account closure, grant revocation, staff
  assignments and center delegation. A browser-supplied scope or capability
  flag must never establish authority.
- Per-row finance, group creation and roster rights must be enforced before
  writes. An unrelated lower-role branch assignment must not inherit an
  administrator's money or staff permissions.
- Finish and inspect the CSV/XLSX mapping, preview, resumption, receipt and
  logical-recovery wizard with real permission boundaries before activating
  the combined importer.

The legacy boundary migration was released separately and is already installed.
The draft release contains six remaining import migrations. They must be
qualified against current installed state; an isolated migration dry run must
list exactly those reviewed files. Since some timestamps precede the installed
legacy boundary, use the explicitly reviewed isolated `--include-all` path
when the CLI requires it, never the primary checkout's pending migration set.
