# Teacher area: requests to core

What the teacher area (T1–T6, T9–T15, branch `claude/ai-teacher`) needs from core. Each item says what the teacher area does until then. Every workaround lives in the teacher area and can be deleted when core ships the item.

## 1. A repository hook for an area's own tables (done in core)

- Core shipped `defineStore` and `ctx.store` in 5571577e. The teacher tables now go through `ctx.store(teacherStore)` (`teacher/deps.ts`); the teacher area's own service-role client is gone.

## 2. Request headers in `ctx.functions.call`

- **Need:** `FunctionCallInit.headers`, limited to an allowlist (`Idempotency-Key`, `If-Match`). Assessment Cloud refuses `POST /assessment-cloud/commands` without an `Idempotency-Key`.
- **Until then:** `deps.ts` `remoteCall` sends calls that need headers with `fetch`, with the person's own token, the anon key, an 8-second timeout and the same error mapping as `ctx.functions.call`. Calls without headers go through `ctx.functions.call`.

## 3. A scheduled entry point (cron) for areas

- **Need:** a route flag such as `system: true` that accepts the worker secret without a user (`X-Schood-Service-Secret` only, no `X-Schood-User-Id`), plus a pg_cron job (the `invoke_*_worker` pattern) or the coach worker's cron calling it. Channel autopilot (T11) has to post at a time when nobody has a page open. The coach agent needs the same for reminders.
- **Until then:** due posts go out:
  - when the week is approved (Approve & run `post_to_channel` sends whatever is due);
  - every minute while a teacher has the autopilot page open (`POST teacher/channel-dispatch`, limited to their workspace).
  `teacher/channel.ts` `dispatchDue(ctx, null)` is ready to be called from the scheduled route for every workspace.

## 4. Routes open without signing in

- **Need:** a route flag such as `anonymous: true` (rate-limited by IP), and an app `api()` option to call it without a token. Students should be able to join a Live Quiz (T10) with a code and a nickname, without a Schood account.
- **Until then:** `/play` is a public page that asks students to sign in (a free account is enough; playing uses no AI). The player routes already identify a player by a per-game token, so they work as anonymous routes as soon as the flag exists.

## 5. Lazy English catalogs for areas (done in core)

- Core loads every area's catalog on demand since 5571577e. The materials package is still imported from `packages/ai-core/src/materials/mod.ts` (not ai-core's `mod.ts`), which keeps its exam formats and schemas out of the first download.

## 6. Print: an independent teacher's own logo

- **Need:** `core/library/PrintPage.tsx` shows the logo only in centre workspaces, and Settings shows the branding form only to centres. The teacher test asks independent teachers to print "with their logo".
- **Until then:** teacher materials print from the Studio's own print view (`/studio/page/:id/print`). It shows the personal or centre logo and offers the student copy, the teacher copy, and the key on its own page. In a personal workspace it also has a small logo field that saves `branding.logo_url` through `PATCH core/settings`, which already accepts branding from any workspace owner. Core's `/library/:id/print` still works and prints the teacher copy with the key at the end.

## 7. Approving a generation from an area

- **Need:** a hook on `core/generations` approval, for example `registerGenerationApproval(feature, fn)`, so that approving a material job also saves its library page.
- **Until then:** the teacher screens approve through `POST teacher/material-decide`. It applies the same rules as `core/generations` (ready only; the owner, or staff in a centre), then creates the page with `ctx.library.create`. If the page cannot be saved, the job goes back to ready.
