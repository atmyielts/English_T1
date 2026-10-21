# ADR: Protected Assessment artifacts

Academic answer follow-up (2026-10-20): the twenty-second migration now gives answer assets their own immutable purpose and candidate/attempt/question/content binding, separate admission API, bounded recovery transport and scan-ready blind marking authority. Prompt libraries and author commands cannot expose/manipulate those assets. Native academic capture, encrypted local byte staging and the actual candidate/marker controls remain unconnected; this does not complete answer delivery. See [MEDIA_ANSWERS.md](MEDIA_ANSWERS.md).

Current image-response follow-up (2026-10-20) supersedes the earlier diagram/hotspot gap below: existing scanned image artifacts now support structured public diagram anchors, private geometric hotspot targets and the actual local author/reviewer/candidate/grader path. Candidate file/audio/video response submissions still need their separate academic artifact lifecycle. No Proctor evidence permission is reused. See [IMAGE_RESPONSES.md](IMAGE_RESPONSES.md).

Status: Proposed for release; implemented and verified locally as an engineering transport.
Date: 2026-10-14
Deciders: Schood engineering and the security/privacy owners responsible for production acceptance.

## Context and boundaries

Assessment question media needs an institution-owned lifecycle, not public bucket URLs or trusted filename extensions. The full service includes image/audio/video prompt assets, rich layouts, response attachments, privacy/retention and review. This implementation establishes **author-owned prompt assets** (PNG/JPEG/WebP, MP3/WAV/OGG, MP4/WebM and PDF), an institution library/upload SDK, question attachment controls, native protected media renderers and a real isolated scanner/decoder. Candidate response uploads, rich/table/diagram/hotspot authoring, complete candidate playback acceptance and production scanner deployment remain required. PDF is transported as an attachment, never considered safe merely because it declares a PDF MIME type; the scanner renders every bounded page and rejects active/encrypted content.

The `artifacts` namespace belongs to Assessment Cloud. The independent `assessment-media` Worker owns its private encrypted R2 data path. Neither is a mother-platform/Academy feature, and neither grants access to Proctor recordings. Proctor evidence retains its own purpose, consent, identity, legal-hold and access model.

## Decision and lifecycle

```text
author: pin filename, MIME, total size and ordered part hashes
  -> uploading: verified one-MiB parts -> encrypted conditional R2 writes
  -> canonical immutable storage receipts -> completed manifest
  -> quarantined: leased, separately authenticated scanner
       -> ready: matching detected format + decoder check + clean scan receipt
       -> rejected: immutable scanner receipt, never usable media
uploading -> cancelled: prevents further writes; this is not a deletion receipt
```

PostgreSQL is transactional truth for identity, lifecycle and receipts. R2 stores encrypted bytes only. An upload supports 1–2,147,483,648 bytes, fixed 1,048,576-byte parts and a smaller final part (at most 2,048 parts). Every part's SHA-256 and exact length are pinned before upload starts. The ordered part manifest is the content identity; it is **not represented as a conventional whole-file SHA-256**. Completion snapshots ordered storage receipts and computes a versioned PostgreSQL JSONB-text SHA-256 manifest binding for the scanner. Clients must use the returned binding rather than assume their JSON serializer produces the same hash.

AES-GCM uses random 96-bit nonces and 128-bit tags. HKDF derives a key from the selected server key version, artifact ID and tenant ID. AAD also binds tenant, artifact, ordinal, plaintext hash and size. Receipts pin nonce, key version, ciphertext hash, object key and ETag. Object keys contain validated canonical UUIDs/ordinal/hash, never user filenames. Conditional create-only R2 writes prevent concurrent retries from replacing an envelope. The Worker reads back and authenticates stored bytes before recording the database receipt and acknowledging a part. Losing a committed reply or restarting the Worker preserves the canonical receipt; retries do not regenerate the artifact or overwrite ciphertext. Every replay rechecks current actor authority.

The keyring currently consists of server-only secret roots with explicit active/old key IDs. This is not production KMS custody, tenant-managed keys, certified rotation or cryptographic erasure. Old keys must remain available for existing envelopes until a verified migration/retention process permits removal. Key wrapping, least-privilege custody, rotation/recovery rehearsals and approved regional/cross-border topology remain mandatory release work.

## API contracts

All public Assessment API routes require the actual user bearer token and `tenant_id`.

| Route | Authority and behavior |
| --- | --- |
| `GET /assessment-cloud/artifacts/library?after=<UUID>&limit=1..100` | Current `banks.read`; tenant-keyset page of metadata, state and manifest hash. No expected parts, R2 keys, encryption envelopes or scan reports. |
| `POST /assessment-cloud/artifacts/commands` / `upload.begin` | Current `items.write`, stable 8–200-character `Idempotency-Key`, `data={filename,mime,byte_length,parts:[{sha256,byte_length}]}`. Actor/tenant/state/storage fields are reconstructed server-side. |
| Same / `upload.cancel` | Current author ownership and write authority; `data={artifact_id}`. Only pending/cancelled uploads are cancellable. Existing bytes are not claimed erased. |
| `POST /assessment-cloud/artifacts/transport` | Private media secret **plus** actual user token; only fixed authorizations, receipt and completion operations. Never exposed as a user storage-receipt command. |
| `POST /assessment-cloud/artifacts/scan/claim` | Distinct scanner secret and configured scanner identity; bounded 1–20 canonical jobs, three-minute lease. |
| `POST /assessment-cloud/artifacts/scan/bundle` or `/scan/renew` | Job ID/current random lease token; quarantined immutable manifest only. Renewal cannot revive an expired/replaced ticket. |
| `POST /assessment-cloud/artifacts/scan/report` | Pinned scanner ID/version/signature version/report hash/manifest hash/current lease. Clean additionally requires matching detected MIME and a verified decoder check. Replay must match the original immutable report. |

Artifact metadata is capped at 400 KB. A human may have at most 20 unexpired pending upload reservations per tenant. This is a transport safety ceiling, **not** the final billing/quota/resource-control policy. Upload reservations expire after 24 hours; reclamation/orphan deletion is not implemented. No authenticated SQL client can read raw envelope/scan tables or execute the service RPCs directly.

Media Worker routes:

| Route | Behavior |
| --- | --- |
| `PUT /v1/artifacts/<id>/parts/<zero-based-index>?tenant_id=...` | Bearer token, exact-origin CORS, bounded one-MiB body/20-second timeout, authority before body consumption and again before commit. Actual bytes must match the pinned hash/length. Returns public part identity, never R2/encryption metadata. |
| `POST /v1/artifacts/<id>/complete?tenant_id=...` | Current author authority; all canonical parts required. Returns `quarantined` and manifest hash, not `ready`. |
| `GET /v1/artifacts/<id>?tenant_id=...` | Current institution `banks.read`, ready state, verified range streaming. |
| Same with `attempt_id=...` | Owning active, unexpired candidate and an artifact referenced by the current immutable form section. Caller-supplied question IDs do not grant access. Earlier/future/foreign sections are denied. |
| `GET /internal/scan/<job>?lease_token=...` | No browser Origin or user-token fallback; distinct scanner secret and a live canonical scan lease. Streams authenticated quarantined plaintext to the scanner without exposing storage keys or root keys to the requester. |

Ranges support one bounded, open-ended or suffix byte range. Only touched parts are decrypted. The first part is verified before success headers; corrupt first content returns 502 `artifact_integrity_failed`. Every later part is verified before plaintext is enqueued; a later integrity failure terminates the stream rather than serving unverified bytes. An authorization covers the request/stream at its start; subsequent requests recheck current authority. Continuous mid-stream revocation/session interruption still needs explicit runtime integration. Responses are `no-store`/`nosniff` with no-referrer policy; PDFs are attachments. There are no public bucket aliases, signed bearer URLs or anonymous fallback.

New item versions may reference only ready, same-tenant artifacts of the declared kind. Ready bytes/manifests and scanner reports cannot be replaced. Storage cleanliness is not content approval: the item/key/rubric workflow still requires independent human review. Prompt-media `attempt.start` now requires the explicit server-only `ASSESSMENT_PROMPT_MEDIA_DELIVERY` release flag and `assessment.prompt-media.v1` client compatibility; the five unconnected capture/diagram/hotspot response tools remain rejected with `media_delivery_unavailable`. Candidate preparation exposes capability requirements only and validates endpoint/shared-cookie topology before time starts. The complete local browser author-to-candidate image/audio/video journey now passes against actual R2, PostgreSQL, handlers/repositories, coordinator and scanner broker. The compatibility signal is not device attestation and cannot bypass canonical authority; hosted/production acceptance remains a release gate.

## Options and trade-offs

Public R2 or direct client presigned uploads would reduce transport work but do not provide the required application encryption, pinned part receipts, current authority checks or quarantine. Supabase Storage could simplify an ordinary private asset library but would not implement the selected Cloudflare data plane and explicit application-encryption lifecycle. The chosen Worker/R2/PostgreSQL path makes retry identity and corruption handling explicit, at the cost of more RPCs, per-part cryptography and operational ownership.

A full malware/decoder service cannot be replaced by magic-byte checks. `services/assessment-scanner` now runs actual ClamAV, Pillow, qpdf/Poppler and FFmpeg inside bounded, networkless, read-only containers without scanner authority secrets. The Python network broker verifies downloaded part hashes and renews canonical leases. Its actual local PNG/WAV/H264 upload-to-broker-to-ready-to-candidate journey now passes; larger broker failure/renewal corpora, hostile-content coverage and hosted/throughput acceptance remain required. Native tools see only one artifact plus verified official signature files; they cannot inherit the parent filesystem/network/credentials. Daily signature freshness is derived from verified build metadata, not copied-file modification time. Content hashes identify the actual signature snapshot and a changing snapshot rejects the scan. HTTP redirects never forward scanner credentials/lease tokens. Missing signatures, native engine errors/timeouts and unscanned content fail closed; a scanner error never becomes a clean receipt. Local engine 1.4.3 is behind FreshClam's recommended 1.4.6 and remains a release-hardening gate.

## Local evidence and open actions

Pure/API tests cover manifest normalization, unsupported/active MIME rejection, size bounds, receipt reconstruction, scanner isolation, AEAD scope/tamper checks, conditional concurrency, ranges and cross-part streaming/old key versions. PostgreSQL tests cover current/foreign authority, pinned parts, immutable envelopes/manifests/reports, incomplete/quarantined denial, scanner leases/renewal/replay, metadata keyset paging, cancelled uploads, ready-only item references, candidate ownership/current-section access and raw-table/RPC denial.

`npm --workspace workers/assessment-media run test:local` runs real local workerd/R2 AES-GCM through the production artifact handler/repository into disposable PostgreSQL after all nine service migrations. It proves lost-after-commit receipt recovery, four concurrent retries/one envelope, restart persistence, quarantine, separate scanner plaintext delivery/reporting, ready bearer/shared-cookie range reads, role/tenant denial and explicit corrupt-cipher rejection. By default the scanner verdict is synthetic; setting `ASSESSMENT_SCANNER_DATABASE` to the verified official signature directory connects actual isolated ClamAV/PNG decoding before the pinned report. That real-verdict mode passes locally. Supabase identity/HTTP remain synthetic; no provider-hosted acceptance is claimed. The separate media browser fixture proves actual encrypted SDK/authoring/reviewer/image rendering, with intercepted Auth/API/storage/scan status.

- [x] Private lifecycle, storage receipts, encryption and connected local transport proof.
- [x] Institution media library, encrypted resumable SDK, ready-only question attachments and independent review/image preview browser evidence.
- [x] Bounded read-only shared-session cookie GET with canonical Edge Auth/current authorization; mutation routes still require bearer credentials. Credentialed exact-origin CORS, same-site resource policy and no bearer URLs.
- [x] Actual isolated AV/decoder smoke and connected real PNG verdict through encrypted R2 and PostgreSQL; twelve checks include active PDF, antivirus detection, actual WebM and container/video misrepresentation.
- [x] Complete real-local candidate image/audio/video decoding/playback, answer sync, pause/resume, canonical lease loss/recovery, cross-service account change, previous-section/expiry authorization denial and native decoder teardown; preparation/client protocol/release flag are explicit.
- [ ] Hosted Supabase identity/PostgREST and provider browser acceptance, richer layouts, captions/transcripts/accessibility/localization and all five media response tools. Production activation remains gated.
- [ ] Supported scanner engine/image updates, exhaustive broker renewal/failure/retry proof, deployment/signature operations, larger hostile/decompression corpus and throughput certification. Normal broker claim/download/part verification/scan/report is now part of connected acceptance.
- [ ] Security revocation/rescanning, copyright/provenance/sharing, scan-review projections and audit UI.
- [ ] Candidate response-purpose upload/lease binding and blind marker/reviewer playback grants.
- [ ] Durable cleanup for abandoned/cancelled uploads and orphan parts; retention/legal holds/reference-safe deletion with receipts.
- [ ] KMS/key wrapping, rotation/restore/erasure, production rate/resource/billing limits and approved data regions.
- [ ] Provider-authenticated staging, exact-release-commit CI, outage/load/privacy/security acceptance and complete full-service ledger requirements.
