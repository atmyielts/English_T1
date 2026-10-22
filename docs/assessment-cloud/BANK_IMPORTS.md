# Question-bank import and protected export

Institution authors can upload existing questions, correct diagnostics, stage an immutable review manifest, inspect protected questions/keys and create draft questions in bounded batches. This adds an institution workflow inside the separate Assessment Cloud application; it does not modify Academy or the mother application.

## Formats

- UTF-8 CSV with BOM, CRLF/LF, quoted commas/quotes and multiline cells. `Download CSV template` provides the recognized header/example. Required columns are `type,locale,prompt,max_score`. Optional fields are `option_a` through `option_d`, `correct_answers`, `numeric_value`, `numeric_tolerance`, `case_sensitive`, `partial_credit`, `tags`, `rubric_id`.
- CSV types: single/multiple choice, true/false, ordering, short answer, numeric and essay. Option identifiers are `a`–`d`; `correct_answers` separates identifiers or accepted answers with `|`. Ordering lists every option in order. Numeric value and nonnegative tolerance are mandatory for numeric rows. Booleans are exactly `true`/`false` or blank (false). Tags use `|`. Essay requires an existing institution rubric. Use structured JSON when literal separators, more options or mapped/other response types are needed.
- Lossless structured JSON: `{ "schema_version": "assessment.bank.v1", "rows": [{ "item": <assessment.item.v1>, "key": <answer key> }] }`. It accepts existing item contracts, including mapped types and institution-owned ready media/rubric references. Unknown fields, spoofed approvals and executable properties are reconstructed away. Export emits only validated item/key contracts, not identity, approval, audit, score or storage credentials. This is **Schood interchange, not QTI certification**.

Each file is limited to 4 MB and 2,000 questions (HTTP envelope 6 MB). Larger banks use multiple reviewed imports; these limits bound interactive validation, not the institution's total bank. Record/cell/column limits protect parsing. Files are never executed and no spreadsheet formulas/external links are evaluated. The only CSV download is the static safe template; protected content export is JSON, not a formula-capable spreadsheet.

## Review and authority

Both `banks.read` and `items.write` are required for private manifests, keys, exports, mutations and cached receipts. The sixteenth migration, `20261019100000_assessment_bank_imports.sql`, creates private jobs/rows/command receipts with immutable manifests and terminal outcomes. Original source bytes have a SHA-256 digest. Normalized item/key fingerprints identify duplicate entries **within the uploaded file**; broader existing-bank semantic/provenance/license deduplication is still required. Duplicate warnings require human acknowledgement and do not silently discard questions.

The Edge handler validates every contract and scoring key; one invalid entry prevents staging the entire file. Database staging verifies the bank and referenced institution rubric/ready media. The database computes a review hash over the destination bank, source digest and complete normalized rows. Filename and source provenance stay private. Uploading identical bytes into the same bank recovers the original job instead of duplicating it. There is no “force repeat” override for a cancelled source; revised content must be freshly staged.

`confirm` pins a current authorized human and requires the reviewed hash, revision and reason. Each explicit `step` creates at most 50 canonical question drafts atomically. It never submits, approves or publishes them; existing independent review/publication remains mandatory. Stable command identities and immutable per-row version receipts make lost-reply retry safe. If a batch fails, it rolls back and stays actionable; already completed batches remain intact. Media readiness is checked again at canonical version insertion.

Another author cannot silently process someone else's job: they must explicitly review/adopt it. Every batch checks current permissions before cached receipt replay. Cancellation marks only unprocessed rows cancelled and preserves existing drafts. Browser closure stops interactive processing; the institution reopens the durable job and continues. This implementation is not an autonomous background import worker.

Submitted intents are encrypted in actor/institution-scoped device storage and retried under Web Locks. A pending uncertain request blocks conflicting actions. Server errors and permission loss cannot produce optimistic “imported” counts. Current denials remove private material; account/institution unmount fences pending read/export completion. Device encryption has the same same-origin/shared-device limitations described in the main implementation record.

## Post-approval refresh recovery

Post-approval refresh recovery is now exercised with a deliberately failed read after an actual committed independent approval. The Assessment shell keeps previously confirmed records through network-only refresh failure, narrows cached resources after fresh capability discovery and clears private data on current denial/session change, including denials arriving after another parallel read failed. The UI distinguishes recorded changes from failed refreshes and supports an explicit refresh without repeating approval. A canonical command receipt clears the pending-request label independently of later read completion. Transport adapters use persistent service-role PostgreSQL sessions; this is not hosted latency/capacity proof.

## Protected export

`GET /assessment-cloud/imports/export?bank_id=...` returns at most 100 latest item/key pairs with item-ID cursor and a server timestamp cutoff. The UI downloads one structured bank JSON after obtaining all pages, checking current actor and authority per request. This is timestamp-bounded pagination, **not a materialized PostgreSQL MVCC export snapshot**: concurrent transactions with an earlier creation timestamp may become visible between pages. Materialized export manifests, large-bank streaming artifacts and asset/rubric package remapping remain required. Media/rubric UUIDs are references within their owning institution, not cross-institution transfer rights.

## API and verification

Routes are `/imports/jobs`, `/imports/jobs/<id>`, `/imports/export` and `/imports/commands`. Commands: `stage` accepts file text/format/destination; `confirm` accepts reviewed ID/revision/hash/reason; `step` accepts ID/revision only; `cancel` accepts ID/revision/reason. Reads use bounded pagination (maximum 100); job rows use immutable record-number cursors, while current job history uses bounded offset pages. All responses are no-store and origin/identity guarded. Raw tables/RPC execution are unavailable to browser roles.

Run:

```powershell
deno test --no-lock packages/assessment-core/src/bank-import.test.ts supabase/functions/assessment-cloud/import-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --imports
```

Local acceptance uses actual UI/handlers/repository mappings, disposable PostgreSQL and synthetic identity. It tests invalid CSV feedback, a 60-question manifest, lost staged/committed-batch replies with reload recovery, 50+10 creation, revoked-author teardown, explicit independent adoption, actual protected JSON download/re-upload validation, unchanged scores, keyboard acknowledgement and five responsive widths. It then follows the real “Open question drafts for review” handoff, submits one original author's imported draft, inspects its private key and explicitly approves it as an independent human through the existing question-review UI/handler/PostgreSQL authority. Final proof is 60 created questions: 59 still drafts and one independently approved, with no score changes. SQL adds stale-revision/hash checks, private-key denial, source deduplication, bounded review/export paging, immutable manifests, cancellation after partial progress and four-process stage/confirm/batch races. This does not prove hosted acceptance or the full import/export subsystem.

Still required: DOCX/PDF/XLSX and QTI import/export, arbitrary column mapping, licensed/shared banks, rich provenance and content QA, cross-bank/semantic duplicate resolution, AI-assisted extraction with human review, media/rubric package remapping, materialized/streamed exports, per-row correction/selection policies, unattended background work, complete localization/manual accessibility, hosted security/operations and capacity acceptance.
