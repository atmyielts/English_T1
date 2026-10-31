# V-AI — Schood AI (ai.schood.online)

| Field | Value |
|---|---|
| ID | V-AI |
| Status | building (started 2026-10-29) |
| Priority | P1, owner-requested; deliver as a finished product, every feature below `[DECIDED]` 2026-10-30 |
| Service | Its own service: app `apps/schood-ai`, function `schood-ai`, Pages project `schood-ai`, domain `ai.schood.online` `[DECIDED]` 2026-10-29 |
| Channels | B2C learners and parents, independent teachers, education centres (owners, office, teachers, students) |
| Depends on | learner profile (`learning-profile-v3`), entitlements (`access-effective`), Academy (when a centre uses it), Assessment Cloud, the student Telegram bot |

## Owner decisions

- **Its own service,** sold also to centres without Academy and to independent teachers. `[DECIDED]` 2026-10-29
- **No AI usage for free users.** A signed-in user without a plan can browse, see the example gallery (pre-made, static examples), compare plans and buy. Every AI call needs a paid plan, a centre seat or bought credits. `[DECIDED]` 2026-10-30
- **Provider-agnostic.** Any model from any provider can be plugged in and routed per feature without code changes. Not tied to OpenRouter, OpenAI, Anthropic or Google. `[DECIDED]` 2026-10-30
- **Main-platform look,** with a light AI-specific touch. `[DECIDED]` 2026-10-30
- **Teacher approval** before anything generated reaches students; **Approve & run** before anything acts on the outside world; **hints only** while a centre homework is open. `[DECIDED]`

## Thesis

General chatbots don't know a learner's mock results, a group's homework mistakes, a centre's curriculum or the exam formats Schood already models. Schood AI does. It has four audiences:

1. **Learners** get a tutor that knows their results across every Schood app, plus writing, speaking, interview, explanation and planning tools.
2. **Parents** get a weekly brief and can ask how their child is doing.
3. **Teachers** get a Materials Studio and marking tools that produce exam-accurate, checked material in minutes, plus ways to earn from it.
4. **Centres** get all of that for their staff, a branded assistant they can resell to students, a 24/7 admissions agent, an owner brief, and insights.

When a centre uses Academy, Schood AI reads Academy data with the user's own permissions. It is also a way into centres that won't switch their whole system.

## Feature catalogue

Plan names are in the plans section. Credit costs are in the credits section.

### Learners

| ID | Feature | What it does | Plan |
|---|---|---|---|
| L1 | Personal tutor | Chat on the web and in the student Telegram bot. It knows the learner's goals, levels, weak skills and recent results (`learning-profile-v3`). For centre students it also knows their open homework and teacher feedback. Answers in uz/ru/en. | Plus, centre students |
| L2 | Explain my mistake | From any Schood results screen ("Ask Schood AI") or a pasted question: why the answer is wrong, the rule behind it, then three new similar items. | Plus, centre students |
| L3 | Writing coach | Feedback on any draft against the right rubric (IELTS Task 1/2, TOEFL 2026 writing, Multilevel writing, general English): level estimate, line comments, a rewritten paragraph, and a model answer on request (labelled as a model). | Plus |
| L4 | Speaking partner | Voice conversation, role-plays, and IELTS Parts 1–3 and Multilevel speaking mocks with a written report. Uses the provider's speech-to-text and text-to-speech when configured, otherwise the browser's; falls back to typing. | Plus |
| L5 | Study plan | Builds and re-plans a week-by-week plan to a target score and date across the learner's exams, linking straight into Schood practice. | Plus |
| L6 | Words from my texts | Paste a text or take a photo: a level-appropriate word list with uz/ru meanings and examples, saved to the English vocabulary notebook. | Plus |
| L7 | Homework helper | For centre students: hints, not answers, while a homework is open, following the teacher's rule for that assignment. | Centre students |
| L8 | Application essays | Personal statements, motivation and scholarship letters, CVs: structure, feedback and line edits. It never writes the whole essay to submit. | Plus |
| L9 | Photo explain | A photo of a maths or English exercise: step-by-step hints, then the worked solution on request. | Plus |
| L10 | Graded reading | A short text at the learner's level on a topic they pick, with questions and new words. | Plus |
| L11 | Essay ladder | The learner's own essay rewritten at three levels (for example band 6, 7 and 8), side by side, with what changed and why. | Plus |
| L12 | Interview simulator | Voice mock interviews with a scored report: US/UK student visa, university admission, scholarship panel, job interview in English. | Plus |
| L13 | Pronunciation coach | Read or shadow a sentence aloud and get word-level feedback from speech recognition, with daily drills and streaks. | Plus |
| L14 | Daily brief in Telegram | Every morning, a 10-minute set built from yesterday's mistakes: three questions, one word, one tip, answered in the chat. | Plus |
| L15 | Gap-to-target | "You are at 6.0 and want 7.0 in 54 days; these four things move you": built from `score-prediction`, re-checked weekly. | Plus |
| L16 | Study-abroad copilot | From scores, budget and goals: which tests and scores are needed, a document checklist and a timeline. Requirements come only from a curated, dated dataset; anything else is marked "check on the official site". | Plus |
| L17 | Challenge a friend | A quick AI-made duel quiz at matched levels, shared by Telegram link. The winner keeps a streak, and the friend's sign-up counts as a referral. | Plus (the invited friend can play one duel free, without other AI use) |
| L18 | Gifts | Buy Plus or credits as a gift for a friend or a child. | Anyone |

### Parents

| ID | Feature | What it does | Plan |
|---|---|---|---|
| P1 | Parent brief | A weekly Telegram brief for each linked child: effort, progress, what to praise, what to watch. | Plus Family, centre (when the centre enables it) |
| P2 | Ask about my child | The parent asks in the bot ("Is she ready for the March exam?"). Answers come only from the child's own Schood and centre data. | Plus Family, centre |

### Teachers (independent and centre staff)

| ID | Feature | What it does | Plan |
|---|---|---|---|
| T1 | Materials Studio | Generates teaching material from a brief: level (CEFR A1–C2 or exam band), topic, exam format, length, and instruction language (uz/ru/en). It can target a group's weak spots when Academy data is available. Types are listed below. | Teacher, Centre |
| T2 | Checked answer keys | A second model call solves every generated question set without the key. Deterministic checks also run: one key per MCQ, the key exists in the options, gap answers fit, and counts match. Disagreements are flagged on the review card. | Included with T1 |
| T3 | Marking assistant | Batch-marks essays or speaking transcripts (typed, pasted or photographed) against a rubric: draft band, comments and the top three fixes per script. The teacher edits and approves. | Teacher, Centre |
| T4 | Feedback and report writer | Report-card comments, term summaries and individual feedback from marks and notes, in uz/ru/en. | Teacher, Centre |
| T5 | Lesson and course planner | Lesson plans (aims, timing, stages, activities, homework) and term outlines mapped to CEFR can-do statements or an exam syllabus. | Teacher, Centre |
| T6 | Library | Every saved material is a page in the teacher's or centre's library. It has folders, search, and a rich editor with slash commands. Autosave uses revision checks. There is version history and sharing within the workspace. Pages print or save as PDF with the centre's logo, and can be exported. | Teacher, Centre |
| T9 | Textbook to lesson | A photo or PDF page of the class book becomes exercises, a quiz, homework and speaking cards on that page, for the teacher's own class. | Teacher, Centre |
| T10 | Live Quiz | Any material becomes a class game. Students join on their phones with a code and see a live leaderboard; results are saved to the class. | Teacher, Centre |
| T11 | Telegram channel autopilot | Daily word, quiz-poll and grammar-tip posts for the teacher's own Telegram channel, in their voice. The week's batch is approved in one click, then posted by the Schood bot added as a channel admin. | Teacher Pro, Centre Pro |
| T12 | Materials marketplace | Sell approved materials and packs to other teachers and centres. Schood takes a commission; listings show ratings and verified usage. | Teacher Pro, Centre |
| T13 | Tutor brand kit | Course landing text, Instagram and Telegram posts, and results posts for independent tutors. Only real, entered results are used. | Teacher Pro |
| T14 | Speaking marking from recordings | Record or upload student answers; they are transcribed by the provider's speech-to-text when configured, then given a band draft per criterion. | Teacher, Centre |
| T15 | AI-writing signals | Likelihood signals on student essays plus a suggested "explain it" check. Never an automatic accusation, the same rule as Homework OS. | Teacher, Centre |

T1 material types (each has a schema in `packages/ai-core`):
- **General material:** worksheet; reading passage with questions; listening script with questions (audio through the provider's text-to-speech when configured); gap-fill or cloze; vocabulary set with exercises; grammar explanation and drill; error correction; speaking cards and role-play prompts; dialogue; writing task with model answer and rubric; auto-markable quiz; homework set.
- **Exam-style sets:** IELTS Reading, Listening, Writing and Speaking; TOEFL 2026 task types; Multilevel sections; SAT Reading and Writing; SAT Math; national admission Maths.
- **Planning and practice:** lesson plan; slide outline; flashcards.
- **Variants:** differentiated versions of any material, at three levels at once.

Exam-style sets reuse the existing format definitions rather than inventing new ones:
- `packages/ielts-core`
- `packages/sat-core`
- the TOEFL 2026 task ids used by `apps/toefl-ibt-simulator`
- `supabase/functions/_shared/english-exam-format.ts` (Multilevel)
- `packages/subject-core` (admission Maths topics)

A material can be exported to:
- a Homework OS assignment, created through Academy's own API with the user's token;
- Assessment Cloud draft items, which then go through its normal review flow;
- print or PDF, using a browser print stylesheet;
- Telegram-ready text;
- the marketplace (T12).

### Centres

| ID | Feature | What it does | Plan |
|---|---|---|---|
| C1 | Centre workspace | Teacher seats, a shared centre library, house style (logo, colours, instruction language, worksheet template, tone) and centre-wide specialists. | Centre |
| C2 | Branded Student Assistant | L1, L2, L6, L7 and L10 for the centre's students under the centre's name, on the web and in Telegram. Teachers set per-group rules (hints only during homework, topics to focus on). | Centre |
| C3 | Office assistant | Lead follow-up drafts and trial-lesson booking drafts. Reads Academy leads when connected. Every outbound message is Approve & run. | Centre |
| C4 | Marketing studio | Instagram and Telegram posts, ad copy, event announcements and results posts in uz/ru/en, in the centre's voice. It never invents scores or testimonials. | Centre |
| C5 | Placement tests | A placement test for a level range (with checked keys, as in T2), AI-marked writing and speaking, and a placement report. | Centre |
| C6 | Insights | What students ask the assistant, grouped by topic per group (at least 5 students per group shown, never individual transcripts), plus group weak spots. | Centre |
| C7 | Admin | Seats, invites, credit budgets per teacher and per student, feature switches, data retention, audit log, and a usage and cost report. | Centre |
| T7 | Teacher assistant | Chat over the teacher's own classes when the centre uses Academy ("who missed two homeworks in 5B?"). Answers are read-only; any action is Approve & run. | Centre |
| T8 | Parent messages | Drafts to parents in uz/ru from the student's record. Sending is always Approve & run. | Centre |
| C8 | AI Admissions Agent | Works 24/7 in the centre's Telegram bot and website widget. It answers from the centre's FAQ and price list, runs a placement test in chat, and books a trial lesson into Academy leads and trials. Booking is Approve & run, or automatic within rules the owner sets. It hands over to a person on request. | Centre Pro |
| C9 | Resell AI to students | The centre sells the branded AI tutor to its students' parents at its own price. Schood charges the centre a wholesale rate per active student. | Centre, Centre Pro |
| C10 | Monday owner brief | A weekly business brief from Academy in Telegram: leads, conversions, payments, debts, attendance, homework, at-risk students and teacher workload, with three suggested actions. | Centre Pro |
| C11 | Win-back and renewal campaigns | Personal messages to the parents of at-risk students and to lapsed students, built from Academy risk signals. Approve & run. | Centre Pro |
| C12 | Curriculum in a box | A whole multi-level course (for example General English A1–B2, or IELTS 5 to 7): aligned units, lessons, homework and tests. The centre's methodologist reviews it before it is published to the library and Courses. | Centre Pro |
| C13 | Staff knowledge assistant | Upload centre policies and procedures; staff ask questions, and answers cite the source page. | Centre Pro |
| C14 | White-label and embed | Assistant name, avatar and colours, plus embeddable placement-test and admissions-chat widgets for the centre's website. | Centre Pro |
| C15 | Bring your own model key | The centre plugs in its own provider key. Schood charges a platform fee instead of credits for those calls. | Enterprise |
| C16 | Lesson observation coach | An observer's notes or a lesson plan become structured feedback for the teacher against the centre's standards, tracked over a term. | Centre Pro |

## Schood Coaches: a family of Telegram AI bots `[DECIDED]` 2026-10-30

A small set of standalone Telegram bots, each a deep coach for one skill, from IELTS to sales. People start them in Telegram and use them straight away (plug and play). The set stays small; each coach is meant to go deeper than anything else people can get in Telegram. Each is one "coach pack" running on a single shared engine, so adding a new coach means adding a pack and a bot token, with no new code.

### The first six coaches

| ID | Coach | What makes it deep |
|---|---|---|
| B1 | **IELTS Coach** | **Speaking:** a full Parts 1–3 examiner over voice messages, following real test flow and timing (a cue card with a 1-minute prep timer and a 2-minute talk). It gives a band per criterion with quoted evidence, fluency numbers (words per minute, pauses, fillers), and "say it better" upgrades for every answer, then you re-record. **Writing:** Task 1 and Task 2 by photo or text, with a band per criterion, an essay ladder and drills on your recurring errors. **Reading and Listening:** daily timed mini-sets with checked keys and strategy by question type. **Also:** topic vocabulary with spaced-repetition quiz polls, a plan to the exam date, a predicted band and a weekly mock linked to the Schood simulator. |
| B2 | **English Speaking Partner** | Everyday fluency from A2 to C1 through voice role-plays (work, travel, shops, doctor, small talk) that adapt to your level. You choose gentle or strict correction mode. It has pronunciation shadowing and a phrase bank with spaced repetition. A weekly fluency report tracks words per minute, filler rate, vocabulary range and error types. Beginners get explanations in Uzbek or Russian. |
| B3 | **Admission Maths Coach** | Daily problem sets chosen by topic mastery, from the `subject-core` topic graph and the Admission bank. Send a photo of a problem for hints, then the worked solution. Also timed mini-mocks, a mistake notebook, a percentile against other users and a predicted score. Uzbek and Russian. |
| B4 | **Sales Coach** | **Skill tree:** prospecting, cold-call openings, discovery questions, value pitch, objection handling (price, "I'll think about it", a competitor, no budget, "send me info"), closing, follow-up, negotiation, shop-floor selling, and Telegram and Instagram DM selling. **Role-plays:** voice role-plays in Uzbek, Russian or English against buyer personas with a hidden state (budget, pain, decision power, mood) that reacts to what you say. **After each call:** a scorecard (talk ratio, questions asked, objections handled, whether a next step was secured) and a replay with better lines. **Also:** a script builder for your own product, rapid-fire objection drills, and a team mode with a leaderboard and a manager view. |
| B5 | **Career and Interview Coach** | A CV rewrite in uz/ru/en, cover letters, and LinkedIn and hh.uz profiles. Mock interviews: HR, behavioural (STAR method), role-specific, salary negotiation role-play, and student-visa interview practice. A job-search plan. Visa and legal facts come only from a curated, dated dataset and are marked "check the official site". |
| B6 | **Public Speaking Coach** | Voice analysis of pace, fillers ("ee", "aa", "типа", "anu"), pauses, structure (hook, points, close) and clarity. Drills: elevator pitch, impromptu topics, storytelling, rehearsing a presentation with a Q&A role-play. Weekly progress. |

Candidate next packs, in validation order: Korean EPS-TOPIK, Russian, Customer Service, Negotiation, Team Leadership.

### Depth standard every coach must meet

- **The Schood loop:** placement diagnostic → goal → daily plan → gap tracking → outcome (a mock or assessment), per `00_PRINCIPLES`.
- **Structured content:** a skill tree with levels; authored lessons, drills, scenarios and rubrics per node; AI-generated variants pass the same checks as T2.
- **Voice first:** voice messages for role-plays and speaking. Speech-to-text with word timestamps powers the fluency numbers; persona replies can come back as voice when a text-to-speech provider is configured; text works everywhere.
- **Evidence-based scoring:** every score cites the learner's own words. Each rubric has a calibration set in the repo, and CI checks score agreement and run-to-run consistency against fixtures. A live evaluation script reports the same against real models.
- **Memory:** a learner model per coach (mastery per skill node, recurring errors, preferences) that shapes every next drill.
- **Visible results:** a weekly report with before/after numbers, level-ups with a verifiable certificate link people can share, streaks, and reminders at the learner's chosen time.
- **Rich screens:** a Telegram Mini App (the `/coach/<pack>` routes of `apps/schood-ai`) for the dashboard, charts, reports, long feedback and the plan.
- **One account:** coaches link to the learner's Schood account through `telegram-link`. One subscription covers web and bots.

### Engine

- **Worker:** `workers/schood-coach-bots` (Cloudflare, free plan) receives webhooks for every coach bot at `/tg/<pack>`. It checks each bot's secret-token header, runs a cron for reminders and weekly reports, and relays to the function's `coach` area with a service secret.
- **Packs** live in `packages/coach-packs/<pack>/`. Each holds a manifest (names in uz/ru/en, audience, skill tree), the diagnostic, lessons and drills, scenarios and personas, rubrics with calibration sets, plan rules, reminder copy, milestones and free sample outputs. The engine validates every pack on load and in CI.
- **Tables:** `coach_enrollments`, `coach_sessions`, `coach_turns`, `coach_scores` (per criterion, with evidence), `coach_mastery`, `coach_schedules`, `coach_certificates`.
- **Speech:** through the provider-agnostic gateway (`stt` and `tts` capabilities). A free option to evaluate is Cloudflare Workers AI Whisper on the existing Cloudflare account, within its free daily allowance `[VERIFY]` limits and Uzbek accuracy. Paid options such as OpenAI or Groq Whisper can be added in the admin console.

### Selling the coaches

- **Free users:** the non-AI placement diagnostic (auto-scored, no model calls) and sample reports. Every AI turn needs a plan, per the no-free-usage rule.
- **Plans:** all six coaches are included in Schood AI Plus and Plus Family. A single-coach pass costs 29,000 / 30 days `[ASSUMPTION]`.
- **Team plans** for companies and centres (sales teams, HR, call centres) cost 39,000 per seat / 30 days, with at least 5 seats `[ASSUMPTION]`. They include a manager dashboard and leaderboard.
- **Payment:** through the Schood account (Click on the web). `[VERIFY]` Telegram's current rules for selling digital goods inside bots (Telegram Stars); owner decision on offering Stars.
- **Owner actions:** create the six bots in BotFather and set their tokens as worker secrets; decide the speech provider.

## Lifetime engagement layer `[DECIDED]` 2026-10-30

The aim is a daily habit that lasts years and a learner who spends more over time, moving from one goal to the next on Schood. One engine serves the web app and every coach bot. Every area reports learning events to it through the core events API.

| ID | Feature | Why people come back |
|---|---|---|
| E1 | **Journeys** | Multi-month programmes with weekly chapters and a graduation, such as "IELTS 5.5 → 7.0 in 16 weeks", "Sales: first 90 days", "Speaking confidence in 60 days". There is always a next chapter. |
| E2 | **Lifetime path** | After every outcome, the next goal is ready: admission → IELTS → university essays → visa interview → career coach → sales or public speaking. Schood moves with the person from school to work. |
| E3 | **Skill Passport** | One verifiable profile: certificates, levels, verified exam results and chosen voice and writing samples, shareable by link with employers, universities and centres. It gains value every year, which makes it hard to leave. |
| E4 | **Leagues** | Weekly leagues of about 30 people at a similar level. The top go up and the bottom go down. XP comes only from verified learning, never from just opening the app. |
| E5 | **Streaks, daily quests, weekly challenges** | One small first step in Telegram each day, three daily quests, and a weekly challenge. Streak freezes are earned with XP. |
| E6 | **Squads and duels** | Squads of up to 5 friends share a weekly goal and a squad streak. Duels (L17) are part of this. Friends keep each other coming back. |
| E7 | **Then vs now** | Your voice from day 1 played next to today's, and your first essay next to your latest, each with its scores. Progress you can hear is the strongest reason to renew. |
| E8 | **Story mode** | Serial stories at the learner's level with daily episodes, choices and cliffhangers: an English drama series from A1 to C1, and "your first month as a sales rep" for the Sales Coach. Reading and listening practice people want to continue. Arcs are authored, and AI fills in the episodes within them. |
| E9 | **A coach that remembers** | It knows the exam date, the interview on Thursday and the weak spot from last week, and checks in at the right moment: "Your interview is Thursday: 10-minute rehearsal tonight?" |
| E10 | **Seasons and live events** | Quarterly seasons with new scenarios, topics and rewards; a weekly national mock; monthly speaking and sales tournaments, with prizes sponsored by centres and universities. |
| E11 | **Regional and centre leaderboards** | City, school and centre rankings, and a centre-vs-centre league. Centres promote it because it markets them. |
| E12 | **Skill Certificates** | Paid certificate exams per coach level (for example "Sales Level 2", "Speaking B2"), proctored with Proctor Lite and verifiable by QR. They become a target to train for. |
| E13 | **Talent pool** (later stage) | Learners who opt in can be found by employers, universities and centres through their Skill Passport. Employers pay. Consent is required and can be withdrawn at any time. |
| E14 | **Win-back** | When a streak or journey is at risk: a personal message showing the progress they would lose, and a return offer after a lapse. Within quiet hours and a daily message limit. |

### Rules: a healthy habit, not exploitation `[DECIDED]`

- **Learning only:** XP and leagues count verified learning (passed checks, scored turns), so the habit actually produces results.
- **No gambling:** no paid random rewards, loot boxes or fake urgency. Prices and offers are honest, and cancelling is one tap.
- **Messages:** at most 2 notifications a day per person across all bots, at their chosen time, within quiet hours (22:00–08:00 local).
- **Under-18s:** no paid streak repair, no public leaderboard by default, an optional daily time limit, and parents see usage in P1. Adults may also buy a streak freeze with credits.
- **Breaks:** "You've done enough today" appears after a long session.

## Credits: the one unit

Every AI action costs credits; one credit is about one tutor reply. Paid plans grant monthly credits and packs top them up. Centre credits are pooled in the centre workspace and handed out by budget to teachers and students. Free users have no credits.

| Action | Credits `[ASSUMPTION]` |
|---|---|
| Tutor or assistant reply (L1, C2, T7, P2, C8, C13) | 1 |
| Explain a mistake with 3 similar items (L2) | 2 |
| Writing feedback, one draft (L3) / essay ladder (L11) | 5 / 8 |
| Speaking or interview turn (L4, L12) / full mock with report | 1 / 10 |
| Pronunciation drill (L13) / daily brief (L14) | 1 / 2 |
| Study plan or gap-to-target re-plan (L5, L15) | 3 |
| Words from a text (L6) / graded reading (L10) / photo explain (L9) | 2 / 3 / 3 |
| Application essay review (L8) / study-abroad plan (L16) | 8 / 5 |
| Material generation, single (T1, T9) / exam-style set, placement test, Live Quiz pack (T1, C5, T10) | 10 / 15 |
| Differentiate into three levels | +10 |
| Marking per script (T3, T14) / AI-writing signal (T15) | 4 / 1 |
| Lesson plan (T5) / term outline / curriculum in a box, per unit (C12) | 5 / 10 / 20 |
| Feedback or report comment (T4), parent message (T8), parent brief (P1) | 1 |
| Marketing or channel post (C4, T11, T13) / weekly owner brief (C10) | 3 / 10 |

The price table lives in `packages/ai-core`, so the app shows the cost before every action and the function charges exactly that. Credits are charged before the model call and refunded automatically when it fails.

## Plans (proposed, UZS) `[ASSUMPTION]`, owner to confirm before they go on sale

| Plan | Price | Includes |
|---|---|---|
| Free | 0 | Browse, example gallery and pricing. No AI calls. |
| Schood AI Plus (learner) | 49,000 / 30 days; 129,000 / 90 days | 1,500 credits a month, every learner feature |
| Schood AI Plus Family | 89,000 / 30 days | One parent and up to 3 children: Plus for each child (1,500 credits each), P1 and P2 |
| Schood AI Teacher | 99,000 / 30 days | 3,000 credits a month, T1–T6, T9, T10, T14, T15 |
| Schood AI Teacher Pro | 199,000 / 30 days | 8,000 credits a month, everything in Teacher plus T11, T12 selling and T13 |
| Schood AI Centre | 490,000 / 30 days | 5 teacher seats, Student Assistant for up to 100 students, 10,000 pooled credits, C1–C7, T7, T8, C9 |
| Schood AI Centre Pro | 1,290,000 / 30 days | 15 seats, 400 students, 40,000 pooled credits, everything in Centre plus C8, C10–C14, C16 |
| Enterprise | By contract | Centre Pro plus C15 bring your own key, an SLA, and custom limits |
| Coach pass (one Telegram coach) | 29,000 / 30 days | Unlimited fair use of one coach bot (B1–B6). All six are included in Plus and Plus Family. |
| Coach Team | 39,000 per seat / 30 days, 5 seats minimum | One or more coaches for a company or centre team, with a manager dashboard and leaderboard |
| Plus Annual / Plus Family Annual | 399,000 / 729,000 per year | About a third off monthly. The main long-term plan, offered at every milestone and graduation. |
| Skill Certificate exam (E12) | 79,000 per sitting | A proctored certificate for a coach level, verifiable by QR |
| Talent pool access (E13) | By contract, later | For employers, universities and centres searching opted-in learners |
| Event sponsorship (E10, E11) | By contract | Centres and universities sponsor tournaments, leagues and prizes |
| Add-ons | Teacher seat 79,000; 100 students 59,000; 1,000 credits 29,000; 10,000 credits 149,000; wholesale per resold student (C9) 9,000 | Add-ons to the plans above |

- Learner, family and teacher plans and credit packs sell through the normal Click → entitlements path.
- Centre plans are granted manually (support grants the entitlement) until tenant checkout is confirmed working, the same rule as the Schood Teaching plans.
- Plans ship inactive (`is_active = false`) until the owner confirms prices and the model routes.
- Before plans go on sale, only Schood admins and an allowlist (`SCHOOD_AI_BETA_USER_IDS`) can use AI features.

## Models: provider-agnostic gateway `[DECIDED]`

Any model is pluggable and routed per feature from an admin console, with no code change.

- **Adapters** in `supabase/functions/schood-ai/providers/`. Each maps one common request (system prompt, messages, images, JSON schema, temperature, max tokens, stream flag) to a provider protocol, and maps usage and errors back:
  - `openai_compatible`: OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Together, Fireworks, xAI, Azure OpenAI by base URL, and self-hosted vLLM, Ollama or LM Studio;
  - `anthropic` (Messages API);
  - `google_gemini` (Gemini API).
  - Optional audio capabilities on the same adapters: speech-to-text and text-to-speech.
- **Registry** in the database:
  - `ai_providers`: key, adapter, base URL, the env var that holds its API key, extra headers, enabled. API keys never sit in a table in plain text: Schood keys are Supabase secrets referenced by name, and centre keys (C15) go in Supabase Vault.
  - `ai_models`: provider, model id, display name, capabilities (chat, stream, json, vision, stt, tts), context window, max output, USD price per million input and output tokens, a data-policy flag (`no_training`), enabled.
  - `ai_model_routes`: a feature or tier, its ordered model list, and the required capabilities and policy.
- **Selection at call time:** take the first enabled, healthy model on the route that has the required capabilities and policy. A circuit breaker skips a model after repeated failures. Fallback is automatic and every switch is recorded.
- **Admin console** at `ai.schood.online/admin`, for Schood admins only. It manages providers, models and routes, has a test console (send a prompt to a chosen model, see latency, tokens and cost), shows cost and error rate per model and feature, and has feature switches.
- **Cost:** every call records tokens, latency, status, model and cost (tokens × registry price) in `ai_calls`. Monthly cost per paying account is shown next to its revenue.
- **Caps:** a global daily cap, plus per-user and per-workspace caps, protect spend. Hitting one returns a clear "try again later" state.
- **Seed:** the existing OpenRouter key with the free `google/gemma-4-31b-it:free` as the default route, so cost stays at zero until the owner adds paid models. For paid plans and children's chats, adding a paid `no_training` model is the owner's decision. `[VERIFY]` the chosen providers' data policies.

## Design `[DECIDED]`

- **The main platform's look** (`apps/platform`):
  - Tailwind 3, Manrope for text and Sora for headings, lucide icons.
  - Deep navy `#0f172a`, warm cream backgrounds (`#f6f1e8`, `#fbfaf7`, `#efe6d8`), lime accents (`#b6f24a`, `#d8f266`) and sky (`#9ee7ff`).
  - The same header, footer, sign-in and language picker behaviour.
- **A light AI touch:**
  - a lime-to-sky "spark" accent on AI actions and streaming states;
  - a calm thinking indicator;
  - a focused dark-navy mode for the Studio editor and Live Quiz screen.
- **Centre branding:** each centre workspace shows its own logo and colour in the workspace, printouts, the Student Assistant and widgets.
- **Layout:** mobile-first for learners (360–390px, weak connections); desktop-first for the teacher Studio and centre admin, which still work on a phone.

## Trust, safety and privacy

- **Generated material:** drafts until a teacher approves them. AI marks are suggestions until a teacher confirms them.
- **Outbound actions:** messages, homework, channel posts, admissions bookings and marketplace listings always need Approve & run by a person with the right role. The one exception is admissions rules the owner turned on explicitly.
- **Marketing:** no invented facts. Results posts use only entered or verified results.
- **Original content:** generation never reproduces published exam books. Material a centre uploads stays private to its workspace.
- **Chats:** a learner can delete their history at any time. Student chats are deleted after 180 days unless pinned `[ASSUMPTION]`. Centre staff see grouped topics (C6), never a student's transcript.
- **Parents (P2):** answers only about their own linked child, only from data the child's centre or account shares.
- **Owner review needed:** the consent and retention text, before under-18s use the assistant.
- **Reporting:** every AI answer has a report button; reports go to the admin queue.

## Architecture

```
apps/schood-ai (Vite, React 19, Tailwind 3, uz/ru/en, ai.schood.online)
  src/core      auth, api client, credits, plan gates, layout, chat UI, review and Approve & run cards, editor, admin console
  src/learner   learner and parent features
  src/teacher   Studio, library, planner, marking, Live Quiz, channel autopilot, marketplace
  src/centre    centre workspace, Student Assistant settings, office, admissions agent, marketing, insights, owner brief
packages/ai-core (pure TypeScript, used by the app and the function)
  credit prices, plan rules, material schemas and validators, deterministic key checks, CEFR and exam-format adapters
supabase/functions/schood-ai (Deno; handler + repository + memory repository, like admission)
  index.ts, handler.ts (router), gateway.ts, providers/*, credits.ts, context.ts, actions.ts, repository.ts, memory-repository.ts
  core/ learner/ teacher/ centre/   (one module per area, registered in handler.ts)
supabase/migrations/2026103*_schood_ai_*.sql
.github/workflows/schood-ai-ci.yml, configure-schood-ai-domain.yml
```

- **Auth and access:** the shared `.schood.online` session. All tables deny direct client access; the function uses the service role with explicit checks (Admission pattern).
- **Region:** the app imports `packages/edge-region` first.
- **Streaming and jobs:** chat streams over server-sent events. Long generation runs as a job that the app polls, with every model call kept well under the edge-function time limit.
- **Live Quiz:** uses Supabase Realtime if it is enabled on the project, otherwise short polling.
- **Workspaces:** every user has a personal workspace. A centre workspace links to an Academy tenant (checked against Academy roles) or is created by a Schood admin. Roles are owner, admin, teacher, student and parent; people join by invite link or code.
- **Academy and Assessment Cloud:** read and written only through their existing APIs with the user's own token.
- **Telegram:** the student bot (`workers/schood-bot`) gets AI modes (`/ai`, the daily brief, the parent brief, duels) that relay to the function with the bot's service secret and the Telegram-linked user. Homework hand-in in the same bot must keep working. The admissions agent (C8) and channel autopilot (T11) run through a centre's own bot or channel, set up in the centre admin.
- **Deep links in:** `ai.schood.online/explain?source=<app>&session=<id>&item=<id>`, plus `/write`, `/speak` and `/tutor`. The other apps get an "Ask Schood AI" link on their results and review screens.
- **OpenDots** (CopilotKit/OpenDots, MIT): we copy the library and editor layout, specialist agents, review and Approve & run cards, and interrupted-then-retry scheduled work. Copied files keep the MIT notice. We do not use CopilotKit Intelligence, Docker computers, Composio, Slack or paid voice services.

## Data model (core; feature areas add their own tables)

| Table | Purpose |
|---|---|
| `ai_workspaces` | Personal or centre; tenant link; branding and house style; settings and switches |
| `ai_workspace_members` | User, role, credit budget, invite source |
| `ai_workspace_invites` | Invite codes and links with role and expiry |
| `ai_pages`, `ai_page_revisions` | Library pages: folder, kind, title, material JSON, editor document, revision, source generation |
| `ai_threads`, `ai_messages` | Conversations per user, specialist and optional page |
| `ai_specialists` | Per workspace: name, role, instructions, allowed tools, enabled |
| `ai_generations` | Jobs: feature, input, status (`requested → generating → ready → approved / rejected / failed`), output, verification report, model, credits |
| `ai_actions` | Approve & run queue: kind, payload, status, approver, result |
| `ai_credit_ledger` | Append-only: account (user or workspace), delta, reason, feature, reference |
| `ai_providers`, `ai_models`, `ai_model_routes` | The provider-agnostic model registry |
| `ai_calls` | One row per model call: feature, model, tokens, latency, status, cost |
| `ai_reports` | User reports on AI answers |
| `ai_audit_events` | Workspace and admin actions |

## Build phases

| Phase | Scope | Branch | Migrations |
|---|---|---|---|
| 1. Core | Skeleton; then the provider registry and admin console, library and editor, specialists UI, the design system | `claude/ai-core` | `20261030100000–199999` |
| 2. Learners and parents | L1–L18, P1–P2, Telegram modes, "Ask Schood AI" links in the other apps | `claude/ai-learner` | `20261030200000–299999` |
| 3. Teachers | T1–T6, T9–T15 | `claude/ai-teacher` | `20261030300000–399999` |
| 4. Centres | T7, T8, C1–C16, Academy and Assessment Cloud exports | `claude/ai-centre` | `20261030400000–499999` |
| 5. Selling | Products, plans, bundles, credit packs, gifts, coach passes, team plans, `/pricing`, platform discovery, plan gates on (ships last) | `claude/ai-pricing` | `20261030500000–599999` |
| 6. Coach engine | `workers/schood-coach-bots`, the `coach` area, Mini App screens, pack format and validator, calibration harness, B1 IELTS and B2 Speaking Partner | `claude/ai-coach` | `20261030600000–699999` |
| 7. Coach packs | B3 Admission Maths, B4 Sales, B5 Career and Interview, B6 Public Speaking | `claude/ai-coach-packs` | `20261030700000–799999` |
| 8. Lifetime engagement | E1–E14 engine (`engage` area), journeys, story-mode arcs, Skill Passport pages, leagues and squads, seasons, certificates on Proctor Lite. Reuses the existing `user-streak`, `referrals` and `certificates` functions instead of duplicating them. | `claude/ai-engage` | `20261030800000–899999` |

## Done when

- A paying learner signs in at ai.schood.online, sees a tutor that knows their results, and can use every L feature in uz/ru/en on a 375px phone. A free user sees the gallery and plans but cannot make an AI call.
- A teacher generates an IELTS Reading set at B2 with a checked key, edits it, prints it with their logo, plays it as a Live Quiz, and sends it to an Academy group as homework after Approve & run.
- A centre owner creates the centre workspace, invites teachers and students, sets budgets, turns on the admissions agent, and receives the Monday brief.
- A Schood admin adds a new provider and model in the console, routes a feature to it, and sees its cost per call, with no deploy.
- Every action shows its credit cost first, charges exactly that, and refunds on failure.
- Each of the six coach bots runs the full loop (diagnostic, goal, daily plan, voice role-play or practice, evidence-based scores, weekly report, certificate), passes its calibration checks, and works in its languages.
- A learner who finishes a goal is offered the next one on their lifetime path. Their Skill Passport shows every certificate and verified result. They can play their day-1 voice next to today's, and they are in a weekly league and a squad.
- Plans exist and switch on with one owner decision.

## North-star metric

Weekly active paying AI accounts that come back the next week, split by learner, family, teacher and centre, alongside revenue, model cost and credits used per paying account.

Long-term metrics: 30-, 90- and 365-day retention; share of payers on annual plans; number of goals per learner over their lifetime (E2); and lifetime value per learner against model cost.
