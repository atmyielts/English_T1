# Center cohorts and durable bulk registration

Centers manage assessment-only cohorts and schedule the whole reviewed roster into a sitting. This does not add Academy groups or create/change mother-platform memberships. Existing active institution members are selected by name through a scoped, paged directory. Coordinators can set extra assessment seconds, revise/archive/reactivate a cohort and remove members with revision fences and audited reasons.

## Authority and data flow

`exams.manage` is required for every read, command and receipt replay. PostgreSQL owns group revisions, reviewed membership/eligibility, sitting/policy snapshots, immutable job targets, per-person outcomes and registrations. The fifteenth migration is `20261014170000_assessment_cohorts.sql`. Raw tables and worker RPCs are unavailable to browser roles.

Before confirmation, the server computes a complete sorted roster plus existing registrations and a SHA-256 review hash. Paged UI previews show total/eligible/existing/conflicting entries. Confirmation sends source identifiers and the reviewed hash, never a caller-authored candidate list. A changed cohort, sitting, policy or existing registration requires fresh review. Members added after confirmation cannot enter a pinned job. Inactive-at-review candidates do not become eligible by later activation.

The separate private `workers/assessment-roster` minute dispatcher leases canonical jobs and sends only tenant/job/lease metadata to its own queue. Each committed step handles at most 50 people. Queue retries, expired leases, duplicate dispatch and lost replies cannot recreate registrations or process another chunk under a stale lease. Canonical outcomes distinguish created, matching existing, conflicting existing extra time, inactive, removed/changed and cancelled. Existing registrations and extra time are never overwritten.

Each batch rechecks the active authorizing coordinator, sitting/policy and cohort, and locks target membership rows. Authority loss pauses remaining work. Another current coordinator must explicitly review/adopt the blocked job with a reason; merely opening it cannot resume processing. A changed sitting requires cancelling the remainder and creating a freshly reviewed job. Cancelling does not delete registrations already created.

## API and recovery

`/assessment-cloud/cohorts` exposes `groups`, `groups/<id>`, `jobs`, `jobs/<id>`, `directory`, `sittings`, `preview` and `commands`. Reads use bounded UUID cursors (up to 100). Commands cover `cohort.create/revise`, `member.add/remove` and `job.create/resume/cancel`. Internal `job.claim/step` requires the separate server-only `ASSESSMENT_ROSTER_SECRET`, not a candidate bearer token. Worker HTTP is disabled; development/staging/production names and queue/DLQ bindings are distinct and configuration-tested, not provisioned.

Submitted UI intents use encrypted actor/institution-scoped recovery with stable request identities and Web Locks. A lost reply remains visible until retry obtains its canonical receipt. Permission denials remove private progress from the screen. Exam assignments now show the actual sitting title.

## Evidence and remaining requirements

Run the cohort handler/queue unit suites, `node scripts/test-assessment-db.mjs`, roster build/config checks and `node scripts/test-assessment-appeals-browser.mjs --cohorts`. SQL covers 121 pinned entries, three bounded batches, conflicts, changed eligibility/membership, cancellation, independent adoption, private history and four-process creation/claim/delivery races. The connected real app/production-handler/PostgreSQL browser journey handles 124 targets across two jobs: 122 new registrations and two existing matches, committed-reply loss, explicit adoption and five responsive widths without score changes.

Identity/PostgREST and the Cloudflare queue port are local fixture adapters. This is not native hosted Queue acceptance or capacity certification. Invitations, enrollment/identity lifecycle, departments/resource scopes, CSV/OneRoster roster ingestion, notifications, full localization/manual accessibility, hosted recovery/operations and full-scale acceptance remain required. No deployment or provider mutation occurred.
