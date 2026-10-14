# Staff import and customer wording candidate

Candidate in PR 248. Frontend-only wording/layout is separated in PR 251. No production migrations or Edge changes were activated
for this batch.

## Behavior

- A staff row uses the same current-authority command as the staff editor.
  Grant, managed profile, source finalization, immutable effect, audit and
  request receipt commit together. Exact-source changes and evidence failures
  roll the whole row back.
- Existing staff retain their role, scope, binding and attribution. Conflicting
  historical grant/profile pairs need explicit review. Historical spreadsheet
  active-status text is normalized without rewriting retained source.
- Commit and recovery process at most 25 pending rows/effects per request.
  Counts come from persisted rows and effects. Reload/retry resumes remaining
  work; completed recovery cannot be reset by an import retry.
- Recovery retains both records. An unchanged, unused new staff pair is
  logically deactivated together. A safe update restores name/status only.
  Changed, used, referenced or incomplete historical records require review.
- The source/effect guard permits the preceding Edge version's exact
  effect-before-row finalization, while refusing later source rewriting or
  deletion. All eight legacy import types retain their existing route behavior;
  this does not qualify the other seven types' transactional recovery.
- New staff import clients use a versioned command alias. An old backend
  refuses the new semantics before writing. The client pins the displayed
  actor through session refresh and completion and validates the returned job.
- Academy imports, follow-ups and payments use task language in English,
  Uzbek and Russian. The row results omit raw IDs and JSON. Section buttons
  have visible selection/focus and 44px targets; phone import history uses
  labeled rows with actions onscreen. Styles use existing brand tokens.

## Local evidence

- Owned native PostgreSQL/PostgREST qualification: 214 checks with staff,
  invitations and legacy staff import enabled; verified helper cleanup. Includes
  both reviewed-source edit/commit lock orders, audit rollback, safe restoration,
  reference/use retention, preserved completed history, RPC denial and exact
  preceding-version finalization. Production was not touched.
- PGlite legacy staff suite: 127 checks. Adapter: five tests; actual-handler
  harness: 30 checks; pinned-client harness: 12 checks.
- Complete Academy Edge suite passed. Academy build/lint, verify:prod,
  eleven-migration manifest, 822 readiness checks and 174 source smoke checks
  passed. Wording-related source checks were updated to the displayed labels;
  no checks were removed.
- Browser fixtures prove partial save/continue, confirmed completion and
  retained recovery messaging at desktop and phone sizes. This is mocked API
  evidence; real persistence is qualified separately above. The full browser run
  recorded 167 passes, one skipped startup benchmark and one failed 390px billing
  check. The isolated billing matrix subsequently passed at all four widths;
  final protected CI is still required. The staff batch test separately passed
  with actions onscreen at 320/768/1024/1440px.

## Remaining release gates

Captured installed-schema qualification, current deployed source reconciliation,
student/guardian invitations, other legacy multi-resource authority and the
other seven legacy import types' atomic recovery/history remain open. PR 248
stays draft until these gates and owned hosted API/browser acceptance are
qualified. The twelve requested Academy additions and all-service visual,
performance and provider acceptance remain governed by finish-checklist.md;
this batch does not declare those items complete.
