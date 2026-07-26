# Security Audit Exceptions

Exceptions in this file are narrow, temporary release decisions. They do not suppress other audit findings.

## GHSA-qwww-vcr4-c8h2 — React Router unstable RSC CSRF

- **Approved:** 2026-07-27 by the production owner.
- **Dependency:** `react-router-dom` / `react-router` 7.18.1.
- **Reason:** The advisory affects only applications using React Router's unstable RSC APIs. Schood's deployed frontends are Vite client-side applications using `BrowserRouter`; the repository contains no unstable RSC API usage.
- **Compensating control:** All frontend workspaces pin the exact 7.18.1 release, which clears the other known React Router advisories. Production verification, repository tests, Academy route tests, and every deployed frontend build must remain green.
- **Audit behavior:** `npm audit --omit=dev --audit-level=high` is expected to report only `GHSA-qwww-vcr4-c8h2` until the patched release is published to npm. Any additional runtime finding invalidates this exception and blocks release.
- **Expiry:** Remove this exception and upgrade promptly when React Router 8.3.0 or another stable patched version is available from npm and passes the full build and route-test matrix.
- **Reference:** https://github.com/advisories/GHSA-qwww-vcr4-c8h2
