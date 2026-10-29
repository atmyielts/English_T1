# Schood AI function: the contract for feature areas

This is the brief for every agent building on `supabase/functions/schood-ai`. Read it with `docs/product/44_SCHOOD_AI.md`. The app has its own contract in `apps/schood-ai/src/CONTRACT.md`.

## Shape

- Routes are `/functions/v1/schood-ai/<area>/<action>`. The areas are `core` and `admin` (owned by the core agent), plus `learner` (learners and parents), `teacher`, `centre`, `coach` and `engage`.
- `handler.ts` is a pure router. It handles CORS, auth (JWT or the worker secret), the admin gate, body limits and errors, then calls your route with a `RequestContext` (`types.ts`).
- `index.ts` wires the environment only.
- Tests run the real handler against `memory-repository.ts` with a fake `fetch` for the model. See `fixture.test.ts`.

## Add a route

Your area already has `<area>/mod.ts`, registered in `handler.ts`. Add actions to it:

```ts
// learner/mod.ts
import type { FeatureModule } from '../types.ts';
import { writingFeedback } from './writing.ts';

export const learnerModule: FeatureModule = {
  area: 'learner',
  routes: {
    // POST /schood-ai/learner/writing-feedback
    'writing-feedback': { POST: writingFeedback, maxBody: 64 * 1024 },
    // Opt in if the Telegram worker may call it:
    'coach-turn': { POST: coachTurn, service: true },
  },
};
```

- Action names match `^[a-z][a-z0-9-]{0,60}$`.
- A handler returns a JSON value (sent as 200) or a `Response`. Use `ctx.sse(...)` for streams.
- To refuse, throw `new SchoodAIError(code, message, status, details)` with a stable `code`. The app translates `error.<code>`.
- Anything else becomes a 500 that names no detail.
- Validate every input with `input.ts` (`record`, `uuid`, `text`, `integer`, `oneOf`, `jsonObject`, `stringList`).
- `maxBody` defaults to 64 KB. Raise it only where needed, for example audio.
- Register specialists, context providers, action kinds and plan sources at module load, at the top of your `mod.ts` (see `core/mod.ts`).

## RequestContext (`ctx`)

| Member | What it gives you |
|---|---|
| `ctx.user` | `{ id, email, token, via: 'jwt' \| 'service', telegramChatId }`. `token` is null on the worker path. |
| `ctx.workspace({ roles? })` | The workspace in `?workspace_id=`, or the personal one (auto-created), with the caller's active membership. Throws `workspace_not_found` (404, the same for "not a member") or `role_required` (403). |
| `ctx.plan()` | `{ workspaceKind, plans, features, beta, grant, anchor }` for this workspace. |
| `ctx.access(featureOrKey)` / `ctx.requireFeature(...)` | The plan and role decision from `packages/ai-core` `featureAccess`. `requireFeature` throws `plan_required` (402, with `plans`) or `role_required`. |
| `ctx.ai` | Charged AI calls (below). The only way a route uses a model. |
| `ctx.context(kinds, { ref?, specialist? })` | Runs registered context providers. A failing or slow provider is skipped. |
| `ctx.actions` | The Approve & run queue: `propose`, `list`, `get`, `decide`. |
| `ctx.library` | Library pages: `create`, `get`, `save`, `list`, with the same rules as the routes (see The library). |
| `ctx.events.emit(event)` | Learning events. Written after the response; never fails the request. |
| `ctx.notify.allowed(userId, channel)` / `take(...)` | The notification budget: 2 a day per person across all bots, quiet 22:00–08:00 local. |
| `ctx.functions.call(name, path, init)` | Another Schood Edge Function, called with the person's own token, for Academy or Assessment Cloud. Throws `user_token_required` on the worker path. |
| `ctx.repo` | The repository (`types.ts` `SchoodAIRepository`) for core tables. Your own tables go in your own repository module. |
| `ctx.audit(event, details, target)` | Writes `ai_audit_events`. Use it for anything an admin or owner would want traced. |
| `ctx.after(work)`, `ctx.sse(produce)`, `ctx.now()`, `ctx.locale`, `ctx.idempotencyKey`, `ctx.body()`, `ctx.bytes()`, `ctx.query` | Plumbing. |

## Charged AI calls (`ctx.ai`)

Every model call names a credit key and its requirements. It never names a model or a provider; the registry decides.

```ts
const { data, credits, balance } = await ctx.ai.json({
  key: 'writing.feedback',                       // credit key from packages/ai-core credits.ts
  messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: wrapUserMessage(draft) }],
  schema: feedbackSchema,                        // packages/ai-core `s` builders; one repair turn on bad JSON
  requires: { noTraining: true },                // optional: capabilities (vision, json_schema…) or policy
});
```

- **What it does, in order:**
  1. checks plan and role;
  2. checks the switches (global, feature, workspace) and the route and model availability;
  3. takes a slot from the daily caps (global, spend, workspace, person);
  4. charges exactly the ai-core price, with the request's `Idempotency-Key` as reference;
  5. calls the model;
  6. refunds automatically on any failure.
- **Methods:**
  - `text`, `json` and `stream`;
  - `transcribe({ key, audio, mime, language })` returns text with word and segment timestamps when the provider gives them;
  - `speak({ key, text, voice, format })` returns audio;
  - `charged({ key, mode }, async (session) => …)` runs several calls under one charge, for example generate then solve without the key (T2). It is refunded if the callback throws.
- **Errors** are `SchoodAIError` with these codes: `plan_required`, `role_required`, `ai_disabled`, `ai_unavailable`, `capped` (429, with `scope` and `retry_after`), `insufficient_credits`, `budget_exhausted`, `retry_with_new_key`, `ai_failed`. The app shows each as a proper state.
- **Prompt safety:**
  - Build the system prompt with `prompt.ts`: `buildSystemPrompt` for chats, or your own system text that keeps the same rules.
  - Wrap anything a person typed or pasted with `wrapUserMessage`, and context with `dataBlock`. Text inside them is data, never instructions.
  - The model has no tools. Outbound effects go through `ctx.actions.propose`.
- **Images:** `{ type: 'image', url }` parts, as `data:` URLs (preferred) or https. A route needs a vision model, and the gateway filters for it automatically.
- **Speech:**
  - `stt` and `tts` have their own routes: `stt.<credit key>`, `stt.<area>`, `stt` (same for `tts`).
  - They never fall back to chat routes.
  - No speech route is seeded: the owner chooses the provider. Until then speech calls return `ai_unavailable`.

## The model registry (provider-agnostic gateway)

- Providers, models and routes live in `ai_providers`, `ai_models` and `ai_model_routes`, edited through `admin/*`.
- The seed is OpenRouter (`OPENROUTER_API_KEY`) with `google/gemma-4-31b-it:free` on the `default` route.
- **Route lookup:** most specific wins: `<credit key>` → `<area>` → `tier.<standard|vision|premium>` → `default`. A matching route is final; its policy is never bypassed by falling through.
- **Adapters** in `providers/`: `openai_compatible`, `anthropic`, `google_gemini`, `cloudflare_workers_ai` (with `config.account_id`; chat plus Whisper speech to text).
- Fallback runs through the route's models in order, with a per-isolate circuit breaker. Every attempt is a row in `ai_calls` with tokens, latency, status and USD cost.
- **Keys** are Supabase secrets named by `api_key_env`; no key is ever stored in a table. Allowed names:
  - the well-known provider names, pinned to their own hosts;
  - `CLOUDFLARE_AI_API_TOKEN` (a Workers AI token, never the Pages deploy token);
  - `SCHOOD_AI_KEY_*` for custom endpoints.

## Extension points

| Registry | Where | Use it for |
|---|---|---|
| `registerSpecialist(def)` | `specialists.ts` | A chat assistant: key, names (uz/ru/en), role prompt, allowed context kinds, credit key, roles, starter prompts. `core/chat` serves it. Workspaces can override names and instructions, narrow context and roles, or switch it off (`ai_specialists`). |
| `registerContextProvider(kind, fn, { allowCustom?, selfView?, timeoutMs?, maxChars? })` | `context.ts` | Data the model may see, for example `homework_open`, `group_weak_spots` or `coach_progress`. Check roles inside the provider. `selfView` only for data about the caller (shown in `core/context`). |
| `registerActionKind({ kind, area, approverRoles, parse, summary, display?, run, retrySafe?, expiresInHours? })` | `actions.ts` | Approve & run: `send_parent_message`, `assign_homework`, `post_to_channel`, `book_trial`. `run` executes as the approver, with their token. |
| `registerPlanSource(name, fn)` | `plan.ts` | Extra plans or directly granted features: children of a Family holder → `plus`, a coach pass → `features: ['B4']`, a team seat. |

## The library (pages)

Every saved material is a page in the library of a person's or a centre's workspace. A page has:

- a Markdown `body`, which is the editable document;
- an optional structured `material` of a registered kind;
- `folder`, `kind`, `title`, `status` (`draft`, `approved`, `archived`) and `visibility` (`private`, or shared with the workspace's staff);
- a `revision` number and version history.

Only staff roles (owner, admin, teacher) use the library.

- **Read and export:** your own pages, shared pages, and all pages for owners and admins. This needs no plan, so your library stays readable.
- **Create, edit, restore, duplicate, move folders:** need T6 in the plan. Edit is for the page's owner, or owners and admins on a shared page.
- **Delete:** the page's owner, or owners and admins on a shared page. No plan needed.
- **Sharing** (`visibility: 'workspace'`) exists only in centre workspaces. Sharing changes and deletes in a centre are written to the audit log.
- **Linking a generation** (`sourceGenerationId`): only one from this workspace, and your own unless you are an owner or admin.
- **Saves:** fields you leave out are kept. A new `material` without a `body` rebuilds the body with the kind's `toMarkdown`. A version of the previous state is kept when you pass `snapshot: true`, when someone else edited the page last, or when the last version is over ten minutes old; the newest 200 are kept. Search covers the title, folder names and body (whole words), plus partial matches in titles.

### Routes

| Route | Use |
|---|---|
| `GET core/pages?folder=&kind=&status=&q=&scope=mine\|workspace\|all&limit=&before=` | List and full-text search. Returns `{ pages: PageSummary[] }`. |
| `POST core/pages` | Create: `{ title, kind?, folder?, body?, material?, visibility?, status?, source_generation_id? }`. Returns `{ page }`. |
| `GET core/page?id=` | One page: `{ page: PageView }`. |
| `PATCH core/page` | Revision-checked save: `{ id, expected_revision, title?, body?, material?, folder?, visibility?, status?, snapshot? }`. Returns `{ page }`, or **409 `revision_conflict`** with the current `page`. |
| `DELETE core/page` | `{ id }`, for the owner or managers. |
| `GET core/page-revisions?id=` / `GET core/page-revision?id=&revision=` | Version history and one snapshot. |
| `POST core/page-restore` | `{ id, revision, expected_revision }`. Restoring is itself a new revision. |
| `POST core/page-duplicate` | `{ id }` copies a page you can see into your own pages. |
| `GET core/page-export?id=&format=markdown\|telegram\|json` | `{ export: { format, filename, mime, parts } }`. Telegram text is split into messages of at most 4,000 characters. |
| `GET core/folders` / `POST core/folders` | Folders with counts; `{ from, to }` renames a folder for the pages you can edit. |

Print is done in the app: `/library/:id/print` uses the browser print stylesheet with the workspace's logo and colour.

### From your area

`ctx.library.create / get / save / list` apply the same rules as the routes. For example, the teacher area saves an approved generation:

```ts
const page = await ctx.library.create({
  kind: 'worksheet', title, material, folder: 'Worksheets/B1', sourceGenerationId: job.id,
});
```

### Material kinds

Define the kind once in `packages/ai-core/src/materials/<kind>.ts` (a `MaterialKindDefinition` with a `schema`, `toMarkdown` and an optional `toTelegram`). Then register it on the function side at module load:

```ts
registerMaterialKind({ ...worksheetKind, area: 'teacher' });
```

- A page's `material` is validated with the kind's schema on every create and save.
- A page created without a `body` gets `toMarkdown(material)`.
- Unknown kinds are refused.
- The built-in kinds are `note` (a free document) and `chat_answer` (a saved assistant answer).

## Credit keys and plans

- `packages/ai-core/src/credits.ts` holds the price table. `plans.ts` holds the plan → feature matrix (`FEATURES`, `featureAccess`), monthly grants and seats.
- To add an action, add a key such as `area.action` with its `feature`, `credits` and `tier` (plus `requires` and `addOns` when needed). The app shows the same number the function charges.
- Mark a price the doc's table lacks with `assumed: true`.
- `priceTableProblems()` must stay empty. It is tested, and checked when the function starts.
- Edits to these two files must be additive: new keys and new rules. Never change an existing price or plan rule without the owner.

## Data and tables

### Core tables (owned by the core agent)

Migration `20261030100000_schood_ai_core.sql`. Every one has RLS on with no policies, so only the service role reads it.

| Table | Purpose |
|---|---|
| `ai_settings` | The global switch, per-feature switches and caps (one row) |
| `ai_workspaces`, `ai_workspace_members`, `ai_workspace_invites` | Workspaces. Roles: owner, admin, teacher, student, parent. Monthly member budgets. The centre agent builds invites, seats and budgets on these. |
| `ai_credit_accounts`, `ai_credit_ledger` (append-only), `ai_usage_daily` | Write only through the SQL functions: `ai_credit_charge`, `ai_credit_refund`, `ai_credit_grant`, `ai_credit_balance`, `ai_take_call`. The service role cannot write these tables directly. |
| `ai_providers`, `ai_models`, `ai_model_routes`, `ai_calls` | The registry and call log. The log takes inserts only. |
| `ai_threads`, `ai_messages`, `ai_specialists` | Chat |
| `ai_generations` | Jobs: `requested → generating → ready → approved/rejected/failed`, with `heartbeat_at` for interrupted runs. Teacher and centre create and update them; `core/generations` polls and decides. |
| `ai_pages`, `ai_page_revisions` | Library pages. The core agent extends these in milestone 2 for the shared library and editor that teacher and centre use. |
| `ai_actions`, `ai_reports`, `ai_audit_events` | The Approve & run queue, reports, audit |
| `ai_learning_events` (append-only), `ai_notify_prefs`, `ai_notify_daily` | Events and the notification budget. `ai_notify_daily` is written only by `ai_notify`. |

### Your own tables

- Prefix them with your area, for example `ai_learner_*`, `ai_teacher_*`, `ai_centre_*`, or `coach_*` for the coach engine as the doc names them.
- Enable RLS on each with an explicit `alter table public.<t> enable row level security;` line (`verify:prod` checks for it), and revoke from `anon` and `authenticated`.
- Reference `ai_workspaces(id)` and `users(id)` with `on delete cascade`.
- Do not alter core tables. If you need a column there, ask the core agent.

## Migration ranges

| Owner | Range |
|---|---|
| Core | `20261030100000`–`20261030199999` |
| Learner and parents | `20261030200000`–`20261030299999` |
| Teacher | `20261030300000`–`20261030399999` |
| Centre | `20261030400000`–`20261030499999` |
| Pricing | `20261030500000`–`20261030599999` |
| Coach engine | `20261030600000`–`20261030699999` |
| Coach packs | `20261030700000`–`20261030799999` |
| Engage | `20261030800000`–`20261030899999` |

Test your migration the way `scripts/test-schood-ai-db.mjs` does: PGlite plus a throwaway Postgres container. Apply it twice.

## Callers other than browsers

The trusted Telegram worker sends three headers:

- `X-Schood-Service-Secret` (`SCHOOD_AI_SERVICE_SECRET`, at least 32 characters);
- `X-Schood-User-Id`;
- `X-Schood-Telegram-Chat-Id`.

The handler checks that this chat is linked to that user (`users.telegram_chat_id`, set by `telegram-link`). It refuses any request that also carries an `Origin`. Only routes with `service: true` accept the worker, never `admin/*`. Plans and credits apply to that person as usual. `ctx.user.via === 'service'` and `token === null`, so token-based context such as `learner_profile` is skipped. Learning events from this path are tagged `source: 'telegram'`.

## Chat stream (`POST core/chat`)

- **Body:** `{ client_message_id, message?, thread_id?, specialist?, regenerate? }`.
- **Before streaming:** refusals come back as JSON errors and nothing is stored.
- **Events:**
  - `start {thread, user_message_id, message_id, credits, balance, context}`
  - `delta {text}`
  - `done {message_id}`
  - `error {code, reason, refunded}`
- **After the stream:** a failed answer is refunded. A stop by the person keeps the charge and the partial text. `regenerate: true` answers the last message again.

## Learning events

`ctx.events.emit({ kind, area, feature, skill?, verified_minutes?, score?, outcome?, ref? })`.

- **Kinds:**
  - verified: `turn_scored`, `check_passed`, `drill_finished`, `mock_finished`, `outcome_recorded`;
  - not verified: `check_failed`, `lesson_viewed`, `goal_set`.
- Only verified kinds carry minutes; the database enforces it.
- Emit after a real learning act only. Opening something is never verified.
- An invalid event is logged and dropped, never thrown.

## Shared files you may touch (additive edits only)

| File | What you may add |
|---|---|
| `packages/ai-core/src/credits.ts`, `plans.ts` | New keys and rules |
| `packages/ai-core/src/schema.ts` | New builders, if you need them |
| `packages/ai-core/src/materials/<kind>.ts` | New files for your material kinds (re-export them from your own module; `mod.ts` stays core's) |
| `supabase/functions/schood-ai/<your area>/**` | Your own code |
| `handler.ts` | Nothing: your `mod.ts` is already registered |
| `.github/workflows/schood-ai-ci.yml` | New test paths |
| `release/manifest.json` | When you ship |
| `.env.example` | New key names |

Everything else in `supabase/functions/schood-ai/` (core, admin, gateway, providers, context, credits, prompt, repositories, types) belongs to the core agent. Ask before changing it. If you need a new `RequestContext` member, ask for it instead of adding it.

## Tests

- `deno test --no-lock supabase/functions/schood-ai/` and `deno check --no-lock supabase/functions/schood-ai/index.ts`.
- Write your area's tests with `fixture.test.ts`. Pass `modules` to add your module, and `setProvider` for model output.
