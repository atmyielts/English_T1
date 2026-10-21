# Diagram and hotspot responses

Status: implemented behind `ASSESSMENT_IMAGE_RESPONSES=false`. The local twenty-one-migration authority suite, 249 pure/API tests, all three app builds and connected actual-app/scanner/Worker/PostgreSQL author-to-candidate-to-grader journey pass. Final mother-token styling is inspected and the ordinary-media browser regression passes again with all twenty-one migrations. No production resource or deployment was changed.

## Scope and service boundaries

This connects two of the five previously blocked response tools. Audio, video and file responses remain required full-service work, including academic submission ownership, durable uploads, quarantine/decoder checks, human marking access, retention, replacement and recovery. Proctor evidence is not an academic answer store and cannot substitute for those workflows.

Institutions create these questions in Assessment Cloud, attach an existing ready scanned image, design the public interaction and submit an immutable version for independent review. Exam displays only the pinned current section and public geometry. Supabase remains academic truth; the existing encrypted `assessment-media` R2 path serves the pinned asset with current actor/tenant/attempt/section checks. No API/feature logic enters the mother platform or Academy. Existing Schood typography, cream/navy elements, outlines and controls are reused.

## Public and private contracts

`Item.image_response` uses `assessment.image-response.v1`, pins one attached image `artifact_id`, and for diagram labeling supplies one `{response_id,x,y}` anchor per public response label. Coordinates are normalized to the original displayed image: x from left, y from top, both 0–1 with six decimal places. Anchors move with image resizing, not screen pixels. Labels should identify neutral fields, not disclose the accepted answer. Accepted diagram text stays in the existing private key and supports alternatives, case rules and partial credit.

Hotspots expose no accepted region, answer ID or shape to Exam. The answer is `{schema_version:"assessment.image-point.v1",x,y}` or null to clear it. The private key contains 1–20 accepted regions. Rectangle, ellipse and simple polygon shapes are supported. A point inside any accepted region earns the item maximum; boundaries count as inside. A malformed response earns no credit in deterministic scoring and is rejected before saving by the new journal guard. Caller-supplied scores/target IDs/regions cannot confer credit. This is a geometric question, not eye tracking, scene analysis or image recognition.

Polygon targets use 3–32 distinct vertices in boundary order, without a repeated first vertex, self-intersections, self-touching, redundant collinear vertices or zero area. Ellipses require positive radii and must fit wholly inside the image. Region validation is mirrored in PostgreSQL and the provider-free scoring module. Private target controls and overlays exist only in the institution author/reviewer UI. Candidate preview receives the public item, not the key.

The twenty-first additive migration adds guards to immutable item versions, private keys and candidate response journal insertion. No old item, response, form, grade or release is rewritten. Previously unsupported geometry drafts require an explicit new revision with versioned interaction metadata; a legacy string region ID is not silently reinterpreted as a coordinate answer.

## User interactions and recovery

Authors select the attached image and use structured percentage controls for diagram anchors and target geometry, including polygon vertex editing. Valid private targets can be overlaid on the protected institution image for review. Public candidate preview must never display that overlay. Edits remain in the existing encrypted, actor/institution/resource-scoped draft system, including incomplete numeric input; incomplete fields never silently become zero. Independent approval hashes include the public interaction and private key.

Candidates can select a hotspot by pointer, keyboard or explicit numeric coordinates. Arrow keys move 0.1%; Shift-arrow moves 1%; Delete/Backspace clears. Numeric coordinates are saved only on “Apply coordinates”; the interface states this explicitly. Diagram numbered markers focus the corresponding labelled text field; the normal field list remains keyboard accessible. Responses use the existing encrypted response journal, stable command identity, canonical coordinator lease and current-section authority, including reload/retry. Paused, expired, disconnected or foreign-account media is not granted by the interaction renderer. Protected image range/access checks remain server-side; no bearer URL is generated.

The deterministic scorer reads the canonical private grading bundle within the existing trusted grading handler. It uses geometry only for hotspots and the existing mapped-text algorithm for diagrams. It does not create a human approval or release. Existing blind marking, approval, release/regrade and score-history authority remain separate.

## Rollout and tests

Image-response starts require all of:

- Ready immutable attached image and independently approved question/form.
- Existing protected prompt-media delivery gate/topology.
- Server-only `ASSESSMENT_IMAGE_RESPONSES=true` on an isolated approved environment.
- Exam's exact `image_response_client=assessment.image-response.v1` compatibility.

Preparation reports only capability names/protocol/enabled state, never future prompts, image IDs, targets or accepted answers. A client cannot enable delivery by sending readiness claims or the prompt-media protocol alone. Text-only sittings gain no media dependency.

```powershell
deno test --no-lock packages/assessment-core/src/image-response.test.ts packages/assessment-core/src/authoring.test.ts supabase/functions/assessment-cloud/handler.test.ts packages/assessment-web/tests/delivery.test.ts
node scripts/test-assessment-db.mjs
node workers/assessment-media/scripts/browser-acceptance.mjs --image-responses
node scripts/verify-assessment-boundaries.mjs
```

The SQL suite checks scanned-asset binding, public/private separation, invalid regions/anchors/private key labels, point bounds/extras, unknown diagram labels, rejected-write sequence preservation, receipt replay and private grading inputs. The browser fixture uses actual immutable builds/handlers/repositories, isolated PostgreSQL, encrypted R2, the real ClamAV/decoder broker and native protected images; identity/PostgREST are adapters. Its final scoring step invokes the production grading handler/scorer with a synthetic server secret, not a hosted Queue. Canonical proof records three ready scan reports/assets, two independently approved image questions, one attempt, six response-history entries, one ready deterministic run and 1/1 points for each question. Correct score computation is not a human grade approval or candidate release.

Native acceptance exercises public author preview without private overlays, keyboard/pointer/explicit-coordinate selection, clearing, actual coordinator sync, encrypted reload recovery, diagram marker focus/text responses, current-section transition, terminal asset denial and five hotspot widths (1440/1024/768/390/320). It also exposed a cached-image readiness race: resetting loading in a mount effect could overwrite a completed native load and strand overlays on the next section. Native load/error events now own that readiness; parent identity/asset keys and explicit retry retain lifecycle control. Responsive screenshots are inspected; manual assistive-technology and broader device/browser coverage are not certified.

The ordinary-media regression also passes with all twenty-one migrations and the same current renderer: actual native image/audio/video playback, decoded video frames, no autoplay/bearer URLs, canonical answer sync, pause/resume preservation, lease-loss teardown, cross-service cookie account changes and former-section/final-expiry denial. The test fixture uses four persistent service-role PostgreSQL sessions; its framing/permission/rollback behavior is independently verified. Exact-release remote CI is still unrun, and the added browser checks do not deploy anything.

Keep release disabled pending complete browser/device and manual assistive-technology coverage, localization, trusted operations, full historical-schema rehearsal and hosted identity/provider/security/legal/retention/restore/capacity gates. Rich diagram/table layouts, drag-and-drop alternatives, author freehand drawing and accessible alternate assessment policies remain full-service work.
