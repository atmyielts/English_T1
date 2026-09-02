# Academy placement, exam day, and academic progress

Status: implemented on the feature branch; not deployed. Center-facing guides
are in Academy docs in English, Uzbek and Russian.

## What center teams can do

- Prepare immutable papers for grammar, vocabulary, reading, listening audio,
  written tasks, and teacher interviews. Manual tasks require private marking
  guidance. There is no bundled or licensed standardized item bank.
- Plan placement, exam, or progress sessions with time windows, rooms,
  instructions, candidate IDs, and seat limits.
- Register existing learners or Admissions applicants. Intake registration
  creates/reuses a trial contact without converting the lead or charging tuition.
- Deliver timed work in My assessments, save answers, restore a session, submit,
  and receive a reviewed report.
- Mark objective answers on the server; require human marks, evidence notes,
  and approval before publishing a center-named report.
- Print/save a report. Choose a group through the existing admissions conversion
  or roster workflow after a placement report is shared.
- Compare matched learner scores on the same paper in the same group.
  Assessment dates, not publication dates, determine baseline and latest.

## Deliberate limits

This is center-operated infrastructure, not a staffed outsourced testing contract.
No AI speaking scores, IELTS conversion, licensed IELTS papers, proctoring claims,
calibrated CEFR measurement, guaranteed timelines, network certification,
automated assessment-fee bundles, dropout predictions, or causal teacher/branch
rankings are introduced. Changes are percentage points, not CEFR increments.
An optional CEFR estimate is explicitly the reviewing teacher's judgment.
Unassessed skills remain unassessed, never zero.

The session limit is 500 seats, not a simultaneous-candidate load-test claim.
Learner history is bounded to the latest 250 registrations. Staff history is
bounded with a limited-history warning. Intake registration requires an
academy-wide operations role; branch staff can organize permitted group sessions.
These features are in web Academy, not the Telegram staff Mini App.

## Access and evidence

- Tables have RLS with no direct anon/authenticated grants. The authenticated
  Academy Edge service mediates every request.
- Operations staff organize; teaching roles grade. Cash/payroll-only roles
  do not gain the assessment workspace.
- Teachers see assigned group sessions. Preparing a paper also assigns its author
  that paper's intake reviews, not unrelated groups or full student records.
- A learner must match a linked contact or verified email. Only their own
  candidates are returned. Keys, private rubrics, internal notes, and draft scores
  never reach the learner.
- Reports are visible only after release and cannot be silently rewritten.
  Use documented reassessment for a correction in this version; a dedicated
  report-correction/versioning workflow remains future work.
- Browser saves/submissions are serialized; SQL writes lock the run then candidate.
  Server deadlines are authoritative. Late submission uses saved answers only.
  Reviewers can collect expired/closed saved work if a learner leaves.
- Lead registration and seat accounting are transactional. Replays do not
  duplicate a candidate or prematurely convert an applicant.
- Material commands use the existing Academy audit log without copying answers
  into audit metadata.

## Verification

    npm run test:academy:assessments
    npm run test:academy:edge
    npm run test:academy:routes
    npm --workspace apps/academy run test:i18n
    npm --workspace apps/academy run lint
    npm --workspace apps/academy run build
    npm --workspace apps/academy-docs run build
    deno check supabase/functions/academy/index.ts
    npm run verify:academy
    npm run verify:prod
    npm run verify:release

The SQL test executes the real migration/functions in in-memory PostgreSQL with
minimal existing-table fixtures. It is not full Supabase schema/auth, hosted email
linking, concurrent load, or production enrollment proof. Browser preview checks
use controlled local API fixtures and the actual UI.

Local acceptance on September 2, 2026: 64 existing routed browser tests, 114
Academy Edge contracts, and the new assessment access/scoring and SQL tests pass.
Both builds, lint, 2,381 localized phrases, 822 readiness checks, 170 static
product smoke checks, release validation, secret checks, and runtime dependency
audit pass. Manual browser checks covered applicant registration, timed
save/reload/restore, submission, teacher review, release, group assignment, and
student report visibility. EN/UZ/RU were checked at 320px; report layout at 390px;
print styling exposes only the selected report. Temporary mock screens were
removed. Screenshot evidence remains under ignored output/playwright/.

## Release and acceptance

Release through a PR after checks and explicit deployment authorization. Follow
release/manifest.json: Pages, reviewed additive migration, then Academy Edge.
Before backend follow-ups finish, assessments may be unavailable; existing
Academy functions continue to work.

Before accepting live bookings, verify in an authorized test academy:
applicant registration, learner sign-in, save/restore, late-answer rejection,
teacher review, release, print, enrollment, and cross-tenant denial.
Do not create production test data or deploy merely because local checks pass.
