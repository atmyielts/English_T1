# Assessment staff invitations

Status: the protected share-link journey is implemented and verified locally. The later [mail workflow](INVITATION_MAIL.md) now adds actual local SMTP handoff/receipts, scheduled reminders, bounded retries and explicit unknown-outcome replacement. **Hosted relay/inbox delivery, automated DSN/bounces and bulk invitation operations remain required.** Nothing was deployed, no real invitations were sent and no provider resource was changed. This work does not close the complete institution-administration requirement. Earlier mail-absent statements below record the share-link wave; current sending behavior and gates are in the mail runbook.

## Center and recipient workflow

In **Assessment Cloud → Staff & permissions → Staff invitations**, an authorized manager selects an immutable role version, recipient email, acceptance deadline (future, at most 30 days), optional role-access expiry and reason. They review the exact capabilities and acknowledge both expiry times. Creation does not grant membership or send email. History shows pending, expired, accepted and revoked invitations with bounded keyset pagination. The current limit is 500 unexpired pending invitations per institution; quota/billing integration and bulk operations remain required.

The original sender can recover a protected share link only while the invitation is pending/unexpired and they still have the authority to delegate its exact role and duration. Other managers may list/revoke invitations but cannot regenerate another sender's bearer link. Copying is an explicit user action. Revocation requires the current revision, a reason and a separate review confirmation. Accepted roles must instead be managed in the member-permission workflow.

The recipient opens the link and signs in using its **verified** Schood email. Ordinary Schood account/profile setup must already be complete; this service does not create or modify mother-platform accounts. The invitation review is available before institution/workspace discovery, so an entirely new Assessment staff member can accept. They see the center, exact role version/capabilities and both expiries, then explicitly acknowledge acceptance. This creates Assessment-only membership when needed and an exact pinned role assignment in one transaction. It never writes Academy/organization membership or grants Proctor rights. A subsequently revised role template cannot silently upgrade an invitation.

Submitted creation/revocation/acceptance commands use encrypted actor/institution/purpose-scoped IndexedDB intents and Web Locks. A lost committed reply survives reload and retries with the same command identity. Acceptance includes a hash of the reviewed immutable snapshot. An accepted receipt is historical evidence, not a restoration command: replay does not recreate a withdrawn role or reactivate suspended membership. Another invitation cannot bypass service/global suspension or silently replace an existing assignment for that role.

## Server boundary

Migration `20261020180000_assessment_invitations.sql` adds private invitation/command histories and four service-only RPCs: `assessment_invitation_read`, `assessment_invitation_command`, `assessment_invitation_preview` and `assessment_invitation_accept`. Acceptance rechecks the sender's current management/delegation/expiry authority and uses the canonical staff assignment command. Institution staff fences serialize acceptance/revocation/permission changes; candidate timed delivery is not placed behind this lock. Table/helper access is denied to browser roles.

`/assessment-cloud/invitations/` is an isolated namespace:

| Route | Behavior |
| --- | --- |
| `GET list?tenant_id=…&limit=50&after=…` | Current-manager-only history; limit 1–100, UUID keyset cursor |
| `POST commands?tenant_id=…` | `invite.create` / `invite.revoke`, stable `Idempotency-Key` |
| `POST link?tenant_id=…` | Current creator-authorized link recovery for `{id}` |
| `POST preview?tenant_id=…` | Verified recipient review for `{id,token}` |
| `POST accept?tenant_id=…` | Verified recipient acceptance for `{id,token,review_hash,acknowledged:true}`, stable key |

POST bodies use the existing `{action,data}` envelope. Actor and verified email come exclusively from Supabase Auth `getUser`; body email, actor, verification and permission claims are ignored. Verification requires a valid `email_confirmed_at`, not user metadata. Errors are bounded/sanitized, requests are streamed with a 40 KB limit and reads/replies are `no-store`. CORS allows exact configured origins only.

The server derives a purpose-separated HMAC-SHA256 bearer secret from a dedicated 32-byte key, institution and fixed invitation UUID. Only its SHA-256 digest enters canonical records/receipts. The raw token appears only in the authorized share response, recipient's URL fragment and encrypted submitted browser intent; never in query parameters or generic audit details. Fragments are not sent in HTTP requests/referrers. The fragment remains during sign-in/reload recovery and is cleared when the recipient continues after a confirmed acceptance; it is not a hidden/plaintext local-storage draft. Browser history, clipboard, extensions and shared-device hygiene remain operational privacy considerations.

Creation retries read the existing key ID before rebuilding their canonical request, so an active-key rotation after a lost committed reply preserves the original token/receipt. Keep old roots until all corresponding invitations expire/revoke and required recovery windows close. A missing original key fails link recovery closed; restore the root or explicitly revoke and replace, never silently change a pending link. Acceptance checks the stored digest and does not need to regenerate the original token.

## Configuration and release

Server configuration is in `supabase/functions/assessment-cloud/.env.example`: `ASSESSMENT_INVITATIONS_ENABLED=false`, `ASSESSMENT_APP_URL`, `ASSESSMENT_INVITATION_ACTIVE_KEY`, `ASSESSMENT_INVITATION_KEYS`. The app URL must be trusted HTTPS without credentials, query or fragment. HTTP loopback is permitted only by an explicit local-fixture constructor option, not the deployed entry point. Keyring values are base64url-encoded 32-byte random secrets, dedicated to invitations, never `VITE_*` values.

The Assessment app uses `VITE_ASSESSMENT_INVITATIONS_ENABLED=false`. Matching schema/API/app must be promoted together after exact-release CI and staged acceptance. Invalid/missing invitation configuration disables only this namespace. Both flags remain off by default. Follow [RELEASE_GATES.md](RELEASE_GATES.md); no deployment is implied by these local tests.

## Evidence

```powershell
deno test --no-lock supabase/functions/assessment-cloud/invitation-handler.test.ts supabase/functions/assessment-cloud/staff-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --invitations
node scripts/test-assessment-appeals-browser.mjs --staff
npm run build --workspace assessment-cloud
deno check supabase/functions/assessment-cloud/index.ts
node scripts/verify-assessment-boundaries.mjs
```

Seven invitation API/signer/repository tests and four staff API tests pass. The 28-migration integration suite and concurrent races pass: pinned rights/review hash, wrong token/email/institution, accepted-identity binding, no silent template upgrade, suspension/withdrawal replay, sender authority removal, immutable/private history, duplicate create/accept and acceptance-versus-revocation with no orphan membership/assignment.

The actual app → production handlers/repositories → isolated PostgreSQL browser journey passes without browser API interception: lost creation reply plus active-key rotation, encrypted reload/retry, wrong verified account, unverified account, recipient review/acceptance before membership, lost acceptance reply/reload/retry, new workspace discovery, real bank creation, second invitation revocation/denial and five widths (1440/1024/768/390/320). Canonical proof: two invitations, one accepted, one revoked, one acceptance audit, one assignment, one Assessment membership, **zero organization memberships**, unchanged organization rows/scores, no management/Proctor permission and one invitee-authored bank. Identity, PostgREST framing and minimal historical schema are explicit adapters; actual hosted Auth/mail, full historical-schema acceptance, manual accessibility/localization and capacity are not proven. Screenshots are under `output/playwright/invitations`.

The service CI includes API/SQL/concurrency and actual invitation-browser gates with screenshot artifacts. This is source configuration, not a claim that remote CI ran. Full email delivery/recovery/abuse controls, rate quotas, lifecycle notifications/offboarding, department/resource scopes, bulk administration, hosted security/privacy/retention/restore/legal/capacity and the rest of the [full service ledger](IMPLEMENTATION.md) remain mandatory.
