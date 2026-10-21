# Certificates and verification

Assessment Cloud now supports independently approved certificate programs, issuer-controlled preparation/signing, owning-candidate downloads, public signature/status verification and permanent revocation. These are **signed JSON credentials in `schood.certificate.v1` format**, not digitally signed PDFs or Open Badges. [PDF/QR delivery](CERTIFICATE_DOCUMENTS.md) now connects mother-design English/Uzbek/Russian documents, exact embedded credentials, immutable render-digest receipts, consent-gated QR verification and optional local PDF-hash comparison. PDF digital signatures, archival byte delivery and standards interoperability remain required parts of the full service.

## Institution and candidate workflow

Program retirement and reviewed credential replacements now have a connected local [lifecycle workflow](CERTIFICATE_LIFECYCLE.md). A replacement signs its predecessor reference, preserves the original bytes and marks the original `replaced` only after sealing. Retirement stops new preparation/signing without revoking existing awards. These do not complete linked program revision families, bulk policy or production acceptance.

1. An active `certificates.manage` holder creates an immutable program: achievement title, award criteria, minimum score percentage and optional validity in days. A different certificate manager reviews its hash and approves it. Drafts cannot issue credentials; approval cannot change the criteria. Changing criteria currently requires a new program ID rather than editing an approved program.
2. The issuer selects a candidate's latest eligible released score revision and the approved program. The server checks candidate ownership/context, elapsed result embargo, numeric threshold, current profile names and outstanding appeals/regrading. Candidates cannot issue their own certificates, even if they separately hold certificate permission.
3. The database prepares a pinned signing snapshot with an ID, key identity, exact payload bytes/hash, score revision, grading generation and expiry. Preparation is not issuance and is invisible to candidates. Issue/expiry timestamps are fixed at preparation; a delayed seal cannot extend validity and an expired preparation cannot seal.
4. The server signs that exact snapshot using Ed25519, then commits the signature/issuance receipt. Only this commit creates the issued audit/outbox event. Lost preparation or issuance replies recover the same certificate, key and payload; they do not create a duplicate award or change grades.
5. The owning candidate can download a signed JSON file after acknowledging that it contains their name/result and that sharing discloses them. Account identity is checked before transport and again before exporting the returned bytes. Institution managers can also download authorized records. Anonymous callers cannot fetch identity or certificate files by ID.
6. Anyone holding a signed file can use Exam's `?verify_certificate=1` screen without signing in. The browser verifies it against this service's published public keys. With explicit consent it then sends the document to the issuer service for live status. Displayed identity/result claims come from the locally verified signed payload, not an unsigned response projection.
7. A manager can permanently revoke an issued certificate with a reason and revision fence, or cancel an unfinished preparation. Original claims/signatures remain immutable. A submitted uncertain command must first reconcile its receipt; another authorized manager can cancel a pending record when the originating issuer cannot recover a signing key. Revocation never changes academic scores.

`certificates.manage` is explicitly added to staff role templates/direct grants. Existing result publishers, graders, Proctors and existing pinned custom roles do not gain it automatically. Organization owners/admins inherit it through the existing bootstrap model. Delegation retains active-member, self-change, expiry, authority and revision safeguards. The migration replaces only the old fixed staff registry literals with a shared catalogue, with explicit source-drift guards; the complete existing staff SQL suite remains mandatory.

## Truth and signature format

PostgreSQL owns programs, prepared snapshots, current results, issued/revoked state, immutable command receipts and audit/outbox intent. The Edge signer owns private-key operations; it cannot trust client-supplied subject, score, key identity, payload or signature. The grading Worker has no certificate issuance authority.

An envelope contains exactly `format`, `key_id`, `payload` and `signature`. `payload` is canonical unpadded base64url of the **exact UTF-8 database-held JSON text**, not a reserialized object. Ed25519 signs UTF-8 bytes of `schood.certificate.v1.<key_id>.<payload>`. The digest is SHA-256 of the original payload bytes. Algorithm selection is fixed; embedded trust keys and unknown envelope fields are rejected.

Signed claims pin the certificate/program/score-revision IDs, recorded issuer/recipient names, achievement/criteria/threshold, exam, grading generation, score/maximum, issue timestamp and optional expiry. This attests the issuer's recorded claim; it does not independently establish accreditation, legal recognition or real-world identity. Underlying human-grade approval/release is still required.

Live verification returns:

| Status | Meaning |
| --- | --- |
| `valid` | Recognized issued snapshot, unexpired, current result and no pending academic review at the time checked |
| `revoked` | Institution permanently revoked the credential |
| `expired` | Its pinned expiry elapsed |
| `superseded` | A newer released grading generation exists |
| `replaced` | A newly signed replacement committed; the original remains historical and is not revived if its successor is revoked |
| `under_review` | An appeal or unfinished grading generation is pending |
| `not_found` | Signature may be valid, but no matching issued database receipt exists |

Signature validity alone does not prove current validity. Offline verification requires an independently trusted issuer key set; a key included with a document is not a trust anchor. Offline copies cannot reflect future revocation/status changes. Live status is currently protected by the configured HTTPS service transport, not a separately signed status assertion.

## API and deployment configuration

Private routes require current bearer identity, `tenant_id` and an exact allowed browser origin. Read pages are 1–100 with UUID cursors. Public verification has no credential cookies, identity directory or anonymous download route. All replies are no-store/nosniff/no-referrer. Public payloads are bounded to 32 KB.

| Route under `/assessment-cloud/certificates` | Authority |
| --- | --- |
| `GET programs`, `results`, `institution` | Current certificate manager |
| `GET access` | Authenticated capability/readiness projection; no key material |
| `GET candidate` | Owning candidate; only issued/revoked records |
| `GET <UUID>/download` | Owner or current certificate manager |
| `POST commands` | Manager; stable idempotency key and canonical action input |
| `GET keys` | Public key catalogue; never private `d` material |
| `POST verify` | Holder submits signed file; signature checked before private status lookup |

Commands: `program.create`, `program.approve` with current review hash, `program.retire` with hash/reason, `certificate.issue` with program/attempt/score revision, `certificate.replace` with original/current revision/same-attempt released result/program/reason, and `certificate.revoke` / `certificate.cancel` with ID/current revision/reason. Public clients cannot invoke prepare/seal or forge a signing receipt. See [lifecycle contracts](CERTIFICATE_LIFECYCLE.md). The underlying RPCs/tables are unavailable to anonymous/authenticated database clients.

Server-only variables:

```text
ASSESSMENT_CERTIFICATE_ISSUANCE=false
ASSESSMENT_CERTIFICATE_ACTIVE_KEY=<active key ID>
ASSESSMENT_CERTIFICATE_SIGNING_KEYS=[{"id":"<key ID>","jwk":<Ed25519 JWK>,"revoked":false}]
```

Private JWKs must never appear in frontend variables, source control, logs or browser key catalogues. Active keys need private signing material; retired verification-only keys need only the public JWK. Retain the old private key while unsigned preparations need recovery. Already sealed receipts recover with the original stored signature and retired public key. Key compromise can mark a catalogue entry revoked; historical verification then fails closed. Invalid configuration leaves signing/verification unavailable without disabling ordinary assessment features. The issuer screen checks authenticated readiness and disables new issuance while the release flag/signing configuration is unavailable; program and revocation workflows remain independent.

This is an environment-key implementation, not hosted KMS/HSM acceptance. Production custody, rotation governance, backup/restore, trusted issuer-domain binding, tenant-specific keys, signed status lists/assertions, monitoring and public abuse/rate-limit controls remain release gates. A locally generated fixture key is never a production credential.

## Verification and remaining scope

```powershell
deno test --no-lock supabase/functions/assessment-cloud/certificate-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --certificates
```

API/crypto tests cover exact-byte hashing, deterministic signatures, canonical signing input, malformed/forged claims, public verification before status lookup, release flags, key compromise, rotation/public-only retirement, sealed receipt replay and secret-free public keys. Fourteen-migration SQL tests cover dedicated permission/delegation, independent program approval, thresholds, current released scores, private projections, pending cancellation, expiry/supersession/under-review/revocation, immutable claims and unchanged grades. Four-process prepare/seal races require one certificate, one issuance audit and one outbox intent. SQL state-predicate fixtures use explicitly synthetic signature shapes; they do not claim cryptographic proof.

The connected actual-app/production-handler/repository/PostgreSQL/Chrome test intentionally loses preparation, signed-issuance and revocation replies; rotates the active key after preparation and removes its private material after sealing; reloads/retries; downloads the actual signed file; independently verifies it offline; rejects tampering; checks public live revocation and foreign-account exclusion. Screenshots cover institution/candidate layouts at 1440/1024/768/390/320 and public verification at 1440/768/320. Identity/PostgREST transport are local fixture adapters, not hosted acceptance.

The document follow-up adds migration 33 and [connected PDF/QR evidence](CERTIFICATE_DOCUMENTS.md); migration 34 adds [program retirement and credential replacement chains](CERTIFICATE_LIFECYCLE.md). Still required for the full service: actual PDF digital signature/validation, immutable rendered-byte archival/retrieval and retained old builds, Open Badges/other standards, program revision families/criteria diffs and richer replacement policies/history, richer/bulk issuance, disclosure controls for score-less certificates, consent/guardian policy, notifications, retention/holds/deletion, complete localization/manual accessibility, hosted identity/KMS/provider/security/legal/capacity acceptance. These remain required, not optional later-MVP features.
