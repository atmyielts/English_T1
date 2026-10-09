# Marketplace transaction and hiring release candidate

Production baseline: `97f5756d47fe4a6221b9274301be24e4b12e8c57` (PR212). This document records local qualification; it does not establish deployment or hosted customer readiness.

The former browser grants allowed a teacher to set their own verification flag and insert an application already marked hired. The former application UPSERT also reset an employer decision when a teacher reapplied. Manager endpoints ignored disabled memberships and sometimes returned success after database failures.

This candidate revokes browser access to the three Marketplace tables and their independent column grants. The authenticated Edge handler binds the verified actor to one private transaction command. Public responses contain selected directory fields. Active owner/admin membership in a team/org workspace is checked inside the same transaction as listing and hiring operations. Automatic personal workspaces confer no academy publishing access. Account suspension, membership revocation, application/closure races and same-actor requests serialize through bounded locks.

Profile saves retain an immutable request receipt and expected revision. Job postings retain their original request, content and expiration. Applications are unique by listing and teacher and preserve the original note and employer status. Employer decisions require the observed status and retain an append-only audit receipt; an old retry returns the current application status. All existing records remain. Legacy verification flags remain stored, but public badges require independent review metadata that teachers cannot write. An operator review/verification workflow remains separate work.

The frontend adds public browsing, explicit profile visibility, correct zero-value display, academy selection, employer applicant review and listing closure. It uses current sessions per private request and ignores delayed replies after account changes. Initiated, unconfirmed mutations are retained in actor-scoped tab storage; replacement writes are blocked until confirmation. Definite command refusals keep the editable form. Profile drafts remain bound to their original saved revision even after background reload. Storage failures refuse dispatch. This is recovery for initiated requests, not persistence of every unsaved edit. Signing out clears private recovery; closing a tab also clears tab storage.

Marketplace uses the shared responsive Schood header with a burger menu, keyboard Escape/focus behavior, labelled forms, wrapping application controls and distinct loading/failure/empty states. The Updates overlay is hidden on this working screen.

Local qualification:

- 26 native PostgreSQL cases using the actual Marketplace baseline DDL and candidate migration, independent connections and synthetic fixtures. Includes legacy exploit reproduction, grants/columns/RPC denials, two-second migration rollback, 12 concurrent retries per write path, stale profile/status conflicts, personal-workspace exclusion, account suspension, manager revocation, atomic receipt failure and legacy badge suppression. Full Supabase reset is not claimed.
- 10 HTTP handler cases; Edge entry point typecheck.
- 23 browser cases with synthetic APIs. Includes failed/invalid save receipts, exact recovery after reload, session changes, blocked storage, draft revision conflicts, duplicate job titles, tenant choice, employer decisions, applicant load retry and burger behavior. Four widths (320/390/768/1280) pass scoped WCAG checks with no page errors. Mobile and desktop screenshots were inspected.
- Platform TypeScript/Vite build and production/release verification pass. Existing large-bundle and Browserslist warnings remain.

Production release sequence:

1. Push the feature branch and attach the PR. Require full CI on the exact final head and normal matching-head merge; no override or direct main push.
2. Verify tracked Pages and post-merge CI, provider source identities and public routes. The new frontend gates changes until the version-2 API is ready.
3. Confirm the linked project `bbjawctnqrufvnesdsel`. Require a fresh database dry-run listing only `20261009110000_marketplace_transaction_boundary.sql`; apply and verify migration history. No customer records are bulk edited.
4. Deploy only `teacher-marketplace` and compare both downloaded runtime source files with the reviewed commit. Production function15 is ACTIVE with `verify_jwt=false`; the explicit scoped config preserves this public gateway behavior. Private commands independently verify bearer identities with Auth and active account/academy authority in SQL. Do not confuse this with Peer Review's separate gateway setting.
5. Run `node scripts/marketplace-production-smoke.mjs --live --browser --output=docs/customer-readiness/2026-10-09-marketplace-live-api.json`. The runner refuses fixture creation without reviewed private grants and the version-2 API. It creates only six exclusive temporary actors/two marked workspaces and keeps credentials in memory. Its syntax is checked; it has not yet been executed against production.
6. Use the one-shot loopback bridge only for these actors' actual published browser journey: owner posting, teacher applying, owner reviewing/deciding/closing, and responsive layouts. Trigger independent cleanup, clear browser cookies and close the QA browser. Confirm absence of owned actors, profile/application/listing fixtures, audit receipts, memberships and exclusively owned workspaces. Do not inspect private customer records.

Rollback retains private grants, immutable receipts and additive schema. Use a bounded unavailable response/fix forward for command failures. Never restore owner-editable trust flags or an application UPSERT that resets hiring decisions. A frontend rollback alone does not revert this backend boundary.

Remaining Marketplace work includes approved operator verification/moderation, abuse/rate limits, pagination beyond bounded histories, authenticated hosted qualification and broader localization. Center approval and Academy-wide role/security repair are separate releases. Whole-platform payment, AI, exam/content and operational readiness remain open.
