# Centre area: requests to core, the teacher package and Academy

What the centres area (T7, T8, C1–C16, branch `claude/ai-centre`) needs from
others. Each item says what the centre does today in its own area, so nothing is
blocked, and what to delete once the request lands. Area docs:
`supabase/functions/schood-ai/centre/README.md`.

## Core

### 1. Mount the centre's public routes (until `anonymous: true` and `system: true` routes land)

The Telegram webhook of each centre's bot, the website widgets and the scheduler
have no Schood session, so core's router refuses them. The area serves them with
`createCentrePublicHandler` (`centre/public.ts`). Two lines in `index.ts`, in front
of the core handler, with the same deps:

```ts
import { createCentrePublicHandler, isCentrePublicPath } from './centre/public.ts';
const centrePublic = createCentrePublicHandler({ repository, gateway, plans, isAdmin, callFunction, stores }, { serviceSecret: Deno.env.get('SCHOOD_AI_SERVICE_SECRET') ?? null });
// in Deno.serve, before the core handler:
if (isCentrePublicPath(new URL(req.url).pathname)) return centrePublic(req);
```

`schood-ai` already has `verify_jwt = false`. When core's anonymous and system
routes land, the centre will move each path onto them and delete this seam. What
those routes need for the centre:

- **Anonymous** (C8 bot, C14/C8 widgets): the area checks the caller itself
  (Telegram's `X-Telegram-Bot-Api-Secret-Token` per bot; the `Origin` against the
  centre's own allowed list), so the route must let the area set
  `Access-Control-Allow-Origin` per centre and answer `OPTIONS`. Per-IP limits from
  core are welcome; the area keeps its per-centre daily counters. AI is charged to
  the centre's pool, acting as the owner (today `systemContext()` in `public.ts`).
- **System** (C10 Monday brief, retention, monthly ledgers, insights): one call a
  day is enough (the area is idempotent per day and per month); today
  `POST /public/centre/cron` with `X-Schood-Service-Secret`. A scheduler has to call
  it (pg_cron or a Cloudflare cron); nothing calls it yet.

### 2. The plan of a workspace for someone who is not a member yet

Joining a centre checks teacher seats and student places, which come from the
centre's plan. A person who is not a member cannot resolve that plan, so the area
caches the limits in `ai_centre_settings.limits`, refreshed whenever a manager
opens the centre. Request: `ctx.planFor(workspaceId)` (or plan limits on the
workspace row). Then `refreshLimits` and the cache go.

### 3. BYOK in the gateway (C15)

Built: sealed key storage, the UI, model hosts pinned per provider, and the
platform fee ledger (`ai_centre_byok_fees`, computed from `ai_calls` rows whose
`provider_key` starts with `byok:`). Missing: the gateway using the centre's key.
The hook we need: when a centre has an enabled own key for the provider the
registry picks, the gateway asks the area for the plaintext key
(`resolveByok(workspaceId, provider) → { label, apiKey } | null`, the area unseals
it), calls with it, records `provider_key = 'byok:<label>'`, and charges no
credits. The UI says "gateway_ready: false" until then.

### 4. Telegram through the Schood bot

The Monday brief goes through the centre's own bot to staff who linked it. For
managers who only linked the Schood bot, the area can send with
`SCHOOD_AI_TELEGRAM_BOT_TOKEN` (a copy of the Schood bot token; an owner decision,
unset by default). Request: `ctx.notify.send(userId, channel, text)` through the
Schood bot, so areas never hold that token.

### 5. Smaller notes

- The centre adds about 5.6 KB gzip to the main chunk (117.6 KB against 112.0
  without the area): the registry of 22 routes and 24 nav items (19 icons) and
  four home cards. Lazy home cards or icon names in `AreaNavItem` would cut most of
  it. All screens, catalogs and the teacher package load on demand.
- `apps/schood-ai/package.json` gained `pdfjs-dist` (lazy, for reading PDFs into
  staff knowledge, C13) and the lockfile with it.
- `packages/ai-core/src/centre/` is new: the placement test shape shared by the app
  and the function (moved out of the teacher's `materials/` folder).
- `.env.example` gained the area's setting names: `SCHOOD_AI_CENTRE_KEYS`,
  `SCHOOD_AI_CENTRE_KEY_ACTIVE`, `SCHOOD_AI_CENTRE_PUBLIC_URL`, `SCHOOD_AI_APP_URL`,
  `SCHOOD_AI_TELEGRAM_BOT_TOKEN`.
- `schood-ai-ci.yml` gained the centre's DB test step and paths (additive).

## Teacher materials package (`packages/ai-core/src/materials/`)

The centre maps placement tests and curriculum units onto the package and does
not edit it. What would let it drop its adapters:

1. **Pre-A1.** `LEVEL_PATTERN` and `CEFR_LEVELS` start at A1. Placement tests for
   young learners start at Pre-A1, which the centre maps to A1 in the material.
2. **A level per question.** Placement items carry their own level; today it rides
   in `skill: 'cefr:a2'`. A `level` on `Question` (or one question set per level,
   which the centre already does for AI drafts) would make it explicit.
3. **A `placement_test` kind** in `MATERIAL_KINDS` (questions, task, rubric;
   single_choice and gap; autoMarkable) so `checkMaterial` applies kind rules too.
4. **A shared solver prompt.** The centre writes its own instruction for the
   no-key solver call (`SOLVER_TASK` in `centre/placement.ts`). One exported prompt
   next to `solverTasks` would keep both areas' checks the same.

## Academy (outside Schood AI)

- **Delegated reads for scheduled work.** The Monday brief and the overview read
  Academy with a person's token. Scheduled briefs use the snapshot captured on the
  last staff visit (`ai_centre_academy_snapshots`) and say how old it is. A service
  read of `business_intelligence` and `alerts` for a centre that linked Schood AI
  would make the brief current.
- **Token-free lead intake.** The admissions bot cannot create a lead or a trial
  without a person's token, so bookings from the bot are confirmed in Schood AI and
  sent to Academy when staff approve (`centre_book_trial`), even in "automatic"
  mode. A service `create_lead` / `schedule_trial` scoped to the centre would make
  automatic booking reach Academy at once.
