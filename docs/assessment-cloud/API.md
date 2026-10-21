# Assessment Cloud API

Unfinished contracts, recorded 2026-10-22: source now parses institution command `registration.accommodate` under `exams.manage` and coordinator runtime commands `break.begin`/`break.end`. Their migration 36 and behavior are unverified, and institution/candidate UI is not connected. These are draft implementation contracts, **not advertised available endpoints**. [ACCOMMODATIONS.md](ACCOMMODATIONS.md) lists payloads, intended invariants, the failed migration check and required completion evidence. Historical passing API/build results below do not verify these additions.

Constrained tests use `assessment.definition.v2` with section `assessment.blueprint.v1` policies; v1 definitions cannot silently carry/drop these requirements. Private question `classification` is approval-bound and omitted from candidate manifests. `POST blueprints/preview` accepts the read-only `blueprint.preview` action with a complete definition, requiring bank-read plus author/publisher authority. Create/revise/publish recompute satisfying witnesses; candidate starts validate canonical selected payloads/counts/points and recover existing forms. See [BLUEPRINTS.md](BLUEPRINTS.md) for schemas, exact matching, bounded-search outcomes, immutable-revision replay and remaining calibration/exposure/adaptive/scale gates.

Diagram/hotspot preparation adds optional `image_response_tools`, `image_responses_enabled` and `image_response_protocol`. `attempt.start` requires the independent server gate and exact `image_response_client=assessment.image-response.v1` for these items, in addition to protected media compatibility. Canonical hotspot answers contain a bounded versioned point, never a region/score. Diagram anchors reference public response labels; private accepted text/regions remain outside candidate forms. See [IMAGE_RESPONSES.md](IMAGE_RESPONSES.md).

Capture-required starts use a separate Proctor registration-bound preparation and exact `capture_binding` only when both server release gates permit it. Runtime snapshots add optional `capture` status and set `next_deadline_at` to the earlier capture-watchdog check. A new runtime mutation blocked by a committed capture-loss pause returns HTTP 422 `capture_continuity_required`, never an answer receipt. A previously committed command remains replayable. Recovery does not authorize automatic academic resume; fresh media plus existing human authority are required. See [CAPTURE_LAUNCH.md](CAPTURE_LAUNCH.md).

`/assessment-cloud/feedback` adds institution-controlled totals/sections/question-points policies, independent hash-bound approval, release-time preview checks and audited withholding/restoration. Historical releases default to totals only. Candidate breakdowns now enforce pinned policy level/date and hold state. See [FEEDBACK.md](FEEDBACK.md) for routes, revision/idempotency semantics, privacy boundaries and operations.

`/assessment-cloud/analytics` provides authorized sitting/cohort/snapshot lists, immutable report creation, form/item paging and released-score diagnostics; institution reads require both `results.read` and `banks.read`. The separate owning-candidate `analytics/candidate/result?attempt_id=...` projection exposes eligible released section/question points, not prompts/keys/responses or grading identities. See [ANALYTICS.md](ANALYTICS.md) for authority, population definitions, source hashes, statistical limitations and exact routes. These are reporting projections, never grade-changing commands.

`/assessment-cloud/cohorts` supplies scoped member-name search, cohorts, pinned roster previews, durable jobs and explicit coordinator adoption/cancellation. A separate private Worker processes 50-person canonical batches; see [COHORTS.md](COHORTS.md). `/assessment-cloud/imports` stages validated CSV/Schood bank JSON, serves private review/history, confirms/adopts/cancels imports and creates bounded question-draft batches; protected JSON export requires author plus bank-read authority. See [BANK_IMPORTS.md](BANK_IMPORTS.md). Neither path modifies Academy groups or bypasses human question approval.

Certificates have a separate `/assessment-cloud/certificates` handler: dedicated-manager program creation/independent approval, canonical released-score signing/issuance and revision-fenced revocation; private owning-candidate downloads; public submitted-file signature/status verification. The credential is signed JSON, not a signed PDF or Open Badge. Default-off `GET <UUID>/pdf?tenant_id=...&locale=en|uz|ru` delivers a mother-design PDF with the exact credential attached after immutable digest reporting; public `POST reference/resolve` requires the complete signed holder tuple, not an identifier alone. Consent-gated browser QR verification and optional local PDF hash comparison are described in [CERTIFICATE_DOCUMENTS.md](CERTIFICATE_DOCUMENTS.md); issuer authority remains in [CERTIFICATES.md](CERTIFICATES.md).

Migration 34 adds reviewed `program.retire` and same-candidate/same-attempt/current-result `certificate.replace` commands under that same certificate handler/capability. The new sealed credential signs `replaces_certificate_id`; the original remains unchanged and its holder-proof status becomes `replaced` only after signature commit. Retired programs cannot admit/sign unfinished awards; sealed replay and historical downloads remain available. See [CERTIFICATE_LIFECYCLE.md](CERTIFICATE_LIFECYCLE.md) for exact inputs, immutable custody, public/private metadata and non-revival semantics.

Academic appeals have a separate handler under `/assessment-cloud/appeals`: owning-candidate listing/submission/withdrawal, current-moderator queue/detail and independent upheld/regrade decisions. They pin released score revisions and use the grading pipeline rather than editing scores. See [APPEALS.md](APPEALS.md) for authority, payloads, cursor pagination and retries.

Base URL is the project's `/functions/v1/assessment-cloud`. Requests use `Authorization: Bearer <Supabase user JWT>`; the gateway verifier is disabled because the handler verifies the token through Supabase Auth. CORS origins must be explicitly configured using `ASSESSMENT_ALLOWED_ORIGINS`. Do not include the service role key in any frontend.

`GET /workspaces` returns only the authenticated user's active memberships. All other routes require `tenant_id=<UUID>` and scope every read to that tenant.

Institution reads: `GET /item-banks`, `/item-versions`, `/rubrics`, `/assessments`, `/assessment-versions`, `/exam-windows`, `/registrations`, `/attempts`, `/audit`. Read permissions are `banks.read`, `exams.manage`, `results.read` and `audit.read` as applicable. Owner/admin memberships bootstrap these capabilities. Current lists are bounded to 1000 records; cursor pagination remains required.

`GET /item-versions/<UUID>/review` requires `items.write` or `items.approve` and returns the item, private key, any pinned subjective rubric and `review_hash`. Candidate access to this endpoint is forbidden. Reviewers must inspect the rubric along with the item/key; its contents contribute to the approval hash.

The review projection also derives `bank_id` from the question's tenant-scoped parent item for revision authoring. The caller cannot choose a different parent bank through this projection. The structured institution editor creates `item.revise` drafts from reviewed immutable material; old versions remain unchanged. Submitted item/rubric commands use encrypted actor/institution-scoped local intents and stable keys until a canonical receipt or definitive rejection. Question/revision and rubric forms now recover encrypted actor/institution/resource-scoped editable drafts on this device. Source/revision conflicts require explicit review or discard.

`GET /candidate/registrations` returns registrations for the authenticated candidate with sitting title and `required_services`; window requirements are loaded in tenant-scoped batches, without a Proctor API dependency. `GET /candidate/attempts/<UUID>` verifies ownership and returns server time, attempt deadlines, pinned delivery requirements, current section manifest and the candidate's response history. Future-section prompts and scoring keys are excluded. Unmonitored Exam sessions never call Proctor; assigned monitoring must satisfy its separate preparation/consent contract.

`POST /commands` accepts `{ "action": "...", "data": {...} }` with an `Idempotency-Key` of 8–200 characters. Retries preserve the same key. Reusing a key with a different semantic request returns 409. Actor identity is derived from the JWT, never the body.

After the runtime migration, timed mutations (`response.append`, `section.advance`, `attempt.submit`) must use the [coordinator contract](COORDINATOR.md). The database rejects their direct Assessment command path with `coordinator_required`. The table below records the original protocol; its three timed mutation rows are not a permitted bypass. The client is now wired; complete provider-authenticated browser acceptance remains required before deployment.

| Action | Data | Capability |
| --- | --- | --- |
| bank.create | title | items.write |
| rubric.create | title, criteria [{id,title,max_score,descriptor}] | items.write |
| item.create | bank_id, item, key | items.write |
| item.revise | item_id, item, key | items.write |
| item.submit | id | items.write |
| item.approve | id, review_hash | items.approve; reviewer differs from author |
| assessment.create | definition | items.write |
| assessment.revise | id, definition, reason; If-Match header carries current working revision | items.write |
| assessment.publish | id; If-Match header carries revision | assessments.publish |
| window.create | assessment_version_id, title, opens_at, closes_at | exams.manage |
| registration.create | window_id, candidate_id, extra_seconds | exams.manage |
| attempt.start | registration_id, delivery_client=assessment.prompt-media.v1 for prompt media | registered candidate only; media release flag/current compatible client; unsupported response tools blocked |
| response.append | attempt_id, sequence, item_version_id, response | owning active candidate; current section only |
| section.advance | attempt_id | owning active candidate |
| attempt.submit | attempt_id | owning candidate |

Item/definition formats are defined in `packages/assessment-core/src/mod.ts`. The API validates and reconstructs author inputs. Publication snapshots approved versions and compiles the existing exam spine inside a transaction. Attempts preserve random item selections/option ordering; retries never regenerate an existing attempt. Response sequence is strictly increasing and hash conflicts are rejected. The same transaction inserts the canonical response, immutable journal, audit event and idempotency result.

## Candidate delivery preparation

`GET /candidate/preparation?registration_id=<UUID>&tenant_id=<UUID>` authenticates the owning candidate and reads the selected immutable publication. It returns `{schema_version: "assessment.delivery-requirements.v1", prompt_media: ["image"|"audio"|"video"], response_tools: [...], prompt_media_enabled: boolean}`. These are deduplicated capability requirements, not prompts, filenames, asset IDs, private keys or a generated candidate form. The current Exam client checks supported response tools, endpoint validity and shared-cookie topology before `attempt.start`, so a missing media configuration does not consume examination time.

Prompt media requires the explicit server-side `ASSESSMENT_PROMPT_MEDIA_DELIVERY=true` release flag and the `assessment.prompt-media.v1` client compatibility signal. The flag defaults off until paired environment/CI/provider acceptance. The client signal is **not device attestation and grants no additional authority**: the server still generates and hashes the approved immutable form; artifact reads still verify readiness, owning active candidate and current section. Capture/diagram/hotspot response types are independently blocked even if a caller claims prompt-media support. Text-only examinations do not depend on media configuration. Shared-cookie identity changes trigger account-scoped UI teardown; Proctor additionally checks its captured expected actor immediately before transport.

## Institution exam design and working revisions

`GET /assessment-revisions` exposes immutable working-definition snapshots to current `banks.read` staff in the selected tenant. Like other existing list resources it is bounded to 1000 rows; complete cursor pagination remains required. Each record binds its assessment, revision, full definition, actor, timestamp and revision reason. It is not candidate data.

Definitions support 1–50 ordered sections with 1–500 pinned approved question-version IDs per section. A question version cannot appear in multiple sections. Fixed selection includes every pinned version; a pool's integer `draw_count` selects a random subset once at attempt start. Selection and ordering are independent: without `shuffle_items`, sampled questions retain their author-defined relative order. `shuffle_options` is independent and excludes ordering tasks. Unbiased cryptographic draws and the persisted immutable form prevent a retry from re-randomizing an existing attempt. Topic/difficulty/exposure balancing, calibrated comparability and adaptive routing are not implemented by this pool selector.

The overall duration is 60–86400 integer seconds. Optional section durations are positive integer seconds, their sum cannot exceed the overall duration, and the runtime caps section deadlines by the overall exam deadline. A section without its own timer uses the overall deadline. These are sequential sections with no candidate backtracking, not freely navigable groups or accommodation/break policies. Language is `uz`, `ru` or `en`; this metadata does not mean the complete staff interface is localized. The request limit remains 1 MB.

The eighth service migration validates form structure and tenant-approved versions inside the database as well as in the API. `assessment.revise` locks the working definition, requires the current `If-Match`, increments the revision, and inserts the reasoned immutable history, audit event and stable command receipt in one transaction. Stale edits/publications return 409. Published versions and exam windows remain pinned and unchanged; publishing a revised definition creates another independent version. Current capability is rechecked before receipt replay. The private pre-design RPC is not executable by authenticated users or the service role.

The institution editor provides section/question reorder controls, fixed/pool selection, separate shuffle settings, timing, structure review, explicit publication review, immutable revision history and role-sensitive controls. An assessment-specific encrypted actor/tenant command queue retains the same key across uncertain replies. Editable definitions and revision reasons recover in encrypted device drafts; stale sources require explicit restoration for review or discard, never silently overwrite the current revision. Recovery disables editing while restoration/deletion is in progress. Same-profile encryption and debounce/shared-device limitations described in the implementation ledger still apply. Cross-device authoring, full pagination, blueprint constraints and rich/media delivery remain required.

Errors carry `code`, `error`, `request_id`; 401 authentication, 403 capability/origin, 404 unavailable record, 409 replay/revision/review conflict, 422 invalid contract/state, 500 internal failure. No provider credentials or raw database details are returned on internal errors.

Deploy the additive migration and Edge function through the repository's authorized release process, configure allowed origins as a server secret and add the candidate/author domains to the auth allowlist. Production deployment is not performed by the local test commands.

## Protected artifacts

The separate Assessment artifact namespace and encrypted media Worker contracts are documented in [ARTIFACTS.md](ARTIFACTS.md). Artifacts must be ready and same-tenant before new item versions can reference them. Media-bearing examination starts remain explicitly gated until the verified media-aware delivery client is connected; a clean storage receipt is not item approval or a completed browser media workflow.

## Academic grading namespace

`/functions/v1/assessment-cloud/grading` belongs to Assessment Cloud, not Proctor or the mother platform. Public routes require the candidate/staff bearer token and `tenant_id`; commands also require a stable `Idempotency-Key`. Authority is derived from authentication and rechecked transactionally, never from body actor/status/total fields.

GET `worklist` lists assigned tasks (or institution moderation tasks); GET `runs` lists institution grading runs; both accept `after=<UUID>` and `limit=1..100`. GET `tasks/<UUID>` returns the pinned question/rubric/response, own mark, `can_mark`, `can_adjudicate` and run state. An assigned marker receives no peer marks, review hash, scoring key or candidate identity metadata. Authorized independent moderators receive the peer marks and current moderation hash. GET `runs/<UUID>` returns a reviewable score summary/hash; assigned markers cannot use that route to bypass blind marking. GET `candidate/results` returns only that candidate's latest released generation whose embargo has elapsed, without private marking notes or keys. Answer text may itself identify its author; this is metadata separation, not proven content anonymization.

GET `access` returns current `can_mark`, `can_moderate`, `can_release`, `can_read_banks`, `can_write_items`, `can_approve_items`, `can_publish` and `can_manage_exams` flags. These filter institution navigation and resource requests; they do not replace transactional permission checks. Release-only staff see only approved/released runs and cannot read tasks, worklists or unapproved run details.

Independent moderator task views also include `can_assign`, the pinned `required_markers`/`tolerance_percent` and active assignment IDs/slots. GET `markers/<taskUUID>` requires moderation authority and returns current authorized marker IDs/display names, excluding the task's candidate and inactive memberships. Assigned markers do not receive peer assignment metadata in task views. Run details include authoritative `can_approve`, `can_release` and `can_regrade` controls.

The institution UI stores submitted grading intents encrypted by actor/institution and retries the identical command key after reload or an uncertain reply. Only a canonical success or definitive 4xx rejection (except 408/429) clears that intent. New conflicting commands are blocked while an intent is unresolved. Account changes cannot send an old intent as the new actor. Criterion-mark and adjudication forms now have encrypted editable drafts, opaque revision fences and source-change blocking. These do not restore approval acknowledgements.

POST `commands` accepts `{action,data}`:

| Action | Required data | Canonical authority |
| --- | --- | --- |
| policy.configure | window_id, marker_count (1 or 2), tolerance_percent | grades.moderate; frozen once any attempt starts |
| marker.assign | task_id, marker_id, slot | grades.moderate; assignee must currently hold grades.mark and cannot be the candidate |
| marker.revoke | task_id, assignment_id, reason | grades.moderate; preserves withdrawn assignments/marks |
| mark.submit | task_id, criteria object, rationale | grades.mark plus active assignment; score is computed from the pinned rubric |
| mark.adjudicate | task_id, score, review_hash, rationale | independent grades.moderate; current disagreement/review hash required |
| grade.approve | run_id, review_hash | independent grades.moderate; all marking resolved, no self-approval of contributing marks/adjudication |
| grade.release | run_id, optional release_at ISO timestamp | results.release; approved snapshot only |
| grade.regrade | run_id, reason | grades.moderate; creates a new generation and preserves existing releases |

Marks and grading points use six-decimal fixed precision. Criterion points are normalized to the item's maximum: four nine-point criteria can produce a nine-point item. Criteria must exactly cover the pinned rubric and remain within its maxima. Distinct marker slots either agree within the exam's pinned tolerance or require independent adjudication; a revised mark invalidates stale adjudication/review hashes. Approval creates an immutable academic score revision. Current backend release is human-controlled, including objective-only exams; automated low-stakes release policies are not yet implemented. Consequential certificates are not issued by this API.

Rubric IDs are immutable snapshots; change a rubric by authoring a new snapshot and question version. Subjective question approval now hashes the displayed rubric content as well as the item/key, preventing ID-only rubric approval. Rich rubric version editing and descriptor/weight workflows remain required.

## Assessment staff namespace

`/functions/v1/assessment-cloud/staff` uses the current user bearer token, exact allowed origins and `tenant_id`. Public staff writes require a stable `Idempotency-Key`; actor/tenant/inheritance/authority fields from the body are ignored. PostgreSQL rechecks authority and current membership transactionally. Raw staff tables and RPCs are service-only.

GET `access` returns `can_manage`, owner/admin `bootstrap`, the actor's `delegable` assessment permissions and `authority_ends_at` limits. GET `members` and `roles` accept `after=<UUID>` and `limit=1..100`. GET `members/<UUID>` returns direct grant revisions/expiry/withdrawal state and immutable role-assignment history within the institution. Names come only from that institution's memberships, not a global account search. Grading's access projection additionally returns `can_manage_team` to filter navigation.

| Staff action | Canonical input |
| --- | --- |
| capability.grant | user_id, capability, expected_revision (0 for absent), optional expires_at, reason |
| capability.revoke | user_id, capability, expected_revision, reason |
| role.create | title, unique capabilities, reason |
| role.revise | role_id, expected_version, title, unique capabilities, reason |
| role.assign | user_id, role_version_id, expected_assignment_id (null for absent), optional expires_at, reason |
| role.revoke | assignment_id, expected_revision, reason |

Allowed role/grant rights are `banks.read`, `items.write`, `items.approve`, `assessments.publish`, `exams.manage`, `grades.mark`, `grades.moderate`, `results.read`, `results.release`, `audit.read` and `team.manage`. Proctor rights and legacy `grades.manage` cannot be delegated here. Only active organization owner/admin roles may delegate management. Other managers need `team.manage` plus every permission being changed; they cannot change themselves or modify inherited owner/admin access. Grants/assignments require active targets; withdrawals may remove inactive members' residual rights. Temporary managers cannot grant permanent or longer-lived rights than their authority. Current permission checks deny revoked/expired grants and inactive memberships immediately, without a background expiry job.

Role revisions create new immutable versions. Existing assignments keep their selected version; explicit reassignment withdraws the previous binding and records a new one. Definitions, bindings, command receipts and audit transitions preserve history. Revoking a manager does not automatically erase grants they previously issued: those remain subject to their recorded expiry and explicit institutional revocation. Departments/resource scopes, invitations, bulk rollout and scheduled expiry audit events remain work.

The staff SDK encrypts pending intents by actor/institution, serializes browser writes and retries the same command key after a lost receipt. Unknown, stale or out-of-authority changes are rejected rather than silently replacing newer staff state. Every successful staff change has an immutable assessment audit event with actor, target, reason and effective operation result. The staff API does not update mother/Academy membership, grant Proctor authority, change grades or invalidate attempts.

## Private grading Worker execution

Device draft tokens stay only in the encrypted client intent. They are stripped before public commands are sent and cannot grant API authority. After a canonical response, the client fences draft cleanup against its bound revision before removing the pending intent; storage interruption therefore replays the same command key, not a new write. A concurrent newer draft is retained. Device data recovery is not an institution submission, release or approval and does not bypass current authenticated capabilities.

The separate `workers/assessment-grading` Worker has no public HTTP workflow. Its environment-specific minute cron claims canonical pending/expired-lease jobs and publishes scoped generation tickets to a distinct grading Queue/DLQ. Jobs are created in the submission/expiry transaction. Each message is acknowledged only after a canonical commit receipt, or when its dispatch lease is stale and canonical redispatch will handle it. Other failures retry individually with bounded concurrency/backoff. Logs contain sanitized outcome/code/count only, not job capabilities, responses or keys.

POST `grading/internal` additionally requires the private `x-assessment-grading-key` matching `ASSESSMENT_GRADING_SECRET` (at least 32 random characters):

- `job.claim`: `{limit:1..100}` returns job metadata, not scoring material.
- `job.process`: `{tenant_id,attempt_id,generation,lease_token}` verifies a canonical lease, obtains pinned item/key/rubric and latest canonical responses inside the Edge/database boundary, invokes the deterministic scorer, and commits the validated report/human tasks. The caller cannot submit scores. An existing committed receipt recovers a lost response without rescoring or duplicating the generation.

The Worker cannot approve subjective scores, adjudicate, release results, issue credentials or invalidate attempts. Its separate secret must never be exposed as a frontend variable. Current local evidence connects actual Worker/Queue, handler/scorer and PostgreSQL; institution marking/release and candidate-result screens have intercepted browser evidence, not hosted Supabase authentication/transport proof. Full-scale chunked processing of large form/response bundles, staff delegation, the remaining draft/retention/shared-device workflows, richer/bulk marking and reports, human-approved AI suggestions, calibration, appeals, key corrections, signed credentials and hosted operations remain mandatory work, not optional omissions.
