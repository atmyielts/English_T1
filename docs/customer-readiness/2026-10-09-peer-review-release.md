# Peer Review privacy and transactional feedback

An anonymous browser could read pending essay content without the author's explicit sharing consent. Review submission and the progress counter were separate writes, so simultaneous reviews or an interrupted response could lose counts or report success incorrectly.

This release changes only platform Peer Review, its Edge function and one additive migration. Existing essays and feedback are preserved. Existing essays begin private and can be explicitly shared by their author. The public queue contains consented metadata only; reading another learner's essay requires an authenticated, capacity-limited one-hour reservation. Academy essays never enter that pool. Withdrawal revokes further reviewer access and reservations; it cannot undo text already read.

All Peer commands use one service-only, invoker-privileged SQL boundary with the actor taken from verified authentication. Both browser roles lose direct table and independent column access, including mutation and trusted RPC execution. Concurrent requests are serialized: one immutable essay per request, one original review per reviewer, and feedback/count/completion/assignment release commit together. Migration and command locks are bounded. Service CRUD is retained.

The page preserves an unconfirmed essay and its request identity in per-account, per-tab storage for up to 24 hours. Confirmed matching receipts clear it. Reload requires fresh sharing consent. Storage refusal prevents an unsafe new save and keeps on-screen writing. Review feedback survives interrupted saves on the same page; feedback persistence across reload is not part of this release. Account changes clear prior account content and reject late responses. Focus/visibility checks hide withdrawn or expired reviewer text while retaining the reviewer's own draft.

The floating Updates button is suppressed only on Peer Review because it obscured the mobile submission control. Four widths (320, 390, 768, 1280) and scoped WCAG checks passed. Peer scores are labeled practice opinions; iTEP uses 0-6 and IELTS 0-9.

## Qualification

- 19 cases against a pinned native PostgreSQL 17.5 container: reproduced old anonymous exposure, table/column/RPC permission denials, bounded migration rollback, 12-way duplicate writes and competing reviewers, foreign-key lock inversion, actual counters, transactional rollback, expiry/renewal, withdrawal and tenant separation. Disposable container removed.
- 8 Edge handler tests and Deno type check.
- 15 browser cases with synthetic API/session fixtures, including interrupted save/reload identity, malformed receipt, denied storage, account switch, withdrawn access, synchronous double click, responsive and accessibility checks.
- Platform production build using child-process-only synthetic configuration; no environment files created.
- Full local Supabase stack reset was not run. Native tests exercise the legacy Peer DDL and the exact migration, not the entire application schema. Exact-head CI and hosted proof remain distinct release gates.

## Production sequence and limits

Normal feature PR, exact-head full CI and tracked Pages deployment first. The new page allows saved histories while gating writes against the old API. Verify project `bbjawctnqrufvnesdsel`; the linked dry-run must list only `20261008194000_peer_review_privacy_commands.sql`. Apply that migration, verify history, then deploy only `peer-review` with its existing JWT setting. Compare downloaded source to the reviewed files.

The controlled live scripts create four exclusively owned temporary QA accounts with synthetic essays and feedback. They exercise browser permission denials, concurrent requests and withdrawal before opening the actual published author/reviewer journey. Credentials remain in process memory. Evidence records safe ownership IDs before actor creation. Cleanup independently checks account, mirror, personal-tenant, essay, review, assignment absence and logout. No customer essays are opened or customer records changed.

Rollback preserves the private grants and all records. Never restore the old open essay policy or old unrestricted Edge handler. Old loaded clients receive a refresh-required response for writes. Marketplace trust, paid AI quotas, payments, abuse/capacity controls, moderation, full history pagination and durable reviewer feedback drafts remain separate work; this release does not establish whole-platform customer readiness.
