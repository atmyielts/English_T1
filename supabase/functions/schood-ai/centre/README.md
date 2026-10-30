# Centres area (T7, T8, C1–C16)

The education-centre part of Schood AI: the centre workspace and its people, the
branded Student Assistant and the teacher's class assistant, drafts that leave
Schood only through Approve & run, placement tests, the admissions agent, and the
owner's reports. Screens are in `apps/schood-ai/src/centre/`; the product spec is
`docs/product/44_SCHOOD_AI.md`. Requests to core are in
`docs/product/ai-requests/centre.md`.

## Rules this area keeps

- **No free AI.** Every model call goes through `ctx.ai` with a key from
  `packages/ai-core/src/credits.ts`. AI work in a centre is charged to the centre's
  pooled credits, within each member's budget. Work with nobody signed in (the
  admissions bot, the website widgets, the Monday brief) pays from the centre's pool
  through core's `ctx.paidBy(centre)` and nothing else (`runner.ts`), and only after
  the centre switched that bot, widget or brief on.
- **Nothing invented.** Drafts that state facts (parent messages, results posts,
  the brief, admissions replies) go through `draft.ts`: every number in a draft must
  appear in the facts it was given, with one correction turn; otherwise the draft
  is refused (`draft_unverified`) and the credits come back. Results posts use only
  verified results of students who agreed to be named.
- **Academy through its API only**, with the person's own token
  (`ctx.functions.call('academy', …)`, `academy.ts`). Writes to Academy are action
  kinds that run when a person with the right role approves them.
- **Privacy.** Insights never show a group under five students and never quote a
  conversation. Conversations are kept for the centre's retention (30–180 days,
  inside core's 180). Account closure erases personal rows (see Data).

## Context providers

### `centre_rules` (self view)

For a student of a centre: the rules of their groups, for the learner area's
homework helper (L7) and the Student Assistant. The learner area reads exactly
these fields:

```ts
{
  homework: {
    default?: 'hints_only' | 'explain' | 'off',
    assignments?: { [academyAssignmentId: string]: 'hints_only' | 'explain' | 'off' },
  },
  focus_topics?: string[],
}
```

- `homework.default` is the group's homework rule: the one a teacher set on the
  group (Groups → Homework helper), or the one its hint policy implies
  (`off` → `explain`, otherwise `hints_only`). With several groups the strictest
  wins (`explain` < `hints_only` < `off`). A student in no group gets `hints_only`.
- `homework.assignments` holds the per-homework rules teachers set for Academy
  homework (`centre/assignment-rules`), strictest across the student's groups. With
  `ctx.context(['centre_rules'], { ref: assignmentId })` that assignment is always
  included, even when the list is cut at 50.
- `focus_topics` are the groups' focus topics (at most 12).

Extra fields, which callers may ignore: `centre` (name), `hint_policy`
(`during_homework` | `always` | `off`), `rule` (the hint policy in plain English for
the prompt) and `groups` (`name`, `level`, `hint_policy`, `homework`,
`focus_topics`, `teacher_note`).

### `teacher_classes`

For owners, admins and teachers in an Academy-linked centre: their classes with
missed homework, absences and averages, read from Academy with their own token.
Used by the teacher assistant (T7), which is read-only.

## Specialists

- `student_assistant` (C2): the centre's branded assistant for students, named and
  styled by the centre (house style, assistant name). Reads `centre_rules` and the
  learner profile. Core's `/tutor` opens it for centre students.
  Credit key `student_assistant.reply`.
- `teacher_assistant` (T7): answers about the teacher's own classes from
  `teacher_classes`; cannot send or change anything. Credit key
  `teacher_assistant.reply`.

Owners and admins tailor both at `/settings/assistants` (core).

## Action kinds (Approve & run)

| Kind | Area | Approvers | What runs |
|---|---|---|---|
| `centre_parent_message` | T8, C11 | owner, admin | Academy `send_guardian_message` or `queue_guardian_notification` to a guardian; `send_message` to the student |
| `centre_lead_message` | C3 | owner, admin | Sends through the centre's Telegram bot when the lead wrote to it (otherwise staff send it themselves), then Academy `record_lead_activity` |
| `centre_book_trial` | C8 | owner, admin | Academy `create_lead` and `schedule_trial` |
| `centre_publish_course` | C12 | owner, admin | Academy `upsert_course/module/lesson`, `publish_course`; progress is kept, so a retry continues |

## Credit keys used

`student_assistant.reply` (C2), `teacher_assistant.reply` (T7), `parent.message`
(T8), `office.draft` (C3, assumed), `marketing.post` (C4), `placement.generate`
and `placement.mark` (C5, mark assumed), `admissions.reply` (C8), `owner.brief`
(C10), `winback.message` (C11, assumed), `curriculum.outline` (assumed) and
`curriculum.unit` (C12), `knowledge.answer` (C13), `observation.feedback` (C16,
assumed). BYOK calls (C15) are not charged in credits; they carry a platform fee
in `ai_centre_byok_fees` (the gateway hook is a core request).

## Teacher materials (C5, C12)

Placement tests and curriculum units use the teacher area's material model in
`packages/ai-core/src/materials/` (imported only through `materials/mod.ts`):

- `packages/ai-core/src/centre/placement.ts` keeps the builder's compact test shape
  and maps it onto a `placement_test` material (`placementMaterial`): each item is a
  teacher question with its own level (`Pre-A1` to `C2`), so keys go through the
  teacher's `checkMaterial` with the kind's rules and answers are marked with its
  `isCorrect`. `placement-generate` drafts a test per level with the teacher's
  lenient reader, leaves out items with broken keys and has a second model call
  solve the rest without the key, with the teacher's shared solver prompt
  (`SOLVER_SYSTEM`, `SOLVER_INSTRUCTIONS`, `solverPayload`) and `compareSolver`;
  disagreements are listed on the draft (`placement-draft-review`).
- Curriculum units are `lesson_plan` materials: a `stages` block per lesson and the
  unit test as a `questions` block (`curriculum-content.ts`).

## Routes with nobody signed in (core's anonymous and system routes)

`public.ts`, registered in `mod.ts`:

- `POST centre/bot-webhook?bot=<ref>&key=<secret>` (anonymous): the centre's own
  Telegram bot (C8). The random bot ref and a per-connection secret are in the
  webhook URL, because routes cannot read Telegram's secret-token header yet (a
  core request); Telegram also gets that secret as its `secret_token`. Updates are
  de-duplicated (`ai_centre_tg_updates`) and answered after the 200. Staff link
  their chat with a one-time code from the app. Telegram's servers are a few
  addresses for every centre, so this route has the highest per-IP limit core allows.
- `GET centre/embed-config`, `POST centre/embed-chat | embed-poll | embed-placement`
  (anonymous): the website widgets (C14, C8). A centre's site loads
  `/embed/widget.js` from ai.schood.online; the script talks through a hidden
  `/embed/bridge.html` on ai.schood.online (core only answers its own origins). The
  bridge passes the embedding page's origin, which the browser reports with each
  message, as `site`; the route answers only sites on the centre's allowed list.
  `_headers` lets only the bridge be framed; the universal `/*` rule is unchanged.
- `POST centre/system-brief` (system, every 10 minutes): builds due Monday briefs
  (at most 8 a call) and delivers them by each manager's notification preferences
  (kind `centre.brief`); retries what quiet hours or the daily limit held back.
- `POST centre/system-daily` (system, six calls a night): once a day per centre,
  retention, this and last month's wholesale and fee ledgers, insights.

The schedules are in the centre migration (`invoke_schood_ai_system`). The routes
use `asCentre` (`runner.ts`): `ctx.workspace()` answers with the centre, AI is
`ctx.paidBy(centre)`, actions are proposed by nobody for staff to approve, and
feature checks use the plan a manager's last visit stored (`refreshPlanCache`),
since core has no `ctx.planFor` yet; each charge still checks the live plan.

## Data

Migration `supabase/migrations/20261030400000_schood_ai_centre.sql` (range
`20261030400000`–`499999`). All tables have RLS on and no browser grants; only the
function's service role reads them, behind the routes' role and workspace checks.
Atomic steps are SQL functions (joining with seats and places, public counters,
staff codes, knowledge search, usage).

- The area store is one core `defineStore('centre', …)` handle (`binding.ts`): the
  Postgres store over core's service-role client in production, a memory twin
  bound to the memory repository in tests and the dev stack
  (`stores.use(centreStore, centreRuntime(deps))`).
- Secrets (centre bot tokens, own model keys) are sealed with AES-256-GCM in
  `crypto.ts` (`v1:<key id>:<iv>:<data>`, bound to workspace, purpose and label).
  The repo has no Vault or pgsodium setup, so keys come from function settings:
  `SCHOOD_AI_CENTRE_KEYS` (`id:base64key,…`) and `SCHOOD_AI_CENTRE_KEY_ACTIVE`.
  Without them, features that store a secret refuse (`secrets_unconfigured`).
  A trigger stops sealed values being rewritten; a revoked secret stays revoked.
- Account closure anonymises the users row, so nothing relies on cascades from
  `public.users`. Group memberships, staff Telegram links and staff codes are in
  `account_personal_erasure_tables()`. `ai_centre_erase_account(p_user)` is a
  service hook after core's: it deletes the person's placement attempts and the
  observations of their lessons, unlinks observer links, and unlinks (does not
  delete) resell periods, which the wholesale charge still counts.

Settings read by the area store (`SCHOOD_AI_*` only): `SCHOOD_AI_CENTRE_KEYS`,
`SCHOOD_AI_CENTRE_KEY_ACTIVE`, `SCHOOD_AI_CENTRE_PUBLIC_URL` (the schood-ai
function's own URL, for bot webhooks and widget snippets),
`SCHOOD_AI_APP_URL` (invite links) and, optionally,
`SCHOOD_AI_TELEGRAM_BOT_TOKEN` (the Schood bot, for briefs to managers who have not
linked the centre's bot; an owner decision). Knowledge files use the repo's S3
media store (`_shared/media-storage.ts`) when it is configured.

## Tests and local runs

- `deno test --no-lock supabase/functions/schood-ai/` runs the area's tests with
  core's: `centre.test.ts` is the doc's end-to-end centre test (memory repository,
  fake model, fake Academy and Telegram); the others cover each feature.
- `node scripts/test-schood-ai-centre-db.mjs` applies core's and the centre
  migrations twice on PGlite and an isolated Docker Postgres, runs
  `supabase/tests/schood-ai-centre.integration.sql` (including account closure
  through `auth.users`) and races joins and counters across real sessions.
- `scripts/schood-ai-centre-dev-stack.ts` runs the real handler, anonymous and
  system routes included, over memory stores with a seeded Centre Pro centre (see
  the file's header for the two commands and the sign-in cookie).
