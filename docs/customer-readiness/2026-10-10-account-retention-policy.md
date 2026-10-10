# Account deletion policy and ownership boundary

The operator approved this policy on 2026-10-10: remove the login and personal
learning data; retain payment history and academy-owned records. Academy and
center owners transfer ownership before deleting their accounts.

## Implemented candidate

`20261009149000_account_deletion_ownership_guard.sql` protects business ownership
at both the account endpoint and the final Auth database transaction. It covers
hard and soft Auth deletion, active owners without creator attribution, and
legacy personal tenants that already contain Academy or center records.

An active owner must transfer/demote their own ownership even if another owner
exists. Historical creator attribution alone does not block an account whose
workspace has another active owner. A disabled membership or deactivated user
cannot act as that replacement owner.

The service-only preflight returns a fixed decision without disclosing tenant
names, other identities or record details. Database locks serialize the final
decision with ownership changes. Contention can abort with a bounded timeout or
deadlock; the entire Auth transaction rolls back and the client can retry. This
is not a claim that mixed tenant-first and Auth-first operations cannot deadlock.

The client recognizes only the bounded, known HTTP 409 ownership code and shows
English, Russian or Uzbek transfer guidance. Existing confirmation, identity
binding and account-switch guards remain in place. An unavailable or malformed
preflight never proceeds to Auth deletion.

## Executed evidence

- 21 native PostgreSQL 17.5 cases passed, including real separate-connection role
  promotion/new-membership races, private RPC permissions, soft-deletion
  bypass rejection, legacy institutional scopes and late FK failure rollback.
- 23 actual account handler/client tests and Edge typecheck passed.
- Platform production build passed with the current public provider configuration
  held in process memory. No provider credentials were saved.
- 14 actual rendered CLI browser checks passed with synthetic APIs: transfer
  guidance in all three locales, confirmation gating, private errors, account
  switching/in-flight response isolation, mobile fit and keyboard focus.
- The exclusively owned, network-isolated SQL container was removed and its
  absence verified.
- Read-only production catalog inspection found 371 public tables and 1,245
  public-child foreign keys. This read did not fetch customer rows.

The native fixture uses canonical user, tenant and membership table definitions,
including the Auth-to-domain-user cascading FK. Institutional anchors use
minimal owned fixtures; the complete production Auth service and Academy
schema have not been qualified for this candidate.

## Required next lifecycle work

This ownership candidate is not the complete approved erasure/retention workflow.
The endpoint deliberately retains its current hard-delete call. Simply changing
it to soft deletion would leave names, email, profile data, writing, speech and
learning records in application tables. New immutable financial receipt FKs in
payment draft PR215 restrict hard deletion; the candidate must not drop those
relationships or erase financial evidence to make deletion succeed.

Before the financial release, implement and qualify a pseudonymous durable
principal, explicit personal-record purge, institutional-record retention,
personal tenant anonymization, external asset deletion/recovery and immediate
denial of previously issued access tokens across data/API paths. Supabase's
stateless access JWTs remain valid until expiry after deleting an Auth user:
https://supabase.com/docs/guides/auth/managing-user-data.

Keep payment draft PR215 unpublished until that compatibility is proven. Do not
claim paid account erasure works on the basis of an ownership-only preflight.
Schema-first installation is required before publishing the new account
handler. Preserve the installed account gateway setting (`verify_jwt=true`),
refresh its source baseline, and install only a source-preserving bundle after
review and exact-head CI/Pages. No production changes were made by these tests.
