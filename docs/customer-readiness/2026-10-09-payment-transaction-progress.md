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

Click callbacks/status, credit-covered fulfillment and admin refresh/regrant share
the transaction command. Old completion markers remain separate legacy evidence.
The unsupported dynamic MD5 WASM dependency was replaced with Deno-supported Node
crypto, retaining Click's existing signature payload. A signed hosted canary is
required to qualify the deployed runtime.

## Executed evidence

- `npm run test:payments` passed: **55 native PostgreSQL 17.5 cases**, **24 actual
  handler tests**, **6 Platform browser cases** and **4 Academy browser cases**.
- Native cases use actual migration SQL, baseline domain DDL and independent
  connections. They cover concurrent callbacks/renewals/retries, competing credit
  purchases, connection termination, injected late failures, permission denial,
  immutable identity and durable recovery. Eighteen cases specifically cover
  Academy checkout, historical contracts, role admission, private snapshots,
  grants/invoice rollback and preservation of non-Click settlement under its
  original non-migration owner. Owned network-isolated containers were removed.
- Handler tests execute callback/checkout code with persistence and notification
  doubles. Browser tests run the actual UI with mocked API boundaries; they cover
  390px/1280px activation, lost-response refresh, same-key retries, no second order,
  automatic rechecks, student/owner screens and no horizontal overflow. These are
  local boundary proofs, not real production provider settlement.
- Platform and Academy production builds passed with actual public configuration
  held in memory. Both typechecks, Academy lint and 2,569-phrase localization check
  passed. Production secret scan and release-scope validation passed. Academy's
  822 source/configuration checks passed; they do not prove all hosted workflows.
- Earlier shared contracts: 72 passed. Historical exact-head CI for `cb88e79b9dcd0dded0297a8e28908e99c106bc12`
  passed in run 37943728986. The Academy extension requires its own full CI run.
- Read-only production aggregate inventory at **2026-10-09T15:02:58Z** found zero
  pending/paid Academy Click invoices, zero legacy metadata-only Academy Click
  pending/paid orders, and zero paid Click platform payments across purchase types.
  Only exact counts were read; no row content. These scopes do not qualify other
  providers, account lifecycle, orphan links, refunds or all financial history.

## Still required before shipping this payment release

1. **Center/partner checkout recovery:** three published source forwarding paths
   still need stable per-intent keys. Tier upgrades create a request before the
   payment and link it afterward; qualify this as a single replayable transaction.
   Old unkeyed HTTP requests remain compatible but cannot deduplicate later retries.
2. **Inventory consumption:** seat assignment and voucher redemption must consume
   captured purchased terms with an atomic claim. Inventory creation tests do not
   prove these independent consumers.
3. **Lifecycle and reconciliation:** review retained financial identity against
   account/contact/tenant deletion, classify legacy evidence and define reviewed
   reconciliation commands. Never clear a grant marker to manufacture a receipt.
   Capture the actual installed Academy settlement definition/owner before replacing
   its entry point. Refund/cancellation and all-provider fiscal settlement remain open.
4. **Release proof:** full exact-head CI and review, source-preserving backend
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
for customers. All three migrations and candidate Edge/frontend changes remain
unpublished; the payment worker remains disabled.
