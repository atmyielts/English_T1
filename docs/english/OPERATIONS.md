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
- Feature names: `coach-summary`, `placement-test`, `tutor-chat`, `voice-conversation-turn`, `pronunciation-feedback`, `vocab-in-context`, `grammar-decode`, `essay-grade`, `translation-compare`, `idiom-extract`, `dictation-generate`, `daily-challenge`, `cultural-notes`, `goal-templates`, `rubric-calibrate`, `themed-week`, `content-recommend`, `shadowing-prep`, `word-lookup`, `speaking-feedback`, `writing-feedback`, `immersion-judge`, `content-draft`, `daily-story` (logged with no learner id: one story is shared by everyone at a level). New features appear in the control center once they make a call.

## Input skills depth (reading, listening, vocabulary, grammar)

Details and reasons: `docs/english/DEPTH_AUDIT_INPUT.md`.

- **One word store.** A learner's saved words and reviews live only in `user_vocabulary_notebook_entries`. The platform drill (`vocab-drill`, /vocab-drill), the Telegram Mini App practice tab (`vocab_next` / `vocab_review`) and the student bot's /drill and due count read and write it (`_shared/english-word-store.ts`); their response shapes did not change. `vocab_drill_cards` is no longer written: migration `20261026140000` copied the cards of learners who used the drill (reviewed cards keep their schedule) and stamped `imported_at`; anything old code writes afterwards is copied on the learner's next visit. A learner with no saved words who opens a drill gets the IELTS AWL starter words, 20 a day. Unreviewed auto-seeded AWL cards of learners who never used the drill were not copied.
- **Scheduler.** Every review (Review page, word practice, Mini App, Telegram quiz, platform drill, words used in writing/speaking) uses FSRS-4.5 (`_shared/english-srs.ts`; state in `metadata.srs` of each word). Grades: again / hard / good / easy; old "correct/incorrect" and SM-2 qualities are mapped. `leitner_box` is still written (derived from stability) for older readers.
- **Reading.** Questions can be multiple choice, True/False/Not given (or Yes/No/Not given), matching headings and gap-fill summaries (`_shared/english-reading.ts`; studio edits the new types as JSON). Reading speed is stored in attempt metadata (`reading_wpm`); `GET reading-articles/speed`.
- **Grammar.** New drill type `word_order` (tiles separated by ` / `). Unit mastery and re-checks (3, 10, 30, then 60 days) are computed from lesson results, nothing stored; due re-checks appear in "Up next".
- **Story of the day.** Tables `english_daily_stories` (one row per level per day) and `english_daily_story_reads`. Written by AI feature **`daily-story`** (switch it off in Control center → AI features to use library texts only; it is not charged to learners' credits; at most one successful call per level per day, 3 tries). If AI is off or fails, the day's story is a reading-library text at that level. Pausing **Reading** pauses the story. Stories older than 180 days are pruned by pg_cron `english-daily-stories-prune-v1` (03:41 UTC). To force a new story for today at a level: delete that day's row; the next request writes it again.

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
