# SAT Practice atomic completion

Submitting the same drill twice previously repeated mastery, review, responses, notebook and XP updates. A failure during these separate writes could leave a partial score. Completed questions also came from the mutable current bank.

The attempt UUID now identifies a single immutable completion. A service-only transaction validates ownership and the full scored question set, serializes progress updates for the learner, and saves all effects with the scored question snapshot. Identical completed answers return the original receipt; changed answers conflict. Historic scored attempts keep their original scores without receiving new progress. Browser writes to SAT-owned trusted progress are denied, including column grants. Shared simulator session and response grants are preserved.

The Lab guards duplicate submits, freezes pending answers, stores the exact pending payload in actor/attempt-scoped tab storage before sending, and recovers the same submission after a reload. Results show explicit loading, outage, and unsubmitted states instead of fabricated zero scores. Constructed answers remain visible and only supported published scalar keys can earn credit.

Validation: eight Edge/grading tests, 13 native PostgreSQL cases with independent connections (same/different attempts, changed-answer races, early and final-receipt failure rollback, ownership, browser grants, legacy replay, and source deletion), SAT build/typecheck, and six synthetic browser scenarios on the actual release checkout. Browser widths 320/390/1280 pass and scoped Results WCAG A/AA checks report zero violations. These tests do not qualify official SAT numeric tolerances, full Supabase reset, pre-submit content revision freezing, shared-auth outages, paid providers or every platform flow.

Rollout: PR CI must pass; merge triggers tracked Pages deployment. After all Pages jobs pass, dry-run must name only 20261007100000_sat_attempt_atomic_completion.sql; apply that additive migration and then deploy only sat-practice. Preserve gateway JWT verification and inspect the deployed source. QA production checks use the tagged audit account and a temporary ten-minute entitlement on its exclusive personal tenant; remove and verify that grant afterward. No customer data, messages, provider calls or payments are part of the smoke.

Recovery: keep additive schema and saved receipts. Prefer a forward repair. An Edge rollback to version15 remains schema-compatible but reopens duplicate XP; do not silently revert the integrity fix. Previous healthy Pages source: 8723bc04fbef52d6d30523299538d52eec093553.

Production deployment is pending until the recorded CI/provider/QA evidence confirms it.
