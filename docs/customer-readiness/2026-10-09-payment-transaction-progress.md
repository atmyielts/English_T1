# Payment transaction progress — 9 October 2026

Status: locally tested draft PR [215](https://github.com/atmyielts/English_T1/pull/215).
Not merged, migrated, deployed or production-qualified. No production payment,
customer charge, account, migration or function was changed by this candidate.

## Implemented

The service-only PostgreSQL fulfillment command commits access, coupon, credit,
referral effects and an immutable receipt together. A paid-state trigger records
persistent recovery jobs. The worker remains disabled until the reviewed backend
release and hosted canaries succeed. Twelve failures escalate to reconciliation.
Renewals serialize; active lifetime access survives finite renewals. Token packs,
seat packs, wallet top-ups and center tiers use recorded purchase terms.

Checkout creates the order, credit reservation and cross-provider intent identity
in one transaction. Concurrent retries replay the original provider and price before
mutable pricing; competing purchases cannot overspend credit. Failed reservations
leave no payable orphan. Revoked accounts/memberships fail closed. Legacy keys
without captured intent require review, rather than another charge.

Academy checkout now captures the offer and every grant in one database snapshot
and atomically creates its platform order, Academy invoice, private purchased terms
and replay identity. Linked learners can pay without tenant membership; purchasing
for another contact requires active Academy or parent-center finance authority.
Ambiguous contacts and invalid grant configurations cannot create an invoice.

Academy settlement uses the captured amount, beneficiary, resources, quantities and
durations after catalogue changes or deletion. Grants, invoice status and financial
receipt commit together. Contact reassignment and separately pre-marked paid invoices
require reconciliation. Late errors or a lost database connection roll back grants
and invoice status; the already-recorded paid order remains recoverable. Legacy
Academy purchases without snapshots are never fulfilled from today's catalogue.

The Academy migration preserves the installed non-Click settlement body behind a
private invoker copy, retaining the public function's original owner and identity.
Direct Click settlement cannot bypass the financial receipt. The installed production
function definition/owner must still be captured and reviewed before migration.

Platform and Academy share a purchase-attempt helper. Keys survive lost responses
and refresh when session storage is available. They rotate only after verified
completion or an unpaid terminal state. Restricted-storage fallback preserves the
mounted attempt but cannot promise refresh persistence. Academy owner and learner
screens poll paid orders until access commits, block another purchase meanwhile,
and explain activation in English, Russian and Uzbek. Already-paid responses cannot
open another payment URL. Legacy TeacherOfficePage uses the helper but is unmounted;
its typecheck does not prove a live purchase flow.

Center and partner checkout now forward one stable key and the original choices.
Online wallets, ticket packs, seats and tiers share recovery across refresh and
unknown responses. Paid activation suppresses every payment link until access
commits. Only fixed invalid input that cannot create its exact purchase intent permits
corrected choices with a new key. Mutable catalogue, admission and SQL failures
retain their original key even when they return HTTP 400; another concurrent
request may have committed it.

Center tier checkout creates the server-priced order, tier request, immutable
financial linkage and replay identity in one transaction. Catalogue edits cannot
reprice an existing purchase. Different-key purchases serialize without lock
upgrades. Current center owner/admin finance authority is enforced inside SQL for
tiers, online wallets and purchased packs even when a caller omits the center flag.
Published older tier requests remain compatible only when their recorded payer,
tenant, price and billing choices match exactly. Legacy unkeyed requests remain
compatible but cannot automatically replay a later request.

Click callbacks/status, credit-covered fulfillment and admin refresh/regrant share
the transaction command. Old completion markers remain separate legacy evidence.
The unsupported dynamic MD5 WASM dependency was replaced with Deno-supported Node
crypto, retaining Click's existing signature payload. A signed hosted canary is
required to qualify the deployed runtime.

## Executed evidence

- The final `npm run test:payments` passed with **67 native PostgreSQL 17.5
  cases**, **31 Deno cases** (27 actual callback/checkout handlers and 4 partner
  payload contracts), **22 Platform browser cases** and **4 Academy browser cases**.
  Browser API boundaries are mocked; these are not hosted settlement proofs.
- Native cases use actual migration SQL, baseline domain DDL and independent
  connections. They cover concurrent callbacks/renewals/retries, competing credit
  purchases, connection termination, injected late failures, permission denial,
  immutable identity and durable recovery. Eighteen cases specifically cover
  Academy contracts, role admission, private snapshots and non-Click settlement
  preservation. Twelve additional center cases cover single/different-key
  concurrency, legacy linkage, captured terms, failed-connection rollback and
  current finance authority. Owned network-isolated containers were removed.
- Browser coverage includes 390px/1280px activation, lost-response refresh,
  original-key/choice retries, no second order, automatic checks, learner/owner
  screens, center/partner purchase variants, removal of paid payment links,
  fixed invalid-choice correction, mutable HTTP 400 key preservation and no
  horizontal overflow.
- The final Platform production build passed with actual public configuration
  held in memory. The Academy production build, lint and 2,569-phrase localization
  check passed for ed95919; Academy source and the shared attempt helper have not
  changed in this extension. Academy's earlier 822 source/configuration checks
  do not prove every hosted workflow. The root `npm test` command passed,
  including admin, payment, marketplace, privacy, exam, SAT, shared and Telegram
  sections, followed by the final affected payment-suite rerun after review.
  Production secret scan, release-scope validation and diff checks passed.
- Exact-head CI for Academy candidate `ed95919dc133495e4dc0734aaee69e607db8b0aa`
  passed in run 37949096285. The center extension requires its own exact-head CI
  and release review. Earlier candidate CI remains historical evidence only.
- Read-only production aggregate inventory at **2026-10-09T15:02:58Z** found zero
  pending/paid Academy Click invoices, zero legacy metadata-only Academy Click
  pending/paid orders, and zero paid Click platform payments across purchase types.
  Only exact counts were read; no row content. These scopes do not qualify other
  providers, account lifecycle, orphan links, refunds or all financial history.

## Still required before shipping this payment release

1. **Inventory consumption:** seat assignment and voucher redemption must consume
   captured purchased terms with an atomic claim. Inventory creation tests do not
   prove these independent consumers. Fresh read-only published source capture
   confirms separate HTTP writes for grant/claim and current catalogue reads.
   Teacher Office also has repository-only score-reporting drift that must not
   be published incidentally; see `2026-10-09-inventory-consumer-baseline.json`.
2. **Lifecycle and reconciliation:** review retained financial identity against
   account/contact/tenant deletion, classify legacy evidence and define reviewed
   reconciliation commands. Never clear a grant marker to manufacture a receipt.
   Capture the actual installed Academy settlement definition/owner before replacing
   its entry point. Refund/cancellation and all-provider fiscal settlement remain open.
3. **Release order and proof:** this combined draft must not merge as-is. Split
   backend and frontend PRs: the first tracked Pages run retains existing frontend
   source, then reviewed additive backend changes and old-client/hosted canaries
   qualify retry support before the recovery UI follow-up ships. Published old
   partner-office discards the new retry key; shipping the UI first is unsafe.
   Full exact-head CI and review, source-preserving backend
   bundles with unchanged gateway flags, tracked Pages commit/provider hashes,
   exclusive production canaries and cleanup. Test a signed owned Click callback,
   activate the worker only after successful proofs, then demonstrate real retry
   recovery. Keep additive receipts during rollback.

## Larger customer-readiness work still open

- AI: dedicated add-on-only premium access, atomic quotas, privacy and cost limits,
  approved allowance/price configuration, and actual hosted grading proof.
- Simulators: server-owned deadlines and submissions, cross-device/retry recovery,
  truthful score reporting and reviewed original question/content inventories.
- Academy/centers: full role boundaries, finance lifecycle, attendance, teacher and
  learner progress workflows, real integration coverage and recovery.
- Administration: server session/idle/revocation enforcement, direct table/RPC
  boundaries, immutable audits and lost-factor recovery qualification.
- Customer UX: remaining responsive burger menus, keyboard/focus/scroll behavior,
  localization, clear empty/error states and consistent service navigation.
- Operations: complete release barriers, backup restore drills, delivery/SMTP/media
  proof, alerts, abuse limits and bounded load qualification.

This is a substantial payment repair. It does not certify all services as ready
for customers. All four migrations and candidate Edge/frontend changes remain
unpublished; the payment worker remains disabled.
