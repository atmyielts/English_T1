# Student spreadsheet migration

The complete requested flow imports name, student phone, parent phone, group,
opening balance and join date from CSV/XLSX in one reviewed operation. A file
parser alone does not complete this capability. This branch is a local draft;
no importer changes have been deployed.

The prior flow has one staging request per row, concurrently recomputes job
counts, and can expose `ready` before the complete file arrives. Reads have no
explicit page range and can hit the provider's default row cap. Commit writes
records separately from effect evidence; a late evidence failure can leave a
record that the reported rollback cannot recover. Duplicate checks cannot
replace transaction locks and immutable request identities.

## Required final behavior

- File parsing preserves Russian/Uzbek headings, quoted separators/newlines,
  phone strings and Excel calendar dates. Malformed quotes, surplus values,
  duplicate headings, unsafe values and unsupported money/date formats produce
  explicit errors rather than silently changing data.
- A branch is selected from server-owned access bounds before reference reads.
  Group names resolve only in that Academy/branch; ambiguous names require an
  explicit choice. Optional missing-group creation requires classroom-management
  permission and appears in preview. No imported row can choose another branch.
- Column mapping is applied on the server to selected source values. Caller
  supplied validation flags, contact links, amounts or capabilities are ignored.
  Only relevant mapped columns are retained; unrelated spreadsheet columns are
  not copied into the database.
- Stage bounded chunks with a stable upload/configuration identity and immutable
  row identities. Seal only after every expected row is present and counted;
  validate the sealed file before commit. No commit is available for a partial upload. Duplicate rows within
  the file and existing-person matches are visible; ambiguity is never guessed.
- Reception can stage/register students within its branch. Staff/role imports
  require staff-management authority. Opening balances require finance approval.
  A non-finance uploader can prepare provided balances, but cannot post them or
  inspect another actor's finance-only job. Keep legacy import permission and
  recovery surfaces in the hardening scope.
- A confirmed commit creates contacts, unverified parent contacts/pending
  relationships, group memberships and opening ledger entries atomically with
  receipts, effects and audit evidence. A failure rolls back every business write.
  A retry returns the original receipt; concurrent duplicate commits do not
  create another contact or balance.
- Parent phone alone does not establish verified identity, guardianship consent,
  financial responsibility or permission to send messages. Import creates no
  invitations or outbound messages and grants no AI add-on or paid-product access.
- The receivable ledger retains its existing sign convention: positive is debt,
  negative is prepaid credit. The wizard explicitly asks whether the source sheet
  uses positive credit or positive debt, previews the result per currency and
  uses exact supported integer currency units. It never truncates decimals or
  combines currencies. Existing-student balances require separate reconciliation;
  importing a file is not proof of a new collected payment.
- Recovery appends compensating ledger entries and preserves immutable evidence.
  It cannot erase a student's later payment, grades, attendance or changes.
  Partially applied legacy jobs require explicit reconciliation rather than an
  automatic replay that guesses which records already exist.

## Qualification

Use local isolated/native PostgreSQL, the complete schema-only capture and
independent connections for duplicate-commit/late-failure/concurrent-change
cases. Include all 5,000 supported rows, scope boundaries, parent-consent denial,
money signs, changed-request keys and reference changes between preview/commit.
Measure a 200+ student file with contacts/parent/group/balance effects.

Release only after full route/locale/keyboard/mobile and exact-head checks,
source-preserving installed backend qualification, an isolated reviewed migration
dry run and owned signed-in published workflow/cleanup proof. Production is the
only environment; customer data is not a test fixture. Larger asynchronous jobs
and measured authenticated loading remain part of the broader readiness scope.

## Current draft evidence (12 October 2026)

`npm run test:academy:import` exercises the shared file parser, server input and
authority decoder, SQL upload protocol, exact row normalization and reference
preview. `npm run test:academy:import:native` uses fresh PostgreSQL 17 containers
without host ports, mounted files, customer rows or hosted credentials. Its
staging test uses independent connections for concurrent creation/chunks and
checks all 5,000 supported rows, incomplete seals, immutable retries, malformed
scope arrays and browser-role denials. Each fixture is removed with its own
anonymous volume after verifying its ownership label.

The preview resolves identities and groups server-side, reports ambiguous phone
or email matches, rejects other-branch and inactive targets, measures all planned
memberships against capacity, and retains paused membership and revoked parent
consent boundaries. Opening balances use exact integer strings, explicit source
signs, the configured Academy currency, and a finance-approval requirement.
Existing student balances require reconciliation. A repeated preview recalculates
reference errors and its content hash. A preview changes only the import's own
staging records; it creates no customer, guardian, membership or payment.

These are local draft checks. Atomic commit/effect evidence, recovery, API
integration, the complete wizard, legacy importer fixes, complete installed
schema qualification and signed-in published qualification remain unfinished.
No importer migration or endpoint has been deployed.
