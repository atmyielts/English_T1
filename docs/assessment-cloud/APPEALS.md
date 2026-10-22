# Result appeals

Candidates can submit an academic appeal against their latest eligible released score revision. Institution moderators review the released result, uphold it with a candidate-visible explanation, or accept the concern and request regrading. This is separate from Proctor integrity cases and does not authorize editing scores or invalidating an attempt.

## Workflow and authority

1. Exam displays only eligible released results. The candidate selects a score revision and submits a scoring, procedure or accessibility concern with explicit acknowledgement.
2. The database verifies candidate ownership, tenant context and the latest release whose embargo has elapsed. One appeal is permitted per score revision, including after withdrawal. A future released revision may receive its own appeal.
3. The candidate can withdraw a submitted appeal with an explanation. Institution moderators can read the queue and released-result projection. Neither queue/detail exposes private responses, scoring keys or human marks.
4. A deciding moderator must not be the candidate, marker, adjudicator, approver or result publisher for that grading generation. Historical marks count even if assignments were revoked. SQL enforces independence and current `grades.moderate` authority, including before receipt replay.
5. Uphold records a permanent explanation. Accept atomically requests the next generation through the existing grading command. If another generation is pending or supersedes the appealed run, the command rejects without closing the appeal or partially recording history.
6. Normal grading, independent approval and result release own replacement scores. The previously released result stays visible while regrading is pending. Candidates see the immutable appeal history and requested generation.

The current reviewer role is the existing academic moderator capability, not a Proctor role or implicit new entitlement. Separately delegated appeal roles, configurable filing windows, explicit assignments/escalation, supporting attachments, supplementary submissions, multi-stage challenge/reopening rules and notification delivery remain full-service work. There is no silently imposed filing deadline.

Regrading currently uses the existing pinned scoring inputs and rubrics. Audited scoring-key corrections and broader result-correction policies remain required; requesting another generation alone does not repair a wrong objective key.

## Data, recovery and concurrency

Migration `20261014150000_assessment_appeals.sql` adds private appeals, immutable histories and immutable command receipts. Appeals pin the attempt, grading run and score revision. The only transition is `submitted` to `withdrawn`, `upheld` or `regrade_requested`; original concerns and closed appeals cannot be rewritten or deleted through the service.

Commands hold a scoped idempotency lock, then attempt/appeal locks, and the grading run lock when deciding. Current authority is checked before cached replay. The normalized body must match its previous key. Competing reviewers cannot both decide the same revision. History, audit, candidate outbox metadata, regrade job and receipt commit together. Outbox delivery consumers are not connected yet.

The client uses actor/institution-scoped AES-GCM command recovery and Web Locks. Lost receipts remain saved intents; reload/retry uses the same command identity/body. Current account identity is checked before transport. Server state is not changed optimistically. This is submitted-intent recovery, not cross-device or last-keystroke draft recovery. Shared-device/key-management/retention gates still apply.

## API

Routes under `/assessment-cloud/appeals` require current bearer identity and `tenant_id`, return `Cache-Control: no-store`, and allow only configured browser origins. Raw tables and privileged functions are inaccessible to anonymous/authenticated database clients.

| Method and route | Scope |
| --- | --- |
| `GET candidate?limit=50&after=<UUID>` | Owning candidate's appeals |
| `GET queue?limit=50&after=<UUID>` | Current moderator; excludes their own candidate appeals |
| `GET <appeal UUID>` | Owner or moderator; safe released-result/history projection |
| `POST commands` | Stable `Idempotency-Key` and normalized action/data |

Page sizes are 1–100. Lists use ascending UUID keyset order, not chronological order; new random IDs can fall before an existing cursor, so Refresh restarts discovery. Both screens provide load-more and refresh.

Submission: `{attempt_id, score_revision_id, category, reason}`. Withdrawal: `{appeal_id, expected_revision: 1, explanation}`. Decision adds `outcome: "upheld" | "regrade_requested"`. Required reasons/explanations are bounded to 5,000 characters; HTTP bodies to 24 KB. Client-supplied candidate, score, state and authority fields are stripped. Conflicts require fresh review; unknown outcomes/fractional revisions are rejected.

## Deadlines, assignment and second-stage review

Migration `20261022150000_assessment_appeal_workflow.sql` adds the multi-stage workflow on top of the original appeal commands. It is additive: the earlier functions are kept as `assessment_appeal_command_v1` / `assessment_appeal_read_v1` and the new wrappers delegate to them.

- **Deadlines.** A releaser (`results.release`) sets the institution policy with `appeal.policy.set {expected_revision, filing_days, escalation_days}`. Each limit is 1–365 days or `null` for none, and the policy revision is fenced. A filing that arrives after `release_at + filing_days` is refused with `appeal_window_closed`; an escalation after `decided_at + escalation_days` is refused the same way. Moderators and releasers read it with `GET policy`.
- **Assignment.** `appeal.assign {appeal_id, expected_revision, reviewer_id}` (`grades.moderate`) names a reviewer who must currently moderate, be independent of the marking, approval and release, and, at stage 2, not be the first-stage decider. Once assigned, only that reviewer can decide (`appeal_assigned_to_another_reviewer`). The staff screen offers **Assign this appeal to me**.
- **Escalation.** Only the candidate can escalate, and only an upheld first-stage decision: `appeal.escalate {appeal_id, expected_revision, reason}`. The appeal moves to status `escalated`, stage 2, records the first decider and clears the assignment. The candidate may still withdraw an escalated appeal.
- **Second stage.** A different independent moderator decides with the same `appeal.decide` payload. Accepting it requests a new grading generation under the key `appeal.regrade:<id>:stage2`. There is no third stage.
- Every step appends to the immutable appeal history (`assigned` and `escalated` events join the original ones), is audited, and emits a `domain_event_outbox` event. Scores and the original release never change.

Detail reads add `stage`, `assigned_to`, `escalated_at`, `escalation_reason`, `filing_deadline`, `escalation_deadline` and the reader's `can_escalate`, `can_assign_self`, `can_decide` and `can_regrade`. All new text is in the uz/ru/en catalogs.

Still open for `RESULT-01`: appeal attachments (through the scanned-artifact path) and delivered candidate/reviewer notifications. The outbox events exist, but nothing sends them yet.

## Verification

Run from the repository root:

```powershell
deno test --no-lock supabase/functions/assessment-cloud/appeal-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs
node scripts/test-assessment-appeals-browser.mjs --appeal-workflow
```

HTTP/repository tests cover identity, normalized payloads, origin/method/body bounds, page cursors, revisions, forged outcomes and SQL error mapping. The thirteen-migration SQL suite covers ownership/tenant denial, superseded/embargoed results, independence, withdrawal/uphold/regrade, immutable history, current-authority replay, unchanged scores and raw/RPC denial. Four-process races require one appeal receipt and one competing decision.

The connected browser fixture uses actual Exam/Assessment apps, production appeal/grading handlers/repositories, real isolated PostgreSQL, native browser encryption and synthetic local identity. It intentionally loses the first committed submission/decision replies, reloads both apps, and checks retry, original-approver denial, independent acceptance, revoked-reviewer teardown, candidate disclosure and unchanged scores. Screenshots cover 1440/1024/768/390/320 in `output/playwright/appeals`. `supabase/tests/assessment-appeal-workflow.integration.sql` covers policy authority, receipts and revision fences, the closed filing deadline, independent assignment, assignee-only decisions, candidate-only escalation, refusal of the first decider at stage 2, withdrawal of an escalation, refusal of a second escalation, the exact event history, unchanged scores and immutable appeal content. The `--appeal-workflow` browser journey runs the whole path in the actual apps: the releaser saves deadlines, the candidate files, a moderator assigns themself and upholds, the candidate escalates before the shown deadline, the first decider is shown no controls, a second moderator assigns themself and decides, and the candidate sees the final decision with no further escalation. Screenshots are `output/playwright/appeals/workflow-*`.

This is local connected evidence, not hosted identity, production notification delivery, manual screen-reader acceptance or full-service completion.
