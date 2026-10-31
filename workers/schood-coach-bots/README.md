# schood-coach-bots

The Telegram side of Schood Coaches (phase 6 of Schood AI, `docs/product/44_SCHOOD_AI.md`).
One Cloudflare Worker (free plan) serves every coach bot. It carries messages and does
no coaching itself: the coach engine runs in the `coach` area of the `schood-ai` function,
and the content comes from the packs in `packages/coach-packs/`.

```
Telegram ──webhook──▶ /tg/<pack> ──┬─ telegram-link (status, /start <token>)  worker secret
                                    ├─ schood-ai/coach/update                  service secret + user + chat
                                    └─ Bot API (replies, voice, polls)          bot token
Mini App ──initData──▶ /miniapp/session ── schood-ai/coach/miniapp-session ──▶ a Schood session
cron */5 ─────────────▶ schood-ai/coach/system-due ──▶ Bot API ──▶ schood-ai/coach/system-delivered
```

## Endpoints

| Path | Who calls it | Check |
|---|---|---|
| `POST /tg/<pack>` | Telegram | `X-Telegram-Bot-Api-Secret-Token` equals `COACH_WEBHOOK_SECRET_<PACK>` (or `_PREVIOUS` while rotating). Anything else gets 401. |
| `POST /miniapp/session` | The Mini App at `APP_URL` | CORS for `APP_URL` only. `initData` must carry a valid signature from that coach bot's token (see below). |
| `GET /health` | You | Lists the coaches that have a token. No secrets. |
| cron `*/5 * * * *` | Cloudflare | Calls the coach area's system routes with the service secret alone. |

## What happens to an update

- **Linked person** (telegram-link says the Telegram id belongs to a Schood account): the
  update becomes an event (text, command, button, voice, photo, poll answer). Voice and photo
  files are fetched from Telegram here (the bot token never leaves the Worker) and sent as
  base64. The event goes to `schood-ai/coach/update` with `X-Schood-Service-Secret`,
  `X-Schood-User-Id` and `X-Schood-Telegram-Chat-Id`, and never with an `Authorization`
  header or an `Origin`. The function checks that the chat really is linked to that user.
  Then the Worker sends the messages it gets back, in order, and reports new voice file ids
  and poll ids.
- **Not linked**: a welcome with three choices: the placement test, examples and "Link your
  Schood account". The placement test runs entirely in the Worker. Its answers ride in the
  button data (2 bits per answer, base 36), so nothing is stored and no model is called.
  After linking, the result can be saved.
- **`/start <token>`** from the web's "Link Telegram" page goes to `telegram-link` (action
  `validate`), which links the account. **`/start team_<code>`** joins a Coach Team.
- Groups, channels and other bots are ignored.

## Mini App sign-in (where the check lives)

Telegram signs a Mini App's `initData` in two ways, and both are checked:

1. **Here, with the bot token**: the HMAC-SHA-256 of the data-check string, keyed by
   `HMAC("WebAppData", bot token)` (`supabase/functions/_shared/telegram-init-data.ts`, the
   same check `telegram-app` uses), and at most 24 hours old. Only the Worker has the bot
   tokens. A page that names no coach (`/coach`) is matched to the bot whose token verifies it.
2. **In the function, with Telegram's public key**: `schood-ai/coach/miniapp-session`
   checks the Ed25519 `signature` field against Telegram's published production key and the
   bot's numeric id from `SCHOOD_AI_COACH_BOTS` (`supabase/functions/schood-ai/coach/telegram-auth.ts`).
   It also checks that the Telegram user is the chat linked to that account. Then core mints
   the Schood session (`ctx.auth.sessionFor(userId, { reason: 'coach.miniapp' })`). Core audits
   it as `core.session_issued` and limits it to 10 an hour and 30 a day per person. It never
   mints one for a Schood admin or an inactive account, and the coach area holds no admin
   auth client.

So a leaked service secret alone cannot sign anyone in: that also needs data Telegram signed.
The app stores the session with core's shared auth client, so the person is signed in to
`ai.schood.online` as themselves (`apps/schood-ai/src/coach/telegram.ts`).

## Free plan limits

- **50 subrequests per run.** The cron claims at most 40 deliveries, and each is one
  message, so a full run makes 42 calls (due + 40 sends + delivered). The cron also keeps a
  budget and reports any delivery past it as failed (`subrequest_budget`). A webhook makes
  about 4 to 10 calls.
- **About 10 ms of CPU per request.** Validating both packs takes about 12 ms, so the Worker
  indexes the packs without validating them (`ciValidatedPacks()`). CI validates every pack,
  and the function validates them again when it loads them.
- **Bundle**: about 1.3 MB minified, 348 KB gzipped (the limit is 3 MB). Most of it is pack
  content.
- **Cron triggers**: the free plan allows 5 per account. This Worker uses one.

## Secrets and settings

Worker (`wrangler secret put <NAME>`, never in `wrangler.toml`):

| Name | What |
|---|---|
| `SUPABASE_URL` | The production project's URL. |
| `SCHOOD_AI_SERVICE_SECRET` | The same value as the `schood-ai` function (32+ characters). |
| `COACH_BOT_TOKEN_<PACK>` | The bot's token from BotFather. `<PACK>` is the pack id upper-cased, with `-` written as `_`: `IELTS`, `SPEAKING`, `MATHS`, `SALES`, `CAREER`, `SPEECH`. |
| `COACH_WEBHOOK_SECRET_<PACK>` | 16 to 256 random characters from `A-Z a-z 0-9 _ -`, also given to `setWebhook`. |
| `COACH_WEBHOOK_SECRET_<PACK>_PREVIOUS` | Optional. Set only while rotating, then remove. |

`APP_URL` (`https://ai.schood.online`) is a plain var in `wrangler.toml`.

Function (Supabase secrets of `schood-ai`):

| Name | What |
|---|---|
| `SCHOOD_AI_COACH_BOTS` | `ielts:<bot id>:<username>,speaking:<bot id>:<username>,maths:…,sales:…,career:…,speech:…`. The bot id is the number before `:` in its token. Not secret. |
| `SCHOOD_AI_COACH_PASS_PRODUCT_IDS` | Optional. `B1:<product uuid>,B2:<product uuid>` (up to B6) for single-coach passes. |
| `SCHOOD_AI_COACH_FAIR_USE_CREDITS` | Optional. Credits a pass or team seat brings per coach every 30 days (default 1200). Core grants them through the plan source, with none for Plus or Family holders. |
| `SCHOOD_AI_COACH_APP_URL` | Optional. Defaults to `https://ai.schood.online`. |

The app build reads `VITE_COACH_BOTS_URL` (default `https://coach-bots.schood.online`).

## Turning a coach on (owner and coordinator)

Nothing here has been run. The order:

1. **Owner, in BotFather:** create one bot per coach (`/newbot`): IELTS Coach (`ielts`),
   Speaking Partner (`speaking`), Admission Maths Coach (`maths`), Sales Coach (`sales`),
   Career and Interview Coach (`career`) and Public Speaking Coach (`speech`). Keep each token private. The setup script sets the names, descriptions, commands
   and menu button, so BotFather needs nothing more.
2. **Coordinator:** apply the coach migrations (`20261030600000`, `20261030600100`, and the
   coach packs' `20261030700000`: saved scripts and the cohort histogram) with
   `supabase db push --linked` (after core's `20261030160000` and `20261030170000`). Deploy
   `schood-ai`. Set the function settings above.
3. **Coordinator:** set the Worker secrets, then deploy the Worker. Its custom domain is
   `coach-bots.schood.online`, so check that the DNS record exists.
4. **Owner or coordinator:** run the setup script against the live bot. A dry run first
   (no network):
   `deno run --no-lock --allow-read --allow-env workers/schood-coach-bots/scripts/setup-webhooks.ts ielts speaking maths sales career speech`.
   Then the same command with `--allow-net` and `--apply`, with `COACH_BOT_TOKEN_<PACK>` and
   `COACH_WEBHOOK_SECRET_<PACK>` set in the shell.
5. **Smoke test:** `GET https://coach-bots.schood.online/health` lists every coach with a token. In
   Telegram: `/start` shows the welcome, the placement test works unlinked, linking from
   `ai.schood.online/coach/ielts/link` works, and a text answer is scored by a Plus account.
   On `ai.schood.online/coach/ielts`, the response headers have no `X-Frame-Options` and the
   CSP `frame-ancestors https://web.telegram.org`. Other paths still send `DENY`.

Voice works only once a speech route (`stt`) and a voice route (`tts`) are configured in
the Schood AI model registry. Until then the coaches say so and use text everywhere.

## Rotating a webhook secret

Set `COACH_WEBHOOK_SECRET_<PACK>_PREVIOUS` to the current value and
`COACH_WEBHOOK_SECRET_<PACK>` to the new one. Run the setup script with `--apply`, check
that updates arrive, then remove `_PREVIOUS`.

## Reminders

The cron calls two `system: true` routes of the coach area, with the worker secret and no
person:

- `coach/system-due` claims due reminders and weekly reports (40 at most). It follows each
  person's Settings → Notifications: Telegram delivery on, the coach kind `coach.<pack>`
  (or the whole `coach` area) not muted. It takes the shared budget, which is at most 2 a
  day across every Schood bot and never in quiet hours. It renders each message in the
  learner's language, with no AI.
- `coach/system-delivered` records what Telegram did with each message. A blocked bot stops
  that person's reminders.

The public certificate check behind a share link is `coach/verify`. It is an `anonymous`
route, rate-limited per visitor.

## Local checks

```
deno test --no-lock --allow-all workers/schood-coach-bots/test/
deno check --no-lock workers/schood-coach-bots/src/index.ts
```

The whole loop (Telegram → this Worker → the function → memory stores) runs in
`supabase/functions/schood-ai/coach/e2e-*.test.ts` with a fake Telegram and a fake model.
To try it by hand, run `wrangler dev --port 8794` (local only; never `wrangler deploy` for a
`schood-*` project from a laptop).
