# Coach area: requests to Schood AI core

From the Schood Coaches build (phase 6, branch `claude/ai-coach`). Core files belong to
the core agent. Each workaround below lives inside the coach area and is small enough to
remove once core offers the feature.

## Done by core (in use)

| Request | Core feature | How the coach area uses it |
|---|---|---|
| Routes for the worker with no signed-in person (the reminder cron) | `system: true` routes (`21f363b2`) | `coach/system-due`, `coach/system-delivered`. The temporary `schood-coach-gate` function was removed. |
| A public certificate check | `anonymous` routes (`21f363b2`) | `coach/verify`, 20 a minute and 500 a day per visitor. |
| People's own notification choices | `core/notify-prefs` and `registerNotifyKind` (`21f363b2`) | One kind per coach (`coach.<pack>`). Reminders follow Telegram delivery, muted kinds or areas, quiet hours and the shared budget. |
| Area tables without core edits | `defineStore` / `ctx.store` (`df67cabb`) | `coachStore`, `coachServices`. |
| Erasing coach data when an account closes | `account_personal_erasure_tables()` and `account_erasure_service_hooks()` | 12 personal tables, plus `coach_erase_account` for teams and invites (`20261030600100`). |
| A Mini App session in the shared auth client | `registerSessionSource`, `auth` from `src/core/session.ts` | `apps/schood-ai/src/coach/telegram.ts`. |
| Credits for a pass or a team seat | Plan sources return `credits: { monthly, anchor }` (`26e45c69`) | `coach-pass` and `coach-team` return the coach's monthly credits from the pass or seat start, with none for Plus or Family. The area's own top-up was removed. |
| A session for a verified Telegram user | `ctx.auth.sessionFor` (`26e45c69`) | `coach/miniapp-session`, reason `coach.miniapp`. The area's admin auth client was removed. |
| Lazy first download | Named nav icons, lazy home cards (`1b49e886`) | `apps/schood-ai/src/coach/icons.ts`, `HomeCard.tsx`. |

## Open

### 1. Selling the coach pass and Coach Team seats

**Need.** The product doc prices a coach pass at 29,000 / 30 days and includes all six
coaches in Plus and Plus Family. The coach reads pass product ids from
`SCHOOD_AI_COACH_PASS_PRODUCT_IDS` and is ready for them. Seats are granted by Schood admins
(`coach/team-create`).

**Ask.**
- Checkout products for the B1–B6 passes and for team seats, in core's payments.
- A decision on Telegram Stars [VERIFY]: whether passes are also sold in the bot, and
  through which payment path.
- Self-serve seat purchase for companies.

### 2. Speech routes

**Need.** Voice answers need a speech-to-text route (`stt`, with word timestamps for the
fluency numbers), and the persona's voice needs text-to-speech (`tts`). Until both exist
in the model registry, `ctx.ai.transcribe` and `ctx.ai.speak` return `ai_unavailable`. The
coaches then say voice is not available yet and run every feature in text.

**Ask.** The owner chooses a provider and adds the routes through the admin registry. No
code change is needed.

## Not needed from core

- Reminder scheduling: the worker's own cron calls the system routes, because only the
  worker holds the bot tokens. No pg_cron job is added for coaches.
- `guard(ctx)` on `registerSpecialist`: the coaches register no specialist.
