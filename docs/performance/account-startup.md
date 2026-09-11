# Account startup performance

Date: 2026-09-05. Baseline: deployed commit `781d8d5b7dcef8dc87520ffde8da6118b89f7fc5`.
Implementation branch: `codex/account-startup-speed`.

## Changes

- Platform restores account identity from the Supabase session immediately. Catalog loading, profile loading, effective product access, and the optional center-office lookup run independently. Profile and access results populate their own UI as soon as available. A catalog failure no longer prevents session restoration.
- Auth events update the landing page, duplicate events for the same token are ignored, and responses from an older account cannot overwrite the active account's landing-page data. Token refresh keeps existing account data visible during the refresh.
- Academy's service root dispatches a restored session directly to workspace entry without requesting `/me` first. Workspace profile, academy access, and student access start together. The existing role and academy selection rules still choose the destination.
- Academy deduplicates profile reads during navigation with a 15-second, in-memory cache keyed by the access token. Sign-out and user updates invalidate it. Explicit entry refresh bypasses it. No profile, permissions, or access tokens are added to persistent storage; backend authorization remains authoritative.
- `/me` authenticates first, then loads profile and memberships concurrently. Tenant details and entitlements also load concurrently after the current tenant has been selected. The response contract, user-scoped RLS, entitlement filtering, admin policy behavior, and error responses are preserved.

No additional loading screen or skeleton was introduced.

## Controlled browser measurements

These are **local browser measurements against mocked APIs**, not production SLAs or measurements from a real signed-in production account. Baseline and changed code used the same browser fixtures and fixed per-request delays. One initial navigation was used as warm-up; the table averages the next two full reloads. Timing includes local app startup, network simulation, and rendering. The backend query optimization is tested separately and is not included in these mocked API timings.

| User-visible result | Baseline | Changed | Reduction |
| --- | ---: | ---: | ---: |
| Platform account controls | 2,650 ms | 607 ms | 77% |
| Platform subscribed services | 2,653 ms | 1,491 ms | 44% |
| Academy owner workspace | 2,928 ms | 1,398 ms | 52% |
| Academy profile requests per entry | 2 | 1 | 50% |

Platform fixture delays: catalog 600 ms, profile 800 ms, effective access 800 ms, center office 1,200 ms. Academy fixture delays: profile 700 ms, academy access 800 ms, student access 800 ms. The Academy benchmark uses an account with one staff workspace and no student workspace, and waits for the rendered owner home.

Raw logs are in `output/playwright/startup-speed/`. Reproduce against baseline and changed checkouts using PowerShell:

```powershell
$env:STARTUP_BENCHMARK = '1'
npm --workspace apps/platform exec -- playwright test -c playwright.config.ts student-center.spec.ts -g 'startup latency benchmark'
npm --workspace apps/academy exec -- playwright test -c playwright.config.ts -g 'startup latency benchmark'
```

The benchmark cases are skipped during ordinary regression runs. Baseline runs use the same benchmark test files with unchanged baseline application code.

## Verification

- Academy browser suite: 65 passed, including role boundaries, student and teacher flows, responsive layouts, and translations.
- Platform browser suite: 45 passed; the explicit benchmark case was skipped.
- Focused final browser checks passed after the error-reporting and explicit-refresh adjustments.
- Account handler tests: 4 passed. Tests block dependent query completion until the independent partner query has started, assert user/tenant scope, reject unauthorized requests before querying data, and verify entitlement filtering and error behavior.
- Both frontend builds and TypeScript checks passed. `verify:prod` passed.

## Release status

Local implementation and validation only. No production changes were made. The current dirty checkout was preserved; implementation is in a separate worktree.

To publish, use a feature PR and the required CI/merge flow. Frontend deployment is automatic after merge. The `/me` backend optimization additionally requires the standard manual Supabase function deployment after merge; CI does not deploy Edge Functions. There is no migration. The frontend changes are compatible with the currently deployed `/me` contract.
