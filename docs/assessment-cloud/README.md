# Assessment Cloud and Proctor: project map

Updated 2026-10-22 (Asia/Tashkent). The objective is the complete service, not an MVP release. Assessment Cloud and Proctor are separately sold services; Exam is the candidate application. Institutions/centers own their banks, tests and operating workflows. All use the mother service's design language without adding assessment modules to Academy or Platform.

## Where to start

- [Implementation record](IMPLEMENTATION.md): what has been written, the evidence obtained, historical verification and the 26-subsystem completion ledger.
- [Full-service backlog](FULL_SERVICE_BACKLOG.md): remaining implementation and verification tasks, stable IDs, dependencies and completion checks. This is the execution breakdown of the ledger, not a replacement or a smaller scope.
- [Accommodations](ACCOMMODATIONS.md): approval and break workflows, contracts, local evidence and remaining work.
- [Service boundaries](SERVICE_BOUNDARIES.md): product ownership, shared visual foundations and forbidden cross-application coupling.
- [Release gates](RELEASE_GATES.md): CI-before-deployment, isolated targets, migration/restore/security/legal/provider/capacity acceptance.
- [Local development](LOCAL_DEVELOPMENT.md): setup and reproducible verification. Historical passing checks are not proof of the current modified checkout.
- [Assessment API](API.md), [Proctor API](PROCTOR_API.md), [coordinator](COORDINATOR.md): service contracts and timing/recovery authority.

## How to interpret status

**Locally evidenced, incomplete:** named workflows have code and recorded local tests. This does not mean the whole subsystem is complete, hosted, enabled or production-ready.

**Written, unverified:** source/tests exist but a current successful result has not been captured. (Accommodations left this state on 2026-10-22; it is now locally evidenced, incomplete.)

**Pending:** required implementation or acceptance evidence is missing. Provider-authenticated, physical-device, production-shaped, external security/legal and target-capacity acceptance are distinct gates.

No full-service ledger row is closed. Nothing in these documents authorizes a deployment, cloud mutation, publication of another agent's changes or a relaxation of the original goal.

## Feature documents

- Authoring/delivery: [blueprints](BLUEPRINTS.md), [artifacts](ARTIFACTS.md), [image responses](IMAGE_RESPONSES.md), [media answers](MEDIA_ANSWERS.md), [cohorts](COHORTS.md), [question review](ITEM_REVIEW.md), [device takeover](DEVICE_TAKEOVER.md), [bank files](BANK_IMPORTS.md).
- Interchange: [QTI](QTI.md), [control plane](QTI_CONTROL_PLANE.md), [byte workflow](QTI_BYTE_WORKFLOW.md).
- Assessment outcomes: [analytics](ANALYTICS.md), [feedback](FEEDBACK.md), [appeals](APPEALS.md), [certificates](CERTIFICATES.md), [certificate documents](CERTIFICATE_DOCUMENTS.md), [credential lifecycle](CERTIFICATE_LIFECYCLE.md).
- Proctoring: [Proctor Lite (no paid infrastructure)](PROCTOR_LITE.md), [capture launch](CAPTURE_LAUNCH.md), [recordings](RECORDINGS.md), [live monitoring](LIVE_MONITORING.md), [institution monitoring board](PROCTOR_WORKLOAD.md).
- Institution access: [self-service join links and institution name](JOIN_LINKS.md), [membership](MEMBERSHIP.md), [invitations](INVITATIONS.md), [invitation mail](INVITATION_MAIL.md).
- Commercial and integration: [billing and usage](BILLING.md), [webhooks and API clients](INTEGRATIONS.md).
- Cross-cutting: [accommodations](ACCOMMODATIONS.md), [localization](LOCALIZATION.md), [measurement cores](MEASUREMENT.md).

Proctor was paused on 2026-10-22 and resumed the same day as **Proctor Lite** (see [PROCTOR_LITE.md](PROCTOR_LITE.md)): browser signals, webcam snapshots, a status board and human review, with live video, identity vendors and native clients deferred.

## Updating these records

For each implementation change, update the owning feature document, the matching ledger row and affected backlog IDs. Record source revision/worktree state, exact checks and results, environment/adapters, remaining failures and release implications. Check a backlog item only when its own completion evidence exists; do not infer completion from file presence, test counts or an earlier wave's green build. Preserve historical evidence but put current qualifications first.
