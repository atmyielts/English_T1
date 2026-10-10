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
  and closure also requires the reviewed API hook pointer. A database-owner-only
  qualification grants one disposable QA actor at most an hour without enabling
  global erasure; revocation/expiry are rechecked after ownership lock waits.
  Legacy personal scopes are classified by current ownership even when creator
  attribution is missing. Private identifier-only markers retain their closed
  billing identity. Active/unknown subscription states require billing review;
  terminal history remains unchanged. Delayed callbacks cannot renew a closed
  payer/scope or detach its retained subscription identity. Another institution's
  payer may continue its subscription after the deleting member leaves.
- **1520** installs an invoker pre-request guard before REST queries, privileged
  views and definer RPCs. Closed or missing authenticated principals receive a
  fixed HTTP 401. Public anonymous browsing and trusted service callbacks keep
  their existing behavior. Installation refuses an unreviewed existing hook.

The handler requests explicit Auth soft deletion after the verified actor's
closure preflight. There is no hard-delete fallback. Confirmation remains bound
to the current account; delayed responses cannot delete or sign out a newly
selected account. Transfer guidance is localized in English, Russian and Uzbek;
SQL/provider diagnostics remain private. Billing guidance is localized too.
Private 409 error bodies have a 1 KiB limit and a two-second read deadline;
unresolved stream cancellation cannot leave the deletion controls pending.
Late audit writes preserve security evidence but redact the closed actor's
email, IP, user agent and arbitrary metadata.
The server also limits confirmation bodies to 1 KiB and a five-second read
deadline; an unfinished request never reaches preflight or Auth deletion.

Personal student leads in the actor's personal scopes (or with no tenant) are
erased with their notes/activities. Attribution through a linked acquisition
session also counts when the lead's direct user field was never populated.
Lead deletion clears the journey's lead FK before personal journey deletion,
allowing the real child cascades to remove attribution and event payloads.
Academy/partner and institution-owned student leads are retained. A surviving
institution-linked acquisition becomes a read-only archive under a private
identifier-only marker. Its arbitrary state, event/touch payloads and deep-link
attribution are cleared; delayed relinking or diagnostic logging is refused.

Locks can produce a bounded timeout or deadlock under mixed tenant-first and
Auth-first operations. The transaction rolls back and can retry. This does not
claim every lock ordering is deadlock-free.

## Executed evidence

- **68 native PostgreSQL/PostgREST cases passed**: ownership races, private
  permissions, disabled configuration, hook drift, personal erasure, financial
  and institutional roots, late rollback, both concurrent-write orderings,
  reactivation denial, teacher anonymization and both Storage ownership columns,
  per-QA expiry/revocation, creatorless scopes, billing review and both callback
  orderings, terminal billing updates, delayed audit redaction, canonical student
  lead/acquisition cascades, business retention and both acquisition-write races.
  Eight cases are actual PostgREST 13 HTTP checks, including privileged-view and
  definer-RPC denial, missing principals, public browsing and service access.
  Three cases reproduce permission attribution errors: an editable profile email
  cannot remove another configured administrator or invitation, grants bound to
  another user survive matching email attribution, and unverified Auth email
  cannot claim unlinked invitations/staff/admin records. Cleanup uses the original
  verified Auth email only for unlinked access, and user ID for bound access.
- **28 actual account handler/client tests** and the Edge typecheck passed,
  including unfinished small requests/responses and unresolved cancellation.
- The updated Platform build passed with a public local fixture configuration.
  **20 rendered browser checks** cover ownership and billing messages in all
  three locales, confirmation, account switching, mobile fit and keyboard focus.
  Three additional menu checks verified Escape dismissal, returned focus and
  mobile fit. Browser APIs were synthetic; these are not hosted deletion proof.
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
- **13 local cases against the complete captured public/Auth/Storage schema
  passed**: 406 tables, 238 public triggers, one Auth trigger and 1,245 public
  foreign keys. No customer rows were included. The pinned Supabase PostgreSQL
  17.6 image restores the captured definitions, matches observed extension
  versions and role attributes/memberships, and applies candidate SQL as the
  observed non-superuser `postgres` role. The installed Supautils privileged
  runtime configuration is also reproduced; ordinary PostgreSQL parameter ACLs
  alone do not describe that permission path. Actual Auth mirroring, transactional
  erasure, ownership refusal/transfer, immutable Academy events, byte-identical
  payments, permission attribution and replacement-owner report revocation pass.
  The prior editable-email defect failed this fixture before the fix. Both the
  failed reproducer and successful final run removed their owned containers.

PostgreSQL 17.5, PostgREST 13.0.7 and the Node HTTP client images are digest-pinned.
The ordinary test command now includes the SQL/HTTP suite. Exclusively owned
containers and local browser/server resources were removed and absence verified.

Personal table definitions are canonical. Optional institutional anchors in the
ordinary suite have minimal owned fixtures. The separate financial qualifier
uses the actual nine migrations, canonical financial tables and their immutable
identity/receipt triggers, with explicitly described fixture augmentation.
Reproduce the financial qualification from this checkout with
`node scripts/qualify-account-financial-retention.mjs --financial-root=<clean-review-checkout>`.
It pins payment candidate `16a8eb759d470410b14e1f0e1c898b636aa834b2` and its reviewed
harness hash, refuses tracked edits and never calls production providers.

The complete captured-schema qualifier is separate from ordinary CI because its
provider schema and metadata inputs remain ignored local artifacts. Run
`node scripts/qualify-account-installed-schema.mjs --schema-file <schema-only-capture> --expected-sha256 <reviewed-capture-hash> --runtime-catalog <metadata-only-capture>`.
The qualified schema SHA256 is
`bdac29206b74fdc0f42629e7d08d22f07aea0132ff23ccdb856f6c43f8ccf169`.
The script refuses a mismatched capture or data dump and has no provider
credentials or connection. It replaces bootstrap schemas only inside its fresh,
label-verified, network-isolated container. This is local compatibility with
captured definitions, not execution through the live Auth service.

Fresh published-source checks classify Academy uploads and center logos as
institutional, and admin library media as platform content. All seven
creator-attributed library rows match the platform pattern and have admin
creators. Preserve these objects across login closure; uploader attribution alone
does not establish personal ownership. No S3 objects, signed URLs or contents
were accessed. Historical orphan objects and future personal uploads remain
unqualified. The downloaded admin-assets shared module differs only in its AWS
dependency versions; this candidate does not publish that module or change them.

## Publication gates

Keep the candidate disabled and payment draft215 unpublished until the complete
hosted lifecycle, installed Auth trigger qualification, historical/future media
coverage, subscription cancellation/recovery, fresh provider/source and
gateway checks, old clients and final exact-head CI are qualified. Zero owned
Supabase Storage objects does not establish external S3 asset erasure. Future
public RLS tables also require the restrictive boundary; the API hook covers
future REST/RPC/view entry points but not every other data transport.
The classified student lead/acquisition paths now have native proof; unlinked
external contacts and all remaining schema exceptions still need review.
The report-authority dependency is now separately published as parent-report v16
through PR219, with its service-only authority migration installed and 25 owned
published-endpoint checks passed. Current owners can revoke links issued by a
former member; historical issuance alone grants no authority. The complete
local-schema case also verifies replacement-owner revocation after issuer closure.
The billing fixture and separate financial SQL proof do not establish a live
subscription cancellation integration. Storage, Realtime and other non-REST
transports still require qualification; the REST hook does not cover them.

Schema installation precedes the new handler. Apply only the four reviewed
migrations from an isolated checkout containing the published migration history;
inspect the plan and refuse unrelated pending migrations. Refresh the installed
account source baseline (v34 at the checkpoint), retain verify_jwt=true, and
download-verify a source-preserving reviewed Edge bundle. The committed earlier
baseline is historical. Activate erasure only after API-hook reload and owned
hosted canaries succeed. First grant only a disposable QA actor a bounded private
qualification and invoke trusted Auth soft deletion directly; global erasure and
the live handler remain unchanged during that isolated qualification. Remove the
grant afterward. Preserve closed personal scope markers, closure and financial receipts on rollback;
never unlink immutable financial roots or restore erased data.

Supabase documents the explicit soft-delete option and the continued validity of
already issued access tokens: [Auth deleteUser reference](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[managing user data](https://supabase.com/docs/guides/auth/managing-user-data).
The API hook is supported:
[securing the API](https://supabase.com/docs/guides/api/securing-your-api).
