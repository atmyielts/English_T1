# Telegram analytics events

## Journey events

`telegram_journey_events` records outcome-bearing funnel events with optional idempotency keys:

- `telegram_start`
- `telegram_funnel_started`
- `telegram_funnel_step_completed`
- `diagnostic_started`
- `diagnostic_completed`
- `first_value_action_completed`
- `account_link_started`
- `account_linked`
- `mini_app_opened_from_telegram`
- `academy_lead_created`

The session itself carries `trial_started_at`, `checkout_started_at`, and `converted_at`. Sales-lead transitions populate trial and paid conversion milestones. Existing `telegram_app_events` continues to record authenticated Mini App actions such as assignment submission, vocabulary review, preference updates, and support creation.

## Attribution

Acquisition sessions store source, medium, campaign, creative, offer, funnel, role hint, deep-link payload, referrer code, original attribution, and latest attribution. `telegram_acquisition_touches` retains subsequent campaign touches without destroying the original source.

## Reports

- `telegram_acquisition_funnel_metrics`: starts, diagnostic starts/completions, first value, linked accounts, Mini App opens, trials, checkouts, and conversions by day and attribution.
- `sales_lead_funnel_metrics`: lead, contacted, qualified, demo, trial, paid, median response seconds, and contacted-within-SLA.
- `telegram_notification_effectiveness`: candidate, sent, suppressed, failed, and deferred counts by category and type.

These views intentionally do not report Telegram message opens. CTA clicks require a Schood-owned tracked redirect or Mini App callback; until that is used by a CTA, downstream Mini App and conversion actions are the reliable measure.
