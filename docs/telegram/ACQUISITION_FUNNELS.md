# Telegram acquisition funnels

## Deep-link format

Telegram payloads use URL-safe letters, numbers, `_`, and `-`, with a maximum of 64 characters.

Examples:

```text
ielts_aug_instagram_reel17
academy_meta_aug26
course_b2_partner_launch
referral_PARTNER42
```

The first token selects an allow-listed funnel. Known source tokens derive `source` and `medium`; the complete payload remains the campaign identifier. Unknown valid payloads enter the generic chooser and cannot become arbitrary application routes.

## Student first-win

```text
campaign deep link
-> target IELTS score
-> exam window
-> three real AWL vocabulary questions
-> actual 0-3 result and missed words
-> seven-day vocabulary/reading starter plan
-> contextual account link to save the plan
-> exact vocabulary Mini App route
```

The result is explicitly a vocabulary readiness check, not an IELTS band estimate. Its score and plan are deterministic from submitted answers. Returning linked students are directed to today's work in `@schoodstudentbot` instead of being restarted.

## Academy acquisition

```text
academy campaign deep link
-> Academy OS value proposition
-> academy name
-> phone, email, or Telegram contact
-> student-count range
-> priority capability
-> preferred follow-up channel
-> dedicated SalesLead
-> Academy OS and demo actions
```

The lead is not a support ticket. It has attribution, a four-hour SLA, an explicit owner field, lifecycle timestamps, activity history and conversion linkage. Ownership remains visibly unassigned until an operator or later business rule assigns it.

Lifecycle: `new -> contacted -> qualified -> demo_scheduled -> trial -> paid`, with `lost` as an exit. Database triggers timestamp and audit every status transition and copy trial/paid milestones to the acquisition session.

## Session and resumption rules

- One active session exists per bot and Telegram user.
- `last_step` and validated state permit resumption after interruption.
- Sessions expire after 30 days.
- `/cancel` ends the current session.
- Invalid or repeated callbacks return a conflict and do not change state.
- A link token is 15-minute, single-use, and optionally bound to both the Telegram user and acquisition session.
- Original attribution is never replaced; subsequent payloads create touches and update latest attribution.
- A focused payload for a different funnel supersedes the interrupted session and starts a clean journey, so `/academy` cannot inherit a half-finished student diagnostic (or vice versa).
- A linked student is routed to the private student bot unless the new intent is explicitly the academy funnel.
