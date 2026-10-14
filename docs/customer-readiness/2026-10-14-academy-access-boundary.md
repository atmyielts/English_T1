# Academy access boundary: deployed table boundary and pending importer

Read-only production policy metadata captured on 2026-10-14 confirms that
`is_academy_member` admits any active tenant membership. The installed contacts
SELECT policy uses that helper. The account-open restriction is present, but it
does not constrain a healthy unassigned teacher's access to unrelated contacts in the same
academy. No customer records were read to diagnose this boundary.

A synthetic fixture reproduces the installed policy using a valid teacher membership
and two unrelated contact records. PGlite passed 90 checks and isolated native PostgreSQL
passed 99 checks, including bounded catalog contention and atomic rollback: the original peer read is reproduced, the proposed migration
removes table and column ACL paths for anonymous/authenticated roles on seven
reviewed private tables, and service-role access and records remain intact.
The test uses a healthy-account predicate; it does not claim account-erasure
qualification. Native containers were removed by the verified ownership helper.

The committed fixture contains only two permission helper definitions and three
contact policy definitions from the read-only capture. It contains no customer
rows, identifiers, credentials or access tokens. CI exercises that same fixture.
Use `--capture=<fresh metadata file>` for an independent current-policy run.

Searches of shipped apps/packages and the primary concurrent checkout found no
direct frontend table queries or Academy table subscriptions for the seven
targets. Supported clients use the Academy service API. The ACL migration does
not change that API, schema shape, RLS definitions or stored records. PR 250 deployed this ACL boundary after protected CI and captured-schema
qualification. Its owned hosted baseline passed 26 checks and postactivation
passed 36 checks, including owner/anonymous raw-table denial, service continuity
and the unassigned teacher peer-read denial. Fixture cleanup was verified. Other tables and callable functions require their own
review; this closes only the seven explicitly listed table/column ACL paths.

The read-action readiness check now parses the actual `handleReadAction`
dispatcher, including combined OR branches. Regression tests require actual
dispatch conditions and reject comment/list/unrelated-function matches. This
corrects the checker failure without weakening route-presence requirements.

## Release gates still open

- Staff grant/profile/invitation writes need transactional, current resource
  authorization. An independent legacy staff profile must not silently recreate
  authority from a revoked managed grant. Explicit provenance is required.
- Remaining legacy multi-resource reads/writes must preserve each grant's own
  capabilities and scope. Directory/import protections do not prove all actions.
- Finish legacy import atomic recovery/history and qualify the final combined
  source against the captured schema, protected CI and owned hosted workflows.
- The wider Academy feature, performance and visual acceptance work remains in
  scope. Concurrent proctor changes remain outside this worktree's ownership.

PR 248 remains draft. The table ACL migration is installed; the importer and directory
changes from this draft remain unactivated.
