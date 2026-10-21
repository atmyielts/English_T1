# Assessment interchange runtime

Current byte workflow: [QTI_BYTE_WORKFLOW.md](../../docs/assessment-cloud/QTI_BYTE_WORKFLOW.md) records the separate encrypted source Worker, real AV broker, default-off `worker.mjs` processor and connected center upload/review/confirmation-to-draft UI. `test:browser` now passes against actual handlers/PG/R2/scanner/parser with explicit identity/PostgREST/minimal-spine adapters. Earlier missing-byte/UI and 25-migration statements below are historical; the authority suite applies 26. Full QTI interoperability and hosted readiness remain incomplete.

Isolated QTI package inspection, inert semantic review, initial objective-question draft conversion and deterministic package building. This belongs to Assessment Cloud, not Academy, Platform or Proctor. It has its own dependency lock and is deliberately not a root workspace.

The complete target, implemented limits and remaining gates are in [QTI.md](../../docs/assessment-cloud/QTI.md). This runtime is **not a complete importer, an authenticated network service or a QTI-certified implementation**. The separate [Assessment control plane](../../docs/assessment-cloud/QTI_CONTROL_PLANE.md) has default-off authenticated source/processing/review/adoption endpoints. Actual QTI R2/AV dispatch and the center interface remain unconnected; no approval/publication write or customer-ready route is enabled.

## Local verification

From the repository root, with Node 24 and a working Linux Docker engine:

```powershell
npm --prefix services/assessment-interchange ci --workspaces=false --ignore-scripts
npm --prefix services/assessment-interchange run check --workspaces=false
npm --prefix services/assessment-interchange test --workspaces=false
npm --prefix services/assessment-interchange run build:sandbox --workspaces=false
npm --prefix services/assessment-interchange run test:sandbox --workspaces=false
npm --prefix services/assessment-interchange run test:control-plane --workspaces=false
npm --prefix services/assessment-interchange run build:worker --workspaces=false
# For actual bytes/browser acceptance, first build/update the separate scanner
# using the commands in QTI_BYTE_WORKFLOW.md (verified official signatures required).
npm --prefix services/assessment-interchange run test:bytes --workspaces=false
npm --prefix services/assessment-interchange run test:browser --workspaces=false
npm --prefix services/assessment-interchange run test:corpus --workspaces=false
```

The image build uses a pinned official Node base and a named build context containing only the provider-free Assessment core. Network is used for dependency installation at build time and the hash-pinned official corpus download by its host test; the actual parser containers have no network. The corpus is immutable `1EdTech/qti-examples` commit `0a92fbbb6d2e620a1f7fad19977be4c418246bc0`; individual digests and expected diagnostics are checked in `corpus.mjs`. It preserves examples as review data, with unsupported legacy processing/adaptive semantics remaining blocked. The examples are downloaded into memory, not vendored or published.

The unit suite covers archive/header/CRC/path/decompression bounds, streamed descriptors, malformed and hostile XML, semantic/manifest preservation, unsupported mappings and deterministic grade-preserving objective round trips. The real-container suite inspects the actual configuration and checks export→inspect→review→draft, changed-source rejection, malformed requests, deadline cleanup, root-write/network denial and OS termination of blocked JS. These are local tests, not provider, full conformance, malware clearance or capacity certification.

The control-plane check applies all 25 additive service migrations to an isolated PostgreSQL fixture, calls actual production handlers/repositories, runs the parser in the exact local image selected by `imageId`, adopts a hash-pinned normalized review and confirms/creates an unapproved draft through the existing bank-import handler. Auth/PostgREST transport, source byte receipts and AV verdicts are explicitly synthetic. It proves the authority/parser integration, not a real R2/AV/UI journey. It removes only its generated database container and supplies no provider credentials to the parser.

## Trusted broker protocol

Import `sandbox` from `run.mjs` in a trusted local job adapter. Supply exact immutable source bytes, operation and the source receipt's lowercase SHA-256:

```js
const result = await sandbox(sourceBytes, "review", { expectedHash: receiptHash });
```

The local helper can calculate a digest for fixtures, but production admission must supply the authoritative stored receipt. Allowed operations:

| Operation | Input | Output |
| --- | --- | --- |
| `inspect` | Exact QTI ZIP | Hashed inventory, manifest resources/dependencies/references, diagnostics |
| `review` | Exact QTI ZIP | Hash-bound inert manifest/document trees, declarations, mappings, processing and diagnostics |
| `candidates` | Exact QTI ZIP | Validated initial-profile draft proposals plus all blocking diagnostics; never publishable |
| `export-choices` | UTF-8 JSON `assessment.qti-export-input.v1` with `rows: [{id,item,key}]` | Deterministic ZIP in base64, package digest, source-row/item-file mapping; never publishable |

Results contain institution-private questions and answer keys. Do not log them, expose them to candidates, cache them publicly or treat a review hash as human approval. The eventual control plane must authorize the actor and tenant before input admission and again before every cached result/adoption/download; this parser has no authority to do so. Source/licensing review, scan clearance and independent content/key/rubric approval remain separate gates.

`src/cli.ts` is the image's data-only entry point, not a network listener. Stdin must match the pinned digest before parsing. Stdout is one bounded JSON envelope; no raw source text or parser internals are logged on failure. Host and OS deadlines terminate the same isolated process; ordinary cleanup removes only its generated container. Host death can leave stopped containers for an operational reconciler. This local harness uses a local image tag; production must pin the approved registry digest, implement durable leases/cancellation/reconciliation, and satisfy the full release gates before receiving customer content.

## Extend without losing fidelity

Add each interaction/presentation/scoring mapping explicitly, preserve its full source and metadata, test adversarial variants and real-source round trips, and compare legal-response grades with the canonical scorer. Unknown behavior must remain visible and blocked, not flattened or executed. Never implement custom processing by running XML-provided JavaScript, fetching template/schema URLs, or importing this parser into a browser/Edge/Worker handler. UI adoption and authenticated export snapshot ownership belong to Assessment Cloud's control plane.
