# Certificate PDF delivery and QR verification

Status: connected local implementation; default-off, not deployed or production-certified. This extends [CERTIFICATES.md](CERTIFICATES.md), not the mother platform or Academy. Migration 33 adds immutable document digest receipts. The actual institution/candidate apps, production Edge handlers/repositories, PostgreSQL, separate native renderer and public browser verification work together locally. Identity/PostgREST remain explicit fixture adapters.

Migration 34 now adds the connected [retirement/replacement lifecycle](CERTIFICATE_LIFECYCLE.md). Replacement PDFs include their signed predecessor; original QR references show `replaced` without disclosing successor claims. Separate lifecycle output/CI compares original and replacement PDFs. That follow-up supersedes the entirely-missing lifecycle statements and smaller test/migration totals below, not the outstanding archival/standards/production requirements.

## What people can do

- An authorized institution certificate manager or owning candidate can download an issued/revoked award as PDF in English, Uzbek or Russian after acknowledging name/result disclosure. JSON download remains independently available.
- Document labels change language; signed institution/recipient names, achievement, criteria and exam claims are never silently translated or rewritten. Complete details continue over extra pages rather than being cut off.
- PDFs reuse Schood's cream/white/navy palette and mother-platform Sora/Manrope typography. Licensed Noto Sans covers additional Cyrillic glyphs when needed. Fonts are local, embedded, reproducibly instanced and carry their OFL licenses.
- The PDF contains the original Ed25519-signed JSON credential as an attachment and a vector QR/verification link. **The PDF itself is not digitally signed.** There is no PAdES, PDF/A, Open Badges or accreditation claim.
- A QR holder can retrieve the original signed name/result only after explicit consent on the public verification page. The browser independently verifies the credential against trusted service public keys and displays the current institutional status.
- Optionally select a PDF for local SHA-256 comparison with immutable institution-rendered receipts. The PDF is not uploaded or opened by the verifier. A changed file does not match, even if its QR refers to an authentic original award; visible PDF contents must not be inferred from QR validity alone.
- Revocation changes current status without rewriting the original claims/PDF or academic scores. Disabling new PDF rendering does not disable verification of previously shared references when the issuer verifier remains configured.

## Authority and data flow

1. Edge verifies current bearer identity and canonical certificate download authority. Pending/cancelled certificates and foreign accounts cannot export documents.
2. The existing issuer signer verifies the stored canonical Ed25519 envelope and exact original payload hash. No caller supplies replacement claims or a signing key.
3. Edge constructs the verification URL from trusted server configuration, never caller input. The reference binds certificate ID, key ID, exact payload SHA-256 and original signature.
4. An authenticated, deadline-bounded private HTTP request invokes the isolated Node 24 renderer. Request HMAC binds timestamp, nonce and exact body hash. Response HMAC binds request nonce, renderer build, document hash, credential hash, language and length. Edge independently checks streamed bytes, length, PDF prefix and hash; redirects are not followed.
5. Before returning any PDF bytes, Edge rechecks bearer identity and download authority, then records the immutable digest in PostgreSQL. A lost committed receipt can safely retry the identical render/report without another award or audit event.
6. The response is an attachment with no-store, nosniff and no-referrer headers. Client account/lifecycle checks run again immediately before saving it.

`assessment_certificate_documents` stores tenant/certificate, payload hash, renderer ID, language, PDF SHA-256, byte length and creation time. One `(certificate_id, renderer_id, locale)` identifies one immutable byte result; a conflicting digest/length cannot replace it. Concurrent equal reports return one receipt and one `certificates.document.rendered` audit. Direct anonymous/authenticated/service-role table access is revoked; only narrow service-role RPCs resolve/report receipts. No PDF bytes are currently archived in R2.

The renderer ID fingerprints renderer source, pinned dependency lock, pure certificate contracts, actual fonts/licenses, configured verification origin/path/query and Node/V8/zlib versions. A changed build can create a new immutable receipt; it cannot silently replace the old build's bytes. Old-build archival/retrieval remains required before durable document delivery can be declared complete. Public resolution currently returns at most 100 recent render receipts; deep version history remains required.

## Holder-reference privacy

The compact fragment is `r1.<certificate UUID>.<key ID>.<payload SHA-256>.<signature>`. It is a **holder proof/capability**, not a private signing key and not a public directory identifier. Anyone who receives it can consent to retrieve the signed recipient name and result. Sharing the QR therefore discloses access to those claims. Do not log the fragment, signature or complete verification URL.

The URL fragment is removed from the address bar without an automatic resolver call. Initial navigation and same-page QR changes reset old files, consent and displayed results; malformed references show a recovery message and cannot retain prior validity. Only explicit verification sends the exact holder tuple to the resolver. The resolver first matches a sealed canonical record and then independently verifies its cryptographic signature; UUID-only, altered tuple and forged signature paths cannot reveal claims. The browser checks the same payload hash/ID/key/signature before showing locally verified names/results. Current status still relies on configured HTTPS transport, not a separately signed status assertion.

## Service isolation and bounds

`services/assessment-documents` has its own package/lock and Node 24 process. PDF/font/QR libraries do not enter browser, Edge, shared design, mother-platform or Academy bundles; `scripts/verify-assessment-boundaries.mjs` checks these source boundaries.

The private service accepts only `POST /render`, at most 32 KB of input, fresh HMAC requests, bounded replay tracking, and two concurrent renders by default (maximum configurable bound four). Each worker has a 10-second deadline, bounded JS heap/stack and receives only `NODE_ENV`, not inherited signing or provider credentials. There is no job queue or automatic repeated external request. The document limit is 3 MB/eight pages. Controls, bidi overrides and unsupported glyphs fail closed rather than disappearing. It draws structured text and vector QR only; no supplied HTML, scripts, remote fonts, images or URL fetching.

Worker threads are **not** an OS sandbox or network isolation guarantee. Container/process isolation, private authenticated ingress, resource/connection budgets, scaling/admission, telemetry and operational deployment remain release requirements. The CLI binds loopback on port 8789; remote Edge connectivity needs an approved private topology, not exposure of a public unauthenticated renderer.

## Configuration and routes

Keep these server-only values disabled/empty outside isolated acceptance:

```text
ASSESSMENT_CERTIFICATE_DOCUMENTS=false
ASSESSMENT_DOCUMENT_URL=
ASSESSMENT_DOCUMENT_SECRET=
ASSESSMENT_CERTIFICATE_VERIFICATION_URL=
```

`ASSESSMENT_DOCUMENT_URL` must be a trusted HTTPS `/render` endpoint; transport secret length is at least 32 characters. The verifier base must be trusted HTTPS without credentials/query/fragment. Local HTTP is explicitly permitted only by test adapters. Signing/public-key configuration remains in the issuer Edge service, never the renderer or browser. Bad document configuration disables PDF delivery without breaking JSON credentials or ordinary assessment workflows.

| Route under `/assessment-cloud/certificates` | Contract |
| --- | --- |
| `GET <UUID>/pdf?tenant_id=<UUID>&locale=en\|uz\|ru` | Current owning candidate/certificate manager; default-off rendering; immutable report before download |
| `POST reference/resolve` | Public exact `{reference:{format,id,key_id,payload_hash,signature}}` holder proof; 2 KB maximum; cryptographic verification before claims are returned |

Resolution is public and cookie-free, not a public identity search. Rate limits/abuse monitoring and approved privacy/guardian/retention policies remain required before launch. Read projections advertise `pdf_enabled` only when document delivery and signing are configured. No new authority is granted by this display flag.

## Local reproduction

Use Node 24, Docker, Deno, root application dependencies and the existing Playwright CLI. Install the native service independently; do not add its libraries to the root application workspace:

```text
npm ci --prefix services/assessment-documents --workspaces=false --ignore-scripts
npm audit --prefix services/assessment-documents --workspaces=false
npm --prefix services/assessment-documents test --workspaces=false
deno test --no-lock supabase/functions/assessment-cloud/certificate-document-handler.test.ts supabase/functions/assessment-cloud/certificate-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --certificate-documents
```

For build-only font/PDF QA, use an isolated Python environment with `requirements-qa.txt` and Poppler's `pdftoppm`. `ASSESSMENT_DOCUMENT_PYTHON` and `PDFTOPPM` can select absolute tool paths. Font reconstruction is read-only in `--check` mode:

```text
python services/assessment-documents/prepare_fonts.py --check
npm --prefix services/assessment-documents run samples --workspaces=false
npm --prefix services/assessment-documents run verify --workspaces=false
npm --prefix services/assessment-documents run verify --workspaces=false -- output/playwright/certificates/certificate-en.pdf output/playwright/certificates/certificate-uz.pdf output/playwright/certificates/certificate-ru.pdf
```

The connected and legacy `--certificates` journeys use the same output directory; rerun document acceptance last before comparing its PDFs with `candidate-certificate.json`. Output contains synthetic identities/awards only. Samples use fresh synthetic keys each run; determinism is asserted for identical signed input/build, not across new random sample awards.

## Verified evidence and open gates

Local checks pass seven native rendering/HTTP tests, 17 issuer/document API/crypto checks, all 33 migrations/authority/concurrency tests (including four-process document receipt replay), the actual connected three-language PDF/QR journey, legacy JSON-only certificate journey, QTI control-plane regression, Exam/Assessment builds, Edge checks, dependency audit and 450-file service boundaries. Native raster QR decoding and full-field/embedded-credential checks pass for connected downloaded PDFs. Font reconstruction reproduces all three static binaries without changes. Screenshots cover institution/candidate at five widths and public verification at three widths; long mixed Cyrillic/Uzbek multi-page samples receive separate text/raster/visual QA. Local fixtures do not certify hosted identity, real providers or production capacity.

The separate `certificate-documents` job in Assessment Services CI uses Node 24, isolated locked dependencies, build-only Python/Poppler, native tests, app/Edge/boundary checks, actual browser delivery and independent raster QA. It has no deployment or production secrets. Exact-release remote CI has **not** been run or proved.

Still mandatory: immutable private rendered-byte archival/retrieval and old renderer retention; PAdES/signature validation and applicable standards; program revision/retirement/replacement chains; richer/bulk/disclosure-controlled credentials; enterprise templates/institution assets; complete localization, tagged/accessible PDF/manual reader QA; KMS/HSM/issuer trust/key governance; consent/minors/legal/security/retention/holds/deletion; rate limits, jobs/admission/operations, hosted delivery/restore, staging/canaries/exact-release CI and full target-load acceptance. No full-service ledger row is closed by this wave.
