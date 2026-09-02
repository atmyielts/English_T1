# Academy admissions, exam day and academic audit

Status: implemented on the feature branch; not deployed. Center-facing guides
are in Academy docs in English, Uzbek and Russian.

## What center teams can do

- Add a 34-task original English intake starter: grammar, vocabulary, reading,
  teacher-read listening, writing and interview. Private listening scripts,
  keys and rubrics never reach learners. A teacher must review a paper before
  opening a session. This is a pilot, not a validated level test.
- Prepare immutable papers and define provisional course suggestions with
  score ranges and skill minimums. Teachers confirm reports and placement.
- Register learners or Admissions applicants without enrolling them or charging
  tuition prematurely. Assign a group through the existing enrollment workflow.
- Deliver timed sessions with candidate IDs, rooms, capacity, check-in, unique
  seats and extra-time accommodations agreed before starting. Save and restore
  answers; server deadlines remain authoritative.
- Assign authorized markers and deadlines, require independent moderation,
  record concerns and resolve appeals. Integrity concerns and appeals block
  publication and certificate issue.
- Publish, print and save center-named reports. Corrections archive the old
  version, withdraw its certificate and require another review.
- Issue verifiable mock-result records. Names and scores stay private until
  the learner enables public sharing. Learners can withdraw consent or appeal.
- Sell single or multi-assessment packages, or include allowances in an active
  learner subscription. Paid grants create one existing-account charge, not
  a payment receipt. Retries do not duplicate charges or consume credits twice.
  Expired/exhausted allowances and withdrawn charges cannot fund new assessments.
- Coordinate service requests through requested, confirmed, in progress and
  delivered, with an agreed provider, coordinator, price, brief and due date.
  Delivery requires all reports shared and no open integrity concerns/appeals.
- Compare matched scores by group, branch or recorded teacher and paper, with
  dates, sample size and skill detail. Attribution must stay unchanged across
  attempts. Each learner contributes at most one comparison per paper/grouping.
  Review expected-level mismatches and assign follow-up goals, owners, dates
  and outcomes.

## Responsible launch and deliberate limits

The user has no approved placement papers or benchmark dataset. The original
starter requires academic review. There is no automatic IELTS/CEFR conversion,
guaranteed timeline, causal teacher ranking, dropout prediction or official
qualification. Changes are percentage points, not CEFR increments. Optional
CEFR estimates are explicitly teacher judgments. Missing skills are not zeros.

CEFR linkage needs evidence and a validation process, not just thresholds:
[Council of Europe guidance](https://www.coe.int/en/web/common-european-framework-reference-languages/relating-examinations-to-the-cefr).
Collect consented pilot data and obtain qualified review, benchmarks and
standard-setting evidence before making stronger claims.

Schood does not book invigilators/graders, promise automated anti-cheating
detection or process center-to-Schood service invoices here. Service orders
coordinate a provider the center has actually agreed with. Package billing uses
the center's learner account. AI speaking assessment, licensed IELTS materials,
calibrated forecasts and network-recognized certification remain outside this
release.

The 500-seat limit is not concurrent-load proof. Learner history is capped at
250 registrations; staff views warn when capped. Archived report snapshots
remain server-side; the UI shows current reports and assessment history, not
an archive-version viewer. These features are in web Academy, not Telegram.

## Access and evidence safeguards

- RLS and revoked direct browser grants protect every assessment table.
  The authenticated Academy service mediates commands. One public route accepts
  a random certificate token and returns a minimal consent-aware record.
- Existing academy/branch/classroom permissions remain authoritative. Assigning
  a marker grants no access. Teachers see assigned groups and intake sessions
  using their own papers, not unrelated student records.
- Learners act only on their own assessments and consent. Draft marks, rubrics,
  keys, internal notes and listening scripts are excluded from their responses.
- Published reports cannot be silently overwritten. Reopening preserves the old
  version and withdraws certificates; resolving an appeal does not restore them.
- Answer writes are serialized; SQL locks run then candidate. Late submission
  uses saved answers. Staff can collect expired or closed saved work.
- Registration, seat accounting, package charges/ledger and allowance use are
  transactional. Material commands use the existing Academy audit log.

## Verification

    npm run test:academy:assessments
    npm run test:academy:assessments:integration
    npm run test:academy:edge
    npm run test:academy:routes
    npm --workspace apps/academy run test:i18n
    npm --workspace apps/academy run lint
    npm --workspace apps/academy run build
    npm --workspace apps/academy-docs run build
    deno check supabase/functions/academy/index.ts
    npm run verify:academy
    npm run smoke:academy
    npm run verify:prod
    npm run verify:release

The fast suite includes 10 access/scoring tests and 66 real in-memory PostgreSQL
assertions. The integration suite exercises the actual Academy handler with
local Supabase Auth and the complete migrated schema: owner, scoped teacher,
learner and outsider; delivery, marking/moderation, tenant denial, consent-aware
certificates, appeals, real charge/ledger entries, idempotent allowance use,
service delivery and teacher follow-up.

On September 2, 2026, the full migration history reset and integration passed
in an isolated local project, not the existing developer database. The project
is English_T1_assessment_qa_20260902, configured under ignored
output/supabase-assessment/supabase/config.toml with repository migrations and
functions linked into it. Ports are 543xx changed to 563xx; SMTP, seeding and
analytics are disabled. Start this project before running the integration
command. The runner refuses any API except localhost:56321 and never prints
keys. It creates local test records only.

Browser QA separately uses the actual components with clearly labeled local
fixtures. Checks cover check-in payloads, package creation, follow-up/certificate
controls, EN/UZ/RU switching, 320px/390px layouts and the invalid-token public
route. Temporary fixture screens are removed before commit. Local UI and
database evidence does not establish hosted acceptance or load capacity.

## Release and live acceptance

Use a PR and explicit merge authorization. The user confirmed production project
bbjawctnqrufvnesdsel. Follow release/manifest.json: Pages, both additive migrations,
then Academy Edge. Frontend CI does not deploy the backend. Existing Academy
flows stay compatible; assessments can remain unavailable until rollout finishes.

Before accepting bookings, verify registration, save/restore, deadlines, marking,
moderation, correction, printing, privacy and enrollment with authorized owner,
scoped-teacher and learner accounts in a designated test academy. The supplied
owner account is not evidence of separate live teacher/learner acceptance.
Do not create production billing fixtures or change account roles.

Rollback Pages to the preceding known-good commit and restore the matching
Academy Edge Function if needed. Retain additive tables and all submitted
evidence; never drop assessment data to roll back.
