# Engage (E1–E14): seams and requests

The lifetime engagement layer lives in `supabase/functions/schood-ai/engage/` (function), `apps/schood-ai/src/engage/` (app) and `supabase/migrations/20261030800000_schood_ai_engage.sql`. This page lists what the other areas and the coordinator wire up, and what engage asks of core. Read it with `docs/product/44_SCHOOD_AI.md` and the two `CONTRACT.md` files.

## 1. How engage counts learning

- Engage reads `ai_learning_events` only. Every area keeps calling `ctx.events.emit(...)`; nothing else is needed for XP, streaks, leagues, quests, squads, tournaments or journeys.
- **XP per event** (`engage/rules.ts` `eventXp`, and the same rule in SQL `ai_engage_event_xp`):
  - verified kinds earn a base (`turn_scored` 5, `check_passed` 5, `drill_finished` 10, `mock_finished` 30, `outcome_recorded` 50) plus 2 per verified minute, up to 30 minutes per event;
  - unverified kinds (`check_failed`, `lesson_viewed`, `goal_set`) earn nothing;
  - at most 600 XP a day from learning.
- **When it is counted:** on the person's next engage request, for the people a squad or league screen shows, and every five minutes by `ai-engage-ingest-v1` (pg_cron, `ai_engage_ingest_pending`). Each event is counted once (`ai_engage_xp.event_id` is unique).

## 2. Seams for the neighbour areas

### Every area that teaches

- **Skill ids** follow `<domain>.<skill>[.<node>]`. Journeys match on the prefix, so a chapter task with `skill: 'ielts.speaking'` counts any `ielts.speaking.*` event. The prefixes the three journeys use:
  - IELTS (`B1`, `L3`, `L11`): `ielts.speaking`, `ielts.listening`, `ielts.reading`, `ielts.writing`, `ielts.vocabulary`, `ielts.grammar`; mocks are `mock_finished` events.
  - Sales (`B4`): `sales.script`, `sales.prospecting`, `sales.cold_call`, `sales.discovery`, `sales.pitch`, `sales.objection`, `sales.closing`, `sales.follow`, `sales.dm`, `sales.negotiation`; full calls with a scorecard are `mock_finished` or `turn_scored`.
  - Speaking (`B2`, `B6`, `L13`): `speaking.roleplay`, `speaking.pronunciation`, `speaking.public`.
- **Lifetime-path outcomes:** an `outcome_recorded` event closes the matching goal and makes the next one ready. Goals listen for:
  - `B1`/`L4`/`E10` with skill `ielts…`;
  - `B3` (admission);
  - `L8` (essays);
  - `L12`/`B5` with skill `interview.visa…`;
  - `B5` with skill `career…`;
  - `B6`.
- **Scores for tournaments:** send `score` either as a band (0–9), which is put on a 0–100 scale, or as 0–100.
- **The weekly national mock:** a `mock_finished` event with `ref: 'national_mock:<Monday YYYY-MM-DD>:<exam>'` and a `score`. The IELTS Coach's weekly mock should set it.

### Learner area (L-features, P1)

- **Duels (L17):** emit `check_passed` or `turn_scored` with `feature: 'L17'` and `outcome: 'win' | 'loss' | 'draw'`. Duels then show in the squad feed and count towards the squad goal.
- **Then-vs-now samples:** after L3, L4 or L12 scores something, call `recordSample(ctx, { kind: 'voice' | 'writing', sourceRef, audio? | storage?, text?, transcript?, durationMs?, scores, promptKey?, feature })` from `engage/mod.ts`.
  - It stores the audio through the shared media helper, or a reference you already stored.
  - A repeated `sourceRef` is ignored.
- **Parent brief (P1):**
  - `engageUsageFor(ctx, childUserId, days)` returns minutes, verified activity, the streak and days the limit was reached. It returns no content.
  - `setChildDailyLimit(ctx, childUserId, minutes | null)` sets a limit the child cannot change.
  - Check the parent–child link before calling either; engage does not know it.
- **Daily time limit:** `dailyLimitState(ctx)` returns `{ limitMinutes, minutesToday, reached }`. Please refuse new practice when `reached` is true, as engage's own screens do.
  - Chats are covered already: engage's chat guard `engage.daily_limit` refuses every `core/chat` turn with `daily_limit_reached` (403, `limit_minutes`) once the limit is reached, before anything is charged.

### Coach engine (B1–B6)

- `registerPassportSource('coach', (ctx, userId) => items)`: `coach_certificates` and mastery levels for the Skill Passport. Each item has `{ kind: 'certificate' | 'level' | 'result', ref, title, data, verifyUrl, verified, issuedAt }`.
- `registerSampleSource('coach', (ctx, { userId, ref, ttlSeconds }) => url)`: a short-lived playback URL for a voice clip you recorded with `recordSample(ctx, { kind: 'voice', sourceRef: ref })`.
- **Context:** every chat can read `engage_memory` (dated goals, weak spot, journey chapter) and `engage_progress` (streak, league, quests left). Both are `selfView` providers.
- **Telegram first step:** `engage/state`, `stories`, `story`, `story-answer`, `memory`, `date-add`, `league`, `squad` and `events` accept the worker (`service: true`).

### Pricing

- `registerSittingSource((ctx, userId) => [{ ref, examKey | null, expiresAt }])` lists the certificate-exam sittings a person bought (79,000 UZS per sitting `[ASSUMPTION]`).
  - One `ref` is one sitting; it is enforced by a unique column.
  - Until a source is registered, only beta testers sit test exams, and their certificates say "test".
- `registerOfferSource((ctx, { userId, moment }) => offer | null)` supplies the honest offer shown at a graduation or a closed goal (Plus Annual). Its title and terms carry the real price.
  - Engage never shows a price or a discount itself.
  - People dismiss an offer in one tap, or mute all offers in settings.
- `streak.freeze` (10 credits, `assumed: true`, `adultsOnly`) is in `credits.ts`. The pricing phase owns the number. Engage buys it with `ctx.credits.spend`, once a week; core refuses anyone an age source does not confirm as an adult. Engage's date of birth is the age source `engage.birth_date`.

## 3. Delivery: scheduled jobs and core's notifications

Core's scheduler runs engage's work: pg_cron calls `core/system-tick` every five minutes, and the jobs are registered with `registerSystemJob` in `engage/system.ts`. There is nothing to schedule or wire by hand, and no bot drains anything.

| Job | When | What it does |
|---|---|---|
| `engage.plan` | every 5 minutes | Plans the day for each person whose preferred hour has come (core's notification preferences, 19:00 when none is set; `ai_engage_due_users`). It queues at most two messages, highest priority first, never a kind they muted. See the list below. Each person is planned once a local day, 150 a run. |
| `engage.deliver` | every 5 minutes | Claims due Telegram messages across everyone (`ai_engage_outbox_claim_due`) and sends each with `ctx.notify.send`. See the outcomes below. |
| `engage.league_rollover` | daily 01:10 Tashkent | Settles every finished league week once, even if nobody opens a league. Weeks end Monday 00:00 Tashkent. |
| `engage.media_sweep` | daily 04:20 Tashkent | Deletes the audio of closed accounts, pruned samples and sittings (section 5). |

What `engage.plan` can queue:
- check-ins before and after a dated goal;
- streak at risk;
- the comeback offer;
- a journey behind schedule;
- win-back on lapse days 2, 7 and 21, Telegram only;
- last week's league result;
- the national mock.

How `engage.deliver` handles core's answer:
- **Later** (quiet hours or the daily limit): the message is put back until then, or dropped if it would be stale by then.
- **No Telegram** (`delivery_off`, `no_telegram`): it moves to the in-app inbox, if the person gets messages there.
- **Deferred:** counts as sent, because the Schood bot keeps it for the person's delivery time.
- **Failed:** tried again after 15 minutes, three times at most.
- **Muted or suppressed:** dropped.
- Every send carries the dedupe key `engage:<key>`, so a retried run never sends twice.

**Why the outbox stays.** `ai_engage_outbox` is the planner's queue, not a bot drain. `ctx.notify.send` delivers one message now; it does not choose between messages or hold them. The outbox:
- picks the day's two by priority;
- keeps dedupe keys across days;
- lets a message expire, since a check-in is pointless the next day;
- holds squad nudges and certificate results queued by actions;
- remembers core's "later" time;
- is the in-app inbox.

The bot-drained `tick`, `outbox` and `outbox-ack` routes and their acknowledgement are gone. Nothing reaches Telegram except through `ctx.notify.send`.

**Kinds** registered with `registerNotifyKind` (Settings → Notifications lists them, and muting `engage` mutes them all):
- `engage.checkin`
- `engage.streak`
- `engage.journey`
- `engage.winback`
- `engage.squad`
- `engage.league`
- `engage.events`
- `engage.certificate`

**Preferences** are core's (`core/notify-prefs`): time zone, quiet hours, messages a day, preferred hour, delivery and mutes.
- Engage reads them for local days (the SQL ingest reads `ai_notify_prefs.time_zone`) and for planning.
- Engage's settings page links to them.

**Web:** people who chose the in-app inbox, or have no linked chat, get the same messages in `GET engage/inbox` (shown on `/progress`). The inbox uses no push budget.

## 4. Requests to core: all answered

Every request is answered by core and now used. The workarounds are gone.

- **Area stores** (`defineStore`, `ctx.store`): `engageStore` in `engage/binding.ts`, over core's service-role client.
- **Learning events in the memory repository** (`learningEvents`): the memory repository reads them as Postgres reads `ai_learning_events`. The `addLearningEvents` patch is gone.
- **Anonymous routes:**
  - `engage/passport-view`, `engage/passport-sample` (link playback) and `engage/verify` open without signing in and show only what the person chose to share.
  - A live link or a real certificate has its own budget (`rateKey`).
  - Made-up tokens and codes stay limited per IP. Certificate codes are limited at 20 a minute (`unkeyedLimit`).
- **Notification preferences** (`core/notify-prefs`): see section 3. Engage's own zone, hour and message columns are dropped.
- **Non-AI credit spend** (`ctx.credits.spend`): the streak freeze. `streak.freeze` is `adultsOnly`, and engage registers the age source `engage.birth_date`.
- **Chat refusal wording:** core's `error.daily_limit_reached`, for the `engage.daily_limit` chat guard.
- **Scheduled work and Telegram delivery** (`registerSystemJob`, `ctx.notify.send`): see section 3.
- **Lazy catalogs, named icons and lazy home cards:** engage adds 2.4 KB gzip to the main chunk (115.3 against 112.9 KB for core alone). That is the 23-route table and its page loaders.

## 5. For the owner and operations

- **The talent pool is off.** It turns on when a Schood admin adds the switch `engage.talent_pool` = on in the admin console (core switches; this one stays off unless it is set). Employers are granted with `POST engage/talent-employer` by a Schood admin.
- **Sponsors** are set with `POST engage/event-sponsor`: name, https logo and prize text, by contract. No payment flow exists.
- **Certificate reviews** are at `/certificates/review` for Schood admins. A reviewer never marks their own sitting.
- **Account closure.** The 24 engage tables keyed on `user_id` are in `account_personal_erasure_tables()`, with the closed-account guard: the Passport, its links and items, samples, XP and days, league rows, sittings and certificates, journeys, goals, dates, squad memberships, the talent profile and the outbox among them.
  - `ai_engage_erase_account` (a service hook) hands an owned squad to the longest-standing member, or deletes it when nobody is left.
  - It also clears the person's id from the talent audit and from sponsor, centre-league, employer-grant and reviewer fields.
- **Audio** for samples and sittings is stored under `schood-ai/engage/` in the media bucket.
  - When the rows go, delete triggers on `ai_engage_samples` and `ai_engage_sittings` queue the objects in `ai_engage_media_trash`. That happens on account closure (through the registry) and when deleted samples are pruned after 7 days.
  - `engage.media_sweep` deletes the objects through `_shared/media-storage.ts` (`deleteStorageRef`).
  - Audio another area stored and engage only references is never queued.
  - A delete that keeps failing stays in the table after 20 attempts, with its last error: `select * from ai_engage_media_trash where attempts >= 20`.
- **Decisions marked `[ASSUMPTION]` in code:**
  - E-feature plan rules in `plans.ts`;
  - `story.episode` 3 credits;
  - `streak.freeze` 10 credits;
  - 600 XP a day;
  - one freeze per 250 XP, two held;
  - "enough today" after 60 verified minutes or 40 activities, or 45 minutes in one session;
  - win-back on days 2, 7 and 21;
  - season badges at 1,000, 3,000 and 6,000 XP;
  - default reminder hour 19:00;
  - tournaments on the 8th–21st;
  - the national mock from Saturday 10:00 to Sunday 22:00;
  - the certificate pass marks (70% of items, 60% of the rubric).

## 6. Release manifest for this PR (for the coordinator)

- **Why:** CI's release manifest check compares `release/manifest.json` with the diff against `claude/ai-core`. This PR does not edit that file, as the brief asks, so the `checks` job fails on it (as on the learner PR).
- **Check:** the manifest below passes `node scripts/verify-release-manifest.mjs --base origin/claude/ai-core --manifest <file>`.
- **Merge:** fold it into the release manifest when this area merges into core.

```json
{
  "schemaVersion": 1,
  "releaseId": "schood-ai-engage-oct30",
  "status": "code_ready",
  "backwardCompatible": true,
  "frontends": ["schood-ai"],
  "migrations": ["20261030800000_schood_ai_engage.sql"],
  "edgeFunctions": ["schood-ai"],
  "workers": [],
  "sharedEdgeConsumers": ["schood-ai"],
  "requiredSecrets": [],
  "rolloutOrder": [
    "pages",
    "migration:20261030800000_schood_ai_engage.sql",
    "function:schood-ai"
  ],
  "manualFollowUps": [
    "Pages: merging publishes schood-ai with the engage screens (progress, journeys, stories, league, squads, Skill Passport, certificates, shared Passport links and certificate checks that open without signing in). No new Pages project or domain. Until the migration and function are deployed, these screens show the connection error state; the rest of the app is unchanged.",
    "Database: supabase db push --linked applies 20261030800000_schood_ai_engage.sql after core's migrations (additive ai_engage_* tables with RLS on and no browser grants; SECURITY DEFINER functions for ingest, leagues, freezes, journeys, squads, the outbox claims, due people from ai_notify_prefs, boards and the audio queue; 24 tables added to account_personal_erasure_tables(); ai_engage_erase_account registered in account_erasure_service_hooks(); delete triggers on ai_engage_samples and ai_engage_sittings that queue engage audio for deletion; pg_cron jobs ai-engage-ingest-v1 at 4-59/5 * * * * and ai-engage-prune-v1 at 53 3 * * *). It touches no existing table. Keep the pending #220 payment migrations excluded, as for core.",
    "Function: supabase functions deploy schood-ai --project-ref <prod>. It carries the engage routes (three anonymous: passport-view, passport-sample, verify), the engage.plan, engage.deliver, engage.league_rollover and engage.media_sweep jobs that core's scheduler runs (schood-ai-system-tick-v1), the notification kinds, the age source, the context providers and the engage.daily_limit chat guard. No new secret: engage uses core's service-role client, core's notify.send and the existing media storage settings. _shared/media-storage.ts gains one export (deleteStorageRef) and no other function changes, so no other function needs a redeploy.",
    "Talent pool stays off: do not add the engage.talent_pool switch in the admin console until the owner decides."
  ],
  "verification": [
    "supabase migration list --linked shows 20261030800000 applied.",
    "select jobname, schedule from cron.job where jobname in ('ai-engage-ingest-v1', 'ai-engage-prune-v1') returns two rows.",
    "select job, last_status, failures from public.ai_system_runs where job like 'engage.%' shows engage.plan and engage.deliver running every five minutes with last_status ok.",
    "select public.account_erasure_service_hooks() includes ai_engage_erase_account; select public.account_personal_erasure_tables() includes the ai_engage_* user tables.",
    "On ai.schood.online as a beta tester: /progress shows 0 XP before practice and counts a scored coach answer within five minutes; Settings → Notifications lists the engage kinds; a shared Passport link opens in a private window without signing in."
  ],
  "rollback": {
    "pages": "Cloudflare Pages: roll schood-ai back to the previous deployment; the engage screens are additive.",
    "migration": "Additive and isolated: leave the ai_engage_* tables. To stop the jobs, select cron.unschedule('ai-engage-ingest-v1') and cron.unschedule('ai-engage-prune-v1').",
    "function": "Redeploy the previous schood-ai function; engage routes then answer not_found, the engage jobs are no longer registered (core's scheduler skips them), and the chat guard and context providers are gone."
  }
}
```
