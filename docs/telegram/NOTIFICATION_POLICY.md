# Telegram notification policy

## Required path

Asynchronous user-facing Telegram messages must call `send-telegram`. Certificate, payment, academy automation, academy morning brief, and partner-voucher sends use this gateway. Direct Telegram API calls in bot Workers are conversational responses to the user's current update, not scheduled notifications.

## Categories

| Category | Examples | Default treatment |
|---|---|---|
| `transactional` | confirmed payment, enrollment, certificate, voucher | Preference-aware; no frequency cap or quiet-hour delay |
| `academic_required` | assignment, grade, class, attendance, teacher feedback | Preference-aware; no frequency cap; defer in quiet hours unless explicitly mandatory |
| `study_habit` | vocabulary, study plan, streak, optional recovery | Maximum two sent in a rolling 24 hours; defer in quiet hours |
| `commercial` | upgrade, promotion, demo follow-up | Opt-in; maximum two sent in seven days; defer in quiet hours |
| `system` | security and recovery | Mandatory path; not delayed by ordinary preference rules |

Callers may explicitly mark only system or transactional messages mandatory. A caller cannot use `mandatory` to bypass policy for marketing.

## Preferences

The Mini App writes, and the gateway enforces:

- global and Telegram channel enablement;
- academic-required, study-habit, and commercial categories;
- assignment, class, score/grade, payment, vocabulary, and certificate types;
- timezone and quiet-hour start/end.

Commercial delivery defaults off. Unknown or invalid timezones fall back to `Asia/Tashkent`. Quiet hours may cross midnight. A non-urgent candidate created during quiet hours is stored once with its next eligible delivery time.

## Evidence and retries

`platform_notifications` stores category, type, policy decision, suppression reason, scheduled time, attempts, claim token, CTA URL, Telegram message ID, error, and sent time. A unique dedupe key prevents two producers from creating two logical deliveries, and an atomic claim prevents two live queue consumers from sending the same row concurrently. Every deferred row is evaluated again against current preferences, quiet hours, and rolling caps before send. Stale claims are recoverable after five minutes.

Telegram `retry_after` is bounded and honored. Network and 5xx failures use bounded backoff; permanent 400/403 responses stop; all retryable failures stop after four attempts. The gateway provides effectively-once logical delivery, not exact-once transport: a crash after Telegram accepts a message but before the database acknowledgement may result in one duplicate when the stale claim is recovered.

Do not mix promotional copy into transactional or academic templates. Telegram does not expose a reliable message-open metric; use callbacks, Mini App opens, and downstream completion instead.

Morning briefs are generated against the UTC calendar day and deduped by academy, recipient, and UTC date. The schedule is UTC by design and does not promise a recipient-local morning or DST adjustment.
