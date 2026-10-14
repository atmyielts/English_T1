# Staff invitation candidate, 2026-10-14

This is draft PR 248 candidate source. No migration, Edge function, Pages change
or email delivery was activated for these invitation changes. Provider calls in
tests are doubles addressed only to owned fixture domains.

The old invitation path reset existing grant status and could replace its role,
scope, accepted timestamp and creator during resend. Acceptance bound the grant,
profile and invitation in separate writes. Withdrawing a pending invitation left
its prepared grant/profile accessible. Staff invitation lists fetched a broad
limited list, and direct table/column grants exposed an alternate read path.

## Candidate behavior

- Preparation reuses the atomic staff command and explicit same-Academy grant
  provenance. Resending retains the current role, resources, dates, binding and
  original creator; changing existing roles/resources requires the staff editor.
  Canonical profile, grant, invitation, audit and request receipts commit together.
- Acceptance and matching-email login autoacceptance bind the verified current
  Auth/public principal and both institutional records atomically. Another
  account cannot take over a bound record. Revoked, suspended, expired and future
  grants cannot activate. Exact legacy profile/grant pairs can retain provenance;
  conflicting legacy pairs require administrator review. Autoacceptance also
  reconciles pending invitations, so resend cannot undo accepted access.
- Withdrawing pending unaccepted access closes its invited grant and profile in
  the same transaction. Independently-approved active or subsequently changed
  grants retain their separate access; accepted staff access is managed through
  the staff editor. Acceptance and revocation serialize in both lock orders.
- Delivery claims a two-minute ticket before provider IO. Same-token sent or
  leased attempts do not send again. Completion uses the exact actor, token hash
  and attempt; immutable claim/completion receipts survive rotation/withdrawal
  and preserve superseded provider evidence. Contradictory completion is rejected.
  An unconfirmed provider result preserves the same acceptance token for retry.
  This is retry-safe access and delivery evidence, not an exactly-once guarantee
  from the email provider or proof of inbox delivery.
- Staff invitation visibility checks each original manager source and the full
  canonical/legacy envelope before bounded cursor pagination. Responses exclude
  hashes, internal delivery tickets and raw metadata. Browser table and inherited
  column privileges are revoked; the service path remains available.
- Browser requests pin the visible account, preserve request and delivery-token
  identity after an uncertain result and show a delivery-pending error rather
  than claiming that an email was sent. Account changes remount the service desk.
  Versioned command aliases make an older backend reject the requested mutations
  rather than silently ignore new scope fields during the Pages-first rollout.

## Evidence

- Five adapter tests cover actor/field pinning, prepare-before-send, secret and
  namespace response guards, sent/leased replay, provider uncertainty and recipient
  identity. Email delivery is mocked; no real customer message was sent.
- Native PostgreSQL/PostgREST combined staff/invitation suite: 149 checks passed.
  Includes actor/scope guards, protected receipts, both account-closure and grant
  revocation lock orders, acceptance versus withdrawal in both lock orders,
  confirmed-email conflicts, token rotation/expiry, historical profile review,
  audit rollback, source-filtered pagination and inherited table/column denial.
  Verified owned native containers were removed.
- PGlite combined suite: 128 checks passed. Actual loader harness: 23 checks.
  Pinned-account/retry client harness: ten checks, including versioned routes and
  unchanged delivery identity after a pending response.
- Complete Academy Edge suite passed before the final historical-profile cases;
  the affected native/PGlite suites passed after them. Full existing browser suite:
  166 passed, one explicitly skipped startup benchmark. Added invitation retry case passed after opening its actual Access lane and form;
  it preserves both request key and delivery token and never claims unconfirmed
  email as sent. Final committed-head CI remains a separate gate.
- Dispatch repair commit `71a45d46c0c12a6c519c7f3cc0ec343329c19e1d` passed all
  protected CI jobs in run `38536280212`. It does not qualify later candidate code.

## Remaining release gates

Student/guardian invitation writes and their reference/read scopes still use
legacy paths. Staff invitation cursor data is available in the private gateway;
the service desk's older-history pagination still needs final UI acceptance.
Legacy staff import/rollback remains an alternate mutation path. Complete those
and the remaining legacy multi-resource authority/recovery work before activation.

The native fixture is isolated and does not prove every installed constraint,
trigger, dependency or role. Qualify all ten pending migrations and the final
source-preserving Academy Edge bundle against a fresh complete installed-schema
capture, then protected CI, tracked deployment and owned hosted acceptance with
verified fixture cleanup. Preserve concurrent proctor changes. This candidate
does not close the full service, design or customer-readiness objective.

Academy build/lint, 2,785 Uzbek/Russian phrases, 822 readiness checks and 174
source smoke checks passed. These checks do not substitute for installed-schema
or provider/customer proof.
