# Centre area: requests to core, the teacher package and Academy

What the centres area (T7, T8, C1–C16, branch `claude/ai-centre`) needs from
others. Each item says what the centre does today in its own area, so nothing is
blocked, and what to delete once the request lands. Area docs:
`supabase/functions/schood-ai/centre/README.md`.

## Core

Everything the centre asked of core has landed (2a83553f, then 13563e28 and 1b49e886)
and is in use; the centre's stop-gaps are gone:

- anonymous routes for the centre bot (`ctx.headers` for Telegram's secret token,
  `rateKey` per bot) and the website widgets (`cors: 'any'`, `ctx.origin`);
- core's scheduler (`registerSystemJob`) for the Monday brief and the daily work, with
  `ctx.paidBy(centre)` paying for AI;
- `ctx.planFor` for joins by people who are not members yet and for the bot, widgets
  and jobs (the plan cache in `ai_centre_settings` is gone);
- `ctx.notify.send` for briefs through the Schood bot (no Schood bot token in the area);
- `registerOwnKeyResolver` for C15: a centre key now names a provider in Schood's
  registry, and calls with it log as `byok:<label>` and cost no credits;
- named nav icons and lazy home cards: the centre adds about 3.7 KB gzip to the main
  chunk (116.5 KB against 112.8 without it), the route and nav registry.

One difference to note: core's CONTRACT describes centre keys as sealed in Supabase
Vault. The repo has no Vault setup, so the area seals them itself with AES-256-GCM
(`crypto.ts`, keys from `SCHOOD_AI_CENTRE_KEYS`); they are never stored in plain text.
Moving to Vault is an owner decision.

### Smaller notes

- `apps/schood-ai/package.json` gained `pdfjs-dist` (lazy, for reading PDFs into
  staff knowledge, C13) and the lockfile with it.
- `packages/ai-core/src/centre/` is new: the placement test shape shared by the app
  and the function (moved out of the teacher's `materials/` folder).
- `.env.example` gained the area's setting names: `SCHOOD_AI_CENTRE_KEYS`,
  `SCHOOD_AI_CENTRE_KEY_ACTIVE`, `SCHOOD_AI_CENTRE_PUBLIC_URL`, `SCHOOD_AI_APP_URL`.
- `schood-ai-ci.yml` gained the centre's DB test step and paths (additive).
- `_headers` gained an additive `/embed/*` rule for the widget script; the universal rule is unchanged.

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
