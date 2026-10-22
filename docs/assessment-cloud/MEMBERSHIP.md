# Assessment-only staff membership and access lifecycle

Status: locally implemented; no deployment/provider mutation. The later [invitation workflow](INVITATIONS.md) now proves protected creation/recovery/revocation and verified-recipient acceptance into service-only membership. **Mail delivery and the broader institution lifecycle remain required.** The original membership/suspension tests below retain explicit enrolled fixtures; they are separate from the new actual invitation-acceptance browser journey.

## Institution behavior

An Assessment-only staff member can discover the institution in Assessment Cloud and exercise explicitly assigned Assessment roles without joining the mother platform/Academy organization directory. Membership alone grants no permissions. Existing active organization members remain compatible with their current explicit grants and inherited owner/admin authority.

In **Staff & permissions → Review member permissions → Assessment staff access**, another authorized manager can suspend/resume a non-owner member using a reason, explicit review and the current membership revision. Submitted requests use the existing actor/tenant-scoped encrypted command journal; a lost committed reply can recover after reload without a second mutation/audit. Missing migration metadata disables these controls instead of guessing a revision. Successful access changes move keyboard focus back to the member heading; denied writes clear the private staff workspace.

Suspension pauses Assessment staff capabilities, including the legacy grading-management alias. It retains assignment/history records; explicit resumption restores only still-valid, unexpired grants/roles. This is not permanent offboarding: withdraw unwanted grants/assignments separately. It does not change Academy/organization membership, Proctor rights, candidate registrations/responses or academic scores. Organization owners/admins and manager self-changes remain protected. An inactive organization membership cannot be bypassed with an Assessment-local row or local resumption.

## Authority and isolation

Migration `20261020170500_assessment_memberships.sql` adds private `assessment_memberships`, a server-only merged staff directory, revision/audit guards, staff command extensions and `assessment_workspaces`. Existing function OIDs/RLS dependencies are preserved. Exact source guards extend existing role/delegation/expiry/replay logic instead of replacing its permission rules.

Assessment-local membership cannot satisfy Proctor membership/permission eligibility. Existing shared organization members retain their existing Proctor authority when their Assessment access is suspended. Neither membership creation nor suspension writes `tenant_memberships` or other Academy-owned data.

`member.suspend` and `member.resume` use the existing `/staff/commands` API and canonical command receipts. The API derives the actor from authentication and reconstructs only `user_id`, `expected_revision` and the reason; supplied actor/tenant/product/role flags are ignored. Private helpers/tables/views are not browser-callable. Reads and staff responses are not publicly cacheable.

Human authoring, grading and prompt-library mutation entry points share the staff-authority fence with membership/delegation changes. Authoring checks current capability before replaying cached receipts. Physical actor membership/grant/assignment locks supplement the transaction advisory lock. Candidate response, submission and timed-delivery paths are not placed behind that institution-wide staff lock. This is scoped correctness evidence, not a capacity certification.

Workspace discovery now calls a private actor-bound RPC rather than reading only the organization membership table. **Deploy migration and matching Assessment API as a compatible unit.** Older hosted schemas do not expose that RPC. The source repository remains dirty with another agent's changes; no release branch/push is implied by local validation.

## Local verification

```powershell
node scripts/test-assessment-db.mjs
deno test --no-lock supabase/functions/assessment-cloud/staff-handler.test.ts
node scripts/test-assessment-appeals-browser.mjs --staff
npm --workspace apps/assessment-cloud run build
node scripts/verify-assessment-boundaries.mjs
```

The full 27-migration integration suite covers local membership with no default grants, explicit role assignment, workspace discovery/removal, suspension/resumption/replay/stale revisions, immutable history, inactive-organization fences, private privileges, cached authoring-receipt denial and preservation of organization/Proctor state. Four-process tests prove identical suspension replay, a single winning competing resume, and authoring/suspension ordering with no post-suspension bank writes or Academy membership creation.

The actual institution app/handlers/repositories/PostgreSQL browser journey proves lost suspension receipt/reload/retry, explicit resumption, five-width controls, an Assessment-only author's workspace discovery and actual bank creation, two suspensions/one resumption, zero organization memberships for that author, unchanged organization rows/academic scores and preserved Proctor authority for the shared examiner. Identity/PostgREST framing/minimal historical schema and initial local enrollment remain explicit fixtures. Hosted authentication/providers, the complete historical schema and manual screen-reader/localization acceptance are not proven.

The connected QTI browser/real AV/parser-to-draft regression and ordinary prompt-media/image-response institution→candidate→grading acceptance also pass with all 27 migrations. The latter retains two independently approved image questions, one attempt, six response-history entries and deterministic 1/1 grades. These checks do not upgrade hosted identity, historical-schema or full-service readiness claims.

CI includes the SQL/authority, API and connected staff browser checks, but exact-release remote CI has not been run. Nothing was deployed.

## Required continuation

Complete hosted relay/inbox/DSN/bounce/suppression and bulk operations beyond the local SMTP/reminder/recovery workflow in [INVITATION_MAIL.md](INVITATION_MAIL.md) and protected invitation acceptance in [INVITATIONS.md](INVITATIONS.md). Add full suspension/offboarding/assignment/reassignment/notifications policy, department/resource scopes, complete roster identity lifecycle and hosted operational/privacy/security/retention/restore/capacity acceptance. The complete [implementation ledger](IMPLEMENTATION.md) remains mandatory; this work does not close its institution-administration row.
