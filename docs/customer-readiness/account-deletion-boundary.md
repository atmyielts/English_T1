# Account deletion identity boundary

The published account endpoint (version 33) deletes whichever account is verified
from the request token, without checking the email confirmation shown in the UI.
The old client can refresh into another account after an earlier confirmation,
and late deletion responses can sign out the newer session. Provider errors also
expose internal details, while the UI promises deletion of every related record.

This release binds deletion to the displayed actor, confirmed email and captured
verified token. The client checks identity again immediately before the request,
never refreshes into another actor, and ignores an old screen's completion. The
server requires matching confirmation, rejects conflicting identity headers,
ignores caller-supplied account IDs and limits actual request bytes. Authentication
outages and existing record-retention failures return static, private messages.

Protected routes invalidate stale validation responses and remount on account
identity changes. Previous form/confirmation/Telegram link state is discarded.
Profile writes also require the displayed account. English, Russian and Uzbek
copy explains that some financial or shared workspace records may remain and
provides a support path when deletion cannot complete. The confirmation has an
accessible email label and fits the existing responsive layout.

## Executed evidence

- 18 Deno HTTP/client boundary tests and actual account Edge typecheck passed.
- 14 Playwright CLI checks passed on the actual account page with synthetic APIs:
  foreign confirmation disabled in three languages, private failure text,
  confirmation payload, no failure sign-out, delayed delete/account switch,
  cleared confirmation, no second deletion, mobile overflow and keyboard focus.
- The existing private-writing account-switch/delayed-response browser regression
  passed against the same protected-route guard.
- Platform production-configured build passed with the public anon key held in
  memory. Production secret scan, release-scope verification and diff checks pass.
- 12 checks against production Auth using the reviewed **local** handler and two
  exclusively owned QA accounts passed. Wrong confirmation, injected foreign ID
  and conflicting headers never deleted the other account; correct confirmation
  deleted only the verified caller. All owned Auth/domain accounts and bootstrap
  tenants were removed and absence verified. See `release/account-schema-canary.json`.
  These checks qualify the provider operation, not a published Edge deployment.

## Release and remaining scope

No production account function, customer account, billing schema or secrets were
changed by this candidate. The source-qualified version 33 baseline and gateway
flag are recorded in `release/account-published-baseline.json`.

Exact-head CI and tracked Platform Pages must succeed before manually installing
the isolated account bundle with `verify_jwt=true` preserved. The new client is
compatible with installed `{ok:true}` replies; an older tab without confirmation
must refresh after server installation. There is no unsafe missing-confirmation
fallback. Refresh the published baseline before installing, refuse drift, then
compare installed hashes and repeat the owned published-endpoint canary.

This release preserves existing database financial restrictions. It does not
certify account anonymization, shared workspace ownership transfer, reviewed
retention policy, fresh authentication or MFA requirements for deletion. Those
remain part of the broader customer-readiness work. Never relax immutable
financial evidence or test deletion on customer accounts to qualify this repair.
