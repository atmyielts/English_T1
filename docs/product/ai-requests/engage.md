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
- `streak.freeze` (10 credits, `assumed: true`) is in `credits.ts`. The pricing phase owns the number. Engage charges it with `ctx.repo.charge`, for adults only and once a week.

## 3. Delivery to Telegram and the web (for the coordinator)

All messages go through `ai_engage_outbox`. At most two a day per person across all bots, at their chosen hour, and never between 22:00 and 08:00 local time.

1. **Who is due.** The bots' cron calls `rpc('ai_engage_due_users', { p_now, p_limit })` with the service key.
   - It returns `{ user_id, chat_id }` once per person per local day, after their chosen hour and outside quiet hours.
   - The coach worker has a cron. The student bot (`workers/schood-bot`) needs `[triggers] crons = ["5 * * * *"]` and a `scheduled()` handler.
2. **Plan.** For each person, call `POST /schood-ai/engage/tick` with the worker headers. It queues at most two messages for their chosen hour, highest priority first:
   - check-ins before and after a dated goal;
   - streak at risk;
   - the comeback offer;
   - a journey behind schedule;
   - win-back on day 2, 7 and 21 of a lapse (three at most), with the person's real XP, best streak and chapter;
   - last week's league result;
   - the national mock.

   Certificate results and squad hellos are queued by their own actions and go through the same drain and budget.
3. **Drain.** Call `POST /schood-ai/engage/outbox` with `{ channel: 'telegram', bot: 'student' | 'coach_b1' | … }`.
   - Each due message is claimed once, then passes `ctx.notify.take`.
   - A refusal puts the message back until the next allowed moment, or drops it if it would be stale by then.
   - The response is `messages: [{ id, kind, text, buttons: [{ label, path }], claim }]`. Paths are relative to `https://ai.schood.online`.
4. **Acknowledge.** Call `POST /schood-ai/engage/outbox-ack` with `{ id, claim, status: 'sent' | 'failed' }` after `sendMessage`.
5. **Web:** people without a linked chat get the same messages in the in-app inbox (`GET engage/inbox`, shown on `/progress`). The inbox uses no push budget.

## 4. Requests to core

Answered by core and now used: area stores (`defineStore`, `ctx.store`) replaced engage's own service-role client, and `useCatalog` loads the engage page text (`i18n/pages.<locale>.ts`) with the pages. Engage adds 2.9 KB gzip to the main chunk (115.0 against 112.1 KB for core alone): the route table, nav icons and the page preload map.

1. **Public routes.** Please let a `RouteHandler` carry `public: true` and run without a user. Engage already marks `engage/passport-view` and `engage/verify` this way (`publicRoute` in `engage/mod.ts`), and neither uses who is asking.
   - Today the handler requires sign-in, so a shared Passport link and a certificate QR open only for signed-in viewers. Signed-out viewers see the sign-in state.
   - Suggested shape:
     - `ctx.user` is null on public routes;
     - no `ctx.ai`, no workspace;
     - a per-IP rate limit.
   - The coach agent will need the same for its certificate links.
2. **Learning events in the memory repository.** Engage's tables go through core's area store (`engageStore` in `engage/binding.ts`, `ctx.store`). Its memory twin taps the core memory repository's `addLearningEvents` to see events. Please add a read method, such as `learningEvents(userId, afterId)`, so the tap can go.
3. **Notification preferences.** Please add a route to set `ai_notify_prefs` (time zone, quiet hours). Engage keeps its own zone and hour in `ai_engage_profiles` and checks quiet hours as well as `ai_notify`. The stricter of the two wins.
4. **Non-AI credit spends.** Please bless `ctx.repo.charge` for a priced action that makes no model call (`streak.freeze`), or add `ctx.credits.spend(key, reference)`.
5. **Wording for the chat's daily-limit refusal.** The `engage.daily_limit` chat guard (`registerChatGuard`) refuses chats once the limit is reached. Core's chat shows `error.<code>`, and engage keeps its own keys under its prefix, so please add `error.daily_limit_reached`. Until then the chat shows the generic error. Suggested text:
   - en: "You reached your daily limit. Practice opens again tomorrow."
   - uz: "Kunlik chegaraga yetdingiz. Mashq ertaga yana ochiladi."
   - ru: "Дневной лимит достигнут. Практика снова откроется завтра."
6. **`retryAt` in the memory `notify`.** It reports "today 08:00" for a used-up day. Engage clamps it to the next local morning; Postgres is right already.

## 5. For the owner and operations

- **The talent pool is off.** It turns on when a Schood admin adds the switch `engage.talent_pool` = on in the admin console (core switches; this one stays off unless it is set). Employers are granted with `POST engage/talent-employer` by a Schood admin.
- **Sponsors** are set with `POST engage/event-sponsor`: name, https logo and prize text, by contract. No payment flow exists.
- **Certificate reviews** are at `/certificates/review` for Schood admins. A reviewer never marks their own sitting.
- **Account closure.** The 24 engage tables keyed on `user_id` are in `account_personal_erasure_tables()`, with the closed-account guard: the Passport, its links and items, samples, XP and days, league rows, sittings and certificates, journeys, goals, dates, squad memberships, the talent profile and the outbox among them.
  - `ai_engage_erase_account` (a service hook) hands an owned squad to the longest-standing member, or deletes it when nobody is left.
  - It also clears the person's id from the talent audit and from sponsor, centre-league, employer-grant and reviewer fields.
- **Audio** for samples and sittings is stored under `schood-ai/engage/` in the media bucket. Closure removes the rows, but the S3 objects need a lifecycle rule or a delete job for that prefix.
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
  "requiredSecrets": [],
  "rolloutOrder": [
    "pages",
    "migration:20261030800000_schood_ai_engage.sql",
    "function:schood-ai"
  ],
  "manualFollowUps": [
    "Pages: merging publishes schood-ai with the engage screens (progress, journeys, stories, league, squads, Skill Passport, certificates). No new Pages project or domain. Until the migration and function are deployed, these screens show the connection error state; the rest of the app is unchanged.",
    "Database: supabase db push --linked applies 20261030800000_schood_ai_engage.sql after core's migrations (additive ai_engage_* tables with RLS on and no browser grants; SECURITY DEFINER functions for ingest, leagues, freezes, journeys, squads, outbox, due users and boards; 24 tables added to account_personal_erasure_tables(); ai_engage_erase_account registered in account_erasure_service_hooks(); pg_cron jobs ai-engage-ingest-v1 at 4-59/5 * * * * and ai-engage-prune-v1 at 53 3 * * *). It touches no existing table. Keep the pending #220 payment migrations excluded, as for core.",
    "Function: supabase functions deploy schood-ai --project-ref <prod> (engage routes, the engage_memory and engage_progress context providers, and the engage.daily_limit chat guard). No new secret: engage uses core's service-role client and the existing media storage settings.",
    "Talent pool stays off: do not add the engage.talent_pool switch in the admin console until the owner decides.",
    "Media: add an S3 lifecycle rule or delete job for the schood-ai/engage/ prefix (sample and sitting audio of closed accounts)."
  ],
  "verification": [
    "supabase migration list --linked shows 20261030800000 applied.",
    "select jobname, schedule from cron.job where jobname in ('ai-engage-ingest-v1', 'ai-engage-prune-v1') returns two rows.",
    "select public.account_erasure_service_hooks() includes ai_engage_erase_account; select public.account_personal_erasure_tables() includes the ai_engage_* user tables.",
    "On ai.schood.online as a beta tester: /progress shows 0 XP before practice and counts a scored coach answer within five minutes; /passport opens; /certificates lists the four exams as test sittings.",
    "select count(*) from public.ai_engage_outbox where channel = 'telegram' and status = 'sent' stays 0 until a bot drains the outbox (no bot is wired in this release)."
  ],
  "rollback": {
    "pages": "Cloudflare Pages: roll schood-ai back to the previous deployment; the engage screens are additive.",
    "migration": "Additive and isolated: leave the ai_engage_* tables. To stop the jobs, select cron.unschedule('ai-engage-ingest-v1') and cron.unschedule('ai-engage-prune-v1').",
    "function": "Redeploy the previous schood-ai function; engage routes then answer not_found, and the chat guard and context providers are gone."
  }
}
```
