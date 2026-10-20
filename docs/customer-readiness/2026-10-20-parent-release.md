# Parent privacy and portal repair

Candidate release, not deployed. This extracts urgent parent fixes from draft
PR 248 without activating its importer, staff or invitation migrations.

The portal previously ignored consent expiry, mixed sibling request histories,
exposed debt without debt permission, queried nonexistent announcement columns
and displayed feedback JSON as an object. It loaded complete histories for every
child. Legacy Telegram links trusted typed IDs and could replace an existing
account binding or restore stopped consent.

This release puts legacy and new parent reads behind current database consent,
independent domain permissions and the selected child. Draft/future learning
material, staff notes and provider errors stay private. Selected history loads
once, while child descriptors paginate. Large amounts remain exact, missing
balances stay unknown and the next lesson excludes past/cancelled sessions.
Telegram claims require fresh signed identity and an explicit confirmation.
Existing user bindings and relationship target identities cannot be overwritten.
Private browser table and column grants are removed; service access remains.

Parents see the shared compact mint/forest layout and invitation instructions
instead of technical Telegram ID fields. Sign-in remains in mother Schood.

Local evidence:

- The two migrations install independently on a fresh 413-table production
  schema-only capture under the captured roles and extensions. No customer rows
  are loaded. Fifty-seven parent canary checks pass; independent connections prove
  consent revocation in both orders, account closure and expiry after a lock wait.
  Owned containers/volumes were removed. Source identities and limits are in
  `2026-10-20-parent-isolated-schema.json`.
- Eight adapter tests, 18 executions of the actual gateway dispatch, ten child
  pagination checks and 28 account-pinned transport checks pass. The transport
  rejects changed accounts before sending and before displaying a response;
  refresh retries retain the original account.
- Academy build, localization, product checks and built-product smoke pass.
  Full Edge/browser suites and exact-head protected CI are required before merge.
- The installed Academy source was captured read-only at version 82. The bundle
  preparation script verifies current provider identity and all captured hashes,
  preserves unrelated modules and reconstructs the original gateway by reversing
  only the reviewed parent edits. A prepared bundle and hosted acceptance remain
  required; a source capture is not a deployment.

Activate only the two manifest migrations and the qualified parent overlay on
the current installed Academy source. Never deploy the whole dirty checkout,
replace unrelated/proctor modules or install the other pending migrations.
Keep the existing published bundle for recovery. Telegram uses the existing
`ACADEMY_TELEGRAM_BOT_TOKEN` and fails closed if it is missing.

Open work stays explicit: general email invitations remain in the larger atomic
invitation candidate, parent write transactions and notification dispatch still
need current-consent qualification, bounded histories need full pagination, and
real Telegram/Click provider behavior and owned hosted cleanup need proof. This
release does not close the twelve Academy additions or the all-service audit.
