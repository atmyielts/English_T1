# Accommodations and controlled breaks

Status as of 2026-10-22: **locally evidenced, incomplete.** The approval command, candidate break runtime and both app workflows pass local database, race, API and connected browser checks. Exact-release remote CI for this wave, the running-clock browser journey, academic-recording teardown in a browser, policy exemptions, alternate media, guardian consent and every hosted, device, legal and capacity gate are still open. See `ACC-01` to `ACC-07` in the [full-service backlog](FULL_SERVICE_BACKLOG.md#acc--accommodations-and-minors).

Source revision: branch `codex/assessment-cloud-foundation` in worktree `.claude/worktrees/gracious-swartz-96bafd`, on top of `0aa2a71`. The environment is Windows 11, Docker 29.6.1 with `postgres:16-alpine`, Deno 2.5.6, Node 24.13 and the installed Google Chrome through `@playwright/cli`. Identity and PostgREST are local fixture adapters. The proctor pause in the browser journey is a direct attempt-state change, not the proctor command path.

## Institution workflow

Assessment Cloud → **Exam sittings** → **Accommodations** (`apps/assessment-cloud/src/accommodations/AccommodationsPanel.tsx`):

1. Choose a sitting. Each registered candidate shows their current extra time, break rules and approval revision.
2. **Review accommodations** opens a form in minutes:
   - extra time (0–1,440)
   - timed breaks on or off
   - clock stopped or running
   - number of breaks (1–20)
   - minutes per break (1–60)
   - total break minutes (1–240)
   - a required approval basis
3. The form converts to the strict whole-second contract (`packages/assessment-web/src/accommodations.ts`) and sends `registration.accommodate` with the loaded revision.

Approvals are durable intents. They are saved encrypted on the device per actor and tenant (`accommodations:<tenant>:<actor>` journal, Web Locks), and a lost reply is retried with the same key. Server refusals are explained in plain language:
- `revision_conflict`: someone else approved first.
- `accommodations_locked_after_start`: the candidate has already started.
- The approval basis is never shown to the candidate. It lives only in the institution command and audit records.

## Candidate workflow

Exam (`apps/exam/src/BreakPanel.tsx`, `apps/exam/src/useBreaks.ts`, `packages/assessment-web/src/breaks.ts`):

- When a policy allows breaks, an **Approved breaks** card shows the breaks left, the break time left and the next break's maximum. It also says whether the clock stops.
- **Take a break** checks these first:
  - no academic answer recording is open
  - local saves are complete
  - pending answers are synced to the server
  - the device lease is valid
  - required monitoring is ready

  Only then does it send `break.begin` through the coordinator as a durable intent (`breaks:<tenant>:<actor>:<attempt>`).
- During a break:
  - the questions and media are unmounted
  - the header shows the break countdown
  - required monitoring panels stay mounted and running
- **Return to the exam** sends `break.end`. Reloading during a break restores the break view from the canonical snapshot.
- A saved break request is retried automatically once the lease is ready, and a manual retry button is shown. A different request cannot be made until the saved one resolves.
- A proctor pause ends the break at the pause time. The candidate sees the paused state with no control that could resume it.

## Contracts

Institution command `registration.accommodate` requires `exams.manage`, current staff authority and a stable command key. Data:

```json
{"registration_id":"uuid","revision":0,"extra_seconds":300,
 "break_policy":{"schema_version":"assessment.break-policy.v1","clock":"stopped","max_breaks":2,"max_seconds":60,"total_seconds":120},
 "reason":"institution-only approval basis"}
```

Contract limits:
- 0–20 breaks, 0–3,600 seconds per break and 0–14,400 seconds total.
- A disabled policy requires all limits to be zero. An enabled policy needs a per-break duration of at least 1 and a total of at least one break.
- Extra time is 0–86,400 seconds.
- The handler forwards only those five fields.

Runtime commands go through the existing coordinator:
- `break.begin` needs the current lease.
- `break.end` needs the current lease and the `break_id`.

The server chooses the duration and returns the break ID and end time. The snapshot adds `accommodations` with the policy, revision, extra time, `used_breaks`, `used_seconds` and the `active` break.

Invariants enforced by migration 36 (`20261021020000_assessment_accommodations.sql`):
- Policy and extra time are pinned on the attempt when it starts, and cannot change afterwards.
- A stopped-clock break reserves its credit up front. Ending early returns the unused credit. A running-clock break grants no time and ends by the attempt deadline (added 2026-10-22).
- No break or extended deadline outlasts the sitting close. A window shorter than one second is refused with `break_window_closed`.
- No new answer, section advance, submission or answer asset is admitted during a break. Rejections are never cached as receipts.
- A human or watchdog pause ends the break at the pause time, so break time and paused time are never credited twice. A late alarm ends the break at its scheduled end, not when it was observed.

## Evidence (local, captured 2026-10-22)

| Check | Command | Result |
| --- | --- | --- |
| Migrations and SQL integration (all service migrations, including 36) | `node scripts/test-assessment-db.mjs` | Exit 0. Both the migration and `assessment-accommodations.integration.sql` pass. |
| Accommodation integration cases | same | Pass:<br>• approval authority, replay, revision and post-start lock<br>• lease and ownership<br>• stopped credit and unused-credit return<br>• answer and submit refusal during a break<br>• pause fence and late alarm<br>• count and time exhaustion<br>• running clock with no credit, capped at the deadline<br>• stale lease epoch and token<br>• cap at sitting close<br>• pause overlap credits only the break interval |
| Mutation check | running-clock cap removed temporarily | Suite fails with `Running break outlasted the attempt deadline`. Cap restored. |
| Four-process races | `scripts/test-assessment-accommodations-race.mjs` (run by the DB suite) | Pass:<br>• same-key approval replay<br>• competing approvals have one winner, the rest get `revision_conflict`<br>• late approval vs start: the pinned snapshot matches the registration<br>• same-key and different-key break begins leave one break<br>• candidate end vs pause gives one end and one audit, with no double credit<br>• late expiry vs end gives an exact `elapsed` end<br>• scores unchanged |
| Focused contract and API tests | `deno test --no-lock packages/assessment-core/src/accommodations.test.ts packages/assessment-web/tests/breaks.test.ts supabase/functions/assessment-cloud/handler.test.ts supabase/functions/assessment-runtime/handler.test.ts` | 32 passed, 0 failed |
| Types, builds and boundaries | `deno check` (Assessment and runtime Edge), three app builds, `node scripts/verify-assessment-boundaries.mjs` | Pass (561 files) |
| Connected browser journey | `node scripts/test-assessment-appeals-browser.mjs --accommodations` | Exit 0 with a full proof (below) |

The connected journey runs the real Assessment and Exam builds against the production handlers, PostgreSQL and the local coordinator Worker:
- The institution's approval loses its reply, then is recovered after a reload with the same key: revision 1.
- A concurrent approval elsewhere makes the open form stale, and the server refuses it: revision 2. Nothing is left pending.
- The candidate registration response contains the policy but no approval basis.
- The candidate answers, the answer syncs, and a break starts with a lost reply that is recovered by the saved key. There is still exactly one break.
- During the break the questions are hidden and the header shows the break countdown.
- A reload keeps the break view. Returning early restores the questions and the saved answer.
- A second break is ended by a pause, and the candidate has no resume control.
- After resume, the exhausted allowance offers no break, and the attempt is submitted.

The proof has:
- 2 approval audits, registration revision 2, pinned revision 2 and pinned extra time of 300 seconds
- 1 attempt, `submitted`
- 2 breaks ending as `candidate` and `proctor_pause`
- 3 break commands and 1 response
- scores unchanged

Screenshots in `output/playwright/accommodations/` at 1,440, 1,024, 768, 390 and 320 px have no horizontal overflow. They were inspected visually.

## Remaining work

- **ACC-03:** run the running-clock policy through the real apps (it is proven in SQL only). Show candidate names rather than account IDs in the approval list.
- **ACC-04:** a browser proof that an open academic answer recording blocks a break and is sealed first. Account-change and lease-change journeys during a pending break intent.
- **ACC-05 to ACC-07:** policy exemptions, alternate media and access arrangements, guardian and age consent, a manual screen-reader review, physical devices and monitored hosted journeys.
- **Localization:** this wave's strings are English. UX-01 extracts them into uz/ru/en.
- **Release gates:** exact-release remote CI for the `accommodations` job, a full historical-schema migration rehearsal, and a coordinated migration, API and client rollout. Do not deploy migration 36 alone.
