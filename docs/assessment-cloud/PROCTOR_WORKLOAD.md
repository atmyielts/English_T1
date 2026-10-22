# Institution monitoring board

Status: connected local implementation, not production-certified. The board is Proctor's default workspace, not a module in Academy or the mother platform. Migration 32 and the matching Proctor API/client must be released together. Existing live/capture launch flags remain disabled outside isolated acceptance; this wave creates no cloud resource and performs no deployment.

## Institution workflow

Supervisors page through session coverage, filter by state, assignment or exact candidate reference, select the current page's candidates and review an observer/reviewer assignment or removal. The staff picker pages through institution staff and shows active assignment counts. Staff with withdrawn capabilities remain available for removing existing assignments, but cannot receive new assignments. Reasons and exact session revisions are shown before confirmation. The review identifies both candidate and sitting, including repeated candidates in different sittings.

Observers/reviewers see only currently authorized sessions. A reviewer assignment never grants live observation. Supervisors can inspect institution sessions without an individual assignment; the uncovered filter still measures explicit eligible observer coverage, not implicit supervisor access. Management controls additionally require the fresh board response's supervisor authority. Failed/denied root refresh clears previously loaded records, permissions and session detail; changing the selected session detaches its previous evidence view before loading another.

The live board permits up to four current-page candidates and one explicitly selected camera or screen feed per candidate. Microphone listening remains in the individual session. Changing pages/filters, hiding the tab, leaving the workspace or losing catalog authorization closes the affected feeds. Publication replacements require explicit selection. There is no automatic candidate surveillance or automatic misconduct judgment. Recording remains independent.

The mother visual foundation is retained: cream paper/header, dark outlines, rounded white panels, pill controls, Sora headings and Manrope text. A sticky selected-session action leads to the reviewed allocation form; desktop/mobile controls retain the same workflow.

## Authority and concurrency

| Boundary | Rule |
| --- | --- |
| Session list | Server-side tenant/capability/assignment predicates run before bounded keyset paging. No fetch-all/client-side authorization filter |
| Page cursor | `(created_at, id)` preserves timestamp ties and microseconds, including non-UTC offsets. It is navigation data, never an authorization token |
| Revision | Assignment insert/active/assigner changes advance the session's `assignment_revision`, including legacy `session.assign` |
| Reviewed batch | 1–50 distinct session/revision targets, sorted locks, one staff account/role/action/reason. All targets validate before any mutation; a stale target rejects the whole transaction |
| Membership/capabilities | Organization membership and grant rows for manager/assignee remain locked through commit. Current manager authority is checked even when replaying a receipt |
| Assignment admission | New assignments require the target's current matching capability, a non-completed session and a staff member different from that session's candidate |
| Removal | Existing assignments can be deactivated even after capability withdrawal or session completion |
| Retry | The same normalized request and stable key recover one immutable receipt/audit. Changed data with the same key conflicts. The UI retains the reviewed request after an uncertain response |
| Academic separation | Assignment changes never start/resume/pause an exam, change responses/marks, or invalidate a candidate |

Pagination is a current view, not an exported transactional snapshot. New sessions and mutable status/assignment filters can change between page requests; refresh restarts paging. Session/staff pages are bounded to 50 at the API/database boundary; the UI uses 25. Authorization is rechecked on every request. Supervisors' other legacy policy/identity/team selectors remain bounded legacy interfaces and still need full paging/search conversion.

## API

All routes are under `/proctor/workload/`, require authenticated identity, an exact allowed origin when supplied, `tenant_id`, and return `Cache-Control: no-store`.

- `GET sessions`: `state=all|preparing|active|paused|completed`, `assignment=all|mine|unassigned`, optional `window_id`/`candidate_id`, `limit=1..50`, optional JSON `after={created_at,id}`. Returns `rows`, `next`, `manager`, `server_time`. `unassigned` is supervisor-only. Rows contain candidate/sitting display fields, state/mode, heartbeat/loss time, eligible observer display fields, own observation authority and assignment revision—not policy/biometric notes, SFU locators, academic responses or scores.
- `GET staff`: supervisor-only, `role=observer|reviewer`, optional staff UUID `after`, `limit=1..50`. Returns paged account/name/eligibility/active-assignment counts. No email or identity-document data is returned.
- `POST commands`: stable `Idempotency-Key`, action `assignment.set|assignment.remove`; data `{user_id,role,reason,targets:[{session_id,expected_revision}]}`. Unknown authority/readiness/academic claims are stripped. Bodies are streamed with a 16 KB limit. Conflicts are 409, current-authority denial 403, malformed/rejected changes 422. Private backend diagnostics are redacted.

The three RPCs are service-role-only; the command receipt table has no browser or service-role direct read/write grants. Protected local fixture diagnostics use their privileged disposable database connection, not weakened production permissions.

## Verification

```text
deno test --no-lock supabase/functions/proctor/workload-handler.test.ts
node scripts/test-assessment-db.mjs
npm --workspace apps/proctor run build
deno check --no-lock supabase/functions/proctor/index.ts
node scripts/verify-assessment-boundaries.mjs
node scripts/test-assessment-appeals-browser.mjs --workload
node scripts/test-assessment-appeals-browser.mjs --live
npm --workspace workers/proctor-evidence run test:browser
```

Local evidence:

- Eight workload contract/API checks cover bounded filters/cursors, spoofed authority stripping, duplicate/invalid/revision-less targets, request size/origin/identity, role-scoped staff paging, redacted database failures and deterministic microsecond/non-UTC cursor handling. The independent live CI contract command totals 47 passing checks.
- The complete 32-migration database/authority suite passes. Its 57 canonical preparation fixture has equal creation timestamps and verifies complete keyset traversal, foreign/unassigned denial, supervisor-only uncovered/directory reads, assignment replay, atomic stale-batch rejection, legacy revision fencing, reviewer/observer separation, capability withdrawal, private receipt privileges and unchanged academic state. Four independent assignment retries recover one receipt; four competing reviewed removals produce one transition. Concurrent capability withdrawal cannot retain effective observation rights.
- Actual Proctor browser → production HTTP handlers/repositories → PostgreSQL passes 57-session traversal, four-candidate board bound/page teardown, reviewed two-session assignment with a lost committed reply, retry recovery, a competing legacy change causing atomic conflict, fresh reviewed removal and immediate observer denial. It also loads individual session detail, returns to the board, withdraws supervisor membership and verifies that fresh root/board denial hides allocation controls and removes stale session evidence. Canonical proof has 57 fixture sessions, two command receipts/audits, no remaining observer assignments and unchanged attempts/scores. Screenshots cover 1440/1024/768/390/320 widths, including the review region, in `output/playwright/capture/workload-*.png`.
- Connected native live acceptance now starts at the default board, receives decoded camera video, rejects a second board feed/microphone, closes the board and proceeds through individual camera/screen viewing, live-loss pause, human resume and submission. Seven local connections and seven synthetic relay credentials close/revoke; recording remains independent. Media and identity/provider boundaries are those in [LIVE_MONITORING.md](LIVE_MONITORING.md).
- The real-local recording/review regression passes native playback/seek, account/revocation teardown, observer denial, explicit gaps, lost finding receipt and two-human citation quorum. QTI control-plane regression with all 32 migrations also passes. Service boundaries cover 441 source files.

## Remaining full-service work

This is not certification of a 20,000-candidate workload, 1,000-viewer environment or production identity/providers. Required work includes credentialed hosted SFU/TURN and restrictive networks, simultaneous multi-candidate media/soak tests, workload/priority/shift policies, durable cross-device allocation intents, sitting/department/resource-scoped assignment rules, complete sitting/name search and legacy selector paging, institutional limits and cross-device server admission, supervisor metrics/alerts, push/hibernation instead of production-scale polling, manual localized accessibility acceptance, physical devices, retention/privacy/legal approval, cleanup/recovery drills and exact-release remote CI/staging/capacity proof. No full-service ledger row is closed by this wave.
