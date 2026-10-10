# Account deletion and retained institutional records

The operator approved this policy on 2026-10-10: remove the login and personal
learning data; retain payment history and academy-owned records. Academy and
center owners transfer ownership before deleting their accounts.

## Implemented candidate

Draft PR218 now contains four additive migrations and the account handler/client
change. Erasure starts disabled. This is an implemented local candidate; it has
not been installed or enabled in production.

- **1490** checks current and historical business ownership at the service-only
  preflight and final Auth transaction. An active owner must transfer/demote their
  role even when another owner exists. Legacy personal tenants with Academy or
  center anchors are institutional. Disabled members and inactive users cannot
  serve as replacement owners.
- **1500** retains a frozen, pseudonymous domain principal for financial and
  institutional foreign keys. Private closure receipts contain counts, not erased
  content. Restrictive authenticated policies add an account-open requirement to
  existing public RLS tables. Personal writes lock the principal before checking
  closure, so a delayed insert cannot wait on a foreign key and recreate PII after
  erasure commits.
- **1510** erases classified profiles, writing, speech and learning records in
  the Auth soft-delete transaction; anonymizes personal tenants and public teacher
  profiles; removes login memberships and grants; disables personal access; and
  retains payment/admission roots and institutional assessment evidence.
  A late failure rolls back Auth changes and the whole purge. Hard deletion and
  reactivation cannot bypass retained-principal mode. Unclassified owned Storage
  objects cause a private failure before erasure. Configuration starts false,
  and closure also requires the reviewed API hook pointer.
- **1520** installs an invoker pre-request guard before REST queries, privileged
  views and definer RPCs. Closed or missing authenticated principals receive a
  fixed HTTP 401. Public anonymous browsing and trusted service callbacks keep
  their existing behavior. Installation refuses an unreviewed existing hook.

The handler requests explicit Auth soft deletion after the verified actor's
closure preflight. There is no hard-delete fallback. Confirmation remains bound
to the current account; delayed responses cannot delete or sign out a newly
selected account. Transfer guidance is localized in English, Russian and Uzbek;
SQL/provider diagnostics remain private.

Locks can produce a bounded timeout or deadlock under mixed tenant-first and
Auth-first operations. The transaction rolls back and can retry. This does not
claim every lock ordering is deadlock-free.

## Executed evidence

- **48 native PostgreSQL/PostgREST cases passed**: ownership races, private
  permissions, disabled configuration, hook drift, personal erasure, financial
  and institutional roots, late rollback, both concurrent-write orderings,
  reactivation denial, teacher anonymization and both Storage ownership columns.
  Eight cases are actual PostgREST 13 HTTP checks, including privileged-view and
  definer-RPC denial, missing principals, public browsing and service access.
- **23 actual account handler/client tests** and the Edge typecheck passed.
- The previously executed Platform build used current public production
  configuration in process memory. The frontend has not changed since its
  **14 rendered browser checks** covering all three locales, confirmation,
  account switches, mobile fit and keyboard focus. Browser APIs were synthetic;
  they are not hosted deletion proof.
- Read-only production inspection captured 371 public RLS tables and 1,245
  public-child foreign keys, empty stored authenticator hook configuration,
  23 views and zero currently owned Supabase Storage objects. No customer rows
  or object contents were fetched. Authenticated-readable views use invoker
  security; the remaining privileged view has no authenticated read grant.
- An exclusively owned hosted Auth-only canary verified soft-deleted Auth
  metadata/credentials, login and refresh denial, and cleanup. It also reproduced
  the old-token gap: REST still read the original domain identity after soft
  deletion. This tests the installed provider, not these migrations.
- **Six separate native financial cases passed** using the actual nine migrations
  from draft215, including immutable identity triggers: byte-identical plan
  checkout/payment/fulfillment evidence, assigned seats, redeemed vouchers, exam
  admissions, Academy invoices after transfer, and refusal to delete/detach the
  retained principals. Closed recipients could not repeat purchase/access claims.

PostgreSQL 17.5, PostgREST 13.0.7 and the Node HTTP client images are digest-pinned.
The ordinary test command now includes the SQL/HTTP suite. Exclusively owned
containers and local browser/server resources were removed and absence verified.

Personal table definitions are canonical. Optional institutional anchors in the
ordinary suite have minimal owned fixtures. The separate financial qualifier
uses the actual nine migrations, canonical financial tables and their immutable
identity/receipt triggers, with explicitly described fixture augmentation.

## Publication gates

Keep the candidate disabled and payment draft215 unpublished until the complete
hosted lifecycle, full installed table/trigger compatibility, external S3/media
classification, subscription cancellation/recovery, fresh provider/source and
gateway checks, old clients and final exact-head CI are qualified. Zero owned
Supabase Storage objects does not establish external S3 asset erasure. Future
public RLS tables also require the restrictive boundary; the API hook covers
future REST/RPC/view entry points but not every other data transport.

Schema installation precedes the new handler. Apply only the four reviewed
migrations from an isolated checkout containing the published migration history;
inspect the plan and refuse unrelated pending migrations. Refresh the installed
account source baseline (v34 at the checkpoint), retain verify_jwt=true, and
download-verify a source-preserving reviewed Edge bundle. The committed earlier
baseline is historical. Activate erasure only after API-hook reload and owned
hosted canaries succeed. Preserve closure and financial receipts on rollback;
never unlink immutable financial roots or restore erased data.

Supabase documents the explicit soft-delete option and the continued validity of
already issued access tokens: [Auth deleteUser reference](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[managing user data](https://supabase.com/docs/guides/auth/managing-user-data).
The API hook is supported:
[securing the API](https://supabase.com/docs/guides/api/securing-your-api).
