# Parent-report authority candidate

The installed `parent-report` v15 service revokes links only when the caller is
the historical creator. It returns success even when no link changed and does
not check the creator's current academy access. An ownership transfer therefore
leaves the replacement owner unable to revoke existing links and a removed,
still-authenticated creator able to revoke them.

The reviewed base is `292dc97702a14e0c9fe0530a30cb28910a0e6875`. Its report entry
matches the downloaded published source after LF normalization:
`c7c8f76c7702685492321780e690de19651196d499dd7c3dd5e3796986f6e8ce`.
The current provider inventory still reports version 15 and `verify_jwt=false`.
This is source and metadata evidence; no customer report was opened or changed.

## Resulting behavior

- Current academy owners/admins can revoke any academy link, including links
  created before an ownership transfer. Direct membership, linked-center,
  accepted academy-wide grants and active staff authority are considered.
- A current reporting delegate can revoke their own link only within their
  current student, classroom or branch scope. Historical creator identity,
  invited grants, expired/revoked grants, another academy's access and unverified
  email matching do not supply authority. A grant already bound to another
  user cannot be claimed through an email match.
- Service-only SQL derives academy and student scope from the stored link,
  locks current principals/access/scope, rechecks the locked link and grant
  expiry, and commits revocation with its audit entry. Repeated revocation
  succeeds only for an authorized caller and records one audit entry.
- The HTTP handler verifies Auth and supplies only that actor and the requested
  link ID to SQL. Missing SQL, timeouts and unexpected decisions fail closed;
  there is no legacy creator-only fallback or diagnostic disclosure.
- Public reports require a student matching the stored academy. Missing or
  failed source data cannot become a successful empty report. All JSON responses
  use `Cache-Control: no-store`; valid public links remain unauthenticated,
  and revoked/expired links retain their existing denial behavior.
- Public classroom relationships normalize both object and array results.
  Both classroom and assignment embeds name the installed composite academy
  foreign keys explicitly. The live schema also has legacy single-column keys;
  unqualified embeds fail as ambiguous and the old handler silently reports
  missing grades/classes. The candidate's private error checks exposed this
  during the owned provider canary before publication.
  Auth outages return a retryable private failure. Creation failures cannot
  expose database details or produce an undefined success URL.

## Verification

37 pinned native PostgreSQL checks passed, including all selected canonical
authority tables and foreign keys, service-only execution, direct and delegated
access, ownership replacement, grant expiry while awaiting a token lock,
concurrent membership/grant/staff/account demotion, token scope movement,
simultaneous revocation, audit rollback, bounded lock contention and migration
replay and malformed scope denial. The exclusively owned network-isolated container was removed and its
absence verified.

23 Deno checks passed, including ten tests through the actual HTTP handler with
synthetic service/Auth responses, plus the Edge entrypoint typecheck. The test
command is part of ordinary `npm test`; no workflow or deployment gate changed.
These are local proofs, not installed-provider canaries or proof of the complete
production schema. Native Auth is a selected fixture, not an Auth service emulator.

An owned published-baseline canary passed 13 checks and complete disposable
Auth/domain/academy cleanup, reproducing the two revocation defects. A further
20 checks ran the candidate's actual default SDK and handler locally against the
production provider with only owned identities and academy records. They verify
real Auth, populated classroom/assignment relationships, an 80% synthetic grade,
100% synthetic attendance, the score trend, no-store responses and private
fail-closed behavior while the new RPC is absent. The local server was removed.

The populated fixture's enrollment generated immutable institutional history.
The database refused deleting those events. Their inactive own student/classroom/
branch and clearly marked QA academy were therefore archived; the retained
creator's Auth identity was soft-deleted and its domain identity anonymized and
disabled. The other test actor, personal bootstrap tenants and disposable report,
grade, attendance, assignment and membership records were removed. This is a
verified retention disposition, **not complete record removal**. No immutable
guard, customer record, production schema or published function was changed.
Do not run an enrollment fixture again while assuming ordinary cascade cleanup.

## Publication and remaining qualification

No candidate migration or function is installed in production. The release
changes only `parent-report` and one additive function migration; no frontend,
account-closure flag, financial worker, secret or customer record changes.

Before publication, require current-head CI and matching tracked deployment.
Refresh the published function source/version/gateway and installed authority
schema, constraints and audit triggers. Refuse drift from the recorded baseline.
From an isolated reviewed checkout, inspect linked migration history and apply
only the new report migration with `supabase db push --linked`; refuse unrelated
pending migrations. Qualify the RPC using exclusively owned disposable academy,
actor and report fixtures while the public function is still unchanged.

Then publish only the reviewed report runtime files using
`supabase functions deploy parent-report --project-ref bbjawctnqrufvnesdsel --use-api --workdir <qualified-report-bundle>`.
The isolated bundle must preserve `verify_jwt=false` and the published remote
imports. Download installed runtime files and compare reviewed hashes. Test a
valid own report, ownership transfer, removal of the old issuer, repeated
revocation, revoked/expired public denial and full owned cleanup; never read
customer report tokens or use customer academy IDs. Do not publish a function
that requires SQL before its RPC is installed and qualified.

Existing browser token management and the Academy monolith's generation/scoped
grant behavior remain separate paths to review. View-count increments are still
the existing non-atomic best-effort update. Public request load limits, bounded
body reads and revocation-versus-in-flight-read behavior need further qualification.
This candidate does not enable account erasure or establish platform readiness.

If publication fails, fix forward and keep revoked links revoked. Never restore
the old creator-only success path, reactivate tokens, erase audit evidence or
re-enable deleted personal data as a rollback. Leave the additive RPC installed.
