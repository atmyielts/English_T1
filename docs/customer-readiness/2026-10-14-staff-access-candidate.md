# Staff access candidate, 2026-10-14

Candidate source in draft PR 248; no production database, Edge or Pages change
was made for this staff implementation. The shipped PR 250 ACL boundary is
separate and remains installed. Concurrent proctor source was not edited.

The old handlers saved a grant and operational profile in separate requests,
inferred authority from the presentation role and could leave independent
profile access after grant revocation. Editing an email also omitted the saved
identity; changing a role/status could discard a non-classroom scope or change
the precise expiry. Staff reads fetched a tenant-wide limited list.

## Candidate behavior

- Service-only commands validate current authenticated/public principals and
  each original manager grant. They cover existing and proposed scopes without
  promoting lower-role assignments. Canonical grant/profile, dated physical
  assignments, both audit streams and immutable actor/request receipts commit
  or roll back together. Target account binding is retained; creator attribution
  is preserved. Closed accounts cannot be reactivated by these commands.
- A managed profile has an explicit same-Academy grant link. It supplies an
  operational staff identity, never another independent source of authority.
  Legacy records are not guessed or backfilled. Converting or revoking an
  independent legacy pair requires authority over both existing envelopes.
- Managed branch grants intersect their declared branches with active dated
  assignments in each branch's timezone. Future, paused, ended, inactive or
  mismatched branches do not supply current authority. The actual loader keeps
  the original grant role/capabilities and attaches the operational staff ID.
- Staff directory filtering precedes pagination and checks the complete grant
  and legacy profile scope. Cursor pages preserve source and identity. Scoped
  administrators cannot use a narrow grant to inspect a wider legacy profile.
- Browser edits send the existing ID and explicit resources, preserve an
  unchanged expiry timestamp, and keep role changes separate from scope changes.
  Saves pin the account/token subject through refresh and response acceptance.
  An uncertain response retains the same request key for an unchanged retry.
  Account changes clear the editing form. Access resources are labelled, with
  Uzbek/Russian copy and phone/desktop coverage.

## Local evidence

- `npm run test:academy:staff-access`: five adapter cases, 68 PGlite database
  checks, six account/retry transport checks passed.
- `npm run test:academy:staff-access:native`: 82 native PostgreSQL/PostgREST
  checks passed. Includes both revocation lock orders, both target-account
  closure lock orders, ambiguous verified-email binding denial, delayed post-write expiry rollback, replay, namespace
  guards, legacy conversion, creator preservation, audit rollback and denied
  browser execution/raw receipt access. Verified owned containers were removed.
- Actual membership-loader harness: 23 checks, including canonical provenance,
  foreign binding, dated/paused branches and UTC/Tashkent midnight boundaries.
- Full Academy Edge suite passed before the final audit-label preservation;
  the affected staff suite and native suite passed afterward. Audit actions
  retain `staff.upserted` and `staff.removed` in both audit streams.
- Academy build/lint passed; localization covers 2,774 phrases in Uzbek/Russian.
  `verify:prod` and 822 `verify:academy` checks passed.
- Existing full browser run: 165 tests passed; the explicit startup benchmark
  was skipped. The newly added staff case initially failed test selectors; after
  correcting discovery of More tools and combobox labels, its focused desktop/
  390px run passed. The request preserved ID, classroom scope and exact expiry
  while changing role/email. Screenshots were inspected. Final protected CI
  must run the combined suite on the committed source.

## Gates still open

Do not activate this candidate as a complete staff release yet. Staff invitation
creation/resend/acceptance/revocation and legacy staff import/rollback still have
separate mutation paths. They need the same authority and atomic evidence rules.
Other legacy multi-resource reads/writes remain under review. Unknown-result
form changes and final account/permission refresh need rendered acceptance.

The isolated native fixture is not the complete installed production schema.
Qualify all nine pending authority/import/staff migrations with the fresh
captured schema, constraints, triggers, roles and runtime settings; then run
protected CI, tracked Pages deployment, selected migration activation and a
source-preserving Academy Edge release. Prove owned hosted workflows and fixture
cleanup before closing customer acceptance. No customer rows, messages or
payments were used in the candidate tests.
