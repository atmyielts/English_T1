# Student import recovery: local implementation and qualification

This branch is not released. The combined student-import API and wizard are still
unfinished. No candidate import migration, Edge Function, or frontend from this
branch has been deployed to production.

The new recovery command corrects an entire committed import in one transaction.
It retains original records and append-only import/financial/lifecycle evidence.
Opening balances are reversed by new ledger entries; later payments remain.
Unused contacts/groups become inactive and memberships become withdrawn. Changed
or used records stay intact with a `recovery_review` receipt. A membership kept
for review also protects its imported group from deactivation. Reused students
retain their older payments and active memberships. Parent permission or consent
established after import is preserved. Recovery produces distinct correction
events, with the actual operator, rather than false student-dropout events or
automatic messages.

Recovery binds the actor, key, reason and supplied server-owned branch scope. A
retry returns the original receipt; a changed request identity is refused. The
final audit and every reversal/status/evidence write roll back together if any
step fails. References are discovered from real foreign keys, including new
referencing tables, and checked in batches at each dependency phase. Target
parents are locked before those checks. Only exact recorded snapshots belonging
to this import/recovery are exempt; merely adding import metadata grants nothing.

Preview now resolves the file in one statement and avoids rewriting unchanged
rows. Normalization remains derived from frozen uploaded source. Live identity,
branch, group-capacity and consent checks are recomputed before commit. The
unique effect-reference key belongs to the commit migration, so commit does not
depend on the later recovery migration for its lookup performance. Commit applies
each entity set in bulk in the same transaction and binds the applied row IDs
without changing uploaded source or deterministic normalization. Ordinary group
writers participate in the identity fence: a group appearing while commit waits
returns a changed preview instead of creating a duplicate. Query-strategy settings
are local to these batch functions; caller timeouts remain unchanged.

## Executed local evidence

- `npm run test:academy:import` passed on the final source: file/input checks,
  staging (51), normalization (53), preview (77), atomic commit (38), recovery
  (49), type-specific permissions, actual legacy handlers (22), and direct-table
  boundary (42). The preview scale case includes 5,000 existing contacts and
  5,000 existing guardians, rather than relying on empty CRM tables.
- Native independent-connection checks exercised recovery serialization and
  stable receipt replay and concurrent ordinary group creation. The final native
  run passed 68 commit/scale checks and 52 recovery checks, including the complete
  5,000-student flow through an isolated PostgREST gateway. Local observed times:
  preview 2,756 ms, commit 22,143 ms, recovery 11,882 ms. Both commands stayed
  inside the unchanged 45-second caller budget. Recovery replay through the
  gateway returned the original receipt. These timings are local measurements.
- The complete schema-only capture restored 406 tables, 238 public triggers and
  1,245 public foreign keys. Installation ran with captured provider role
  attributes and memberships, including non-superuser `postgres`. A synthetic
  canary exercised Auth mirroring, import, receipt replay, retained recovery and
  a later payment. The final canary also checks retention of an imported paid
  group. Source hashes are frozen before qualification begins.
- The Academy production build, `npm run verify:prod`, and whitespace checks
  passed. Fixture containers have no
  host ports, customer credentials/data, external network or host mounts. Owned
  containers and anonymous fixture volumes are removed after each run.

These are local tests. They do not prove hosted latency, live scoped permissions,
the user-facing importer, or overall Academy/customer readiness.

## Remaining import work before release

1. Preserve actual per-grant permission/resource scope across access aggregation
   and command authorization; do not promote a lower grant's resources into a
   higher role's authority. Bind current account/grant state to the mutation
   transaction, including concurrent closure and revocation.
2. Bind upload, row review, commit, recovery and history endpoints to current
   server-owned authority, with bounded, complete pagination and exact money.
3. Build and visually verify the compact CSV/Excel mapping/review/recovery wizard,
   including resumed uploads, lost responses, changed previews, account changes,
   keyboard use, small screens, and clear manual-review results.
4. Finish the legacy importer’s atomic commit/recovery and remaining history
   completeness. Type-specific permissions and direct-table restrictions alone
   do not make the legacy workflow atomic.
5. Require exact-head CI and the protected PR path. Deploy only reviewed additive
   migrations and source-preserving Edge changes, then qualify owned hosted
   workflows and cleanup. No direct main push or local Pages deployment.

All other requested Academy features and the cross-service correctness,
security, performance, workflow and visual audit remain in the overall scope.
Concurrent proctor work is outside this branch. Before release, re-read main and
the installed schema/migration history, preserve shared-file changes, and apply
only the selected reviewed import migrations.
