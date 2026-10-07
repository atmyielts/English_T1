# SAT Practice filter repair

Selecting Math could return no questions because the old bank limited content before filtering. Starting an empty drill then silently substituted unrelated questions. History controls were displayed but ignored. The new service query filters the published bank and the authenticated learner's history before limiting; empty or contradictory selections stay empty. A rejected start creates no session or attempt.

History meanings: Previously missed includes the learner's incorrect scored answers and review queue; Unseen excludes scored/reviewed questions; Repeatedly correct requires the highest review box and at least one correct review. These labels describe practice history, not official SAT mastery calibration. Both browsing and starting use the same history filter.

The query joins private answer keys on the server. Browser roles cannot execute either bank or due-review RPC. Keys remain withheld before scoring. Explicit retired IDs can be loaded only through owned attempt paths, preserving earlier work and immutable completed receipts. Due reviews skip retired or unavailable questions before their page limit.

The screen has named filters, shareable URLs, loading/empty/error recovery, a subject-specific domain menu, protection from stale responses, and one start request while pending. Local browser scenarios use synthetic learning content and blocked external requests; their success does not certify production content quality.

## Validation

- Five Edge tests cover strict filters, explicit empty IDs, actor propagation, private errors and owned legacy-read controls.
- Thirteen native PostgreSQL cases use the actual schema/query migration in a disposable, isolated local container. They cover late matches, history before limits, separate actors, legacy scored history, retired content, missing keys, stable sorting, due-review pagination and browser-role denial.
- Seven actual browser scenarios cover filter races, history propagation, start failures/double clicks, recovery, empty results, navigation and widths 320/390/1280. Main-content WCAG A/AA scan returned no violations; desktop/mobile screenshots were inspected.
- SAT Practice build, Edge typecheck, completion/grading tests and production/release guards pass locally. Full required CI remains mandatory before merge.

The first PR CI exposed a native-test startup race: the Docker image's temporary initialization server accepted a query and then shut down before fixture loading. Both native helpers now wait for the final PostgreSQL process as PID1 before checking SQL readiness. All26 native completion/bank cases pass with that corrected setup; full CI must run again on the updated head. No production state was changed by the failed CI.

## Production sequence

Use the feature PR and required CI; merge normally, then wait for the tracked Pages release. Inspect the linked migration dry run and apply only `20261008100000_sat_bank_filtered_selection.sql`. Deploy `sat-practice` after the migration and verify downloaded source/JWT configuration. Run the exclusive QA smoke with `--live --after --atomic --bank`; its temporary entitlement must be removed and its absence confirmed. Confirm the public service responds and the production bank screen uses the reviewed build.

The migration is additive and performs no existing-row changes. Previous Edge version16 remains compatible. Recovery baseline is main `254302fecb81677dd618562a4b77b7665fa23bd5`; use tracked Pages deployments and the saved version16 Edge source, keeping atomic completion protections.

## Remaining content work

This release does not certify SAT content readiness. A separate read-only production inventory found 300 incomplete RW seed items and 300 variations of one Math linear-equation template. Replacement content, private explanations, preservation of retired receipts and question snapshots at start remain open. It does not change customer scores, prices, purchases, AI allowances, provider budgets or other services.
