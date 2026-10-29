# 45 — Schood Company English (company.schood.online)

**Status:** building (2026-10-30). Owner decision: Company English is its own Schood service, English only for now, for companies to **test, place, train and prepare their workforce in English in every useful way**.

## 1. Product

**Buyers:** HR and L&D teams, heads of departments, and owners of Uzbek and Central Asian companies (hotels, banks, IT, call centres, logistics, retail, manufacturing, government bodies).

**Users:**
| Who | What they do |
|---|---|
| Owner / HR admin | Runs the workspace: people, seats, tests, training, reports |
| Manager | Sees and supports their own department |
| Employee | Takes placement and progress tests, learns job-role English, practises with AI, sees their own progress |
| Candidate (no account) | Takes a hiring test from a link |
| Schood staff | Opens workspaces, sets plan, seats and test limits, handles demo requests |

**What it does:**
1. **Hiring tests.** A link per vacancy, tailored to the job role, with an adaptive grammar and vocabulary section plus reading, listening, writing and speaking. AI grades writing and speaking. Integrity signals are recorded, candidates are compared, and a printable report is produced.
2. **Placement and progress.** Staff take a CEFR placement test, retest on a schedule, and their level updates automatically.
3. **Training by job role.** 11 tracks of workplace lessons with phrases, vocabulary, dialogues and exercises. AI role-plays (an angry guest, a client call, an interview) and an email/writing checker. Lessons are built on the company's own glossary. Each learning seat also unlocks the full Schood English app (all 7 skills).
4. **Insights.** A workforce level map by department, the gap to target, activity, a monthly report, CSV export, team challenges and live training sessions with attendance.
5. **Sales and operations.** Landing page with demo requests, self-serve free pilot, people management (invite, CSV import, team links, seats), and a staff console.

**Commercial model:**
- **Pilot:** free and self-serve. It includes `COMPANY_PILOT_TESTS` tests (default 10) and no learning seats.
- **Contract:** set up by Schood staff in the staff console. Staff set the status to `active` and set `seats_limit`, `tests_limit` and `contract_ends_at`, with invoice and bank transfer handled outside the app.
- **Prices:** not published, quote based. **No invented prices, testimonials or outcome claims anywhere.**
- **Levels:** reported as "Schood estimate" on the CEFR scale, never as an official certificate.

**Privacy:**
- An employee must agree before the company sees their progress (`company_members.consent_at`). Until then, HR sees only membership and test results of tests the company ran.
- Candidates agree to processing before starting.
- Private AI-tutor chats in Schood English are never shown to the company.

## 2. Architecture (built on `claude/company-core`)

| Piece | Where |
|---|---|
| Shared catalogue (levels, skills, roles, job roles, industries, scoring) | `packages/company-core/src/mod.ts` |
| API, one Edge Function | `supabase/functions/company/` — `handler.ts` router, `types.ts`, `util.ts`, `core.ts`, and one module per area exporting `routes` |
| Route test harness | `supabase/functions/company/testing.ts` (`FakeDb`, `testHandler`) |
| Database | `supabase/migrations/20261031100000_company_core.sql` |
| DB tests | `scripts/test-company-db.mjs` (throwaway Docker Postgres) with `supabase/tests/company*.sql` |
| App | `apps/company` (React 19, platform look via `packages/service-design`, i18n en/ru/uz via `packages/service-i18n`) |
| CI / deploy | `.github/workflows/company-ci.yml`, `deploy-pages.yml` (Pages project `schood-company`), `configure-company-domain.yml` |
| Secrets | `COMPANY_ALLOWED_ORIGINS`, optional `COMPANY_PILOT_TESTS`, `COMPANY_SELF_SERVE`, `COMPANY_AI_DAILY_LIMIT`, `COMPANY_APP_URL` |

**API rules (handler.ts):**
- Every route declares an `access` level:
  - `public`: no session.
  - `user`: any signed-in user.
  - `staff`: `users.role` starts with `admin`.
  - `org`: the path starts with `orgs/:org`. The caller must be an active member with one of `roles`. Staff may act in any workspace.
- A suspended workspace refuses writes unless the route sets `allowSuspended`. A closed workspace refuses everything for non-staff.
- Errors are `throw new CompanyError(code, message, status, details)`. The app shows `error.<code>` from i18n when that key exists.
- Use `ctx.audit(action, target, details)` after every HR change.

**Shared helpers in `core.ts`:**
- `syncAccess(db, userId)`: run after any seat, status or membership change. It calls `company_sync_english_access`, which grants or revokes the All Skills entitlement with source `company`.
- `reserveTest(db, orgId)`: run once per attempt start; throws `tests_exhausted`.
- `consumeAi(ctx)`: run before every AI call; when it returns false, answer with a friendly "AI limit reached today" and no AI.
- `logActivity(db, row)`: every lesson, role-play, writing check, test and session writes one row to `company_activity`. Insights and challenges read only this table, so **always log**.
- `usage(db, org)`.

**AI:**
- Call `ctx.ai({ systemPrompt, userPayload, feature, userId }, fallback)`. It is the English gateway, so calls are logged in `english_ai_calls` and each feature can be switched off from the English control centre.
- Features:
  - `company-writing-grade`
  - `company-speaking-grade`
  - `company-roleplay`
  - `company-writing-check`
  - `company-report-summary`
- Ask for strict JSON. Always handle `status !== 'ok'` (show "AI unavailable, try later", keep the learner's work).
- Feedback language follows the member's UI locale (`en`, `ru` or `uz`), sent in the request body.

**Data:**
- RLS is on for every `company_*` table, with no anon/authenticated grants. Only the function (service role) reads or writes them.
- New tables follow the same pattern:
  - add the RLS, `revoke` and `grant service_role` block;
  - add an `updated_at` trigger if the table has the column;
  - if it holds `user_id`, append it to `account_personal_erasure_tables()` with the same additive `do $$` block as the core migration.
- Migrations must be idempotent (`if not exists`, `create or replace`, `drop trigger if exists`). The DB test applies them twice.

**Core tables (already created):**
- `company_orgs`
- `company_departments`
- `company_members` (role, department, job_role, seat, level/level_score/level_source/level_at, target_level/target_date, consent_at)
- `company_invites` (personal or team link; token stored as sha256)
- `company_leads`
- `company_audit`
- `company_assessments`
- `company_attempts`: items without keys, answers, `skill_results` `{skill: {score, level, …}}`, `ai_feedback`, `integrity`, decision, notes, `certificate_code`
- `company_lesson_progress`
- `company_assignments`
- `company_activity`
- `company_ai_usage`

**App rules:**
- Pages are `AreaRoute`s in `src/areas/<area>/routes.tsx`. The `access` values mirror the API's.
  - `nav` puts a page in the role-filtered sidebar section: overview, me, people, hiring, training or insights.
  - `bare` renders without the header.
- `useSession()` gives `me`. `useWorkspace()` gives `org`, `member`, `departments`, `usage`, `hr`, `lead`, `staff` and `refresh()`.
- Call the API with `api<T>(path, { method, body, auth })`. Use `auth: false` for public routes.
- Links use `Link` and `navigate` from `router.tsx`.
- Text: every visible string goes through `useAppT()` with keys in your own `src/i18n/<area>.{en,ru,uz}.ts`, prefixed with `<area>.`. ru and uz are typed to the English keys, so missing keys fail the build.
  - Uzbek Latin uses ‘ (U+2018), for example o‘, g‘.
  - Shared labels for levels, skills, roles, job roles and industries already exist in core: `level.b1`, `skill.reading`, `job.sales`, and so on.
- Styles: put them in your own `src/areas/<area>/<area>.css`, imported from your routes file. Prefix classes with your area name and reuse the shared building blocks in `style.css` (`company-grid`, `company-stat`, `company-table`, `company-badge`, `button-link`, `company-toolbar`).
  - It must work at 360 px phone width with no horizontal page scroll.
  - Tables go inside `.company-table-wrap`.
- Charts are plain HTML/CSS bars or inline SVG. **Do not add npm dependencies.**
- Accessibility: labels on every input, `role="alert"` for errors, `role="status"` for notices, buttons for actions and links for navigation.

## 3. Workstreams and ownership

Each workstream works on its own branch from `claude/company-core` and **edits only the files it owns**. If you need something in a shared file (`handler.ts`, `types.ts`, `util.ts`, `core.ts`, `testing.ts`, `shell.tsx`, `session.tsx`, `api.ts`, `style.css`, `core.*.ts`, workflows, `package.json`), do not edit it. Put a local helper in your own files and list the request in your final report. `FakeDb` may lack a query method you need. In that case add a small subclass in your own test file, or keep your queries to the supported subset.

| Workstream | Function files | App folder | i18n | Migration (fixed name) | DB test |
|---|---|---|---|---|---|
| **hiring** | `hiring.ts`, `hiring/**` | `src/areas/hiring/` | `hiring.*` | `20261031110000_company_hiring.sql` | `supabase/tests/company-hiring.integration.sql` |
| **training** | `training.ts`, `training/**` | `src/areas/training/` | `training.*` | `20261031120000_company_training.sql` | `company-training.integration.sql` |
| **insights** | `insights.ts`, `insights/**` | `src/areas/insights/` | `insights.*` | `20261031130000_company_insights.sql` | `company-insights.integration.sql` |
| **gtm** (site, people, staff) | `site.ts`, `people.ts`, `staff.ts`, `people/**` | `src/areas/site/`, `src/areas/people/`, `src/areas/staff/`, plus it may rewrite `CreateWorkspace` in `src/areas/core/pages.tsx` | `site.*`, `people.*`, `staff.*` | `20261031140000_company_people.sql` | `company-people.integration.sql` |

A migration is needed only if the workstream adds tables or functions. Each integration test starts on a fresh database: the fixture in `supabase/tests/company.fixture.sql`, then `\i /work/migration.sql` (every company migration in order). It ends with `select 'company <area>: ok';`. Route tests go in `supabase/functions/company/<area>.test.ts` using `FakeDb` and `testHandler`.

**API namespaces (do not use another workstream's):**
- **hiring:**
  - `orgs/:org/assessments…`, `orgs/:org/attempts…`, `orgs/:org/placement…`
  - `orgs/:org/my/tests`, `orgs/:org/my/attempts…`
  - `public/t/…`, `public/attempts/…`, `public/v/…`
- **training:** `orgs/:org/tracks…`, `orgs/:org/learn…`, `orgs/:org/roleplay…`, `orgs/:org/writing…`, `orgs/:org/glossary…`, `orgs/:org/assignments…`, `orgs/:org/my/home`
- **insights:** `orgs/:org/insights…`, `orgs/:org/members/:member/profile`, `orgs/:org/reports…`, `orgs/:org/challenges…`, `orgs/:org/sessions…`
- **gtm:** `public/leads`, `join/:token`, `orgs/:org/people…`, `orgs/:org/departments…`, `orgs/:org/invites…`, `orgs/:org/settings`, `staff/…`

**App paths:**
- **hiring:**
  - `/w/:org/hiring`, `/w/:org/hiring/:assessment`, `/w/:org/hiring/:assessment/:attempt`
  - `/w/:org/placement`, `/w/:org/test/:assessment`
  - `/t/:token` (public, bare), `/v/:code` (public)
- **training:** `/w/:org/me` (replace the placeholder), `/w/:org/learn`, `/w/:org/learn/:track/:lesson`, `/w/:org/roleplay`, `/w/:org/writing`, `/w/:org/glossary`, `/w/:org/training`
- **insights:** `/w/:org` (replace the placeholder overview), `/w/:org/people/:member`, `/w/:org/reports`, `/w/:org/challenges`, `/w/:org/sessions`
- **gtm:** `/` (replace the placeholder landing), `/join/:token`, `/start` (may improve), `/w/:org/people`, `/w/:org/departments`, `/w/:org/settings`, `/staff`, `/staff/orgs/:org`, `/staff/leads`

**Contract between hiring and training:**
- `GET orgs/:org/my/tests` returns `{ tests: [{ assessment_id, title, kind, status: 'todo'|'in_progress'|'done', level: string|null, attempt_id: string|null, deadline_at: string|null }] }`.
- A member takes the test at `/w/:org/test/:assessment_id`.
- Training's My English page shows these and must handle a 404 (hiring not merged yet) by showing nothing.

### 3.1 hiring — tests, candidates, placement, certificates
- **Item bank** in `supabase/functions/company/hiring/bank/`. All content is original (no copying from IELTS, Cambridge, TOEIC or textbooks). Each item is tagged with skill, CEFR level (a1–c1, a few c2) and job_role (`general` or a specific one). Minimum:
  - grammar: 70 items;
  - vocabulary: 70 items, including at least 4 per job role;
  - reading: 12 workplace texts (emails, notices, policies, reports, chats) at A2–C1, each with 3–5 questions;
  - listening: 12 scripts (calls, meetings, announcements, voicemail), played with browser text-to-speech (copy the approach of `apps/english-hub/src/lib/speech.ts`), each with 3–4 questions and a replay limit of 2;
  - writing: 2 tasks per job role, plus general;
  - speaking: 3 prompts per job role, plus general.
  - A test checks the bank's counts, shape, unique ids, and that every answer key is valid.
- **Engine:**
  - Grammar and vocabulary: staged adaptive, starting at B1 with stages of 5 items, moving up or down a level by stage score.
  - Reading and listening: pick texts at the estimated level and the one below.
  - Each skill gets a 0–100 score → `scoreToLevel`; overall via `overallScore`.
  - Writing and speaking: AI rubric (task achievement, organisation, grammar, vocabulary; plus fluency and pronunciation-from-transcript for speaking) → score, level, strengths and improvements in the HR locale.
  - Speaking answers: browser speech recognition transcript with a typed fallback, labelled "transcript-based".
  - If AI is unavailable, the attempt stays `submitted` with a pending flag; HR can "Grade again" or enter a manual score.
- **Integrity:**
  - Keys never leave the server before submit.
  - The server enforces the deadline plus a 2-minute grace.
  - Answers autosave.
  - Recorded signals: tab hidden count, paste count, copy count, fullscreen exits, and seconds per section. They are shown as flags, never used to reject automatically.
- **HR features:**
  - create, edit, close and duplicate hiring tests (title, job role, skills, minimum level, time limit, max attempts, closing date, "show the candidate their level" switch);
  - the open link is shown at creation and can be regenerated;
  - candidate list with filters (meets minimum, status, decision), sort and side-by-side compare (up to 3);
  - shortlist/hold/reject with notes;
  - printable candidate report;
  - CSV export.
- **Candidate flow (`/t/:token`):**
  - intro (company, sections, time), consent checkbox, name/email/phone, microphone check if speaking is included;
  - sections, then submit, then a thank-you page with the level if allowed;
  - resume from localStorage token.
  - Public routes are rate-limited by `ctx.ipHash`: at most 5 starts an hour per IP per test.
- **Placement and progress:**
  - HR launches for everyone, a department or chosen people;
  - members take it signed in at `/w/:org/test/:assessment`;
  - grading updates `company_members.level*` and logs `test` activity;
  - a retest is allowed after an HR-set interval.
- **Every start calls `reserveTest`.**
- **Certificates:**
  - a code (`readableCode`) on every graded attempt;
  - public `/v/:code` shows name, company, level per skill and date, without contact details;
  - a printable certificate page for members.

### 3.2 training — learning by job role
- **Tracks** in `supabase/functions/company/training/tracks/`: all 11 job roles. Each has at least 8 lessons in two stages, Foundation (A2–B1) and Professional (B1–B2).
  - **Each lesson:** goal, 8–12 key phrases with ru/uz translation, 8–10 words with ru/uz, a model dialogue of 8–14 lines (played with browser TTS), 4–6 checked exercises (choice, gap fill, order the dialogue, match), and a workplace mission (an AI role-play scenario or a writing task).
  - All content is original. A test validates every track.
- **My English (`/w/:org/me`):**
  - level, target and gap;
  - tests to take (from hiring's `my/tests`);
  - active assignments with due dates;
  - continue lesson;
  - minutes and lessons this week;
  - a button to open Schood English (english.schood.online) if the member has a seat;
  - certificates.
- **Lesson player:** answers are checked server-side, progress goes to `company_lesson_progress`, and each lesson logs `lesson` activity with minutes.
- **AI role-play (`company-roleplay`):**
  - scenarios per job role (persona, goal, difficulty);
  - turn-based, with typing or speech recognition;
  - at most 12 turns;
  - a final feedback summary with score, good phrases and better phrases;
  - stored in a training table;
  - logs `roleplay` activity;
  - `consumeAi` before every turn.
- **Writing checker (`company-writing-check`):**
  - the learner pastes a work email or message and gets a corrected version, tone notes and explanations in their language;
  - 3 or more templates per job role;
  - logs `writing` activity;
  - stored drafts are deleted after 90 days (state this in the UI).
- **Company glossary:**
  - HR adds terms (term, meaning, ru/uz, example, department), including by CSV import;
  - employees practise them with flashcards and a quiz;
  - logs `glossary` activity.
- **Training admin (`/w/:org/training`):** HR assigns a track, target level and due date to departments or people, and sees completion per assignment.

### 3.3 insights — dashboards, people, reports, challenges, sessions
- **Overview (`/w/:org`):**
  - KPIs: people, learners active in the last 7 and 30 days, minutes this month, lessons, tests, average level, % at target;
  - level distribution;
  - department table;
  - level trend by month (from graded attempts);
  - things to do (people without placement, overdue assignments, candidates waiting for a decision);
  - pilot usage with "Talk to Schood about seats" (mailto/tel from settings, no invented numbers);
  - managers see only their department.
- **Person profile (`/w/:org/people/:member`):**
  - test history with per-skill bars;
  - lessons, role-plays, minutes, assignments, certificates;
  - Schood English activity (only with consent and a seat): read the learner's English activity tables by `user_id`, and find which ones hold minutes, XP and level.
- **Reports (`/w/:org/reports`):**
  - a printable monthly report (summary, level movement, departments, top improvers, hiring funnel, training completion);
  - CSV exports for people, attempts and activity;
  - a date-range filter;
  - optional AI narrative (`company-report-summary`) with a clear label.
- **Challenges (`/w/:org/challenges`):**
  - HR creates a challenge (name, dates, metric: points, minutes or lessons; scope: all or chosen departments);
  - leaderboards by department and by person, from `company_activity`;
  - every member can see standings.
- **Sessions (`/w/:org/sessions`):**
  - HR schedules live classes and workshops (title, trainer, time, duration, link or room, department or people);
  - members see their upcoming sessions;
  - HR marks attendance, which logs `session` activity.

### 3.4 gtm — landing, people, onboarding, staff
- **Landing (`/`, bare, public):**
  - hero and the problem it solves;
  - the 4 pillars (Test candidates, Place your staff, Train by job role, See progress);
  - how it works in 3 steps;
  - the job-role tracks and industries;
  - a mock sample report built in HTML/CSS;
  - a free pilot offer (tests count from config);
  - pricing as "by agreement, per seat and per test";
  - FAQ (privacy and consent, languages, AI, certificates as Schood estimates, invoices and bank transfer, data stays in Schood);
  - a demo request form → `POST public/leads`, rate-limited (5 a day per IP hash) and validated;
  - sign-in and "Start a free pilot".
  - en/ru/uz, with Russian as the strongest. No invented numbers or testimonials.
- **People (`/w/:org/people`):**
  - search and filters (department, role, level, seat, status);
  - invite one person, which gives a personal link to copy plus a Telegram share link;
  - CSV import (name, email, department, job role, role), which gives a CSV of links back;
  - team join links (department, job role, max uses, expiry);
  - edit role, department, job role, target level and date;
  - seat on/off within `seats_limit`, only for `active` workspaces, followed by `syncAccess`;
  - remove a member (status removed, seat off, `syncAccess`).
  - Managers may view their own department but not edit.
- **Departments (`/w/:org/departments`):** create, rename and delete (members move to "no department").
- **Join (`/join/:token`, user):**
  - shows the company and role, plus the consent text;
  - accepting activates the member (consent recorded), then `syncAccess`;
  - expired, used or revoked links get a clear message;
  - joining twice is harmless.
- **Onboarding:** after `/start`, guide the owner through departments, inviting people and creating the first hiring test (a link into hiring).
- **Settings (`/w/:org/settings`, HR):**
  - company profile and default language;
  - plan and usage (status, seats, tests, contract end);
  - the list of admins.
- **Staff console (`/staff…`):**
  - workspaces (search, status);
  - workspace detail: set status, `seats_limit`, `tests_limit`, `contract_ends_at` and `settings.ai_daily_limit`, then `company_sync_org_access`;
  - audit log;
  - leads pipeline (status, notes, link to a workspace);
  - open a workspace for a lead, which creates the org plus an owner invite link.

## 4. Local preview (no Supabase needed)

`apps/company/preview/` runs the **real** `company` function inside the browser on `FakeDb`, seeded with an active hotel workspace (3 departments, 17 people, six weeks of activity).
- Start it with `npm --workspace apps/company run preview:local`, or the launch.json entry for your worktree (`company-hiring` :5192, `company-training` :5193, `company-insights` :5194, `company-gtm` :5195).
- Personas: `?as=owner|hr|manager|employee|newcomer|staff|signedout`. Add `?reset=1` to reseed.
- Add your own seed data and AI stubs in `apps/company/preview/seed.<area>.ts`, which `boot.ts` picks up automatically:
  - `export function seed(db, world)` for data;
  - `export const ai = { 'company-roleplay': (payload) => ({ … }) }` for canned AI replies.
- Keep function area modules **browser-safe**: no `Deno.*` globals and no `npm:`/`jsr:` imports outside tests. Configuration comes from `ctx.env`, and AI only through `ctx.ai`.

## 5. Done means
- `deno test --no-lock packages/company-core/src/ supabase/functions/company/` passes.
- `deno check --no-lock supabase/functions/company/index.ts` passes.
- `node scripts/test-company-db.mjs` passes (Docker).
- `npm --workspace apps/company run build` passes (strict TS, complete ru/uz).
- `node scripts/verify-assessment-boundaries.mjs` passes.
- Pages checked in the browser preview at desktop and 360 px width.
- Commit on your branch; do not merge, push to main or deploy.
