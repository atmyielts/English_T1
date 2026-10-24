# Schood English: operator map

One page for running Schood English alone. Learner app: `apps/english-hub` at https://english.schood.online (skills are paths: `/reading`, `/writing`, ... `/tutor`). Old skill subdomains (`reading.english.schood.online` etc.) 301 to those paths via `cloudflare/english-legacy-redirects.js`. Operator UI: https://schood.online/admin/english (tabs Overview, Content, Ops, Rules, **Control center**).

## Edge functions

| Function | Status | What it does |
|---|---|---|
| `hub` | active | Learner router: today/catalog/progress, access, review, XP/leagues, goal, certificates, reminders, Telegram quiz, word lookup (`/word`), 18 `/ai/*` tools + `/insights/coach-summary` |
| `reading-articles`, `listening-content`, `writing-workbench`, `speaking-studio`, `grammar-remediation`, `vocabulary-notebook`, `immersion-missions` | active | One per skill: list, open and submit activities (each submit passes `guardActivity`) |
| `me` | active | Account + entitlements for the learner app |
| `admin-english-content` | active | Content Studio (list/edit/publish, `/content/draft` AI drafting) |
| `admin-english-ops` | active | Rules, ops dashboard, and the control center: `/control`, `/ai-usage`, `/learner` |
| `admin-language-config` | **orphaned** | No UI calls it. Leave deployed; do not build on it |
| `speaking-coach`, `writing-tutor` | **legacy (platform)** | Older AI coaching pages on schood.online (`SpeakingCoachPage`, `useAiCoaching`). Not used by the English app; own allowance, not the English AI gateway |
| `vocab-drill` | **legacy (platform)** | `VocabDrillPage` on schood.online and the @schoodonlinebot funnel. Duplicates the English vocabulary skill |
| `grade-writing` / `grade-writing-v2` | **exam, duplicate** | IELTS/SAT/iTEP simulator writing grading. v2 is current; v1 kept for old clients. Not English |
| `ielts-practice`, `sat-practice`, `academy` (`_shared/ielts-ai.ts`, `_shared/sat-ai.ts`) | exam/other | Their own AI paths (OpenRouter). Not controlled by the English switches |

## Where each switch lives

| Switch | Where | Default |
|---|---|---|
| Pause a skill or the AI tutor | Control center → Services (`english_service_settings.services`) | all on |
| Free activities per day (learners without the skill) | Control center → Free tier (`free_activities_per_day`) | 1 |
| All English AI on/off | Control center → AI (`ai.enabled`) | on |
| One AI feature on/off | Control center → AI features (`ai.features["<feature>"]`) | on |
| AI credits per learner per UTC day | Control center → AI (`ai.daily_limit`; env `ENGLISH_AI_DAILY_LIMIT` is only the fallback) | 30 |
| New word meanings per learner day | Control center → AI (`ai.word_lookup_daily_limit`) | 60 |
| Provider / model / fallback | Supabase secrets `ENGLISH_AI_PROVIDER`, `ENGLISH_AI_MODEL`, `ENGLISH_AI_FALLBACK` + the provider key (shown read-only in the control center) | openai, gpt-4o-mini, openrouter |
| Learning rules (handoffs, thresholds) | Admin → English → Rules (`admin-english-ops /rules`) | seeded |
| Prices / plans | Admin billing (never in this page) | — |

Settings are cached ~60 s per function instance, so a change reaches everyone within about a minute. If the table is missing or unreadable, functions use the defaults above (learners are never blocked by a settings problem).

## AI

- Every English AI call goes through `_shared/english-ai.ts` (`callEnglishAIWithStatus`) with a `feature` name and `userId`. Switched off → callers get status `unconfigured` and show their basic (non-AI) feedback.
- Every call (and every refusal) is logged to `english_ai_calls`: feature, learner id, provider, model, status (`ok`/`failed`/`unconfigured`/`disabled`/`over_limit`), latency, sizes, token counts. No prompt or answer text. Rows older than 120 days are pruned daily (pg_cron `english-ai-calls-prune-v1`).
- Learner credits: `_shared/english-ai-quota.ts`. One credit per AI answer from `english_ai_usage_daily`; taken before the call and refunded when the call fails or AI is off. Used by hub `/ai/*`, speaking, writing and immersion feedback. Word lookup has its own cap (cached words are free). Admin drafting uses no learner credits.
- Feature names: `coach-summary`, `placement-test`, `tutor-chat`, `voice-conversation-turn`, `pronunciation-feedback`, `vocab-in-context`, `grammar-decode`, `essay-grade`, `translation-compare`, `idiom-extract`, `dictation-generate`, `daily-challenge`, `cultural-notes`, `goal-templates`, `rubric-calibrate`, `themed-week`, `content-recommend`, `shadowing-prep`, `word-lookup`, `speaking-feedback`, `writing-feedback`, `immersion-judge`, `content-draft`. New features appear in the control center once they make a call.

## Social and Telegram depth

- **Vocabulary duels** (`/duel`, `/duel/:code`; bot `/duel`; Mini App English → Word duel). Invite link only, no matchmaking with strangers; players see first names only. 10 questions (definition → pick the word), 60 s per player, server clock (+2.5 s network grace). Questions: 4 from each player's vocabulary level and saved words (max 2 saved words per side) and 2 at the level in between, same order and options for both. Invites expire after 24 h; after joining, both have 48 h to play. XP (added to weekly XP and leagues): played 5, draw 7, win 10, walkover 5, at most 20 XP a day from duels. Max 15 new duels per learner per 24 h. Pause: Control center → Services → **Vocabulary duels** (stops new duels and starts). Rules: `_shared/english-duel.ts`; one service for web, bot and Mini App: `_shared/english-duel-service.ts`. Tables `english_duels`, `english_duel_players`. Results and "your friend accepted" go through `send-telegram` (`english_duel`, study-habit cap). The hourly reminder cron also settles duels where a player stopped tapping.
- **Share cards**: drawn in the browser (canvas → PNG, Story 1080×1920 or Square), from `public/brand/` (Schood English signature + ribbon from `brand-materials/`). Shown after level-up (Progress), certificate, streak 7/30/100 (Today), league promotion, speaking mock and monthly check results, duel results. Links carry `?ref=share_<kind>`.
- **Progress links for parents/teachers** (Settings → Progress link; public page `/p/:token`). Only a SHA-256 of the token is stored; the learner sees the link once. Up to 5 active links, 5 Telegram followers each. Page shows first name, levels, streak, this week, recent badges and the 3 most common kinds of mistake (topic or skill names only). A follower starts `@schoodstudentbot` with `pl_<token>` and gets the weekly report; "Stop weekly reports" button in the chat, or the learner turns the link off. Tables `english_progress_links`, `english_progress_link_watchers`.
- **Weekly report** (Settings → Telegram reminders → Weekly report): Sundays from 19:00 Tashkent (19–21 h catch up, 150 learners per run), from the same hourly cron as reminders. Minutes (time on task, capped 1 h per activity), activities by skill, XP, streak, level changes, next week's focus. When it is on, the old short Sunday summary is not sent. Log: `english_weekly_report_log` (one row per learner and week). Dry run: `POST /hub/internal/reminders {"dry_run": true, "now": "<Sunday 14:30Z>", "user_ids": ["…"], "weekly_report": true}`.

## Deploy order

1. Migrations: `supabase db push --linked` (settings + ledger: `20261025100000_english_ops_settings_ai_ledger.sql`). Safe before the code: nothing reads it yet, defaults match today.
2. Edge functions (`supabase functions deploy <name>`): `hub`, `speaking-studio`, `writing-workbench`, `immersion-missions`, `grammar-remediation`, `listening-content`, `reading-articles`, `vocabulary-notebook`, `admin-english-content`, `admin-english-ops`. Any function importing `_shared/english-allowance.ts` or `_shared/english-ai.ts` must be redeployed to pick up shared changes.
3. Frontends: merge to `main` (CI ships `english-hub` and `platform`).
4. Check: Control center loads, "settings table is not in the database" warning is gone, AI usage shows calls after a test.

## How do I…

- **Stop AI spending right now?** Control center → AI → switch off. Learners keep basic feedback; nothing reaches a provider.
- **Turn off one misbehaving AI tool?** Control center → AI features → switch it off.
- **Take a skill offline while fixing content?** Control center → Services → pause it. Learners see a calm "paused" note; admins can still test it.
- **Be more generous to free learners for a campaign?** Control center → Free tier → raise the number. Lower it back afterwards.
- **See what AI costs?** Control center → AI usage (tokens by feature and model; multiply by your provider's price).
- **Help a learner who says "it's locked"?** Control center → Learner lookup by email: products and end dates, free activities left, AI credits used, Telegram link.
- **Change the AI model or provider?** `supabase secrets set ENGLISH_AI_MODEL=... --project-ref <prod>`; the control center shows the new value after the next function start.
- **Find why an AI answer failed?** AI usage → Latest failures (provider error text, keys scrubbed).
