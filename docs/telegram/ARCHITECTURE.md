# Telegram architecture

## Product boundary

- The website is for exploration.
- The Mini App is for authenticated work.
- A bot tells the user what matters now and provides the narrowest useful action.

## Runtime map

| Surface | Runtime | Responsibility |
|---|---|---|
| `@schoodonlinebot` | `workers/schood-online-bot` | Anonymous acquisition, campaign routing, IELTS vocabulary first-win, academy qualification |
| `@schoodstudentbot` | `workers/schood-bot` | Linked-student commands and a contextual daily home |
| Public Mini App | `/telegram/discover`, `telegram-public` | Public discovery/support and authenticated Worker funnel API |
| Student Mini App | `/telegram`, `telegram-app` | Telegram initData verification, linked identity, student work and preferences |
| Notification gateway | `send-telegram` | Policy, dedupe, quiet-hour deferral, caps, Telegram delivery and delivery evidence |
| Academy automation | `academy` plus `invoke_academy_worker` | Required reminders, at-risk detection, queue dispatch and morning briefs |

Both Workers require Telegram's webhook secret. They claim `update_id` in `telegram_update_receipts` before side effects and acknowledge Telegram only after processing reaches a terminal database state. Worker-to-Edge calls use the separately rotatable internal Worker secret. Conversational bot replies stay in the bot Worker; asynchronous notifications must use `send-telegram`.

## Data flow

1. A deep link opens `@schoodonlinebot` with a validated 1-64 character payload.
2. `telegram-public` creates or resumes one active acquisition session per bot and Telegram user.
3. The original attribution is immutable; later `/start` payloads update latest attribution and add a touch.
4. The backend state machine validates every transition and stores `last_step` plus `journey_state`.
5. Link tokens can be bound to the acquisition session and its Telegram user. The database consumes them atomically.
6. The student Mini App validates initData, maps Telegram to a Schood user, and validates requested resources against that user's dashboard.
7. Domain senders submit candidates to the gateway. The gateway records why each candidate was sent, deferred, suppressed, skipped, or failed.

## Lifecycle derivation

The private bot does not rely on a broad persisted role state. It derives the highest-priority next action from current records:

1. overdue assignment;
2. assignment due within 48 hours;
3. vocabulary due, including difficult-card context and time estimate;
4. recent weak result;
5. clear state with a short practice action.

The shared context model also supports payment block, upcoming class, active learning, completion and recovery inputs as those domain sources become available.

## Failure handling

- A unique `(bot_name, telegram_update_id)` receipt, lease, and claim token make database business effects effectively once. A failed or stale claim can be reclaimed, while a completed update is ignored.
- Telegram message delivery is at-least-once at the transport boundary. If a Worker or Edge Function loses its response after Telegram accepted `sendMessage` but before the database acknowledgement, a replay can produce a duplicate message. Database effects remain deduped; exact-once Telegram delivery is not claimed.
- Funnel updates compare the stored previous step, so repeated or out-of-order callbacks cannot advance state.
- Notification dedupe keys reserve a candidate before external delivery.
- Telegram 429 responses are queued using bounded `retry_after`; network and 5xx failures use bounded backoff, permanent 400/403 failures stop, and all retryable failures stop after four attempts.
- Deferred messages retain one delivery record and are processed by the gateway queue.
- Errors log structured event names and bounded reasons, not tokens, initData, or full personal payloads.
