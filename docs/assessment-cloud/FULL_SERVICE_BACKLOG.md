# Full-service implementation and acceptance backlog

Updated 2026-10-22. This decomposes all 26 rows of the [implementation ledger](IMPLEMENTATION.md#full-requirement-and-evidence-ledger). It preserves the full end state; it is not MVP sequencing or a claim that existing foundations must be rebuilt. Baselines below summarize recorded local evidence, not a fresh verification of the now-modified checkout.

All listed checkboxes are **open remaining work or acceptance**, including tasks that extend existing code. Stable IDs identify tasks across documents. Dependencies identify prerequisite workstreams/tasks; an independent workstream need not wait for unrelated polish. No production target, signing identity, legal approval, commercial promise or paid provider is assumed authorized by this document.

## Completion and evidence rules

For each checked task, record the implementing source revision, exact command/journey, terminal result/artifact, environment/adapters and evidence link in its feature document and ledger. Separate local, hosted, physical-device, external-review and capacity proof. A task stays open when only a plan, fixture, file, intended invariant or unrelated green check exists. A subsystem closes only when every required task and its shared gates pass; no subsystem is closed now.

Shared acceptance applies to every workstream: tenant/current-role enforcement at the authoritative boundary; idempotency and lost-response recovery; server-owned state; auditability; no unintended academic-score changes; correct product entitlements; mother-design UX; Uzbek/Russian/English and accessible supported-device workflows; retention/deletion/holds; monitoring/operations; exact-release CI; applicable hosted and target-capacity proof. These are not waived where omitted from an individual task.

## TEN — Tenants, centers, groups and staff

Baseline: tenant-scoped memberships/capabilities, immutable role revisions, invitations and bounded cohort registration have local evidence. References: [membership](MEMBERSHIP.md), [invitations](INVITATIONS.md), [mail](INVITATION_MAIL.md), [cohorts](COHORTS.md). Dependencies: SEC, OPS; entitlement enforcement joins BILL.

- [ ] `TEN-01` Add department/branch/resource scopes to roles and delegation. Complete when every list/read/write/job enforces scope and tests deny cross-department and cross-center leakage, not only foreign tenants.
- [ ] `TEN-02` Complete roster identity/import lifecycle: preview, duplicates, ambiguous accounts, membership changes and reconciliation. Complete when reviewed imports produce per-person outcomes and retries cannot duplicate registrations or alter Academy membership.
- [ ] `TEN-03` Complete invitation delivery operations: authenticated hosted relay/inbox proof, bounce/DSN processing, suppression, abuse/rate controls and bulk/reminder policies. Complete when accepted, rejected and unknown SMTP outcomes reconcile without unsafe automatic resend.
- [ ] `TEN-04` Finish institution setup and access lifecycle, including bounded bulk operations, delegation expiry and suspension recovery. Complete when new-center setup through staff withdrawal works end to end and current authority fences in-flight work.

## BANK — Question banks, versions and licensed content

Baseline: immutable item versions and independent approval exist; metadata/review/sharing remain partial. Dependencies: TEN-01, SEC; see [blueprints](BLUEPRINTS.md) and [bank files](BANK_IMPORTS.md).

- [ ] `BANK-01` Complete metadata, curriculum/topic taxonomy, copyright/source/license ownership and migration of older items. Complete when structured filters and edits preserve immutable published versions and provenance.
- [ ] `BANK-02` Add reviewer comments, change comparisons, revision requests and collaboration conflict handling. Complete when reviewers can identify all changed prompt/key/rubric/media material before independently approving the exact version.
- [ ] `BANK-03` Implement licensed bank sharing, permitted use/copy/export and withdrawal/expiry semantics. Complete when recipient rights and source attribution are enforced in publication, delivery and export, including existing publications.
- [ ] `BANK-04` Add full-bank search, stable pagination and large-bank operations. Complete when tied timestamps/concurrent changes do not skip or expose items and operation limits are measured.

## ITEM — Question types and accessible authoring

Baseline: conventional structured types and local image/file/audio/video answer workflows exist. Dependencies: BANK, EVID/SEC artifact custody, UX. References: [image responses](IMAGE_RESPONSES.md), [media answers](MEDIA_ANSWERS.md), [artifacts](ARTIFACTS.md).

- [ ] `ITEM-01` Complete rich prompt/rubric layouts and media alternatives. Complete when each supported type can be authored, independently reviewed, delivered and graded in all three languages without leaking private keys.
- [ ] `ITEM-02` Finish native response pre-selection review, takes/duration limits, incomplete-prefix validation and remediation. Complete when cancellation, interrupted recording, changed file and recovery never silently select an unintended answer.
- [ ] `ITEM-03` Complete cross-device draft and answer recovery policy. Complete when explicitly authorized handover preserves confirmed work and fences the old device without claiming unsynced bytes exist remotely.
- [ ] `ITEM-04` Expand malformed/hostile media, browser/device and interrupted-session coverage. Complete when actual decoding/scanning and cleanup tests cover the supported corpus with measured bounds, not MIME strings alone.

## IMPORT — Import/export and human-reviewed content assistance

Baseline: CSV/Schood JSON and partial QTI-to-unapproved-draft acceptance exist. Dependencies: BANK, ITEM, SEC, OPS. References: [bank files](BANK_IMPORTS.md), [QTI byte workflow](QTI_BYTE_WORKFLOW.md), [QTI](QTI.md).

- [ ] `IMPORT-01` Complete supported QTI item/test/scoring/rubric/asset/license mappings and semantic-loss diagnostics. Complete when real full-type packages round-trip without silent scoring or ownership changes; unsupported semantics remain explicit.
- [ ] `IMPORT-02` Implement materialized, protected exports with job history, cancellation, large-file streaming, retry and retention. Complete when only authorized pinned content is exported and job recovery/DLQ inspection works.
- [ ] `IMPORT-03` Add DOCX/PDF/XLSX author import workflows with previews, ambiguity diagnostics and explicit adoption. Complete when extraction never silently invents keys, rights or approvals and malformed files stay isolated.
- [ ] `IMPORT-04` Add human-reviewed AI authoring/adoption with provider/model/version/source provenance. Complete when generated content stays draft until independently reviewed and no AI request grants access to unrelated banks.
- [ ] `IMPORT-05` Prove standards compatibility and hosted byte/scan/processor custody against the full historical schema. Complete when conformance/round-trip reports and credentialed provider evidence are attached.

## FORM — Blueprints, exposure and adaptive forms

Baseline: fixed/randomized multi-section forms and constrained v2 blueprints have local evidence; difficulty labels are author estimates. Dependencies: BANK-01, STAT calibration, TIME, OPS. Reference: [blueprints](BLUEPRINTS.md).

- [x] `FORM-01` Implement exposure/security pools, item-family/enemy constraints and overlap limits. Complete when concurrent admission cannot exceed policy or choose forbidden combinations and exhaustion is reported without relaxing constraints. *Local evidence 2026-10-22: blueprint v2 enemies/families/exposure in core, SQL and Edge; DB integration test; four-process exposure race (lock-removal mutation over-admits and fails); blueprint editor controls. See [BLUEPRINTS.md](BLUEPRINTS.md#blueprint-v2-relations-and-exposure).*
- [ ] `FORM-02` Add richer blueprint dimensions, collaboration and complete pool paging. Complete when feasibility/publication uses the complete authorized pinned pool and detects stale source revisions.
- [ ] `FORM-03` Add bounded background/compiled-form assembly and operations. Complete when search-budget exhaustion, infeasibility, cancellation and worker recovery remain distinct and no candidate receives a partial/unproved form.
- [ ] `FORM-04` Implement adaptive routing/stopping with pinned calibrated item/model versions and auditable path decisions. Complete when deterministic replay, exposure control, accommodation interaction and calibrated simulation results are recorded.
- [ ] `FORM-05` Establish calibrated comparability/equating and standards mappings. Complete when evidence supports difficulty claims and exported/imported forms preserve their constraints; randomization alone is not equivalence.

## TIME — Timed delivery, autosave and recovery

Baseline: canonical leases/epochs/alarms, encrypted journals and connected local delivery exist. Dependencies: ACC, CTRL trusted-device integration, OPS. Reference: [coordinator](COORDINATOR.md).

- [ ] `TIME-01` Complete provider-authenticated real-browser/coordinator/Edge/Postgres acceptance. Complete when server clocks, outage/restart and committed-response recovery are proved with actual identity/providers rather than transport adapters.
- [ ] `TIME-02` Add explicit safe takeover/trusted-device handover and late-response policy. Complete when old epochs cannot write, acknowledged answers are never lost and unacknowledged late work is disclosed rather than silently accepted.
- [ ] `TIME-03` Finish live state subscriptions and final submission confirmation. Complete when tab/account/section/lease changes tear down stale state, pending work is reconciled and a lost submission reply returns the same result.
- [ ] `TIME-04` Expand long-session/clock/section/outage tests. Complete when delayed alarms, sitting close, breaks, proctor holds and recovered media cannot grant or remove time outside the pinned policy.

## ACC — Accommodations and minors

Baseline: extra-time field has prior use; new revisioned policy/break implementation is written but unverified. Dependencies: TIME, POLICY, IDENT, UX, SEC. Reference: [unfinished accommodations](ACCOMMODATIONS.md).

- [x] `ACC-01` Repair and verify migration 36 and strict contracts. Complete when the isolated 36-migration suite, focused tests, relevant builds/types and regression stacks have captured terminal passes; the previous syntax-failure correction is not proof. *Local evidence 2026-10-22: full DB suite, 32 focused tests, Edge types, three builds, boundaries and the coordinator/media/evidence/scanner/interchange/live stacks pass — see [ACCOMMODATIONS.md](ACCOMMODATIONS.md#evidence-local-captured-2026-10-22). Exact-release remote CI is tracked under OPS-01.*
- [x] `ACC-02` Prove clock/pause/concurrency authority. Complete when running/stopped breaks, unused credit, limits, stale leases, competing start/approval/break/end/pause/expiry and late alarms preserve one state, exact non-overlapping time and original scores. *Local evidence 2026-10-22: integration cases and four-process races in `scripts/test-assessment-accommodations-race.mjs`; a mutation check proved the running-clock cap test fails when the cap is removed.*
- [x] `ACC-03` Build institution approval/revision controls and candidate policy/break/countdown/early-end screens. Complete when both clock policies work through real apps, private approval reasons stay private, and no candidate control resumes a proctor hold. *Local evidence 2026-10-22: connected `--accommodations` journey covers stopped- and running-clock policies through the real Assessment and Exam apps, the private approval basis, and no candidate control during a pause. Hosted acceptance remains under OPS/ACC-07.*
- [ ] `ACC-04` Add durable submitted intents and full academic-tool teardown/recovery. Complete when pending answers sync before break, active academic recordings are sealed, questions/media are hidden during break, monitoring continues and reload/lost replies do not duplicate breaks. *Progress 2026-10-22: durable approval and break intents, answer sync before break, hidden questions, reload and lost-reply recovery pass in the connected journey. Open: browser proof that an open academic recording blocks and is sealed first; account/lease change during a pending intent.*
- [ ] `ACC-05` Implement explicit policy exemptions and alternate media/access arrangements. Complete when authorized exceptions are pinned, reviewed, candidate-visible where appropriate and cannot silently disable unrelated integrity controls.
- [ ] `ACC-06` Implement guardian/age-related consent and exceptions with approved legal policy. Complete when required consent, withdrawal, retention and institution escalation are enforced without unnecessary medical/biometric data disclosure.
- [ ] `ACC-07` Complete accommodated-cohort, manual accessibility and hosted monitored journeys. Complete when actual institution/Exam/Proctor workflows cover keyboard/screen-reader users, recording/live loss and physical devices; all adapters and remaining limits are named.

## GRADE — Grading, moderation and approved AI

Baseline: deterministic scoring, leased jobs, blind/double marking, adjudication, reviewed release and regrade generations have local workflows. Dependencies: ITEM, TEN-01, OPS, AI provenance controls.

- [ ] `GRADE-01` Complete cross-device editable/submitted marking drafts and scoped delegation. Complete when stale reviews and permission changes cannot submit under a different reviewer or overwrite another device's work.
- [ ] `GRADE-02` Add chunked/background processing and complete bulk marking/release controls. Complete when large cohorts, partial failures, retries and cancelled batches reconcile per task without duplicate grades or releases.
- [ ] `GRADE-03` Implement richer rubrics and reviewed key corrections. Complete when correction impact is previewed and a new auditable score generation preserves prior released results and appeal/credential links.
- [ ] `GRADE-04` Add subjective AI suggestions with provenance and explicit human adoption. Complete when suggestions never become final subjective grades or consequential credentials without the required human approvals.
- [ ] `GRADE-05` Prove hosted queue/provider failure and complete objective-to-subjective-to-moderation-to-release workflows. Complete when retry/DLQ/lease-expiry recovery and reviewer independence hold under production-shaped load.

## STAT — Psychometrics and analytics

Baseline: local released snapshots, cohort distributions and raw item diagnostics exist; no calibrated measurement claim. Dependencies: GRADE, FORM, SEC. Reference: [analytics](ANALYTICS.md).

- [ ] `STAT-01` Add materialized/background reporting and protected report exports. Complete when report snapshots are reproducible, cancellable/recoverable and bounded for large cohorts.
- [ ] `STAT-02` Add topic/longitudinal comparisons and historical attribution. Complete when revisions, mixed forms, repeated candidates and historical membership are handled without misleading merged cohorts.
- [ ] `STAT-03` Implement CTT uncertainty and small-sample/assumption warnings. Complete when known datasets validate each metric and undefined/unreliable estimates are not presented as precise values. *Progress 2026-10-22: tested uncertainty core (Feldt, SEM, Wilson, Fisher z) with explicit warnings. Open: report/UI wiring. See [MEASUREMENT.md](MEASUREMENT.md).*
- [ ] `STAT-04` Implement calibrated IRT/equating/standard-setting datasets and workflows. Complete when model fit, versioning, uncertainty and comparable-score validation are documented and independently reviewed. *Progress 2026-10-22: Rasch JMLE calibration core with seeded recovery validation. Open: datasets, workflow, review.*
- [ ] `STAT-05` Add DIF/fairness analysis and controlled disclosure. Complete when approved reference datasets validate subgroup diagnostics while privacy thresholds and access policy prevent identification or unsupported bias claims. *Progress 2026-10-22: Mantel–Haenszel DIF core with ETS classes and a privacy minimum. Open: approved subgroup policy and UI.*

## RESULT — Results, credentials and appeals

Baseline: released results, independent academic appeals, signed JSON, three-language PDFs/QR, revocation/retirement/replacement have local evidence. Dependencies: GRADE, EVID archival, SEC/KMS, TEN notifications. References: [appeals](APPEALS.md), [certificates](CERTIFICATES.md), [documents](CERTIFICATE_DOCUMENTS.md), [lifecycle](CERTIFICATE_LIFECYCLE.md), [feedback](FEEDBACK.md).

- [ ] `RESULT-01` Complete appeal filing windows, assignments, escalation, attachments and multi-stage challenges. Complete when candidate-to-independent-reviewer decisions and notifications survive retries while preserving original releases.
  - Progress 2026-10-22: filing and escalation deadlines, independent assignment and a two-stage review are built and verified locally (SQL integration test, handler test and the connected `--appeal-workflow` journey; see [APPEALS.md](APPEALS.md)). Attachments and delivered notifications are still open, so this stays unchecked.
- [ ] `RESULT-02` Finish richer result reports and policy-controlled low-stakes automatic release. Complete when disclosure/embargo rules and approved release policies are enforced per immutable result generation.
- [ ] `RESULT-03` Add actual PDF digital signatures and immutable byte archival/retrieval. Complete when signed-file validation, exact-original download and retained/replaced/revoked status work; signed embedded JSON and a hash receipt alone do not satisfy this.
- [ ] `RESULT-04` Complete Open Badges, program revision families and richer replacement/history policies. Complete when standards validation and full predecessor/successor status checks preserve originals and never revive replaced credentials.
- [ ] `RESULT-05` Implement reviewed bulk issuance and delivery/status operations. Complete when partial failures, current-score eligibility, key rotation, unknown signing outcomes and notification retries reconcile without duplicate credentials.

## POLICY — Proctor policies and limited automated enforcement

Baseline: policy consent, pre-clock capture/live readiness and scheduled continuity warn/pause exist locally. Dependencies: ACC, IDENT, CTRL, EVID, LIVE, SEC. Reference: [capture launch](CAPTURE_LAUNCH.md).

- [ ] `POLICY-01` Complete policy versioning, institution exceptions and supported-control compatibility. Complete when candidates acknowledge the actual pinned policy and unavailable capabilities block or follow an explicitly approved alternative.
- [ ] `POLICY-02` Implement remaining permitted browser/device/anomaly controls. Complete when policy action, source provenance, thresholds and escalation are testable; AI may request re-verification/pause but cannot invalidate.
- [ ] `POLICY-03` Prove physical-device, browser, provider and repeated-loss behavior. Complete when warning-only versus pause policies, fresh-source human resume and long-session recovery work with no automatic resume loophole.
- [ ] `POLICY-04` Finish trusted-device and accommodation interaction. Complete when recovery never silently changes device/policy/consent or discards mandatory monitoring evidence.

## IDENT — Identity tiers and biometric consent

Baseline: attended human checks/base monitoring consent exist; external document/liveness tiers are pending. Dependencies: SEC legal/data approval, TEN, POLICY.

- [ ] `IDENT-01` Implement approved proofing provider adapters, identity tiers and attended fallback. Complete when verification, rejection, retry, provider timeout and manual exceptions are demonstrated with credentialed provider evidence.
- [ ] `IDENT-02` Implement explicit biometric and cross-border consent, purpose/version records and refusal paths. Complete when declined/withdrawn consent cannot be bypassed or misreported as verified identity.
- [ ] `IDENT-03` Implement transient embedding/document custody and deletion. Complete when retention/holds/key access and provider-side deletion receipts are exercised without leaking raw material to clients or logs.
- [ ] `IDENT-04` Complete minors, identity re-check and disputed-match escalation. Complete when approved guardian/exception policy and independent human decisions cover false matches and interrupted re-verification.

## CTRL — Browser controls and integrity ingestion

Baseline: ordered source-separated ingestion and encrypted retry spool exist; browser enforcement/attestation are incomplete. Dependencies: POLICY, DESKTOP, SEC.

- [ ] `CTRL-01` Implement and disclose actual browser restrictions/capability limits. Complete when focus/fullscreen/navigation/copy-related controls are tested across supported browsers without claiming ordinary browser code is a secure lockdown client.
- [ ] `CTRL-02` Add trusted-client signatures, device binding and attestation verification. Complete when unsigned/replayed/foreign-client events are rejected or explicitly untrusted and key rotation does not lose provenance.
- [ ] `CTRL-03` Finish offline event policy, gaps and tampering model. Complete when reordered/repeated/missing events and clock changes preserve source ordering and visible integrity gaps rather than fabricating continuity.
- [ ] `CTRL-04` Prove adversarial ingestion and bounded recovery. Complete when abuse limits, reconnect flooding, stale grants and interrupted device spools cannot cross tenants or drop acknowledged events.

## EVID — Recording and evidence data plane

Baseline: local capture-to-encrypted storage/playback/citation and monitored Exam launch exist. Dependencies: SEC keys/retention, OPS, POLICY. References: [recordings](RECORDINGS.md), [artifacts](ARTIFACTS.md).

- [ ] `EVID-01` Complete physical-device/browser/long-session capture coverage and trusted/cross-device recovery. Complete when crash, permissions, sleep, storage-full, network loss and abandoned sessions produce explicit recoverable media or gaps.
- [ ] `EVID-02` Add sandbox-validated processed renditions, indexes and clips. Complete when decoded outputs preserve source provenance, cited boundaries and corrupt/missing-chunk diagnostics with bounded CPU/memory/storage.
- [ ] `EVID-03` Implement retention, legal holds, deletion and archival reconciliation. Complete when original/processed/replicated/provider bytes and keys obey holds/deletion with auditable drills; policy defaults are not deletion proof.
- [ ] `EVID-04` Complete hosted encryption/key rotation and authorized storage/media delivery. Complete when credentialed R2/key custody/range access and cross-tenant/revoked/expired tests pass.
- [ ] `EVID-05` Establish recording operations and capacity telemetry. Complete when backlog, gaps, failed close/cleanup, corrupt bytes and retention errors are actionable and the 5,000-recording target is measured with LOAD.

## LIVE — Institution live monitoring

Baseline: canonical preparation/readiness/loss, assignments and bounded monitoring board have local evidence with synthetic SFU/TURN ports. Dependencies: POLICY, EVID, TEN-01, OPS. References: [live monitoring](LIVE_MONITORING.md), [workload](PROCTOR_WORKLOAD.md).

- [ ] `LIVE-01` Prove real hosted SFU/TURN, restrictive networks and physical publisher/viewer media. Complete when relayed packets, renewal/revocation, disconnect and cleanup work with actual provider credentials and isolated namespaces.
- [ ] `LIVE-02` Complete shifts/workload/resource-scoped assignment and full session/staff search/paging. Complete when cross-shift/scoped access, stale bulk changes and withdrawal are handled atomically across legacy and new controls.
- [ ] `LIVE-03` Add durable assignment/viewer intents, push updates and bounded admission. Complete when tab/device/reload/provider uncertainty does not create orphaned forwarding or unauthorized feeds.
- [ ] `LIVE-04` Prove simultaneous multi-candidate media, long-session soak and 1,000-viewer target. Complete when latency/resource/cleanup reports cover actual concurrent streams and recording is preserved when viewing stops.

## CASE — Review cases and consequential human decisions

Baseline: immutable event/recording citations, findings and independent agreeing quorum exist locally. Dependencies: EVID, TEN-01, RESULT appeals, SEC.

- [ ] `CASE-01` Implement senior disagreement adjudication and assignments/escalation. Complete when disagreeing independent reviewers reach an authorized audited decision without allowing AI final invalidation.
- [ ] `CASE-02` Add cross-device draft/submitted-intent recovery. Complete when source changes, revoked roles and lost findings replies require explicit reconciliation and preserve immutable citations.
- [ ] `CASE-03` Complete candidate evidence disclosure and integrity appeals. Complete when permitted disclosure, redaction, filing policy and independent challenge outcomes preserve original evidence and academic-score separation.
- [ ] `CASE-04` Prove the complete proctor-to-reviewer-to-adjudicator journey. Complete when actual hosted media/citations, quorum, notifications, appeal and retention/hold behavior are exercised end to end.

## DESKTOP — Signed Windows/macOS secure clients

Baseline: pending client implementation/distribution. Dependencies: CTRL, POLICY, TIME, SEC, OPS. Browser controls are not a substitute.

- [ ] `DESKTOP-01` Implement isolated Rust/Chromium client adapters and institution-controlled exam launch. Complete when an installed client authenticates, binds an attempt and enforces the pinned supported policy without embedding privileged service secrets.
- [ ] `DESKTOP-02` Implement process/display/VM/control detection and permitted enforcement. Complete when actual Windows/macOS behavior and accessibility/approved exceptions are documented and bypass-tested; unsupported checks are disclosed.
- [ ] `DESKTOP-03` Implement signing/notarization, secure updates and release rings. Complete when authentic packages install/update/roll back safely and revoked/untrusted packages cannot attest as current clients.
- [ ] `DESKTOP-04` Complete OS/device interruption and uninstall/cleanup journeys. Complete when network/sleep/crash/permissions/multi-display changes preserve acknowledged answers and allow authorized recovery without weakening lockdown policy.

## MOBILE — Android/iOS second camera

Baseline: pending paired companion implementation. Dependencies: IDENT/consent, POLICY, EVID, LIVE, SEC, OPS.

- [ ] `MOBILE-01` Implement expiring QR pairing and cryptographic attempt/device binding. Complete when scanned/replayed/foreign codes cannot attach a camera to another candidate and pairing replacement is explicitly authorized.
- [ ] `MOBILE-02` Implement native capture/reconnect and battery/background/permission handling. Complete when physical Android/iOS devices send authenticated media, report gaps and recover without silent monitoring cessation.
- [ ] `MOBILE-03` Add consent, candidate/proctor pairing status and loss-policy integration. Complete when the required companion is ready before time starts and loss invokes the pinned warning/pause policy.
- [ ] `MOBILE-04` Complete signed distribution, updates and device acceptance. Complete when real supported devices install authentic releases and pairing/media/key cleanup is tested after completion and withdrawal.

## CENTER — Offline Center Node

Baseline: pending local center runtime. Dependencies: FORM, TIME, CTRL, SEC, OPS; local enforcement must preserve server authority semantics.

- [ ] `CENTER-01` Implement authorized encrypted packages and center/device mTLS provisioning. Complete when a node receives only its pinned sitting/content and expired/revoked/foreign packages cannot launch.
- [ ] `CENTER-02` Implement local leases, timing, admission and complete disconnected sittings. Complete when multiple actual center devices can start/save/finish without internet while respecting approved clocks, accommodations and content access.
- [ ] `CENTER-03` Implement signed synchronization, idempotent ingestion and conflict quarantine. Complete when reconnect/repeated upload/partial transfer cannot duplicate results or silently overwrite conflicting authoritative work.
- [ ] `CENTER-04` Prove node crash/restore, clock tampering, key loss and compromised-node response. Complete when restoration preserves acknowledged answers and untrusted sessions are quarantined for human resolution, with an operating runbook.

## AI — Integrity and collusion analysis

Baseline: decision bounds exist; integrity models and similarity analysis remain pending. Dependencies: POLICY, CASE, EVID, IDENT/consent, SEC, STAT fairness.

- [ ] `AI-01` Implement consent-compatible on-device/clip inference pipelines with explicit provenance. Complete when model inputs/outputs, source windows and processing retention are bounded and reproducible.
- [ ] `AI-02` Add model registry/versioning, rollout/rollback and measured thresholds. Complete when labeled validation reports show false-positive/negative rates and repeated-window behavior for supported devices/cohorts.
- [ ] `AI-03` Implement answer/item/timing collusion similarity analytics with limitations. Complete when controlled datasets validate signals without equating similarity with proven misconduct or leaking other candidates' work.
- [ ] `AI-04` Complete calibrated fairness review and human case adoption. Complete when reviewers can inspect evidence, disagree and appeal; AI cannot invalidate or silently replace human subjective grading.

## ENT — Enterprise APIs and interoperability

Baseline: base scoped commands/reads and partial QTI workflow exist. Dependencies: TEN-01, IMPORT, SEC, OPS, BILL. References: [API](API.md), [Proctor API](PROCTOR_API.md), [QTI control plane](QTI_CONTROL_PLANE.md).

- [ ] `ENT-01` Complete resource APIs, stable paging, error contracts and versioned compatibility. Complete when SDK/contract tests cover scoped reads/writes, concurrency, limits and deprecation without direct-database bypass.
- [ ] `ENT-02` Implement scoped OAuth/service accounts and institution SSO. Complete when provisioning, revocation, key rotation, account matching and tenant isolation pass real provider/institution flows. *Progress 2026-10-22: scoped service accounts, hashed secrets/tokens, rotation, revocation, creator-authority binding and integration audit; v1 registrations/results/events. Open: SSO, staff UI, provider flows. See [INTEGRATIONS.md](INTEGRATIONS.md).*
- [ ] `ENT-03` Implement OneRoster and complete QTI standards fidelity/conformance. Complete when real authorized institutions exchange datasets/packages and mapping/unsupported-field diagnostics preserve ownership and meaning.
- [ ] `ENT-04` Implement signed webhooks, delivery history, retry/backoff and DLQ replay. Complete when consumers verify signatures/rotation, duplicate and out-of-order events reconcile, and secrets/foreign payloads never leak. *Progress 2026-10-22: thin signed events, encrypted secrets, rotation overlap, leased delivery, backoff, dead letter and replay; delivery Worker. Open: staff UI and real consumer delivery on staging.*

## BILL — Product entitlements and billing

Baseline: pending separate product grants, quotas and metering; the ledger identifies existing Click integration to reuse through an explicit boundary. Dependencies: TEN, OPS, SEC; do not move assessment behavior into the mother platform.

- [ ] `BILL-01` Implement independently purchasable Assessment/Proctor plans and effective entitlement history. Complete when standalone/combined institution access is enforced on server admission and provider data planes, not only hidden buttons. *Progress 2026-10-22: tenant entitlement read from the existing Click plan fulfilment; sitting/start admission enforced when support enables it (default off). Open: media/recording/coordinator data planes. See [BILLING.md](BILLING.md).*
- [x] `BILL-02` Implement bounded quota reservation and immutable usage ledger/reconciliation. Complete when retries, simultaneous starts, failed technical preparation and uncertain provider outcomes cannot overcharge or exceed approved quota. *Local evidence 2026-10-22: attempt-keyed ledger (reserve at start, consume at finish), quota under a per-tenant lock; SQL tests and a four-process quota race with a lock-removal mutation check. Hosted reconciliation remains under OPS/LOAD.*
- [ ] `BILL-03` Integrate approved Click settlement, credits/refunds and invoices. Complete when authenticated callbacks, exact monetary arithmetic, idempotent reconciliation and partial/unknown settlements pass without changing another product's billing. *Progress 2026-10-22: Click checkout restricts institution-service products to tenant owners/admins (payments suite passes). Open: Click test-mode journey, credits/refunds/invoices; live settlement blocked on static-IP egress.*
- [ ] `BILL-04` Add institution usage/billing views and support adjustments. Complete when explainable per-exam/recording usage matches receipts/invoices and every adjustment has explicit authority and an audit trail. *Progress 2026-10-22: summary/adjustment/enforcement APIs with audited support authority. Open: institution and support screens.*

## OPS — Environments, CI, deployment and recovery

Baseline: service CI and local checks exist; historical provider access was read-only. Dependencies: SEC approvals and all applicable feature compatibility. Reference: [release gates](RELEASE_GATES.md).

- [ ] `OPS-01` Prepare service-owned release isolation and exact-SHA CI. Complete when only intended changes are selected, Academy/Platform/Hub/Telegram work is preserved, and existing plus service CI pass for the exact release commit.
- [ ] `OPS-02` Provision approved isolated dev/staging/production topology. Complete when target identities, secrets, redirects/origins, queues/DLQs, cron, SFU/TURN and storage/key namespaces are verified; the existing linked project is not presumed staging.
- [ ] `OPS-03` Rehearse all additive migrations against complete historical schema/data. Complete when coordinated clients/API/runtime versions, old records and interrupted migration recovery pass without direct-write bypasses or destructive resets.
- [ ] `OPS-04` Complete PITR/restore and provider-loss drills. Complete when measured recovery restores acknowledged answers, command receipts, media custody, credentials, jobs and retention state, with explicit residual loss/limits.
- [ ] `OPS-05` Implement SLO telemetry, alerts, incident ownership and runbooks. Complete when stalled jobs, gaps, compromised keys, unknown outcomes, quota and provider failures produce actionable operational evidence without private-data logging.
- [ ] `OPS-06` Rehearse staging promotion, canaries, safe flags/client rings and rollback. Complete when the same reviewed artifacts pass credentialed smoke/soak and rollback preserves records/keys/custody rather than disabling security.

## SEC — Privacy, security and legal acceptance

Baseline: many local authority/encryption guards exist; full legal/external-security/retention/operations acceptance is open. Dependencies: legal/provider decisions by authorized owners; applies across all workstreams.

- [ ] `SEC-01` Complete approved registration/DPAs, processing purposes and cross-border transfer/biometric/minor policies. Complete when actual approved documents and institution/provider responsibilities are recorded; no legal approval is inferred from architecture.
- [ ] `SEC-02` Complete key custody/KMS, rotation/revocation, access separation and artifact encryption review. Complete when compromise/rotation/restore drills preserve eligible old evidence and cannot expose unrelated tenants.
- [ ] `SEC-03` Implement and drill retention, holds, deletion and subject/institution requests. Complete when data maps cover originals, derived media, logs, backups, exports and providers, with auditable deletion/exception evidence.
- [ ] `SEC-04` Complete threat model, dependency/SBOM/scanner hardening and external penetration review. Complete when actual release findings are remediated/retested or explicitly accepted by an authorized risk owner; a local green test is insufficient.
- [ ] `SEC-05` Complete tamper-evident audit export/digests and privileged operations review. Complete when role/key/deletion/support actions can be independently traced without leaking candidate evidence or creating unaudited bypasses.

## UX — Localization, branding and accessibility

Baseline: separate mother-design package, matching fonts/licenses and responsive/keyboard checks exist; full localization/manual accessibility is unfinished. Dependencies: every user-facing workstream.

- [ ] `UX-01` Complete Uzbek/Russian/English across all roles, errors, mail, exports and operational states. Complete when locale/format/fallback reviews cover actual workflows, not only primary navigation or certificates. *Progress 2026-10-22: Assessment Cloud and Exam UI in uz/ru/en with typed catalogs and code-based error text. Open: native review, Proctor, mail/exports/core validation text, lazy loading. See [LOCALIZATION.md](LOCALIZATION.md).*
- [ ] `UX-02` Complete institution branding within the shared mother design. Complete when authorized branding, readable contrast/font fallback and consistent controls work without importing mother routing/auth/business modules.
- [ ] `UX-03` Complete manual WCAG 2.2 AA/screen-reader/keyboard review. Complete when every question/control/dialog/timer/recovery state is operable, with transcripts/captions/alternatives and approved accommodation behavior.
- [ ] `UX-04` Complete desktop/tablet/mobile and shared-device failure UX. Complete when realistic content, narrow widths, loading/empty/error/permission changes and recovery explain the user's actual state without claiming unsynced work is safe remotely.

## LOAD — Full target-capacity proof

Baseline: targets are untested, not certified capacity: 20,000 concurrent candidates, 5,000 recording publishers and 1,000 live viewers. Dependencies: OPS, TIME, FORM, GRADE, EVID, LIVE, BILL and SEC operational approval.

- [ ] `LOAD-01` Build production-shaped workload/data/traffic models and obtain approved latency/error/resource/recovery budgets. Complete when assumptions, peak start patterns, media rates and provider quotas are explicit; do not invent capacity from architecture.
- [ ] `LOAD-02` Test 20,000 simultaneous candidates with start bursts, save/lease/section/submit and background grading/analytics. Complete when staging reports show no acknowledged-response loss and agreed SLOs hold under realistic mixed forms and retries.
- [ ] `LOAD-03` Test 5,000 concurrent recording publishers plus 1,000 viewers on the real isolated media path. Complete when SFU/TURN/storage/bandwidth/renewal/playback/cleanup bounds and quota/cost measurements are documented.
- [ ] `LOAD-04` Run soak, failover, queue-backlog, provider-throttling and restore scenarios. Complete when measured recovery/consistency evidence covers the combined service, not separate component throughput numbers.
- [ ] `LOAD-05` Publish a reproducible capacity/SLO report and admission limits. Complete when the tested release, environment, generator, resource ceilings, failure results and safe operational limits are independently inspectable.

## Execution order without reducing the end state

1. Reconcile the current checkout and finish `ACC-01`/`ACC-02` before layering UI on unproved timing authority. Then complete the connected `ACC-03`/`ACC-04` workflow and remaining accommodation requirements; do not call the whole subsystem done after breaks alone.
2. Continue missing breadth as explicit workstreams: secure desktop, second camera, Center Node, identity, entitlements/billing and enterprise integration. Their provider/legal/signing decisions stay explicit gates, not reasons to substitute browser demos.
3. Extend bank/form/grading/result/analytics workflows against their remaining IDs, reusing existing working code. Calibration, exposure/adaptive behavior, standards fidelity and human review remain real requirements.
4. Carry SEC, UX and OPS work alongside implementation. Hosted claims require approved isolated targets; local fixtures cannot close these gates. CI must precede any authorized deployment.
5. Perform combined hosted/device/security/legal/restore/capacity acceptance and requirement-by-requirement completion audit. Only then close every ledger row and the full goal.

This order is a dependency guide, not a new limited release definition. Closing this document requires all tasks plus any still-unmapped explicit requirement from the approved plan; omissions discovered later must be added rather than treated as out of scope.
