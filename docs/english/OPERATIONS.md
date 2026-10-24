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

## Shadowing, Read aloud and the offline session

- **Shadowing** (Speaking → Shadowing, `/speaking/shadowing`, plus a Shadow button on listening script lines, role-play partner lines and tutor replies, and Read aloud under every reading paragraph). Runs entirely in the browser: browser voice for the model, MediaRecorder for the learner (kept in memory, never uploaded), browser speech recognition for the word score. No AI, no credits, no paid API.
- Sentence sets: `GET /hub/shadowing/sets?level=` cuts sentences from published `listening_items` and `reading_articles` (the level and its neighbours). Nothing to configure; more content means more sets.
- Practice log: `POST /hub/shadowing/log` records a light speaking attempt (`attempt_type`/registry `content_type` `speaking.shadowing`, one registry item `shadowing`). At most **5 per learner day** (`SHADOWING_LOGS_PER_DAY` in `_shared/english-shadowing.ts`). Counts for streak and XP (once a day, like any repeated activity); never moves the speaking rating, mistakes or Next; never uses the free activity. Pausing Speaking in the control center stops the logging (practice still works).
- **Offline session**: Today → "Download for offline" saves the unfinished reading, listening, grammar and vocabulary activities of today's plan in the learner's browser (IndexedDB) and asks the service worker (`sw.js` v5) to keep the app shell. `/offline` runs them without a connection; answers are queued on the device and sent through the normal submit routes when the learner is online and signed in. Writing, speaking, immersion and review show "Needs a connection".
- Exactly-once sync: each queued answer carries a `client_attempt_id`. `reading-articles`, `listening-content`, `grammar-remediation` and `vocabulary-notebook` claim it in `english_client_attempts` (migration `20261026120000`, service role only, rows pruned after 30 days by pg_cron `english-client-attempts-prune-v1`) and replay the stored response for a repeat. Without the table the functions submit as before (no dedupe).
- Known limit: an answer done offline counts on the day it is sent (the server time), so a learner offline for a whole day sees that day's practice on the next day.
