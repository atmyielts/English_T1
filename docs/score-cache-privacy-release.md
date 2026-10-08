# Prediction cache privacy

The original cache service-write policy has no role restriction and applies to all operations. Its grants allow browser roles to read and change cached learner predictions. A production anonymous HEAD request with limit0 returned200; no customer rows were read or changed. Native PostgreSQL reproduces unauthorized synthetic access before the repair.

The isolated migration removes the permissive policy and revokes table and independent column privileges from PUBLIC, anon and authenticated. Existing records, columns and owner policy are retained. Service-role SELECT/INSERT/UPDATE/DELETE remain available; the downloaded production Edge handler matches the unchanged source and uses that role. A two-second lock timeout and ten-second statement timeout prevent indefinite disruption; failure rolls back atomically.

Fourteen actual PostgreSQL cases pass: original exposure, independent busy-table timeout/rollback, both browser roles denied five operations each, compatible backend CRUD and repeatability with retained records. The root test command runs this matrix in required CI. It uses the repository's pinned PostgreSQL17.5 image in an owned disposable container with no network, mounts or host ports. The container was removed. This is targeted native table qualification; a full Supabase stack reset was not run.

Normal PR, exact-head full CI and tracked Pages precede the manual migration. Verify production ref bbjawctnqrufvnesdsel and require dry-run to list only20261008183000_score_prediction_cache_privacy.sql. Then apply with supabase db push --linked and verify migration history. Run scripts/score-cache-privacy-production-smoke.mjs --live against one exclusively owned QA row; it checks real permission denials, backend CRUD, retained data and independent cleanup/logout. The script refuses to create a fixture while the public cache is still readable.

This does not fix the prediction API's incompatible outcomes query, provide calibrated score forecasts, or qualify the other Marketplace/Peer Review/Academy policies. Those remain separate readiness work. Do not restore public cache access as a rollback.
