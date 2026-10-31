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

### 1. Selling the coach pass and Coach Team seats (answered by pricing)

**Done (phase 5).** The six passes (29,000 / 30 days) and Coach Team plans (5, 10 and 20 seats at
39,000 a seat) are products in migration `20261030500000`; the coach reads the pass ids from
`packages/ai-core/src/catalog.ts` (`SCHOOD_AI_COACH_PASS_PRODUCT_IDS` only adds more). A paid team
order is set up by its buyer on `/pricing/done` (`pricing/team-setup` creates the `coach_teams` row,
source `order`, or extends a team they manage). The bot paywall links to `/pricing?coach=<feature>`.
Still open: Telegram Stars [VERIFY], an owner decision.


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

## Packs

From the coach packs build (phase 7, branch `claude/ai-coach-packs`: B3 Admission Maths,
B4 Sales, B5 Career and Interview, B6 Public Speaking). The engine additions they needed
live in the coach area (packages/coach-packs, the `coach` area, its Mini App screens and
migration `20261030700000`). Two things touch core or other services.

### 1. A `script` coach action in the price table (done additively; please confirm)

**Need.** The B4 script builder makes one structured document per call (a call script and
an objection map) and must show its cost first.

**Done.** `COACH_ACTIONS` in `packages/ai-core/src/credits.ts` gained `script`, so
`coach_b1.script` … `coach_b6.script` exist at 5 credits, premium tier, `assumed: true`
(priced as a lesson plan, the closest row). Only B4 uses it. Nothing else in the table
changed.

**Ask.** Core keeps or reprices the row; the owner confirms the price with the others.

### 2. Reading the Admission bank (cross-service; owner decision)

**Need.** The doc wants B3's daily sets from the subject-core topic graph *and the
Admission bank*. The graph is used. The bank is approved item versions in Assessment Cloud
(`assessment_item_versions` for the Schood content tenant), read today only by the
`admission` function with its own service role and tenant setting. The admission service
is switched off until content exists, so the bank is empty in production.

**Now.** B3 serves its own 297 verified problems, each tagged with a subject-core topic
code, so Admission items can be added later without changing the engine.

**Ask.** A read path for approved Admission items by topic code and question language,
with their keys, for service callers (an `admission` route, or permission for the coach
store to read the same rows the admission repository reads). The coach would then deal
bank items into the same sessions (`<source>#<item id>` refs).

### Not needed from core

- Under-18s on public boards: the percentile is shown only to the learner it is about and
  there is no public board. A future public board must use `requireAdult`.
- Age, consent and retention: coach scripts are personal rows in the erasure registry; the
  cohort histogram returns counts only.
