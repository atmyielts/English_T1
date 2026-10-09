# Shared admin security release candidate

Base: reviewed Marketplace merge 21064f81f5c693f7c1c7b965f28345338c166690. Qualify that independent deployment before any admin release. This is a local candidate; no admin backend has been deployed.

The shared admin admission helper did not check account suspension, overrode the saved MFA requirement, allowed requests when rate-limit checks failed, and ignored failed admission-audit writes. The settings API and editor also forced MFA off on ordinary saves. The bootstrap endpoint reported a different policy from the database and hid security-check outages behind a null policy.

The candidate requires an active account and a readable, structurally valid saved policy. It respects the saved MFA flag using the exact Auth-verified token's matching subject and AAL2. Permissions, rate-limit receipts and admission audit failures refuse privileged access with a 503 response and no internal provider details. Existing exhausted limits return 429. No-store headers protect refusal responses. The success audit records admission to a route; it does not prove that a later domain write committed.

Settings reads show the actual policy. Ordinary writes exclude the MFA field; an old tab cannot downgrade the policy. Changing that flag requires a separately qualified administrator enrollment/recovery process. The public bootstrap shares policy/permission parsing, refuses suspended accounts and returns retryable security outages. AAL1 admins retain bootstrap access for authenticator enrollment; privileged APIs still enforce AAL2 whenever required by the stored policy.

The portal directs required AAL1 sessions to the existing authenticator page. It ignores late access replies after account changes, preserves same-account mounted forms during ordinary token refresh, and shows explicit retry screens for access or initial settings outages. Server-only settings clients no longer start Auth auto-refresh intervals per request.

A read-only production check at 2026-10-09T11:29:56.291Z confirmed require_mfa=false, a 30-minute configured timeout, 120 requests per minute and zero IP allowlist entries. No policy was changed. An earlier migration deliberately disabled mandatory MFA; this candidate does not turn it on implicitly.

Local evidence:

- 40 in-memory admission cases exercise active accounts, saved MFA off/on, matching verified subject/AAL, service throws and errors, malformed policies/receipts, effective permissions and configured IP matching. These do not establish identity-provider behavior or trusted IP header provenance.
- 10 actual settings/bootstrap HTTP handler steps with intercepted transport exercise saved policy preservation, old-tab downgrade refusal, AAL1 refusal, suspension, policy outage and admission-audit failure. No provider or customer services are contacted.
- 5 synthetic-API browser cases verify MFA routing, actual policy display, safe save payloads, retained session and retry recovery.
- Existing Guide HTTP contracts pass after representative active-account/policy fixtures were supplied. All 24 shared consumer entry points typecheck. The final platform TypeScript/Vite build and production/release verification pass. Existing large-bundle and Browserslist warnings remain.

Release scope: platform, me, platform-settings and 24 named shared consumers in the manifest (Guide's only direct diff is its test fixture). Full exact-head CI and tracked frontend release precede backend rollout. Compare each current gateway flag and deployed source with the reviewed commit; retain the saved policy. Use exclusive temporary QA actors and independently verify cleanup. Never deploy every function merely because a shared file changed.

Remaining admin work: server-side idle-session leases; fully qualified MFA setup, recovery and policy activation; trusted IP provenance and IPv6 restrictions; transactional permission/revocation binding to each domain command; append-only committed-operation auditing; browser/table/RPC grants; bounded service timeouts; broader account-switch, role and responsive coverage. Source typechecks and mocked cases do not prove all 24 hosted consumers safe. No broad admin-ready claim is made.
