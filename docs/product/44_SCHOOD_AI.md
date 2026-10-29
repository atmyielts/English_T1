# V-AI — Schood AI (ai.schood.online)

| Field | Value |
|---|---|
| ID | V-AI |
| Status | building (started 2026-10-29) |
| Priority | P1, owner-requested |
| Service | Its own service: app `apps/schood-ai`, function `schood-ai`, Pages project `schood-ai`, domain `ai.schood.online` `[DECIDED]` 2026-10-29 |
| Channels | B2C learners, independent teachers, education centres (teachers, office, students) |
| Depends on | learner profile (`learning-profile-v3`), entitlements (`access-effective`), Academy (when a centre uses it), Assessment Cloud, the student Telegram bot, the OpenRouter key already set |

## Thesis

General chatbots don't know a learner's mock results, a group's homework mistakes, a centre's curriculum or the exam formats Schood already models. Schood AI is one AI workspace that does, with three audiences:

1. **Learners** get a tutor that knows their results across every Schood app, plus writing, speaking, explanation and planning tools that charge per use.
2. **Teachers** get a Materials Studio and marking tools that produce exam-accurate, checked material in minutes, saved in their own library.
3. **Centres** get all of that for their staff, a centre-branded assistant for their students, an office and marketing assistant, and the insight that comes from it.

Everything a student sees from a teacher passes a teacher's approval first. Everything that acts on the outside world (messages, homework, published items) waits for an explicit **Approve & run**. `[DECIDED]`

It is a separate service so it can be sold to centres that do not use Academy and to independent teachers. When a centre does use Academy, Schood AI reads Academy data with the user's own permissions. It is also a way into centres that won't switch their whole system. `[DECIDED]`

## Feature catalogue

Credit prices are in the credits section. **Free** means it is available on the free daily allowance.

### Learners (B2C, and centre students)

| ID | Feature | What it does | Tier |
|---|---|---|---|
| L1 | Personal tutor | Chat on web and in the student Telegram bot. Knows the learner's goals, levels, weak skills and recent results from `learning-profile-v3`, and (for centre students) their open homework and teacher feedback. Answers in uz/ru/en. | Free (limited), Plus |
| L2 | Explain my mistake | From any Schood results screen ("Ask Schood AI" link) or by pasting a question: why the answer is wrong, the rule behind it, then three new similar items to try. | Free (limited), Plus |
| L3 | Writing coach | Feedback on any draft against the right rubric: IELTS Task 1/2, TOEFL 2026 writing tasks, Multilevel writing, general English. Band/level estimate, line-level comments, a rewritten paragraph, a model answer on request (marked as a model). | Plus (1 free check a day) |
| L4 | Speaking partner | Voice conversation using the browser's speech recognition and speech synthesis (no paid speech service). Free talk, role-plays, IELTS Speaking Parts 1–3 and Multilevel speaking mock interviews with a written report. Falls back to typing when the browser has no speech recognition. | Plus |
| L5 | Study plan | Builds and re-plans a week-by-week plan to a target score and date across the learner's exams, linking straight into Schood practice. | Free |
| L6 | Words from my texts | Paste a text or snap a photo: level-appropriate word list with uz/ru meanings and examples, saved to the English vocabulary notebook. | Free (limited), Plus |
| L7 | Homework helper | For centre students: hints, not answers, while a homework is open. Respects the teacher's rule for that assignment. | Centre plan |
| L8 | Application essays | Personal statements, motivation and scholarship letters, CVs: structure, feedback, line edits. Never writes the whole essay to submit. | Plus |
| L9 | Photo explain | Photo of a maths or English exercise: step-by-step hints, then the worked solution on request. Uses the vision-capable model already used by homework pre-marking. | Plus (1 free a day) |
| L10 | Graded reading | A short text at the learner's level on a topic they pick, with comprehension questions and new words. | Free (limited), Plus |

### Teachers (independent and centre staff)

| ID | Feature | What it does | Tier |
|---|---|---|---|
| T1 | Materials Studio | Generates teaching material from a brief: level (CEFR A1–C2 or exam band), topic, exam format, length, language of instructions (uz/ru/en). Types listed below. Can target a group's weak spots when Academy data is available. | Teacher, Centre |
| T2 | Checked answer keys | Every generated question set is solved again by a second model call without the key, plus deterministic checks (one key per MCQ, the answer exists in the options, gap answers fit, counts match). Disagreements are flagged on the review card before the teacher sees "ready". | Included with T1 |
| T3 | Marking assistant | Batch-mark essays or speaking transcripts (typed, pasted or photo) against a rubric. Draft band, comments and the top 3 fixes per script. Teacher edits and approves. | Teacher, Centre |
| T4 | Feedback and report writer | Report-card comments, end-of-term summaries and individual feedback from marks and notes, in uz/ru/en. | Teacher, Centre |
| T5 | Lesson and course planner | Lesson plans (aims, timing, stages, activities, homework), and a term outline mapped to CEFR can-do statements or an exam syllabus. | Teacher, Centre |
| T6 | Library | Every saved material is a page in the teacher's or centre's library: folders, search, a rich editor with slash commands, autosave with revision checks, version history, sharing within the workspace, print/PDF with the centre's logo, and exports. | Free (view), Teacher |
| T7 | Teacher assistant | Chat over the teacher's own classes when the centre uses Academy ("who missed two homeworks in 5B?", "plan next week for my B1 group"). Read-only answers; any action goes to an Approve & run card. | Centre |
| T8 | Parent messages | Drafts messages to parents in uz/ru from the student's record; sending is always an Approve & run action. | Centre |

T1 material types (each has a JSON schema in `packages/ai-core`): worksheet; reading passage with questions; listening script with questions (text only; audio is a later add-on); gap-fill / cloze; vocabulary set with exercises; grammar explanation and drill; error-correction; speaking cards and role-play prompts; dialogue; writing task with model answer and rubric; quiz (auto-markable); homework set; exam-style set (IELTS Reading/Listening/Writing/Speaking, TOEFL 2026 task types, Multilevel sections, SAT Reading & Writing, SAT Math, national admission Maths); lesson plan; slide outline; flashcards; differentiated versions of any material (three levels at once).

Exam-style sets must reuse the existing format definitions, not invent new ones: `packages/ielts-core`, `packages/sat-core`, the TOEFL 2026 task ids used by `apps/toefl-ibt-simulator`, `supabase/functions/_shared/english-exam-format.ts` (Multilevel), and `packages/subject-core` (admission Maths topics).

Exports from a material: Homework OS assignment (Academy, through Academy's own API with the user's token), Assessment Cloud draft items (enter its normal review flow), print/PDF (browser print stylesheet, no server PDF), copy as Telegram-ready text.

### Centres

| ID | Feature | What it does |
|---|---|---|
| C1 | Centre workspace | Teacher seats, shared centre library, house style (logo, colours, instruction language, worksheet template, tone), centre-wide specialists. |
| C2 | Branded Student Assistant | L1, L2, L6, L7 and L10 for the centre's students under the centre's name, on the web and in the student Telegram bot. Teachers set per-group rules (hint-only during homework, topics to focus on). |
| C3 | Office assistant | Lead follow-up drafts, answers to common admissions questions (prices, schedule, levels) from a centre-maintained FAQ, trial-lesson booking drafts. Reads Academy leads when connected. Every outbound message is Approve & run. |
| C4 | Marketing studio | Instagram and Telegram posts, ad copy, event announcements and results posts in uz/ru/en, in the centre's brand voice. Results posts only use results the centre entered or Schood verified; it never invents scores or testimonials. |
| C5 | Placement tests | Generates a placement test for a level range (checked keys, as T2), AI-marked writing and speaking parts, and a placement report. |
| C6 | Insights | What the centre's students ask the assistant, grouped by topic per group (minimum 5 students per group shown; never individual transcripts), plus group weak spots. |
| C7 | Admin | Seats, invites, credit budget per teacher and per student, feature switches, data retention, audit log, usage and cost report. |

## Credits: the one unit

Every AI action costs credits. One credit is about one tutor reply. Plans grant monthly credits; everyone gets a free daily allowance; packs top up. Centre credits are pooled in the centre workspace and allocated by budget to teachers and students.

| Action | Credits `[ASSUMPTION]` |
|---|---|
| Tutor or assistant reply (L1, C2, T7) | 1 |
| Explain a mistake with 3 similar items (L2) | 2 |
| Writing feedback, one draft (L3) | 5 |
| Speaking turn (L4) / full mock interview with report | 1 / 10 |
| Study plan build or re-plan (L5) | 3 |
| Words from a text (L6) / graded reading (L10) | 2 / 3 |
| Photo explain (L9) | 3 |
| Application essay review (L8) | 8 |
| Material generation, single (T1) / exam-style set or placement test (T1, C5) | 10 / 15 |
| Differentiate into three levels | +10 |
| Marking, per script (T3) | 4 |
| Lesson plan (T5) / term outline | 5 / 10 |
| Feedback or report comment (T4), parent message (T8), marketing post (C4) | 1 / 1 / 3 |

The price table lives in `packages/ai-core` so the app shows the cost before every action, and the function charges exactly that. Credits are charged before the model call and refunded automatically when the call fails.

## Plans (proposed, UZS) `[ASSUMPTION]`, owner to confirm before they go on sale

| Plan | Price | Includes |
|---|---|---|
| Free | 0 | 30 credits a day, all Free features |
| Schood AI Plus (learner) | 49,000 / 30 days; 129,000 / 90 days | 1,500 credits a month, every learner feature |
| Schood AI Teacher | 99,000 / 30 days | 3,000 credits a month, T1–T6, library without limits |
| Schood AI Centre | 490,000 / 30 days | 5 teacher seats, Student Assistant for up to 100 students, 10,000 pooled credits, C1–C7 |
| Extra teacher seat / extra 100 students / 10,000-credit pack | 79,000 / 59,000 / 149,000 | Add-ons for centres |

- Learner and teacher plans sell through the normal Click → entitlements path, like every other Schood product.
- Centre plans are granted manually (support grants the entitlement) until tenant checkout is confirmed working, the same rule as the Schood Teaching plans.
- Plans ship inactive (`is_active = false`) until the owner confirms prices and the model decision below.

## Models and cost

- One gateway (`supabase/functions/schood-ai/gateway.ts`) for every call. It resolves the model per tier from env (`SCHOOD_AI_MODEL_STANDARD`, `SCHOOD_AI_MODEL_VISION`, `SCHOOD_AI_MODEL_PREMIUM`), falling back to `OPENROUTER_MODEL` and then the free `google/gemma-4-31b-it:free`, which homework pre-marking already uses. A fallback chain (`SCHOOD_AI_FALLBACK_MODELS`) covers rate-limit errors.
- Every call is recorded: feature, user, workspace, model, tokens, latency, status, credits.
- Caps: a global daily call cap (`SCHOOD_AI_GLOBAL_DAILY_CALLS`) protects the shared OpenRouter allowance, plus per-user and per-workspace daily caps. A cap returns a clear "try again later" state, never a broken screen.
- Owner decision pending: free models are rate-limited per day and some free providers keep prompts. For paid plans and for students' chats a paid, no-training model is likely needed. `[VERIFY]` OpenRouter's current free-model limits and the data policy of the chosen providers.

## Trust, safety and privacy

- **Teacher approval:** generated material and AI marks are drafts until a teacher approves them. `[DECIDED]`
- **Approve & run:** sending a message, assigning homework or publishing items always needs a click by a person with the right role. `[DECIDED]`
- **Hint mode:** while a centre homework is open, the assistant gives hints for that assignment, not answers. `[DECIDED]`
- **No invented facts in marketing:** results posts use only entered or verified results; no invented testimonials or guarantees.
- **Original content:** generation prompts ask for original text and never reproduce published exam books. Material a centre uploads stays private to its workspace.
- **Chats:** a learner can delete their history at any time. Student chats are deleted after 180 days unless pinned `[ASSUMPTION]`. Centre staff see grouped topics (C6), never a student's transcript.
- **Consent text and retention** need the owner's review before the Student Assistant opens to under-18s.
- **Abuse:** a report button on every AI answer; reports go to the Schood admin queue.

## Architecture

```
apps/schood-ai (Vite, React 19, uz/ru/en, ai.schood.online)
  src/core      auth, api client, credits, layout, chat UI, review card, approve & run card, editor
  src/teacher   Materials Studio, library, planner, marking, feedback
  src/learner   tutor, explain, writing, speaking, plan, words, photo, essays, reading
  src/centre    centre workspace admin, student assistant settings, office, marketing, placement, insights
packages/ai-core (pure TypeScript, used by the app and the function)
  credit prices, material schemas and validators, deterministic key checks, CEFR and exam-format adapters
supabase/functions/schood-ai (Deno, handler + repository + memory repository, like admission)
  index.ts, handler.ts (router), gateway.ts, credits.ts, context.ts, repository.ts, memory-repository.ts
  teacher/*.ts, learner/*.ts, centre/*.ts   (one module per feature area, registered in handler.ts)
supabase/migrations/2026103*_schood_ai_*.sql
.github/workflows/schood-ai-ci.yml, configure-schood-ai-domain.yml
```

- **Auth:** the shared `.schood.online` session, like every other app. All tables deny direct client access; the function uses the service role with explicit checks (Admission pattern).
- **Region:** the app imports `packages/edge-region` first, so calls use `ap-southeast-1`.
- **Streaming:** chat replies stream over server-sent events. Long generation runs as a job record that the app polls, with every model call kept well under the edge function time limit (split big materials into sections).
- **Workspaces:** every user gets a personal workspace on first use. A centre workspace is linked to an Academy tenant (created by its owner, checked against Academy roles) or created by a Schood admin for a centre without Academy. Members have roles owner, admin, teacher, student; teachers and students join by invite link or code.
- **Academy and Assessment Cloud:** read and write only through their existing APIs with the user's own token, so their permission rules apply. Schood AI does not write their tables directly.
- **Telegram:** the student bot (`workers/schood-bot`) gets an AI mode (`/ai`) that relays to the function with the bot's service secret and the Telegram-linked Schood user. Homework hand-in in the same bot must keep working.
- **Deep links in:** `ai.schood.online/explain?source=<app>&session=<id>&item=<id>`, `/write`, `/speak`, `/tutor`. The other apps get an "Ask Schood AI" link on results and review screens.
- **Patterns from OpenDots** (CopilotKit/OpenDots, MIT): the library-and-editor layout, specialist agents, the review card and Approve & run card, and scheduled work that is marked interrupted and waits for a retry. Copy patterns or code, keep the MIT notice in any copied file, and do not use CopilotKit Intelligence, Docker computers, Composio, Slack or paid voice.

## Data model (core; feature areas add their own tables)

| Table | Purpose |
|---|---|
| `ai_workspaces` | personal or centre; tenant link; branding and house style; settings and switches |
| `ai_workspace_members` | user, role, credit budget, invite source |
| `ai_workspace_invites` | invite codes and links with role and expiry |
| `ai_pages`, `ai_page_revisions` | library pages: folder, kind, title, material JSON, editor document, revision number, source generation |
| `ai_threads`, `ai_messages` | conversations per user, specialist and optional page |
| `ai_specialists` | per workspace: name, role, instructions, allowed tools, enabled |
| `ai_generations` | jobs: feature, input, status (`requested → generating → ready → approved / rejected / failed`), output, verification report, model, credits |
| `ai_actions` | Approve & run queue: kind, payload, status, approver, result |
| `ai_credit_ledger` | append-only: account (user or workspace), delta, reason, feature, reference |
| `ai_calls` | one row per model call: feature, model, tokens, latency, status |
| `ai_reports` | user reports on AI answers |
| `ai_audit_events` | workspace admin actions |

## Build phases

| Phase | Scope | Branch |
|---|---|---|
| 1. Core and Studio | Service scaffold and deploy wiring, workspaces, credits, gateway, chat core, specialists, review and Approve & run cards, library and editor, Materials Studio (T1, T2, T5, T6) | `claude/ai-core` |
| 2. Learners | L1–L10, Telegram AI mode, "Ask Schood AI" links in the other apps | `claude/ai-learner` |
| 3. Teachers and centres | T3, T4, T7, T8, C1–C7, Academy and Assessment Cloud exports | `claude/ai-centre` |
| 4. Selling | Products, plans, bundles, `/pricing`, platform discovery, plan gates switched on | `claude/ai-pricing` |

Migration ranges: phase 1 `20261030100000–199999`, phase 2 `20261030200000–299999`, phase 3 `20261030300000–399999`, phase 4 `20261030400000–499999`.

## Done when

- A learner signs in at ai.schood.online, sees their results-aware tutor, and uses every L feature in uz/ru/en on a 375px phone.
- A teacher generates an IELTS Reading set at B2 with a checked key, edits it, saves it, prints it with their logo, and sends it to an Academy group as homework after Approve & run.
- A centre owner creates the centre workspace, invites teachers and students, sets budgets, and sees usage, cost and grouped insights.
- Every action shows its credit cost first, charges exactly that, and refunds on failure.
- Plans exist and switch on with one owner decision.

## North-star metric

Weekly active AI users who come back the next week, split by learner, teacher and centre, alongside credits used per paying account and model cost per paying account.
