# Schood Academy Telegram bot

This Worker is the public webhook boundary for the Academy staff bot. It verifies Telegram's webhook secret and forwards the update to the permission-checking `academy-telegram` Edge Function. It intentionally does not hold the bot token or the Supabase service-role key.

## Product boundary

- Staff must link their existing Schood account before using the Mini App.
- Academy, branch, classroom, and guardian groups are connected with one-time, ten-minute links.
- The bot responds to explicit commands and approved actions. It does not read ordinary group conversation.
- Personal warnings, grades, payments, and individual attendance concerns are private-only.
- Academy Telegram operations are disabled by default per academy and must be enabled by an Academy administrator.

## Required provider configuration

Worker secrets: `SUPABASE_URL`, `TELEGRAM_INTERNAL_SECRET`, `WEBHOOK_SECRET`, and optional rotation-overlap `WEBHOOK_SECRET_PREVIOUS`.

Supabase Edge secrets: `ACADEMY_TELEGRAM_BOT_TOKEN`, `ACADEMY_TELEGRAM_BOT_NAME`, `ACADEMY_SITE_URL`, and the shared `TELEGRAM_INTERNAL_SECRET`.

Use BotFather group privacy mode. The setup script registers only explicit commands, the Mini App menu, and the webhook update types `message`, `callback_query`, and `my_chat_member`. Never place a token value in this repository or a command log.

## Verification

Run `npm --workspace workers/schood-academy-bot run check`, `npm run test:telegram`, and `npm run test:academy:edge`. Deploy the Worker and Edge Functions only after the migration is applied and provider secrets are configured.
