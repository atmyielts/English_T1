# Teacher area: requests to core

What the teacher area (T1–T6, T9–T15, branch `claude/ai-teacher`) needs from core. Each item says what the teacher area does until then. Every workaround lives in the teacher area and can be deleted when core ships the item.

## 1. A repository hook for an area's own tables (done in core)

- Core shipped `defineStore` and `ctx.store` in 5571577e. The teacher tables now go through `ctx.store(teacherStore)` (`teacher/deps.ts`); the teacher area's own service-role client is gone.

## 2. Request headers in `ctx.functions.call`

- **Need:** `FunctionCallInit.headers`, limited to an allowlist (`Idempotency-Key`, `If-Match`). Assessment Cloud refuses `POST /assessment-cloud/commands` without an `Idempotency-Key`.
- **Until then:** `deps.ts` `remoteCall` sends calls that need headers with `fetch`, with the person's own token, the anon key, an 8-second timeout and the same error mapping as `ctx.functions.call`. Calls without headers go through `ctx.functions.call`.

## 3. A scheduled entry point (cron) for areas (done in core)

- Channel autopilot (T11) is a job on core's scheduler: `registerSystemJob('teacher.channel_dispatch', { everyMinutes: 5 })`, with no route and no cron entry of its own. Approving a week still sends what is already due, and the page has a manual "Send due posts now".

## 4. Routes open without signing in (done in core)

- Live Quiz players join with a code and a nickname on `teacher/quiz-join-open`, `quiz-play-open` and `quiz-answer-open` (core's anonymous routes). A signed-in student still joins through the signed-in routes, so the class results name them.
- Limits count per open game (`rateKey`: a real code or player token names the game; anything made up returns null and is limited per IP). A class of 40 behind one school address plays at full speed; play allows 3,000 a minute per game under a 6,000-a-minute ceiling per address.
- **Note:** a request with no key is limited per IP at the same rate as a keyed one (core uses one `perMinute` for both). A separate, lower per-IP limit for unkeyed requests would let made-up tokens be slowed harder.

## 5. Lazy English catalogs for areas (done in core)

- Core loads every area's catalog on demand since 5571577e. The materials package is still imported from `packages/ai-core/src/materials/mod.ts` (not ai-core's `mod.ts`), which keeps its exam formats and schemas out of the first download.

## 6. Print: an independent teacher's own logo (done in core)

- Core's Settings → Your branding sets a personal workspace's logo, print name and colours (2a83553f). The Studio's print view uses them as core's print does; its own logo field is gone. It stays for the student copy, the teacher copy and the key on its own page.

## 7. Approving a generation from an area

- **Need:** a hook on `core/generations` approval, for example `registerGenerationApproval(feature, fn)`, so that approving a material job also saves its library page.
- **Until then:** the teacher screens approve through `POST teacher/material-decide`. It applies the same rules as `core/generations` (ready only; the owner, or staff in a centre), then creates the page with `ctx.library.create`. If the page cannot be saved, the job goes back to ready.
