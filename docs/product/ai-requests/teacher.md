# Teacher area: requests to core

What the teacher area (T1–T6, T9–T15, branch `claude/ai-teacher`) asked of core. All seven are done in core; each item says how the teacher area uses it, and the workarounds are gone.

## 1. A repository hook for an area's own tables (done in core)

- Core shipped `defineStore` and `ctx.store` in 5571577e. The teacher tables now go through `ctx.store(teacherStore)` (`teacher/deps.ts`); the teacher area's own service-role client is gone.

## 2. Request headers in `ctx.functions.call` (done in core)

- Core forwards `Idempotency-Key` and `If-Match`. Assessment Cloud commands go through `ctx.functions.call` with them; the teacher area's own fetch is gone (`teacher/deps.ts` `remoteCall` only passes calls on, so tests can fake Academy and Assessment Cloud).

## 3. A scheduled entry point (cron) for areas (done in core)

- Channel autopilot (T11) is a job on core's scheduler: `registerSystemJob('teacher.channel_dispatch', { everyMinutes: 5 })`, with no route and no cron entry of its own. Approving a week still sends what is already due, and the page has a manual "Send due posts now".

## 4. Routes open without signing in (done in core)

- Live Quiz players join with a code and a nickname on `teacher/quiz-join-open`, `quiz-play-open` and `quiz-answer-open` (core's anonymous routes). A signed-in student still joins through the signed-in routes, so the class results name them.
- Limits count per open game (`rateKey`: a real code or player token names the game; anything made up returns null and is limited per IP). A class of 40 behind one school address plays at full speed; play allows 3,000 a minute per game under a 6,000-a-minute ceiling per address.
- A made-up code or token has no key and gets core's ordinary per-IP limit (`unkeyedLimit`: 30 a minute, 1000 a day), never a game's budget.

## 5. Lazy English catalogs for areas (done in core)

- Core loads every area's catalog on demand since 5571577e. The materials package is still imported from `packages/ai-core/src/materials/mod.ts` (not ai-core's `mod.ts`), which keeps its exam formats and schemas out of the first download.

## 6. Print: an independent teacher's own logo (done in core)

- Core's Settings → Your branding sets a personal workspace's logo, print name and colours (2a83553f). The Studio's print view uses them as core's print does; its own logo field is gone. It stays for the student copy, the teacher copy and the key on its own page.

## 7. Approving a generation from an area (done in core)

- `registerGenerationApproval` runs the teacher's hook for every Studio credit key: approving a material job in `core/generations` saves its library page (in the folder the app names, in the teacher's language) and records the page on the job. If saving fails, core puts the job back to ready. `teacher/material-decide` is gone; the app approves through `core/generations`.
