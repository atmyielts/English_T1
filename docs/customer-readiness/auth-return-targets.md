# Authentication return destinations

Platform validates `returnTo` before sign-in completion, account continuation,
checkout continuation, pricing navigation and the admin MFA return.

Approved external destinations must use HTTPS and have an approved host. URLs
containing userinfo, backslashes or control characters return to `/account`.
Internal destinations are parsed against the current origin and normalized;
their query strings and anchors remain intact. HTTP is accepted only for a
same-origin loopback preview. The existing host allowlist and HTTPS session
handoff remain in place.

The prior production sanitizer accepted an approved HTTP service, a URL with
userinfo, and malformed internal paths. Four signed-in published-frontend
regressions reproduce these failures with synthetic sessions. Their backend
requests and navigation destinations are mocked or blocked; no customer record
or real credential is used.

`npm run test:platform:return` runs seven policy cases and five signed-in browser
scenarios. The complete Platform suite also covers provider sign-in, account
switching, marketplace, peer review, guide, student center and admin behavior.
Production qualification requires exact-head CI, ordinary PR merge, all Pages
deployments and the same five browser scenarios against the published build.

This is a frontend release. No migration, Edge Function or secret change belongs
to it. The preceding reviewed main commit is
`5cdf630915845830806d14c92f773b971a01d123`; use its Pages deployment if rollback
is needed. Browser transport diagnostics and paid-provider qualification are
separate work.
