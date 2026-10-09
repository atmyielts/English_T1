# Payment transaction progress — 9 October 2026

Status: local candidate; not merged, migrated, deployed or production-qualified.

The published Click 27 source was downloaded and matched the repository baseline
before this change. Writing Tutor 14 and Speaking Coach 15 also matched. The
downloaded access-effective 31 source has a small difference and must be preserved
and reviewed before any future AI release.

## Implemented

- A service-only PostgreSQL fulfillment command locks the payment and tenant and
  commits access, coupon, credit, referral effects and an immutable receipt together.
- A paid-state trigger records durable jobs. A dormant cron worker can retry failures
  after the reviewed backend release; twelve failures escalate to reconciliation.
- Product and bundle grants serialize distinct renewals and preserve active lifetime
  access and its value. Checkout terms and financial identity are immutable.
- Token packs use cryptographic codes; seat packs preserve the existing 30-day
  assignment window and retain the captured access terms for assignment hardening.
- Wallet top-ups use the recorded financial amount. Center tier grants derive tier
  and billing period from the captured catalogue, reject forged/downgrade metadata,
  and stack renewals of the same tier.
- Academy tuition verifies the linked tenant, amount, currency and platform payment
  before the existing Academy grant procedure runs inside the same transaction.
  A separate paid-status write can no longer bypass its grants.
- Click callbacks, status fulfillment, credit-covered fulfillment, and admin
  refresh/regrant use the same database command. Incomplete legacy claims are never
  silently re-granted. Old completion markers remain labeled legacy evidence.
- Customers receive an activation message only after fulfillment succeeds.
  Checkout keeps checking while a paid order awaits access, prevents another payment,
  and explains that state in English, Russian and Uzbek.
- The old dynamic MD5 WASM dependency failed checked execution of the new callback
  tests. The handler uses the Deno-supported Node crypto MD5 implementation while
  preserving the existing Click signature payload. A hosted signed canary is still
  required to qualify the Edge runtime.

## Executed evidence

- 24 native PostgreSQL 17.5 cases using real migration SQL, real baseline domain DDL,
  the actual prior Click guardrail migration, and independent connections. Covers
  concurrent callbacks/renewals/referrals, late rollback, connection termination,
  durable recovery, purchase variants, immutable terms and browser permission denial.
  Every exclusively owned, network-isolated test container was removed.
- 10 tests execute the actual callback parser, signature checks, state branches and
  RPC adapter against persistence/notification doubles; no customer or provider calls.
- 4 actual browser cases with mocked API boundaries cover provider-paid and fully
  credit-covered orders at 390px and 1280px, automatic rechecks, no second order,
  no horizontal overflow and navigation after committed activation.
- Existing shared suite: 72 passed. Edge entry points typechecked. Platform production
  build passed with the real public configuration held in memory. Production secret
  scan and scoped release-manifest validation passed. Academy readiness verifier:
  822 source/configuration checks passed; this is not hosted Academy workflow proof.

## Still required before this payment release can ship

1. Full-credit checkout needs atomic order identity, reservation and paid transition;
   retries must not create another credit order. The current pending-job recovery
   protects fulfillment but does not complete checkout idempotency.
2. Academy checkout needs a server-captured offer/grant snapshot and atomic linkage;
   the existing Academy procedure still reads today's offer grants. Freeze and qualify
   the purchased specification before publishing this candidate.
3. Seat assignment and voucher redemption must use the retained purchased terms and
   an atomic inventory claim. These are separate consumers, not proven by inventory
   creation tests.
4. Verify legacy classifications against a bounded, privacy-preserving production
   inventory. Reconciliation requires evidence and an explicit reviewed command,
   not clearing a customer's grant marker. Qualify receipt retention against account
   deletion/tenant lifecycle; do not silently block an existing customer workflow.
5. Full exact-head CI, source-preserving backend bundles, tracked Pages/provider
   identity, scoped production canaries, worker activation and recovery evidence.

Refund/cancellation reconciliation and all-provider fiscal settlement also remain
open. This change is a substantial payment boundary repair, not full commerce or
whole-platform customer-readiness certification. No production state changed.

## Wider platform priorities

AI add-on-only access and atomic/cost-bounded quotas; server-owned simulator deadlines,
idempotent submissions and truthful scores; full Academy/center role and finance
workflows; original reviewed content and populated catalogues; remaining admin session
and direct-RPC boundaries; mobile navigation accessibility/localization; release-wide
deployment barriers, backup restore, alerts and media/email delivery qualification.
