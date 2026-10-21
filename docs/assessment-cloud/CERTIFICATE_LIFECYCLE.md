# Certificate retirement and replacement

Status: implemented and connected locally; not deployed or production-certified. Migration 34 extends [certificate issuance](CERTIFICATES.md) and [PDF/QR delivery](CERTIFICATE_DOCUMENTS.md). It does not change Academy, mother-platform routes, academic scores or Proctor authority.

## Institution workflow

A current certificate manager can permanently retire a program after reviewing its immutable criteria hash and entering a reason. Retirement blocks new preparation, approval and signing of unfinished awards under that program. It does not revoke existing awards, rewrite approved criteria or remove history. To change criteria, create another program and have a different manager approve it; linked program revision/family management remains unfinished.

An eligible issued credential offers **Replace certificate**. The manager reviews the original reference, selects an active independently approved program and the original candidate's latest eligible released result from the same attempt, supplies a reason and acknowledges the replacement's new validity period. The service uses current recorded profile names and canonical results; no manually supplied name, grade, subject, signature or key can override them. A replacement is a new award with new issue/expiry timestamps, not an in-place correction or automatic extension.

The original remains current until the replacement's signature commits. A pending replacement can be cancelled without invalidating the original; it does not appear in candidate downloads or public verification. One predecessor can have only one non-cancelled successor intent. After issuance, candidates/managers see the direct links and can download either original signed JSON/PDF or replacement. A current certificate manager cannot issue their own candidate award merely because they hold this capability.

The immutable signed replacement payload adds optional `replaces_certificate_id` to `schood.certificate.v1`. Existing credentials retain exactly their original payload/signature; browser verification remains compatible with credentials without this field. Replacement PDFs include the predecessor in their details and retain the exact signed JSON attachment. They are still not digitally signed PDFs.

## State and verification semantics

| Event | Original | Successor |
| --- | --- | --- |
| Replacement prepared | Original status unchanged | Private pending snapshot, no award yet |
| Pending replacement cancelled | Original status unchanged | Historical cancelled preparation |
| Replacement signature commits | Public status becomes `replaced` | Independently verifiable issued credential |
| Program retired | Existing signed status unchanged | No new preparation/signing under retired program |
| Replacement revoked | Original stays `replaced`, never revived | Public status `revoked` |

Public `replaced` status returns only the successor's UUID, not its signed identity, result or holder proof. The verifier tells the holder to supply that replacement separately. UUID-only/wrong-key/wrong-signature lookups cannot retrieve chain metadata. Original QR verification uses the same consent and local-signature checks as before. An original's own explicit revocation takes precedence over its replaced status; expiry/regrading/appeal checks continue independently for each signed credential. Revocation is not automatically transitive: a manager must review/revoke the relevant issued award rather than assuming an ancestor's status controls every descendant.

Multi-link replacements are supported without mutating predecessors. The UI currently shows direct links rather than a recursively expanded history; complete paged chain navigation, institution-specific replacement/renewal policies and higher-level program revision families remain required.

## Canonical custody and concurrency

`assessment_certificate_program_retirements` stores one immutable program/hash/reason/actor/time record. `assessment_certificate_replacement_preparations` stores the new credential's predecessor ID, revision, original payload hash, reviewed reason and preparing actor. Both have tenant foreign keys, immutable triggers, RLS and no direct anonymous/authenticated/service-role access. Narrow service-role RPCs mediate operations.

The existing certificate table gains an immutable predecessor foreign key. A partial unique index preserves one ordinary root award per program/released score. A second unique index permits at most one pending/issued/revoked successor per predecessor; cancelled preparations retain history but release the successor slot. It does not create a second ordinary issuance route or permit arbitrary root duplicates.

Preparation checks current capability, exact predecessor revision/state, same candidate/attempt, approved non-retired criteria, latest released result/embargo, threshold and outstanding academic review. Sealing checks current authority again, program retirement and the pinned predecessor revision/hash/state before committing. It then records issuance plus one replacement audit/outbox intent in the same transaction. Existing tenant staff-authority locks serialize these consequential transitions with retirement/revocation and permission changes; target-load acceptance remains unproved.

Stable command keys recover preparation, replacement signature and retirement receipts. A signing-key rotation is excluded from the request fingerprint but the original signing key remains pinned in the canonical snapshot. An already sealed replacement can recover using its retired public-only key. A retired program blocks unfinished signatures, but does not block replay of an already sealed receipt. Changed reasons/revisions under the same key conflict rather than silently replacing a reviewed intent. The new wrappers retain previous command/read/seal/status contracts; legacy helpers are revoked from public, anonymous, authenticated and service-role callers to avoid bypassing lifecycle checks.

## API contracts

All commands use `POST /assessment-cloud/certificates/commands?tenant_id=<UUID>`, current bearer identity, an exact allowed origin and stable `idempotency-key`. Existing `certificates.manage` is required; no new inherited Academy/Proctor authority is added.

| Public action | Required `data` |
| --- | --- |
| `program.retire` | `id`, current `review_hash`, reason (1–5,000 characters) |
| `certificate.replace` | Original `id`, `expected_revision`, approved `program_id`, same `attempt_id`, latest `score_revision_id`, reviewed reason (1–5,000 characters) |

Replacement uses the existing server-only `ASSESSMENT_CERTIFICATE_ISSUANCE` and signer readiness gate. Retirement does not require new issuance or a private signing key. Clients cannot call internal `certificate.replace.prepare` or forge a seal receipt. Existing cancellation/revocation commands remain available to capable managers.

For operational rollback, stop new admissions while retaining signature verification, existing keys, canonical receipt recovery and historical download APIs. Do not drop lifecycle history, reset certificate states or remove old verification keys to simulate a rollback. Actual staging rollback/restore rehearsal remains a release gate.

Program list rows add nullable `retirement`. Private certificate rows add `attempt_id`, signed predecessor/direct committed successor identifiers and a manager-only pending-successor indication. Public status adds `replaced`/`replacement_id` only after exact original holder proof. These projections never substitute for canonical write authority. Deploy migration/API/client/verifier together; do not enable production issuance from local fixture evidence.

## Local reproduction and evidence

Use the same isolated Node 24 dependencies, Docker, Deno and browser setup as certificate documents:

```text
deno test --no-lock supabase/functions/assessment-cloud/certificate-handler.test.ts supabase/functions/assessment-cloud/certificate-document-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --certificate-lifecycle
npm --prefix services/assessment-documents run verify --workspaces=false -- output/playwright/certificate-lifecycle/certificate-en.pdf output/playwright/certificate-lifecycle/replacement-en.pdf
```

PDF verification uses build-only Python/Poppler selected with `ASSESSMENT_DOCUMENT_PYTHON`/`PDFTOPPM`; see [document reproduction](CERTIFICATE_DOCUMENTS.md). Lifecycle output has its own directory so it cannot overwrite the separate three-language document journey.

Local evidence: all 34 migrations/authority/races pass, including replacement/cancellation/multi-link history, changed profile snapshots, self-award denial despite explicit capability, retired pending-signature blocking, unchanged scores and revoked private bypass helpers. Four-process equal prepare/seal/retire calls produce one successor and one audit/event/retirement. Distinct successor commands admit only one intent. Competing retirement/signature commits never sign after canonical retirement.

The connected actual institution/Exam apps, production Edge/repositories, real PostgreSQL and native document HTTP service pass lost initial/replacement preparation, lost committed replacement signature and retirement replies, encrypted reload/retry, public-only retirement of the pinned replacement signing key, original-byte preservation, independent browser signature verification, original QR `replaced` status, valid then revoked successor, non-revival and foreign-account denial. It retains two credentials, one replacement intent/audit/event, one retirement/audit, two document receipts/audits and unchanged scores. Five-width institution/candidate and three-width public screenshots are inspected. Native PDF raster QR, complete text/predecessor and original embedded-credential comparisons pass. Identity/PostgREST are local adapters, not hosted identity/provider acceptance.

The existing issuer/document suites now pass 20 API/crypto tests; seven native renderer/HTTP tests, QTI control-plane regression, app/Edge builds and 452-file source boundaries pass. The original three-language document journey remains a separate regression. CI includes both journeys and independent original/replacement PDF checks, without deployment or production secrets. Exact-release remote CI is not proved.

Remaining full-service requirements include program revision families/linked criteria diffs, institution-specific replacement/renewal approval policy, richer/paged history, bulk operations, score-disclosure controls, accessible localized UI/manual reader QA, PAdES/standards, archival byte retrieval, notifications/delivery, KMS/trust/key governance, retention/holds/deletion, legal/minor consent, hosted identity/private transport, operations/restore and target-capacity acceptance. No full-service ledger row is closed by this locally verified lifecycle.
