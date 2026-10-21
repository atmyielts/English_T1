# QTI source jobs and reviewed draft adoption

Status: **disabled by default**. Connected actual institution browser→production handlers/PG/encrypted R2/real malware scanner/processor/parser→reviewed adoption/separate confirmation/unapproved draft now passes locally. Identity/PostgREST/minimal historical spine remain explicit adapters. Scan-result projection distinguishes exact-byte proof from historical metadata without exposing leases/raw scanner output. This is not complete interchange or hosted/provider acceptance. [QTI_BYTE_WORKFLOW.md](QTI_BYTE_WORKFLOW.md) records current evidence/gates; detailed records below describe the preceding wave. No provider resource changed.

## Implemented behavior

The twenty-fifth additive migration, `20261020150000_assessment_qti_jobs.sql`, adds private source jobs, immutable part receipts, stage-specific processing reports, stable command receipts and adoption provenance. Assessment Cloud's own Edge entry exposes a separate `/qti/` route; it never loads the XML parser. Academy, Platform and Proctor do not acquire QTI feature code.

```text
uploading -> scan_queued -> scanning -> parse_queued -> parsing -> review_ready
                              |                         |            |
                              +-> blocked               +-> blocked |
                                                                    v
                                                       explicit reviewed adoption
                                                                    |
                                                       existing staged bank import
                                                                    |
                                                       confirmation + bounded steps
                                                                    |
                                                       draft questions only
                                                                    |
                                                       independent approval/publication
```

A source pins its bank, original filename, exact ZIP SHA-256, ordered one-MiB part manifest, byte count and approved processing build identity. Logical object keys belong to `assessment-qti/`, not prompt media, candidate academic answers or Proctor evidence. Only a trusted byte transport **and** the owning, currently authorized author can record a part receipt or complete the upload. A declared receipt is not itself proof that the new byte gateway exists or that bytes have been scanned.

Both source and normalized review identities are preserved. The parser's review hash is retained; PostgreSQL creates its own review digest binding source/part-manifest/processor identity and normalized rows/diagnostics. Client fingerprints, approvals and supplied parser IDs are discarded. Canonical item/key validators reconstruct each row, and duplicate content warnings are deterministic in source order. Any blocked resource prevents automatic whole-package adoption.

Human adoption requires the current job revision, exact database review hash, explicit acknowledgement and a reason. It stages an ordinary private bank import, whose separate confirmation and resumable 50-row steps create **drafts only**. It never submits, independently approves or publishes imported questions. A QTI bank import's `source_hash` is its immutable normalized-review identity; `assessment_qti_adoptions.raw_source_hash` separately preserves the original ZIP digest, processing identity and adopting actor. These are different domains, not interchangeable hashes.

## Processing authority and recovery

Scanner and parser claims are separate. A parser cannot claim an unscanned or rejected source. Claims carry one five-minute canonical lease, source/manifest hashes and the pinned build identity; `FOR UPDATE SKIP LOCKED` excludes competing dispatchers. Expired claims are fenced and reissued, not silently extended. Renewal must present the same current lease and build. Ten failed/expired claims block the source pending explicit operator recovery.

Transport, scanner and parser service keys must be distinct and at least 32 characters. A browser user token never substitutes for them. Internal processing ports reject browser origins. The current actor/tenant capability matrix is rechecked before reads, commands, cached command receipts, source bundles and report replay. Revocation and consequential processing writes serialize through the existing staff-authority lock. Authorized recovery requires an expected revision/reason, records the new processing actor and invalidates the old lease. It cannot erase committed malware rejection or parsed review results.

Reports are immutable per stage. A repeated, exact report from the same lease returns the same receipt after a committed reply is lost; a changed report or lease conflicts. Worker events use `actor_kind=system`, while human actions retain their actual actor. Cancellation invalidates current processing and prevents new bundles/reports without deleting source/history. A cancelled source permits a fresh upload identity, including by another qualified author; it does not rebind or overwrite old bytes.

## Routes and configuration

All routes are relative to the Assessment Cloud function, return `Cache-Control: no-store`, and use exact configured CORS origins for institution requests.

| Route | Authority and input |
| --- | --- |
| `GET /qti/jobs?tenant_id=...` | Current authenticated author; bounded list page |
| `GET /qti/jobs/{id}?tenant_id=...` | Current authenticated author; source metadata, received indices, normalized row page and diagnostics; no lease token |
| `POST /qti/commands?tenant_id=...` | Current authenticated author plus stable `Idempotency-Key`; `source.begin`, `cancel`, `retry`, `adopt` |
| `POST /qti/transport?tenant_id=...` | Current owning author plus `X-Assessment-QTI-Transport-Key`; reconstructed part authorization/receipt or completion |
| `POST /qti/internal/{scan|parse}/claim` | Respective `X-Assessment-QTI-Worker-Key`; bounded claim count, configured build identity only |
| `POST /qti/internal/{scan|parse}/{bundle|renew}` | Respective worker key; exact job/lease/build, current institutional processing authority |
| `POST /qti/internal/{scan|parse}/report` | Respective worker key; exact job/lease and normalized stage result; configured scanner/build identities only |

Metadata requests are streamed under a 6 MiB limit, source manifests under 64 MiB/64 parts, and parser proposals under 4 MiB/2,000 rows. Larger complete-service workloads still require reviewed partitioning/streaming, not a higher unbounded JSON body limit. Current list paging is offset-based; deep keyset/filtering and background-scale operations remain required.

The function-local [.env.example](../../supabase/functions/assessment-cloud/.env.example) documents `ASSESSMENT_QTI_ENABLED=false` and the independent secrets/identities. Missing or non-distinct enabled configuration returns an isolated QTI 503 without crashing other Assessment APIs. Do not enable the gate until the complete byte/AV/job/UI workflow and release gates are verified. Do not expose processing secrets or put service credentials into parser containers.

## Verified locally

```powershell
deno test --no-lock packages/assessment-core/src/qti.test.ts supabase/functions/assessment-cloud/qti-handler.test.ts
deno check --no-lock supabase/functions/assessment-cloud/index.ts
node scripts/test-assessment-db.mjs
npm --prefix services/assessment-interchange run build:sandbox --workspaces=false
npm --prefix services/assessment-interchange run test:control-plane --workspaces=false
```

The contract/API suite currently has **15 tests**. The full **25-migration** integration suite includes exact source/receipt/review adoption, cancellation, stale leases, current permissions, blocked/rejected sources and draft-only creation; its four-process QTI race requires one source, one exclusive scan lease/report/system audit and zero unreviewed items. Existing migration/authority/race checks also pass.

The connected test uses actual production QTI and bank-import handlers/repositories, real PostgreSQL/service-role calls, a pinned real isolated parser and real normalized draft creation. It verifies concurrent admission, committed report/adoption replay, changed review denial, retained original-source provenance, unapproved draft state and permission revocation. **Auth identity/PostgREST framing, byte-storage receipts and malware verdicts are explicit fixture adapters.** This is not an actual QTI R2/AV/browser or provider-authenticated journey. The generated fixture database is removed on terminal cleanup; no user data is involved.

## Mandatory next work

Connect actual purpose-separated encrypted R2 transport and current-grant recovery; verify exact bytes and real networkless malware clearance; add durable scanner/parser dispatch, heartbeats and operational-error handling without inventing clean/source-failure verdicts; retain complete private source/review artifacts; implement center file/status/diagnostic/mapping/adoption controls with account fences, recovery, mother design, localization and accessibility. Then finish all-type/rich/scoring/test/asset/rubric/license fidelity, materialized authorized exports and schema/conformance, retention, hosted/security/legal/recovery/capacity acceptance. The [full ledger](IMPLEMENTATION.md) remains authoritative; no row is closed by these authority-layer checks.
