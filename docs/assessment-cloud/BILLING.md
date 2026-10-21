# Assessment Cloud entitlements, quota and usage

Status 2026-10-22: **locally evidenced, incomplete; enforcement off by default.** See `BILL-01` to `BILL-04` in the [backlog](FULL_SERVICE_BACKLOG.md#bill--product-entitlements-and-billing).

## How institutions buy and are metered

Assessment Cloud is its own product (`products.id = a55e5500-0000-4000-8000-00000000c10d`). Its `metadata.kind` is `institution_service` and it starts in status `draft`.

Purchases go through the existing Click `plan` flow:
- Schood creates plans for this product in the admin console, with prices approved by the business. No plan or price is seeded.
- The plan's `metadata.limits.assessment_attempts_monthly` sets the monthly attempt quota. If it's absent, attempts are unlimited.
- Fulfilment writes one tenant-scoped `entitlements` row. Migration 37 only reads that row.
- Since `fe4aae4`, only the institution's **owner or administrator** can check out an `institution_service` product. Other members get `institution_admin_required` before any order or credit write.

Metering (migration 37, `20261022110000_assessment_entitlements.sql`):
- Each attempt start creates one `attempts` unit in `assessment_usage_ledger`, keyed by the attempt. Replays, retries and refused starts never add a unit, and preparation is never charged.
- The unit is `reserved` at start and becomes `consumed` at submission or expiry.
- Metering is recorded even while enforcement is off, so institutions and Schood can see usage before plans are enforced.

When Schood support turns enforcement on with `assessment_billing_configure` (platform admin, reason required, audited):
- creating a sitting or starting an attempt needs a current entitlement (`assessment_subscription_required`, 403)
- a start beyond the monthly quota is refused (`assessment_quota_exhausted`, 422) under a per-tenant advisory lock

Support adjustments (`assessment_usage_adjust`, platform admin only):
- release a unit, for example after a technical failure, or restore it
- a reason is mandatory; each adjustment is idempotent per key and recorded in `assessment_usage_adjustments` plus the audit log

The institution view (`assessment_billing_summary`, `team.manage`) shows the plan, period totals (reserved, consumed, released) and a keyset page of units with their adjustments.

API (Edge `assessment-cloud/billing/*`):
- `GET billing/summary?tenant_id&limit&before&before_id`
- `POST billing/adjustments` with `{action: release|restore, ledger_id, reason}`
- `POST billing/enforcement` with `{enforced, reason}`

## Evidence (local)

- `supabase/tests/assessment-entitlements.integration.sql` covers:
  - metering with enforcement off, and replay without a second charge
  - enforcement authority and idempotency
  - refusal without an entitlement and when the quota is used up
  - release and restore authority, reasons and audit
  - summary paging and expiry
  - function grants
- `scripts/test-assessment-entitlements-race.mjs` starts four candidates at once, on separate sittings, against a two-attempt plan. Exactly two are admitted and two units charged; replays change nothing.
  - Mutation check: with the advisory lock removed, the race over-admits and the test fails on both runs.
- `supabase/functions/assessment-cloud/billing-handler.test.ts` covers auth, paging bounds, reasons and field stripping.
- `npm run test:payments` (Click) passes with the institution-buyer guard: 56 Deno tests plus 183 native cases.

## Remaining work

- **BILL-01:** enforce the entitlement on the media, recording and coordinator data planes, not only at sitting and start admission. Add a Proctor product only when Proctor work resumes.
- **BILL-03:** exercise Click test mode end to end. Live settlement is blocked on the static-IP egress requirement. Credits, refunds and invoices are still open.
- **BILL-04:** institution billing screen and Schood support screen. The API exists; the UI is not built.
- Approved plans and prices; hosted acceptance and reconciliation against real settlements.
