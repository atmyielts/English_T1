# Centre area: requests to core, the teacher package and Academy

What the centres area (T7, T8, C1–C16, branch `claude/ai-centre`) needs from
others. Each item says what the centre does today in its own area, so nothing is
blocked, and what to delete once the request lands. Area docs:
`supabase/functions/schood-ai/centre/README.md`.

## Core

### Done: anonymous and system routes (core 2a83553f)

The centre's bot webhook, website widgets and scheduled jobs now run on core's
anonymous and system routes (`centre/public.ts`, registered in `mod.ts`), pay for AI
only through `ctx.paidBy(centre)`, and are scheduled by pg_cron in the centre
migration. The stop-gap handler and its `index.ts` mount request are gone. Three
things the move surfaced:

1. **Request headers on anonymous routes.** A route cannot read
   `X-Telegram-Bot-Api-Secret-Token`, so the bot's secret is also in the webhook URL
   (`?bot=<ref>&key=<secret>`), where request logs can see it. Request: let an
   anonymous route read a named header (for example
   `anonymous: { headers: ['x-telegram-bot-api-secret-token'] }` and
   `ctx.header(name)`). Then the key leaves the URL.
2. **Other websites calling anonymous routes.** Core refuses any `Origin` outside
   `SCHOOD_AI_ALLOWED_ORIGINS` before a route runs, so a centre's own website cannot
   call the widget routes. The widgets talk through a hidden bridge page on
   ai.schood.online (`/embed/bridge.html`) that passes the embedding page's origin
   (the one the browser reports for the message) as `site`; the route checks it
   against the centre's list. That works today. If core lets a route accept origins
   it checks itself (for example `anonymous: { origins: 'route' }`, with the route
   setting `Access-Control-Allow-Origin`), the bridge can go.
3. **One IP for many callers.** Telegram calls every centre's webhook from a few
   addresses, so the per-IP limit is shared by all centres' bots. The bot route uses
   the highest limit core allows (600 a minute, 100,000 a day). A per-route key other
   than the IP (here the bot ref) would separate centres.

### 2. The plan of a workspace for someone who is not a member yet (`ctx.planFor`)

Not landed yet, so the seam stays. Joining a centre checks teacher seats and student
places, and the bot, widgets and schedules check the centre's features; none of these
callers can resolve the centre's plan. The area stores the plan's seats and features
in `ai_centre_settings.limits` whenever a manager opens the centre (at most hourly,
`refreshPlanCache` in `shared.ts`) and reads them there (`runner.ts`). Every AI charge
on those routes still checks the live plan through `ctx.paidBy`. Request:
`ctx.planFor(workspaceId)`. Then the cache goes.

### 3. BYOK in the gateway (C15) (not landed; seam unchanged)

Built: sealed key storage, the UI, model hosts pinned per provider, and the
platform fee ledger (`ai_centre_byok_fees`, computed from `ai_calls` rows whose
`provider_key` starts with `byok:`). Missing: the gateway using the centre's key.
The hook we need: when a centre has an enabled own key for the provider the
registry picks, the gateway asks the area for the plaintext key
(`resolveByok(workspaceId, provider) → { label, apiKey } | null`, the area unseals
it), calls with it, records `provider_key = 'byok:<label>'`, and charges no
credits. The UI says "gateway_ready: false" until then.

### 4. Telegram through the Schood bot (`notify.send`; not landed, seam unchanged)

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
- `_headers` gained rules that let only `/embed/bridge` be framed (detaching
  `X-Frame-Options` and the frame-ancestors CSP there); the universal rule is unchanged.

## Teacher materials package (`packages/ai-core/src/materials/`)

The centre maps placement tests and curriculum units onto the package and does
not edit it. All four earlier requests landed at 117d961e and are in use: Pre-A1
(`toCefrLevel`), a level on each question (`questionLevel`), the `placement_test`
kind, and the shared solver prompt (`SOLVER_SYSTEM`, `SOLVER_INSTRUCTIONS`,
`solverPayload`; the centre's own prompt is gone). Nothing is open.

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
