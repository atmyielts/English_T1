# Accommodations and controlled breaks — unfinished work

Status as of 2026-10-22: **written, unverified; no connected institution/candidate UI; not release-ready**. This document reflects interrupted implementation, not a completed feature. See `ACC-01` through `ACC-07` in the [full-service backlog](FULL_SERVICE_BACKLOG.md#acc--accommodations-and-minors).

## What is currently written

- `packages/assessment-core/src/accommodations.ts` and `.test.ts`: strict `assessment.break-policy.v1` contract, disabled policy, running/stopped clock choices, break count/per-break/total limits and candidate runtime projection types.
- `supabase/migrations/20261021020000_assessment_accommodations.sql` (service migration 36): registration policy/revision, pinned attempt accommodations, break records, institution approval command, runtime break commands, schedule/snapshot/expiry wrappers, pause/finalization handling and new-response/answer-asset guards.
- `supabase/tests/assessment-accommodations.integration.sql`: drafted tests for approval authority/replay/revision, post-start immutability, lease/ownership, stopped-clock reservation and unused-credit return, response/submit denial, pause separation, late end and exhaustion. Test presence is not a passing result; running-clock and complete combined-monitoring/concurrency coverage still need expansion.
- `supabase/functions/assessment-cloud/handler.ts`: parses `registration.accommodate` under `exams.manage`.
- `supabase/functions/assessment-runtime/{handler,repository}.ts`: parses break commands and translates canonical non-receipt rejections.
- `workers/assessment-coordinator/src/index.ts`: allows `break.begin` and `break.end` through the existing coordinator path.
- `packages/assessment-web/src/runtime.ts`: optional accommodation projection, break command types and a new academic-answer admission check.
- The isolated database runner, connected browser-stack migration lists and QTI control-plane migration-count expectation reference migration 36. These edits do not demonstrate that those stacks currently pass.

The Assessment and Exam applications do **not** yet have the institution approval editor, candidate break controls/countdown, durable submitted break intents or complete question/media teardown integration. Searching source for runtime command names is not evidence of an end-user workflow.

## Intended authority and contracts — not yet verified

Institution command: `registration.accommodate` carries `registration_id`, expected `revision`, `extra_seconds`, `break_policy` and an approval `reason`. Current code requires `exams.manage`, current staff authority and a stable command key. The intended rule is approval before the first attempt; the policy and extra time are pinned at start. Approval reasons belong in institution-only command/audit records, not candidate-visible diagnoses or medical evidence.

Policy fields currently written:

```json
{
  "schema_version": "assessment.break-policy.v1",
  "clock": "stopped",
  "max_breaks": 3,
  "max_seconds": 300,
  "total_seconds": 600
}
```

Written limits: 0–20 breaks, 0–3,600 seconds per break and 0–14,400 seconds total; disabled policies require all limits to be zero. Enabled per-break duration must be positive and no greater than the total allowance. Extra time is a whole number from 0 to 86,400 seconds. These are implementation limits, not accessibility/legal policy claims.

Candidate coordinator commands: `break.begin` uses the current attempt/device lease; `break.end` additionally identifies `break_id`. The server chooses an allowed duration and returns the break ID/end time. The runtime snapshot adds an `accommodations` projection with policy/revision/extra time, usage and the active break. Older attempts may have an empty accommodation snapshot; compatibility and presentation need verification rather than fabricated historical approvals.

Intended invariants:

- A candidate break never resumes a proctor, monitoring or finalized pause/state.
- A stopped-clock break reserves bounded credit up front; early completion returns unused credit. Running-clock breaks grant no academic time.
- Academic and section clocks cannot extend beyond the sitting close time. No new answer/section/submit admission is allowed during a break; already-admitted transport recovery remains distinct.
- Human/watchdog pause ends the break at its effective cutoff, avoiding double credit for overlapping break/pause time. Monitoring continues; a break is not consent to stop recording/live feeds.
- Closed-tab recovery and late alarms use canonical timestamps, not the browser clock or observation time.
- Lost replies recover one immutable command result. A rejection is not a success receipt and must not be cached as one by the coordinator.

These statements describe required behavior. Trigger ordering, wrappers, deadline arithmetic, privacy and all bypass paths still need evidence.

## Last verification and interruption

The last captured full database run passed the preceding migration/test sequence through blueprints, then **failed applying migration 36** with `syntax error at end of input` in `assessment_validate_break_policy` at the `if case when ...` expression. Parentheses around that expression are now present in the file.

A follow-up database run and focused Deno checks were initiated in a tool sequence that the user interrupted. No successful terminal result from that sequence was captured. Do not label the syntax correction, the migration, SQL cases, focused tests, app builds or browser-stack/QTI changes as verified. A future implementation turn must inspect any surviving process before restarting it; an interrupted observer is not proof the process stopped.

Documentation reconciliation on 2026-10-22 inspected source and documentation only; it did not rerun the product suites or alter deployment state.

## Required continuation

1. Inspect current process/worktree state. Resolve the migration failure, then run the isolated database suite and focused contract/runtime checks; retain actual terminal results.
2. Review registration/start serialization, immutable snapshots/history, trigger ordering, wrapper recursion, grant revocations and new/legacy command bypasses. Expand running-clock, section-close, sitting-close, delayed alarm, lease rotation and monitored pause overlap tests.
3. Add different-key competing requests and lost-reply concurrency for approval/start/begin/end/pause/expiry. Assert exact credit, one active break, no acknowledged rejected answer and unchanged academic scores.
4. Build institution approval/revision/review controls and candidate policy/break/countdown/early-end screens in the mother design. Hide/unmount question and response tools during breaks, without stopping required monitoring. Block beginning a break until local responses are synced and active academic recordings are stopped/sealed.
5. Add actor/tenant-scoped durable submitted intents, reload/retry/account-change/lease-change handling, and explicit recovery rather than silently generating another break.
6. Exercise actual Assessment/Exam/Proctor apps with production handlers, PostgreSQL/coordinator and recording/live workers; test manual and watchdog pauses, tab closure/recovery, foreign access, local save failure and supported widths. Report synthetic ports explicitly.
7. Add complete policy exemptions, alternate media/accessibility review and guardian/age-related consent workflows. These remain required even after timed breaks work.

Useful next local commands (instructions, **not new passing evidence**), from the repository root:

```powershell
node scripts/test-assessment-db.mjs
deno test --no-lock packages/assessment-core/src/accommodations.test.ts supabase/functions/assessment-runtime/handler.test.ts
deno check --no-lock supabase/functions/assessment-cloud/index.ts supabase/functions/assessment-runtime/index.ts
node scripts/verify-assessment-boundaries.mjs
```

Do not deploy migration 36 or describe accommodations as available based on this draft. Full historical-schema migration/restore rehearsal, coordinated API/client rollout and exact-release CI remain mandatory.
