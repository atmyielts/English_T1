# QTI interoperability and isolated interchange service

Latest implementation: [QTI_BYTE_WORKFLOW.md](QTI_BYTE_WORKFLOW.md) records connected actual center browser→production handlers/PG/source Worker/encrypted R2/real AV/processor/parser→reviewed adoption/confirmation/unapproved draft acceptance, with explicit identity/PostgREST/minimal-spine adapters. Migration 26 and the UI distinguish verified scan results from historical metadata. Earlier missing-byte/UI descriptions below are historical. Full interoperability and hosted/launch gates remain unfinished; no production enablement or provider mutation occurred.

Status: implementation in progress. This is the full-service workstream, not a claim that a small XML subset is a complete importer or that Schood is QTI-certified. Existing CSV/Schood JSON remains available. No QTI delivery, import adoption or export publication is enabled by this document.

## Implemented local runtime

`services/assessment-interchange` now performs actual ZIP inspection, namespace-aware XML analysis, resource/dependency/reference checks and immutable-source hashing. It retains manifest metadata/licensing, item/test/section/stimulus structure, standalone response-processing templates, response/outcome declarations, weighted/area mappings and interaction bodies as **inert data**, not renderable HTML or executable scoring. Shared template resources with no `href` resolve only a sole declared XML file, with an explicit origin and warning; ambiguous resources remain blocked.

The first conversion profile produces validated **draft proposals** for plain single choice, unconstrained multiple choice and ordering with one identifier response. It recognizes the standard `match_correct` template or an exact structurally checked all-or-nothing rule. It does not execute arbitrary response processing, infer scaling from `normal-maximum`, collapse rich content into text or silently discard unknown item semantics. Unsupported or invalid resources remain visible in the result. Regional/absent language, additional presentation/feedback/behavior, composite items, custom processing, partial credit and other interactions require mappings still to be built.

The companion builder emits real deterministic item-bank ZIP packages for corresponding plain objective snapshots (true/false is represented as a single-choice interaction). Exact source-row/item-file provenance is returned separately for the future authenticated export job. Fixed DOS timestamps prevent retry clocks from changing package bytes. Unmapped metadata, keys, media, rubrics, tags and option attributes fail explicitly rather than disappearing. Tests compare the restored questions' **legal-response** grades using the existing production scorer. This is not yet all-type fidelity, rich presentation equivalence, schema/conformance validation, an institutional export permission or a complete bank export service.

The local broker sends hash-pinned stdin bytes to a separately built, unprivileged container with **no network, mounts or provider secrets**, a read-only root, dropped capabilities, 512 MiB memory/no swap, 256 MiB JS heap, one CPU, 32 processes and a 45-second OS deadline. Its attached process is observed to termination; output/deadline failure kills the same generated container and cleanup targets that exact identity. The OS deadline also survives a blocked JS loop or caller crash. A caller crash can leave a stopped local container requiring operational reconciliation; production scheduling, image-digest pinning, orphan reconciliation and durable job cancellation are not implemented by this local harness.

Hard limits are 64 MiB source ZIP, 128 MiB actual expanded bytes, 16 MiB per file, 10,000 entries, 4 MiB per XML, 32 MiB aggregate reviewed resource XML, bounded nodes/graph traversals and 32 MiB serialized output. UTF-8 stored/deflated ZIPs, including checked streaming descriptors, are supported. ZIP64, split/encrypted archives, path aliases/escape, symlinks, inconsistent metadata/CRC, DTDs/entities, invalid XML characters, active instructions, XInclude and `xml:base` are rejected. These are explicit admission limits, not a claim of unlimited package compatibility; full-service large jobs need reviewed partitioning/streaming.

Local verification on 2026-10-20 includes the hostile archive/XML suite, semantic preservation, deterministic export/grade round trips, real-container isolation/deadline/cleanup and pinned official examples. The official examples are fetched by immutable commit and verified SHA-256, not redistributed in this repository. The corpus exercises **review preservation and explicit unsupported diagnostics**, not successful runnable import or standards certification. Legacy/non-allowlisted template URIs and adaptive behavior remain blocked; no URI is fetched inside parsing. See the exact executable cases in `corpus.mjs`.

The current checked baseline is **33 unit/semantic/round-trip tests**, **five real-container checks**, three official packages with **23 retained semantic documents/24 resources**, the service type check, clean independent install and production dependency audit. Existing bank-import/core/API regression tests pass **11/11**, and source boundaries pass across **385 files**. These counts do not imply that other older suites or hosted CI were rerun for this wave.

The [default-off QTI control plane](QTI_CONTROL_PLANE.md) now implements authenticated source manifests, private byte-receipt authority, stage-separated leases/reports, current-capability review/adoption and a handoff into existing confirmed, bounded draft creation. Its connected handler/PostgreSQL/isolated-parser check passes with explicit synthetic byte/AV/Auth transport ports. Actual QTI R2 uploads, real ZIP malware processing/dispatch, private review artifact storage and the center interface remain unconnected; no export/download authority is enabled. Complete asset/rubric/license and all-type/rich/scoring/test mappings, materialized authorized exports, XSD/conformance, retention and all hosted/full-service gates remain mandatory. Do not add ZIP to the current CSV/JSON bank route or enable `ASSESSMENT_QTI_ENABLED` from these component checks.

## Required end state

Centers exchange QTI 3 item banks and fixed/randomized multi-section tests, with versioned source provenance, supported scoring semantics, protected media and rubric remapping, accessibility content, licensing review, immutable import/export manifests and resumable jobs. Imports create drafts only; independent content/key/rubric approval and immutable publication remain mandatory. AI does not approve imported content or consequential grades. Assessment Cloud owns this service; Proctor and Academy do not acquire its dependencies, permissions or UI.

The [1EdTech implementation guide](https://www.imsglobal.org/spec/qti/v3p0/impl) and [official examples](https://github.com/1EdTech/qti-examples) are the technical sources. Packages contain a root `imsmanifest.xml`, QTI XML resources and optional associated files; item/test/stimulus dependencies and relative paths are part of the exchange, not incidental filenames. A plain XML question picker is not the complete package service.

```text
private source upload -> immutable source receipt -> isolated AV/package/XML inspection
                                                   |-> resource/dependency graph
                                                   |-> diagnostic and mapping review
                                                   |-> protected asset scan/remapping
reviewed normalized snapshot -> draft creation -> independent approval/publication
approved export snapshot -> private package build/verification -> authorized download
```

## Boundaries and authority

`services/assessment-interchange` owns the parser/compiler runtime and its separately locked dependencies. It is not registered as a mother-platform module. The parser receives one exact hash-bound source and bounded policy, no Supabase token, R2 keyring, database privilege, tenant lookup or network-fetch capability. It never runs package JavaScript, stylesheet code, templates, custom response processing or external schema retrieval. The authenticated Assessment control plane owns source receipts, job leases, grants, audit/outbox events, reviewed mappings, adoption/cancellation and bounded draft writes.

ZIP contents are read as data, never extracted into caller-selected filesystem paths. Preflight validates both central/local metadata, compression/encryption modes, canonical portable paths, duplicate/colliding names, bounded file counts and compressed/expanded budgets. Actual decompression sizes and CRCs must match the pinned directory. XML is strict, namespace aware and bounded; DTDs, entities, external retrieval and active processing instructions are unavailable. Resource links resolve within the admitted archive and declared graph, never to the network or another institution's asset UUID.

Parsed source does not become renderable HTML. Presentation must compile into a validated safe content model and retain supported accessibility/layout semantics; unknown presentation/scoring/interaction behavior stays visible in a blocked diagnostic, not silently flattened, skipped or given a fabricated key. Source preservation and manual structured mapping are separate from a declaration that an imported item is runnable.

## Required capabilities and acceptance

| Area | Required implementation and proof |
| --- | --- |
| Source/package admission | Private immutable exact-source receipt, actual AV/ZIP/XML checks, bounded parse jobs, replay-safe leases, cancellation/revocation, no path/network/authority escape |
| Resource graph | Item/test/section/stimulus/asset metadata, references/dependencies, namespaces, duplicate/ambiguous identifiers, complete missing/unreferenced-resource diagnostics |
| Interactions and scoring | Explicit mapping for all existing conventional Schood types; reviewable response/outcome declarations, matching/order/text/numeric/geometry/file semantics, tolerances and partial credit; no executable PCI/code sandbox |
| Presentation/accessibility | Safe structured rich content, tables, media alternatives, language/direction and supported accessibility metadata; preserve source and block unsupported semantics |
| Assets/rubrics/licenses | Content-digest remapping into institution-owned scanned artifacts/rubrics, provenance/license review, no cross-tenant UUID borrowing, no unscanned preview |
| Tests and randomization | Fixed/random pools, section/test timing and supported selection/order rules mapped into immutable definitions without silently changing difficulty, replacement or adaptive behavior |
| Review/adoption | Protected diagnostics, comparisons/mapping/correction, source hash/revision bound review, explicit adoption, resumable bounded draft creation and independent publication |
| Export | Materialized immutable authorized snapshots, private keys only under export authority, assets/rubrics/licenses included/remapped, dependency-complete QTI manifest, conformance checks, retry-safe build/download and revocation |
| Operations and conformance | Networkless memory/time limits, hostile and real corpus, standards round trips and external tooling, audited deletion/retention/holds, localization/manual accessibility, exact-release CI, hosted/recovery/capacity evidence |

QTI optional custom/adaptive behavior that cannot be represented by the approved non-code delivery model must remain explicitly unsupported and block runnable adoption; preserving an original source is not equivalent to supporting its behavior. No silent best-effort scoring conversion is acceptable. Full legal/security/hosted/load gates from the implementation ledger remain mandatory.

## Parser dependency decision

The runtime pins `@xmldom/xmldom` 0.9.12 and `fflate` 0.8.3, verified against the registry and maintainers' releases/advisories on 2026-10-20. The XML maintainer identifies 0.9.12 as a patched line in its [DocType advisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-27p8-2357-5qqv); DTDs are additionally forbidden by this service. The compression maintainer documents streaming ZIP handling and its [0.8.3 fixes](https://github.com/101arrowz/fflate/releases/tag/v0.8.3). Library choice is not a security verdict: application limits, CRC/graph/namespace checks, sandboxing and adversarial tests are still required.

Install/check this runtime independently with `npm --prefix services/assessment-interchange ci --workspaces=false --ignore-scripts`, `npm --prefix services/assessment-interchange run check --workspaces=false` and `npm --prefix services/assessment-interchange test --workspaces=false`. Node 24 is required. The separate `interchange` job in Assessment Services CI installs that lock and runs types, unit/round-trip tests, the pinned sandbox and official corpus without changing the Node 22 job for the existing apps. Local checks do not prove that this workflow has run on GitHub or authorize deployment. See [the runtime guide](../../services/assessment-interchange/README.md).
