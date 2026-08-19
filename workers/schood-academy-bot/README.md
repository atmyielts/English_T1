# Schood Academy Telegram bot

This Worker is the public webhook boundary for the Academy staff bot. It verifies Telegram's webhook secret and forwards the update to the permission-checking `academy-telegram` Edge Function. It intentionally does not hold the bot token or the Supabase service-role key.

## Product boundary

- Staff must link their existing Schood account before using the Mini App.
- Academy, branch, classroom, and guardian groups are connected with one-time, ten-minute links.
- The bot responds to explicit commands and approved actions. It does not read ordinary group conversation.
- Personal warnings, grades, payments, and individual attendance concerns are private-only.
- Academy Telegram operations are disabled by default per academy and must be enabled by an Academy administrator.

## Required provider configuration

Worker secrets: `SUPABASE_URL`, `ACADEMY_TELEGRAM_INTERNAL_SECRET`, `ACADEMY_TELEGRAM_WEBHOOK_SECRET`, and optional rotation-overlap `ACADEMY_TELEGRAM_WEBHOOK_SECRET_PREVIOUS`.

Supabase Edge secrets: `ACADEMY_TELEGRAM_BOT_TOKEN`, `ACADEMY_TELEGRAM_INTERNAL_SECRET`, and `ACADEMY_TELEGRAM_WEBHOOK_SECRET`. The public bot name, Academy URL, and Worker URL have safe production defaults and may be overridden with `ACADEMY_TELEGRAM_BOT_NAME`, `ACADEMY_SITE_URL`, and `ACADEMY_TELEGRAM_WORKER_URL`.

The first authenticated staff-link request verifies that the token belongs to `schoodacademybot`, then idempotently configures the webhook, Mini App menu, commands, name, and descriptions from inside the Edge runtime. This keeps the bot token inside Supabase. The local setup script is recovery tooling only and should not be used with a token copied into a command or log.

Use BotFather group privacy mode. Provider setup registers only explicit commands, the Mini App menu, and the webhook update types `message`, `callback_query`, and `my_chat_member`. Never place a token value in this repository or a command log.

## Verification

Run `npm --workspace workers/schood-academy-bot run check`, `npm run test:telegram`, and `npm run test:academy:edge`. Deploy the Worker and Edge Functions only after the migration is applied and provider secrets are configured.
