# CLICK production launch readiness

This is the authoritative launch record for Schood's CLICK integration. A reachable webhook is necessary, but it is not evidence that payment correctness, fiscalization, or operational recovery is ready.

## Architecture map

### Request and callback paths

- Checkout clients: `apps/platform/src/pages/CheckoutPage.tsx` and Academy billing surfaces in `apps/academy`.
- Authenticated order/status API: `supabase/functions/click/index.ts` at `/functions/v1/click/create-transaction` and `/functions/v1/click/status`.
- Public Shop API callback: `https://click.schood.online/click` -> reserved Oracle IPv4 `89.168.67.25` -> Caddy -> `https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/click/webhook`.
- `/webhook` is an intentional route inside the `click` function. The function name remains `click`; the suffix is routed by `index.ts`.
- Supabase gateway JWT verification is disabled only by the `[functions.click]` entry for this callback. The handler still authenticates every non-webhook route and validates CLICK service, signature, order, amount, Prepare linkage, and transaction linkage before mutations.

### Backend components

- `supabase/functions/click/index.ts`: server-priced order creation, hosted CLICK URL, optional card-widget configuration, Prepare, Complete, cancellation, authenticated status reconciliation, coupons/referrals/credits, platform grants, Academy synchronization, and notification dispatch.
- `supabase/functions/click/webhook-security.ts`: strict Shop API envelope validation, signature payload construction, and constant-time comparison.
- `supabase/functions/_shared/payment-terms.ts`, `pricing.ts`, `entitlements.ts`: server-authoritative prices and grant terms.
- `supabase/functions/_shared/click-fiscalization.ts`: dormant fiscalization helper; it is not currently wired into successful payment processing.
- `supabase/functions/admin-payments/index.ts`: admin search, anomaly listing, CLICK status refresh, and grant retry.
- `supabase/functions/admin-analytics/index.ts`: paid/ungranted and grant-error operational counts.
- `supabase/functions/academy/index.ts`, `billing/index.ts`, `admin-billing/index.ts`, and `partner-office/index.ts`: Academy billing, invoices/charges, operator settlement, and partner purchase surfaces.
- There is no automatic CLICK reconciliation cron. Recovery is operator-driven through status refresh, anomaly views, and grant retry.

### Frontend components

- Platform checkout displays the server quote, creates the order server-side, supports hosted "Payment through CLICK" and the CLICK `checkout.js` card flow, polls authenticated status, and grants success UI only after authoritative paid state plus entitlement confirmation.
- Academy office/student flows create tenant-bound tuition payments; the office payment view shows pending, paid, failed/canceled, grant mismatch, provider IDs, and manual-vs-provider settlement actions.
- Platform admin payments provide search, anomalies, provider refresh, and grant retry. A separate `grant_completed_at` marker distinguishes a claimed grant from one whose downstream effects completed.
- Academy billing/history screens are tenant scoped. The platform account page is not a complete invoice ledger; operator support uses the admin payment surface.

### Database components

- `public.payments`: provider-agnostic payment/order record; user, tenant, product/plan, integer amount/currency/status, provider transaction, snapshots, metadata/provider payload, grant timestamp/error, coupons/credits/referrals, and timestamps. RLS permits the payer or tenant members to read; writes are service-role driven.
- `public.academy_payments`: academy/contact/offer-bound billing record with amount/status constraints, unique provider transaction, and finance-scoped RLS.
- `public.entitlements`, `public.academy_entitlements`, `public.seat_licenses`, and `public.exam_tokens`: access effects. Academy grants are protected by `(payment_id, payment_grant_key)` uniqueness.
- `public.academy_subscriptions`, `academy_charges`, allocations, immutable account ledger, debt/promises, and `academy_payment_reconciliations`: Academy billing and reconciliation system.
- Provider transaction IDs are unique. CLICK merchant transaction and Prepare IDs map deterministically to the platform payment UUID.

### State machine

Schood uses `pending -> paid` or `pending -> canceled` for CLICK. `created` is accepted as a legacy pre-pending state. CLICK Prepare records the CLICK transaction linkage but intentionally leaves the local status pending. Only a successful Complete or an authenticated positive Merchant API reconciliation may move the payment to paid and invoke idempotent granting. Paid must be terminal; cancellation after paid is acknowledged without revoking access. Failed/canceled/refunded are terminal and do not grant access.

## Security and correctness boundaries

- The browser never receives `CLICK_SECRET_KEY` or service-role credentials. Service/merchant/user IDs are public integration identifiers.
- Browser-provided amount, currency, tenant, plan, and offer values are not authoritative; the Edge Function reloads server-side catalog/Academy records and scopes access before creating an order.
- The public callback may mutate payment state only after the CLICK signature and protocol envelope are valid and the stored provider/service/merchant/order/amount/linkage match.
- Normal users must not receive stored signature material or unrestricted provider payloads.
- Entitlement issuance is launch-critical and must converge with successful payment through both Complete and reconciliation paths. Paid rows with `granted_at` but no `grant_completed_at` are operator-visible anomalies. Academy tuition grants may be safely retried because the database grant is keyed idempotently; other incomplete grant types require manual reconciliation so a retry cannot double-credit or extend access.

## Readiness stages

- **CODE READY**: automated protocol/security/state tests and builds pass; migrations and function code are merged.
- **INFRASTRUCTURE READY**: DNS, static IP, TLS, callback reachability, Caddy recovery, and persistent firewall rules are verified.
- **CLICK CREDENTIALS READY**: all four production secrets are installed and the readiness check reports configured without revealing values.
- **CLICK TESTING READY**: official Prepare/Complete, negative, duplicate, and fiscalization cases pass.
- **CLICK ACTIVATED**: CLICK confirms whitelist and service activation.
- **REAL PAYMENT VERIFIED**: an explicitly approved controlled real payment, entitlement, history, reconciliation, and fiscal receipt are verified.

## Credential installation

Create a local, gitignored `.click-production.env` containing the real values only:

```dotenv
CLICK_SERVICE_ID=104316
CLICK_MERCHANT_ID=
CLICK_MERCHANT_USER_ID=
CLICK_SECRET_KEY=
```

Install without printing the values:

```powershell
supabase secrets set --env-file .click-production.env --project-ref bbjawctnqrufvnesdsel
```

Never commit, paste into logs, or expose this file to a frontend build.

## External infrastructure runbook

- Cloudflare record `click.schood.online` must remain **DNS only**, resolving directly to `89.168.67.25`.
- The Oracle address must remain reserved. TCP 80/443 must stay publicly reachable; TCP 22 must remain available only under the operator's intended SSH policy.
- Caddy must proxy `/click` to the exact Supabase upstream above and preserve POST bodies/content type.
- Recovery: verify DNS, VM reachability, Caddy service/config/logs, certificate renewal, upstream health, then retry a non-mutating GET. Do not bypass signature checks to restore service.
- The current manually added iptables rules are **not proven persistent**. Install the operator-approved persistent firewall mechanism and verify 22/80/443 after a controlled reboot before launch.

Safe public check:

```powershell
Resolve-DnsName click.schood.online -Type A
curl.exe -sS -D - https://click.schood.online/click
```

The GET is expected to return the handler's `405` CLICK JSON, not Supabase's generic `Unauthorized` response.

## Fiscalization gate

The repository contains a disabled, fail-closed helper only. It validates CLICK's documented field lengths, requires exactly one valid TIN/PINFL, rejects invalid/empty items before any provider request, and is still not called after Complete. It does not establish Schood's IKPU count, product/package codes, VAT, TIN/PINFL scope, or CLICK activation requirements. Written clarification and the required values were requested from CLICK for service `104316` on 12 August 2026. Decide the receipt item model, implement idempotent submission/retry/auditing, and verify failure recovery only after that reply. This is a launch blocker; do not enable `CLICK_FISCALIZATION_ENABLED` until those values and the official test are complete.

## Operational alerts

The CLICK function sends hourly-deduplicated security and payment-integrity alerts from the general Schood bot directly to verified platform-admin Telegram accounts. Recipients are resolved only from `users.role = 'admin'` rows whose Telegram chat was linked through Schood's authenticated one-time-token flow; the public bot's unauthenticated acquisition state never selects recipients. Alerts cover callback 5xx failures, rejected signatures, signed amount/order/action mismatches, and entitlement grant failures. Alert payloads are allowlisted and exclude signatures, credentials, raw callback bodies, and customer contact data. Delivery requires at least one linked platform admin who has started the general Schood bot; verify a controlled rejected-signature alert before launch.

## Production launch checklist

- [ ] `CLICK_MERCHANT_ID` installed
- [ ] `CLICK_MERCHANT_USER_ID` installed
- [ ] `CLICK_SECRET_KEY` installed
- [ ] `CLICK_SERVICE_ID=104316` verified
- [ ] Public callback resolves correctly
- [ ] Static IP = `89.168.67.25` verified
- [ ] HTTPS certificate valid
- [ ] Public callback reaches handler
- [ ] Firewall survives reboot
- [ ] CLICK official integration tester passed
- [ ] Prepare successful
- [ ] Complete successful
- [ ] Duplicate Prepare tested
- [ ] Duplicate Complete tested
- [ ] Invalid signature tested
- [ ] Invalid amount tested
- [ ] Cancellation/replay tested
- [ ] Entitlement granted exactly once
- [ ] Payment UI production-ready
- [ ] Both intended CLICK payment buttons verified or explicitly gated
- [ ] Fiscalization requirement resolved
- [ ] Logs verified
- [ ] Alerts verified
- [ ] CLICK whitelist confirmation received
- [ ] CLICK service activation confirmation received
- [ ] Controlled real payment approved

## Post-credential sequence

1. Install secrets using the env-file command above.
2. Run `npm run verify:click-prod` and `npm run verify:prod`.
3. Deploy configuration-controlled code with `supabase functions deploy click`; use `--no-verify-jwt` only if the CLI demonstrably ignores `supabase/config.toml`.
4. Verify the public GET, then run CLICK's official signed Prepare/Complete and negative/duplicate test matrix.
5. Resolve and test fiscalization, logs, alerts, reconciliation, and persistent firewall evidence.
6. Obtain CLICK whitelist and activation confirmation.
7. Request explicit approval before one controlled real payment.
