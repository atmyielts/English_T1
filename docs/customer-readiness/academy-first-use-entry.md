# Academy first-use entry

A real free account reached Academy's document and authenticated APIs, but its
staff directory returned HTTP 403 with `No active academy membership`. The
workspace showed an access error with Retry and Sign in again. Its empty student
dashboard succeeded; the account could not reach the existing setup path.

The entry and directory screens now recognize that exact legacy response when
the authenticated profile has no active Academy staff membership. They continue
using the independently authenticated student dashboard. An enrolled learner
opens the student workspace; an account with neither staff nor learner access
sees the existing setup screen. No role, membership or permission is granted.

Other 403 responses, failed lookups, and a denial contradicting an active staff
membership retain the error and retry path. Staff routes keep their existing
permission checks. The change creates no Academy or customer record.

Seven browser cases cover the three first-use entry URLs, enrolled learner routing,
generic denial, an unavailable service, and contradictory staff access. Four
positive cases fail against the preceding published frontend; the three error
boundaries already pass. Hosted fixtures mock or block all actual API traffic.
Production qualification also needs an exclusively owned free-account journey
against the published frontend, verified account closure, exact-head CI, all
Pages deployments and credentialed Academy smoke.

Frontend-only release: no migration, function or secret change. The separate
browser-session connection-reset diagnostic is not resolved by this change.
