# QTI package upload, processing and institution review

Status: locally implemented in the scopes below; **not deployed or production-enabled**. This is progress toward the full service, not complete QTI interoperability or certification. Academy and the mother platform contain no QTI feature code.

## Center workflow

Assessment Cloud → **Import & export → QTI test packages** lets a center author choose their own question bank and upload a QTI ZIP (22 bytes–64 MiB). It shows history, upload/scan/parse/review state, source and review identities, unsupported-resource diagnostics, proposed questions, private answer keys and warnings. XML is rendered as text, never executable HTML.

All proposal pages must be loaded before adoption. Adoption requires a reason and explicit content/key/warning/source-rights acknowledgement bound to the current revision/review hash. Blocking diagnostics prevent whole-package adoption. The next step is existing **draft import review**, separate confirmation and resumable 50-question draft batches. Nothing automatically approves or publishes questions.

The authorized job read exposes a bounded security-result projection, not raw scanner logs or leases. The screen distinguishes exact-byte scan clearance, security rejection, mismatched source bytes, historical metadata without clearance and absent scan results. A clean security scan does not imply content compatibility. Adoption is also disabled in the UI unless the current projected scan is clean and byte-verified; the database independently enforces that rule. Historical metadata is never displayed as modern clearance.

Source bytes remain in browser memory, not plaintext browser storage. Submitted commands use a separate actor/tenant-scoped encrypted journal and Web Lock. Lost command replies recover after reload; unfinished uploads require reselecting the identical file and destination bank. Transfers check current authentication before each part/completion and abort on workspace closure. Revoked reads clear QTI proposals/history and release the selected file. Review headings receive focus; mother-service design is reused.

## Bytes, authority and processing

`workers/assessment-qti` owns a purpose-separated private R2 namespace/keyring. One-MiB parts use AES-256-GCM, tenant/job-derived HKDF keys and AAD binding tenant/job/index/size/digest. Conditional first writes and canonical receipt recovery preserve the original envelope. Cipher hash, GCM tag, plaintext hash/length and storage receipt are checked on retry/read. Retaining older keys supports active-key rotation.

Browser transfers require current owning-author authority. Private scan/parse streams require separate service keys, no browser Origin and canonical leases refreshed before each part. Authority redirects are manual and never followed with credentials. Cancellation prevents subsequent reads without deleting history.

The trusted scanner streams ZIP bytes through container stdin into ephemeral tmpfs: no host plaintext source file. ClamAV uses verified fresh official signatures, no network, read-only root, no capabilities, an unprivileged user and resource/time bounds. Sandboxes receive no user JWT/service key. Wrong hashes produce explicit rejected/unscanned receipts; operational failures produce no verdict. Clean receipts bind independently observed bytes, declared source, engine and signatures.

Migration 26 rejects newly submitted metadata-only clearance. Exact historical reports can recover their original receipts but cannot unlock new parsing/adoption as verified bytes. Immutable history is not rewritten; predecessor functions are unavailable to browser/service-role callers.

`services/assessment-interchange/worker.mjs` is a default-off trusted host loop. PostgreSQL owns durable jobs/exclusive leases. Each host processes at most one package at a time, alternates scan/parse opportunities, renews work and validates canonical report receipts. SIGINT/SIGTERM abort sandbox work and stop claims. Outages log operational events without credentials/content or fabricated verdicts; unfinished leases expire canonically, never through blind reset/delete. Hosted supervision and capacity remain unproven.

## Configuration and checks

- Institution: `VITE_ASSESSMENT_QTI_URL` is the dedicated HTTPS Worker origin, never a secret. Empty configuration shows an unavailable notice; CSV/JSON remains available.
- Edge: retain `ASSESSMENT_QTI_ENABLED=false`, distinct transport/scanner/parser keys and approved scanner/build identities.
- Worker: retain `QTI_ENABLED=false`, distinct environment buckets, purpose-specific keyring/active key, canonical origin and exact browser-origin allowlist. No hosted bucket/route was created.
- Host: [environment template](../../services/assessment-interchange/.env.example). Supply environment through an approved operator/secret manager; the template is not automatically loaded. `npm --prefix services/assessment-interchange run worker --workspaces=false` starts the host; append `-- --once` for one bounded round. Never expose these keys through Vite.

From repository root, Node 24/Linux Docker:

```powershell
npm --prefix services/assessment-interchange run build:worker --workspaces=false
npm --prefix services/assessment-interchange run build:sandbox --workspaces=false
node services/assessment-scanner/run.mjs build
node services/assessment-scanner/run.mjs update
npm --prefix services/assessment-interchange run test:processing --workspaces=false
npm --prefix services/assessment-interchange run test:bytes --workspaces=false
npm --prefix services/assessment-interchange run test:browser --workspaces=false
deno test --no-lock packages/assessment-core/src/qti.test.ts supabase/functions/assessment-cloud/qti-handler.test.ts workers/assessment-qti/src/storage.test.ts packages/assessment-web/src/qti-source.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-media-ui.mjs --qti
```

## Evidence boundaries

**Connected actual-browser acceptance now passes locally.** `test:browser` serves an immutable build of the actual institution app with no browser request interception. Production QTI, bank-import, assessment and grading handlers/repositories use real PostgreSQL permissions/canonical jobs, the actual source Worker/encrypted R2, the actual bounded host processor, real networkless ClamAV and the pinned isolated parser. The center uploads, reloads/retries lost begin/part/adoption/import-confirmation replies, reviews the private key, explicitly adopts, separately confirms, then creates one unapproved draft. Canonical evidence requires three sources, five reports, one adoption/import/draft, zero approvals, three source-completion audits and one adoption audit. Malware is scanned/rejected without reaching parsing; malformed XML retains a clean AV result plus a separate blocking semantic diagnostic. All observed source hashes match their exact package identities. Five-width review screenshots and revocation teardown pass.

Sign-in identity, display-name enrichment, PostgREST framing and the minimal historical-schema spine remain explicit fixtures. Roles, memberships, capabilities, source/report/adoption/import transitions and private bytes are real, not invented API responses. The test controller starts a bounded actual processor round and observes the same job ID until terminal state; it is not hosted service supervision or autonomous production scheduling. No browser, parser or scanner receives production credentials.

Actual Worker/persisted encrypted local R2/production handlers/repositories/PostgreSQL/ClamAV/pinned parser pass source→scan→review→adoption→confirmation→unapproved draft. The real host processor performs a bounded canonical scan-and-parse round in this check. Cases include lost part reply, restart/key rotation, malware, whole-source mismatch, malformed XML, cancellation, ciphertext corruption and revocation. **Identity/PostgREST framing are explicit adapters.** Cancellation intentionally errors a private stream; workerd can log the expected `qti_cancelled` exception while the test passes.

The separate fast actual-UI/service-fixture regression remains useful for identical-file rejection, all-pages review gates, historical-metadata adoption denial, keyboard controls and five widths. These synthetic checks do not substitute for the connected journey above.

The full 26-migration authority/integration suite and process races pass. Component and host tests cover their respective scopes. The isolated interchange full dependency audit reports zero advisories for the current lock, not a whole-repository security verdict. CI includes new checks but exact-release remote execution is unproven. No deployment, production migration or provider mutation occurred; enablement remains off.

## Still required

Prove the connected workflow against hosted authentication/providers and the complete historical schema, plus sustained processor operation and supervised recovery. Complete private semantic-review artifact custody, asset/rubric/license mappings, all-type/scoring/test/rich-content fidelity, remediation/recovery UI, scalable processing and authorized materialized exports. Complete XSD/conformance, localization/manual accessibility, retention/deletion/holds/KMS, scanner-engine hardening, security/legal, restore and measured capacity. Every [full-service ledger](IMPLEMENTATION.md) row remains mandatory; none is closed by this wave.
