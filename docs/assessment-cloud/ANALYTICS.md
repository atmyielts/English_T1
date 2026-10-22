# Released-result analytics and candidate breakdowns

Assessment Cloud provides immutable, reproducible result snapshots and form-specific question diagnostics. Exam provides owning-candidate section/question point breakdowns. Neither path changes scores, approval, answer keys, certificate status or Proctor findings. This is part of the full analytics subsystem, not a claim that calibration, IRT, equating or the full service is complete.

## Population and reproducibility

The seventeenth additive migration is `20261019110000_assessment_analytics.sql`. An authorized analyst selects a sitting, optionally a current cohort, an exploratory percentage cutoff and a purpose. Both `results.read` and `banks.read` are required for all institution reads, creation and receipt replay; existing capability/role versions are not upgraded. Access discovery adds only the derived `can_read_analytics` flag. Candidate detail access is a separate owning-result authority, not this staff capability.

PostgreSQL materializes the registration/start/finalization counts and latest eligible **released** grading generation per attempt in one population-selection statement. A future embargoed release does not replace an older eligible result. Unapproved, unfinished and never-released scores do not enter the scored population. Current active cohort entries are pinned through the selected cohort revision; this is explicitly not retrospective membership at exam time. Snapshots capture their population, timestamp, source revision IDs, generation, sanitized scores, source hash, reason and immutable item metadata. Header, rows, request receipt and audit commit together. Permission is checked before cached replay; concurrent identical requests create one snapshot/audit.

Later releases can enter a new snapshot but cannot rewrite an older one. Snapshot source rows contain attempt/revision identifiers privately, not candidate names. These are pseudonymous private records, not a promise of irreversible anonymization. No answer keys, free responses, marker identities, raw grading inputs or AI/guilt flags are stored in the analytics projection. Only response-present flags and recognized choice-option IDs are retained for item summaries. Current authorization is required to reopen any snapshot.

## Metrics and interpretation

Descriptive reports show the selected scored population, percentage mean/median/sample standard deviation/range, ten score bands and the count at/above the analyst's cutoff. Bands are lower-inclusive and upper-exclusive, except 90–100 includes 100. Zero released cases remain an empty population with unavailable—not zero—means/deviations. The cutoff does not create official pass/fail decisions or alter credential criteria.

Different randomized forms are not automatically comparable. A form-group key binds the exact selected item-version IDs and numerically normalized maxima, ignoring permutation; `1` and `1.000000` are the same weight. Mixed-form views show descriptive totals only; item diagnostics and internal consistency require selecting one group. All form groups are reachable through bounded keyset pages, including beyond the initial 100 groups. Question diagnostics are also keyset-paged. Ordering/matching option statistics are not implemented as choice counts; unsupported option analyses stay absent rather than appearing as fabricated zeros.

For a chosen identical-item group:

- Mean points earned is the average awarded-points / maximum ratio, expressed as percent. Full-credit counts are separate; partial-credit items are not mislabeled as binary item difficulty.
- Response recorded means the final journal response is present and not a literal null/empty string/empty array/empty object. It does not certify a complete or valid answer. Awarded zero points come from the canonical released score, not statistical imputation.
- Choice-option counts include recognized selections without marking a correct key. Multiple selections can sum above the number of cases. Option text is protected by bank-read authority.
- Corrected item-rest correlation is Pearson correlation between an item's raw awarded points and the remaining raw test points. At least five cases and nonzero variation in both variables are required; otherwise it is unavailable.
- Raw coefficient alpha is `k/(k-1) * (1 - sum(item sample variances)/sample variance of total raw points)`. It requires at least five cases, two items and nonzero total variance. Unequal point weights affect this raw statistic. Negative values remain negative and trigger human-investigation wording; nothing is automatically reversed, rescored or removed.

These definitions follow the primary [psych alpha documentation](https://personality-project.org/r/psych/help/alpha.html), including its distinction between raw alpha, item-rest correlation, internal consistency and broader measurement claims. The five-case computation gate and under-30 caution are explicit product safeguards, not assertions of statistical adequacy. No confidence intervals, dimensionality, fairness or validity certification are claimed. IRT/calibration/equating/DIF/standard setting and uncertainty estimates remain required.

## Candidate results

The eighteenth migration supersedes unconditional owner-only granular disclosure: [institution feedback policies](FEEDBACK.md) now pin detail level/date at release, default old releases to totals-only and enforce per-release withholding. The section/question fields described below are returned only when the pinned policy permits them and details are available. Analytics fixtures explicitly approve a points policy rather than weakening these defaults.

`GET /assessment-cloud/analytics/candidate/result?attempt_id=...` selects only the signed-in owner's latest eligible released generation. The response contains release/revision provenance, section titles, section point totals and question ordinal/awarded/max points. It does not expose prompts, question IDs, answer keys, responses, grader identities or unreleased generations. Exam lazily opens the breakdown and its question lists, with bounded visible batches, reload controls and account/unmount fences. If a later eligible release differs from the selected result card, the UI identifies the newer release and requests refreshing the list. Foreign/unreleased attempts return not found.

## API, UI and recovery

Institution routes: `analytics/sittings`, `analytics/cohorts`, `analytics/snapshots`, `analytics/reports/<id>`, `analytics/reports/<id>/forms`. List/item cursors are UUIDs; form cursors are full 64-character group hashes. Page sizes are 1–100. `analytics/commands` accepts only `snapshot.create` with sitting/cohort/cutoff/purpose; client-authored scores, populations, authority and official decisions are stripped. All responses are no-store and origin/identity guarded; raw tables/helper RPCs are not browser-accessible.

The UI keeps the mother service's cream/navy typography, panels and controls in the separate Assessment app. Consequential requests use encrypted actor/institution-scoped journals, stable command identities and Web Locks. Lost replies remain actionable through reload/retry; confirmed counts come from canonical receipts/reads. A current denial tears down the private report and selectors. This device recovery has the same same-origin/shared-device limitations as the other assessment journals.

## Verification

```powershell
deno test --no-lock supabase/functions/assessment-cloud/analytics-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --analytics
```

The database fixture uses a documented synthetic matrix: five identical two-question cases `(0,0),(0,0),(1,9),(1,9),(1,9)`. Expected mean is 60%, corrected item-rest correlation 1 and raw alpha .36. A sixth full-credit case receives a different valid two-of-three form and a seventh registration has not started. Tests cover mixed-form exclusion, score-band boundaries, option/response provenance, small samples, question/form paging, current-cohort filtering, immutable history, future-release embargo, foreign/candidate denial, role revocation before replay, later-release snapshots and preserving the existing results-array API. Four-process creation replay must produce one snapshot/row/audit.

The connected browser fixture uses actual apps/production handlers/repositories and disposable PostgreSQL, with synthetic Auth/PostgREST. It exercises snapshot creation/reply loss/reload/retry, known statistics, current cohort, revoked-analyst teardown, independent authorized reopening, private candidate breakdown, real keyboard acknowledgement and both apps at 1440/1024/768/390/320. The test-only PostgreSQL transport now uses persistent service-role sessions rather than starting/blocking a Docker/psql process per HTTP operation. `node scripts/test-assessment-fixture-database.mjs` independently verifies role privileges, UTF-8/newline framing, concurrent request identity, SQLSTATE preservation, deferred-constraint failure/atomic rollback and subsequent recovery. Application request deadlines remain unchanged. The migration tests use a representative spine fixture plus all seventeen additive service migrations, not the complete historical mother-platform migration chain. This is local evidence, not hosted acceptance, full accessibility certification or capacity proof.

## Remaining full-service requirements

Institution-controlled feedback/disclosure levels must be completed before production enablement of granular candidate feedback; current local breakdowns are owner-only and released-score-only, but are not a complete configurable feedback policy. Background/streamed snapshot construction, precalculated metric materialization, retention/erasure/holds, report exports and sharing governance, richer blueprint/topic/longitudinal/center comparisons, historical cohort attribution, section/topic aggregation, pass-standard governance, CTT uncertainty estimates, calibration datasets, IRT/CAT/equating/DIF/standard setting, richer timing/omission analysis, full localization/manual accessibility, provider-authenticated acceptance and 20k-candidate reporting/load/SLO tests remain required. Current snapshot construction is an atomic synchronous transaction; report queries expand pinned JSON scores. Local fixtures do not certify production-scale latency or resource usage.
