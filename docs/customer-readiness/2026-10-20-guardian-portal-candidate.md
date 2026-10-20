# Parent portal privacy and linking candidate

Not deployed. This extends PR 248; it does not close the all-service audit or
the twelve Academy acceptance rows. The latest shipped main remains PR 252.

Confirmed defects corrected in this candidate:

- Parent reads ignored consent expiry. Notification history included every
  addressed guardian notification, including stopped relationships and fields
  outside the currently permitted domains.
- Payment visibility exposed unpaid debt even when `can_view_debt` was false.
- Every child loaded full history through separate HTTP queries. Support
  requests were grouped by academy, so switching siblings could mix histories.
- The live announcement table has `body` and `created_at`; the old portal
  queried nonexistent `content` and `published_at` columns. Feedback is stored
  as JSON and was displayed as an object instead of the student-facing comment.
- Legacy Telegram linking trusted typed IDs and could replace an existing
  account binding or restore stopped consent. The page exposed technical ID
  fields and its empty state missed the shared Academy layout styles.
- The next-lesson metric could show a past or cancelled lesson. Large monetary
  values could lose precision, and an absent balance could appear as zero.

`20261020120000_academy_guardian_portal_reads.sql` adds service-only dashboard
and selected-child request reads. It locks the complete parent reference graph
before reading, rechecks current principal and consent at the end, and projects
each domain independently. Debt fields, drafts, unreleased homework, raw feedback
JSON, provider errors, staff notes and unsupported notification categories are
withheld. Child lists paginate before loading selected history. Bounded histories
have explicit continuation flags; complete historical paging remains a gate.
Eight parent/outbox tables lose browser table and column grants while retaining
service access. Legacy read routes use the same commands.

The existing Telegram claim RPC now preserves established account/Telegram
bindings, validates current consent and commits binding, consent evidence, token
use and audit together. Matching successful retries do not duplicate evidence.
The gateway verifies fresh signed Telegram initData with the existing
`ACADEMY_TELEGRAM_BOT_TOKEN`; caller-supplied IDs are ignored. Missing configuration
fails closed. Web parents receive invitation instructions, and Telegram parents
confirm access without entering technical IDs. Parent reads and claims pin the
account across refresh/retry; the UI keeps requests, selection and drafts tied to
the child. The mother Schood auth pages are unchanged.

Evidence:

- Fresh schema-only capture on 2026-10-20: 413 tables, 334 public triggers,
  four Auth triggers and 1,253 public foreign keys. No customer records were read
  or loaded. The frozen thirteen candidate migrations install under captured
  production role/extension settings in a network-isolated Supabase PostgreSQL.
- The captured-schema canary passes 52 checks with real Auth/business triggers,
  financial views and keys. Native independent connections also prove both
  consent-revocation lock orders, account closure while waiting, and consent
  expiry after a lock wait. All owned containers and volumes were removed.
  Source hashes and limits: `2026-10-20-guardian-captured-schema.json`.
- Fast CI fixtures use 26 captured table definitions and the real balance views;
  they independently pass the same 52 checks. Eight adapter tests cover domain
  projections, foreign identities, cursors, signed/expired/forged Telegram data
  and safe errors. Ten client pagination checks and 18 executions of the actual
  gateway dispatch cover selected-child and authenticated-actor routing.
- The pinned transport passes 24 checks. Seven affected browser flows pass,
  including siblings in one academy, exact large amounts without debt disclosure,
  signed Telegram confirmation, web entry, stale responses, drafts and preferences.
  Phone/desktop payment and phone invitation screenshots were inspected. The
  empty page now uses the mint/forest Academy styles, compact controls and the
  language selector. The next-lesson and final layout checks passed again.
- Complete Academy Edge suite, build, lint, localization, verify:prod,
  verify:release, 822 product checks and built-product smoke pass locally.
  Exact committed-head CI is still required.

Remaining gates include parent message/request/preference write transactions,
queue/dispatch consent enforcement, full history paging, real configured
Telegram/Click behavior, source-preserving installed Edge qualification, owned
hosted acceptance and fixture cleanup. Other legacy imports and multi-resource
authority remain separate blockers for PR 248. Installing all candidate commands
locally does not qualify every imported workflow on the installed schema.

Priority for the next protected release: assess extracting these urgent parent
fixes from the larger importer draft, qualify that isolated migration/module
closure against the fresh schema and current installed source, then ship through
protected CI with owned hosted acceptance. Preserve concurrent proctor work.
