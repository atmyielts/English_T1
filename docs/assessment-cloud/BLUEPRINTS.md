# Constrained test blueprints

Status: connected local implementation, migration 35; not a hosted or scale acceptance. Centers can classify question versions, set overlapping section requirements, check feasibility, publish immutable constrained tests and run satisfying candidate forms. This is Assessment Cloud functionality with the existing mother-design controls, not an Academy or mother-platform module.

## Institution workflow

1. Authors add up to 20 named topics and an optional **author-estimated** easy/medium/hard difficulty to a question version. Each topic has its own text control; punctuation such as commas is preserved. These fields join the existing immutable item payload and independent content/key/rubric review hash. Revising a classification creates a new version requiring review, not an update to an approved source.
2. In a fixed section or randomized pool, add up to 20 quota rules plus optional minimum/maximum section points. A rule has a name, topic filters (any or all), estimated difficulty filters, question-type filters and minimum/maximum question counts. Filters within different dimensions combine with AND; multiple allowed difficulties/types combine with OR. Empty dimensions match any value, but each rule must filter at least one dimension.
3. All rules apply together. A question can satisfy several overlapping rules without being drawn twice. Quota minima need not sum to the draw count. A missing classification is not guessed: an unclassified question cannot satisfy a topic or difficulty filter.
4. **Check constrained form** runs an authorized server check against the actual pinned approved versions and displays a satisfying example's counts/points. It is not a preview of a future candidate's random form and contains no private scoring keys or question prompts.
5. Saving/revising and publishing independently recompute a deterministic satisfying witness. Conflicts or an unsatisfied pool stop the write; the service does not lower a minimum, widen a maximum or silently substitute questions. Working definitions, encrypted device drafts, explicit publication review and immutable publication history retain the new rules.
6. At start, the server constructs a satisfying selection and persists one immutable form. PostgreSQL checks source membership, approval, section/order, exact canonical prompt/options, quotas and points before admitting a constrained form. Candidate question manifests omit the author classification and blueprint policies. A lost start reply/reload resumes the committed form rather than drawing a replacement.

Difficulty labels, matching topic counts and equal points **do not establish calibrated difficulty, parallel-form equivalence or fairness**. Those require the separate calibration/psychometric work in the full-service ledger. The engine also does not yet implement exposure quotas, item-family exclusion or adaptive routing.

## Contracts and compatibility

Question payloads retain `assessment.item.v1` and optionally add:

```json
{"classification":{"topics":["Algebra","Reasoning"],"estimated_difficulty":"hard"}}
```

Topic matching is exact and case-sensitive. Classification labels are institution-authored metadata, not an external standards/calibration assertion. Source metadata is private authoring material; candidate manifests omit the `classification` object, although ordinary prompts/tags may themselves describe the subject.

Constrained definitions use **`assessment.definition.v2`**. Existing unconstrained v1 definitions remain unchanged. New validation rejects a v1 definition containing blueprint requirements and a v2 definition with no blueprint. This version fence makes older v1-only validators reject a constrained test instead of silently stripping its unknown fields. The current editor chooses the appropriate version; deliberately removing all blueprint requirements creates an ordinary v1 working definition, still subject to reviewed revision/publication. Public candidate manifests remain `assessment.manifest.v1` because the delivered question format is unchanged.

A section's blueprint is:

```json
{
  "schema_version":"assessment.blueprint.v1",
  "minimum_points":3,
  "maximum_points":3,
  "rules":[
    {"id":"72000000-0000-4000-8000-000000000001","label":"Algebra exactly one","topics":["Algebra"],"minimum":1,"maximum":1},
    {"id":"72000000-0000-4000-8000-000000000002","label":"Easy exactly one","difficulties":["easy"],"minimum":1,"maximum":1}
  ]
}
```

Rules also support `types` and `all_topics`; omitted arrays are empty, `all_topics` defaults false and a missing maximum defaults to the draw count. Counts are whole numbers within that count. Points support six decimal places and are calculated in integer micro-points in the solver; canonical SQL uses exact numeric arithmetic. No schema accepts private caller keys, arbitrary matching scripts or unsupported fields as blueprint authority.

`POST /assessment-cloud/blueprints/preview?tenant_id=<UUID>` accepts `{action:"blueprint.preview",data:{definition:<complete definition>}}`. It is a read-only authenticated operation requiring `banks.read` plus `items.write` or `assessments.publish`, with exact allowed browser origins and a 1 MB body limit. It returns `assessment.blueprint-preview.v1`, feasibility and section counts/points/selected-version identifiers, not prompts, keys or a persisted future form. Existing assessment create/revise/publish commands remain the write path; server-generated witnesses cannot be supplied as trusted authority by browser clients.

## Assembly and canonical enforcement

The provider-free engine randomizes candidate traversal, then performs bounded exact branch-and-bound selection. Suffix matching counts and conservative remaining-point bounds prune impossible branches. Every selected item must satisfy the final combined quotas and point range; fixed selections are checked too. Exhaustive small-bank tests independently compare the solver's feasibility decisions with all possible subsets.

Outcomes are deliberately distinct:

| Outcome | Meaning |
| --- | --- |
| Satisfying selection | All requirements are met; candidate ordering still follows the separate shuffle setting |
| `blueprint_infeasible` | The search proved no satisfying selection exists for these pinned versions |
| `blueprint_search_limit` | The shared 100,000-node per-form search budget was exhausted; feasibility remains indeterminate |

There is no relaxed fallback. Randomized traversal is **not uniform sampling of every feasible form** and is not an exposure-balancing guarantee. The existing bounded pool is at most 500 versions per section. Large/complex compiled-form jobs, scheduling, admission/telemetry and target-load measurements remain required before full-scale operation can be claimed.

PostgreSQL retains transactional truth. Private helpers validate classification/schema/rules, a complete satisfying selection and exact candidate manifest payloads against same-tenant approved versions. Prompt/options are reconstructed from canonical source; only permitted option permutations are accepted, and author order is retained unless explicitly shuffled. Manifest checks apply across all sections of a blueprint-bearing test. Legacy unconstrained admission is not claimed to gain this entire stronger manifest verifier from this wave.

Derived witnesses are excluded from command identity. Current authority precedes replay; stable committed commands recover before revalidation. Publication retries rebuild the requested immutable working revision, not a later manager's edited definition, and canonical receipts retain the original publication. Four concurrent requests with different valid witnesses recover one definition/version; four different satisfying candidate-form proposals recover one attempt and one committed form. Private pre-blueprint/validation helpers are revoked from public, anonymous, authenticated and service-role callers.

## Local reproduction and evidence

Use existing root dependencies, Docker, Deno and Playwright CLI:

```text
deno test --no-lock packages/assessment-core/src/blueprint.test.ts packages/assessment-core/src/blueprint-draft.test.ts supabase/functions/assessment-cloud/blueprint-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --blueprints
npm --workspace apps/assessment-cloud run build
npm --workspace apps/exam run build
deno check --no-lock supabase/functions/assessment-cloud/index.ts
node scripts/verify-assessment-boundaries.mjs
```

The 15 focused checks cover exact overlapping quotas/points, exhaustive feasibility comparisons, fixed-set and search-limit distinctions, classification privacy, encrypted incomplete drafts/round trips, v2 downgrade rejection, API permission/source fencing, deterministic witnesses, historical publication recovery and committed-form reuse. The broader core plus base/blueprint API suite passes 92 checks. All 35 migrations/authority/concurrency tests pass, including malformed/forged witness/manifest denial and differing-witness four-process replay. QTI control-plane regression, app/Edge builds and 461-file source boundaries also pass locally; Exam still emits its existing large-chunk build warning.

Connected acceptance uses actual institution/Exam apps, production HTTP handlers/repositories, PostgreSQL and a real local coordinator Worker. It creates and independently approves a classified question through the center UI, combines it with four canonical fixture questions, rejects conflicting overlap, confirms a satisfying two-question/three-point example, recovers lost create/publish/start replies and reloads/resumes the same form. Independent checks inspect canonical sources and verify Algebra/exact easy/Reasoning counts and points. Responses sync/submit without changing existing score records. One definition/version/form/attempt, five approved classified versions and zero classification-object leaks remain; a foreign actor cannot preview. Unmonitored delivery requests no personal devices. Screenshots at 1440/1024/768/390/320 and focused 320px controls are inspected in `output/playwright/blueprints`.

Identity/PostgREST, minimal historical schema and internal job/provider ports remain explicit local adapters. Four seed questions are canonical SQL fixtures; the fifth uses real author/reviewer UI. No hosted identity, real-device, restricted-network, production SLO or capacity proof is inferred. A separate `constrained-blueprints` service CI job runs focused tests, builds/boundaries and the actual browser journey with synthetic identities and no deployment secrets. Exact-release remote CI remains unproved.

## Release and remaining full-service work

Ship migration, authoring/delivery APIs and compatible institution/candidate clients as a coordinated unit. Never downgrade v2 definitions into v1 to force compatibility or disable canonical quota checks to allow a sitting to start. Existing published versions/forms must remain immutable and recoverable; rollback must preserve the new schema/receipts and disable new admissions safely rather than dropping data. No cloud/deployment/Academy mutation occurred in this work.

Still required: calibrated difficulty/IRT/equating/DIF and uncertainty, exposure/security pools and item-family constraints, adaptive routing, richer blueprint dimensions/collaboration, full bank/history paging, scalable compiled-form jobs/operations, standards mappings/round-trip fidelity for classification/blueprints, full localization/manual accessibility, complete historical-schema/hosted identity, restore/security/legal/retention/capacity and exact-release CI acceptance. This closes a local center-owned workflow, not the full-service ledger row or the overall goal.


## Blueprint v2: relations and exposure

Added 2026-10-22 (FORM-01, migration 40 `20261022140000_assessment_blueprint_relations.sql`). `assessment.blueprint.v2` keeps every v1 field and adds:

- `enemies`: pairs of question versions, stored sorted, that are never delivered in the same form.
- `families`: groups of 2–50 questions, for example items sharing a reading passage, with a `maximum` per form.
- `exposure.maximum_per_sitting`: how many forms in one sitting may include each question.

Enemy and family questions must belong to their own section, and v2 requires at least one of the three fields.

Assembly prunes on enemies and families during the bounded exact search. Before assembly, the Edge reads the questions already at their limit in the candidate's own sitting (`assessment_blueprint_saturated`) and excludes them. If what remains cannot satisfy the blueprint, the result is `blueprint_exposure_exhausted`; no rule is relaxed.

The database re-checks enemies and families on every committed form. At `attempt.start` it enforces exposure under a per-sitting advisory lock, also behind the live gate's sitting row lock. A replay of an existing attempt is not re-counted.

Evidence (local):
- `supabase/tests/assessment-blueprint-relations.integration.sql` covers:
  - questions outside the section, and zero exposure
  - enemy and family witnesses refused
  - enemy forms refused at start
  - saturation reads scoped to the candidate's own sitting
  - a second candidate refused on a saturated question, and admitted with a distinct form
  - grants
- `scripts/test-assessment-exposure-race.mjs`: four simultaneous starts under a one-form limit admit exactly one. With the lock removed, the race over-admits on both runs and the test fails.
- `packages/assessment-core/src/blueprint-relations.test.ts`: parsing, 200-run assembly without enemies together or families over their maximum, and exhaustion.
- The blueprint editor has a **Question relations** section (exposure limit, enemy pairs, families) in uz/ru/en. The `--blueprints` journey and the authoring smokes still pass.

Not yet covered: a browser journey that authors v2 relations end to end, and calibrated exposure or security pools across sittings (FORM-04/05).
