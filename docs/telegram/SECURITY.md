# Telegram security boundaries

## Trust model

Telegram identifiers are external claims, not Schood authorization. Private data access requires a validated Telegram Mini App signature and a server-side mapping to a Schood user. Resource access remains scoped by Schood user, academy membership, classroom membership, and existing capability checks.

## Controls

- Both webhook Workers fail closed if their configured Telegram webhook secret is absent or mismatched.
- Mini App HMAC validation uses Telegram's documented data-check string, a constant-time hash comparison, a one-hour maximum age, and five-minute future-clock tolerance.
- Worker-only Edge actions require the service-role bearer or a separately configured internal Worker secret.
- Service-role and bot tokens remain server-side and must never enter frontend bundles, logs, or analytics metadata.
- `telegram_update_receipts` combines a unique update key, lease, and claim token to prevent duplicate database side effects from Telegram retries and to recover stale processing claims.
- Funnel transitions are backend validated; callback data is never treated as a route or authorization decision.
- Account-link tokens are random, 15-minute, single-use and atomically consumed. Contextual tokens bind to the acquisition session's Telegram user.
- Mini App launch assignment/result IDs are accepted only if present in the linked user's server-loaded dashboard.
- Academy briefs query one academy ID at a time and send only to active owner/admin memberships with linked Telegram accounts.
- Sales and acquisition tables use RLS; only platform admins manage leads, while service-role backend paths perform bot writes.

## Privacy and observability

Structured logs include event name, bounded reason, update ID, or a short chat-ID suffix where needed. They do not include tokens, Telegram initData, message bodies, diagnostic answers, phone numbers, emails, or full chat IDs. Sales-lead contact data is not copied into analytics events.

## Secret contract

| Runtime | Required secrets |
|---|---|
| Public bot Worker | Worker-local `TELEGRAM_BOT_TOKEN`, `TELEGRAM_INTERNAL_SECRET`, `WEBHOOK_SECRET`, `SUPABASE_URL` |
| Student bot Worker | Worker-local `TELEGRAM_BOT_TOKEN`, `TELEGRAM_INTERNAL_SECRET`, `WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| Telegram Edge Functions | `TELEGRAM_PUBLIC_BOT_TOKEN` for public-bot signatures, `TELEGRAM_BOT_TOKEN` for student delivery/signatures, `TELEGRAM_BOT_NAME`, `TELEGRAM_INTERNAL_SECRET`, `TELEGRAM_RATE_LIMIT_SECRET` plus ordinary Supabase secrets |

`TELEGRAM_INTERNAL_SECRET` must be identical in both Workers and the receiving Edge Functions. Each Worker has an isolated secret namespace, so its existing `TELEGRAM_BOT_TOKEN` binding remains unambiguous; Supabase keeps separate public (`TELEGRAM_PUBLIC_BOT_TOKEN`) and student (`TELEGRAM_BOT_TOKEN`) bindings. Before deploy, run `npm run verify:telegram:identities` with those two Supabase-style token variables in the local process; it calls `getMe`, verifies the exact bot usernames, verifies that they are different bot IDs, and never prints tokens.

Webhook-secret rotation uses an overlap: deploy the Worker with the new `WEBHOOK_SECRET` and old value in `WEBHOOK_SECRET_PREVIOUS`, call Telegram `setWebhook` with the new secret, verify delivery, then remove the previous secret. Never change Telegram first without Worker overlap.

## Deployment and rollback sequence

1. Run `telegram-growth-preflight.sql`; stop on duplicate links, invalid preferences, or missing dependencies.
2. Apply the additive migration. It does not schedule cron and uses bounded lock/statement timeouts.
3. Deploy `telegram-public`, `telegram-link`, `telegram-app`, `send-telegram`, `support-center`, `academy`, and `partner-office` with the matching secrets.
4. Deploy both Workers with webhook-secret overlap, verify bot identities, and run webhook/replay smoke tests.
5. Merge the compatible frontend through normal CI only after the backend contract is live.
6. Run `telegram-growth-validate-constraints.sql`, then enable the UTC morning-brief job with `telegram-morning-brief-enable.sql` only after all prior checks pass.

Rollback starts by running `telegram-morning-brief-disable.sql`, then rolls Workers and Edge Functions back together. The additive database objects remain in place during application rollback; destructive schema rollback is intentionally not part of the incident path. Remove them only in a later reviewed migration after old code is confirmed absent.

Run the production readiness scanner before merge and never expose service-role, internal, rate-limit, webhook, or bot secrets in Cloudflare Pages variables.
