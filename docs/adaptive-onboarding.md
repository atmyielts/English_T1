# Schood Guide implementation and operations

## Status and boundaries

Implementation lives on `codex/adaptive-onboarding`, based on `c2637f6` (refreshed `origin/main`).
The original `English_T1` checkout and its unrelated dirty work are untouched.
No push, PR, merge, production migration, Edge deployment, or flow publication has been performed.

This is a connected product implementation, not a static quiz: public requests use the `guide` Edge function,
published configuration and private sessions live in Postgres, catalog prices remain authoritative, and
administration uses existing server-side admin permissions. Browser test fixtures are confined to tests.

## Product contract

Homepage (only when published) → `/start` → audience-specific interview → optional six-question check →
`/start/result` → existing workflow, existing access, or current plan checkout.

- Four complete audiences: learner, parent, teacher, center. Starter routes have at most 12 interview questions.
- Uzbek, Russian, and English copy; explicit Continue; back/edit; unknown/skip for optional answers.
- Questionnaire answers describe needs, not measured scores. The separate check reports sampled accuracy and coverage.
- No account needed before recommendations. No automatic roles, organization membership, guardian relationships,
  assessment records, or product entitlement changes.
- Parents choose and help pay, but preparation is claimed and purchased on the learner's account after confirmation.
- Parent progress routes explain that a verified report link/invitation is required; no tokenless report page.
- Every product recommendation must be explicitly enabled by an admin. Active catalog products are not automatically
  eligible. A starter draft intentionally does not invent product IDs or approve paid offers on the operator's behalf.
- Owned access is preferred where suitable. Free-only answers cannot produce a paid recommendation.
- No suitable approved offer yields honest support guidance, not a forced sale.

## Content and no-code operation

Open **Admin → Onboarding** (`/admin/onboarding`).

1. Create a starter draft, or clone a published version.
2. In Questions, edit all three translations, options, input type, chapter, required status, and goal mapping.
3. In Branches, select earlier questions and build AND conditions / OR groups. No JavaScript is accepted.
4. In Recommendations, map real Products/Billing records, write three truthful reasons and limitations, configure
   conditions and priority, and explicitly approve eligibility. Keep test plans excluded.
5. Review the two six-question skill-check banks. Listening audio is original synthetic-voice material, not an
   official exam recording. Source transcripts and reproducible generation are in `scripts/generate-guide-audio.ps1`.
6. Choose illustration, accent, and motion presets. Edit the no-match fallback rather than manufacturing an offer.
7. Validate and preview. Save first, then Publish. Published snapshots cannot be edited: clone to make changes.
8. To roll back, select a previous published snapshot and choose Restore this version. This revalidates current
   catalog availability. Disable entry hides the guide for new visitors; existing seven-day sessions can finish.

Editing requires `admin.products.manage`. Publishing, rollback, and entry disabling require
`admin.settings.manage`. Analytics requires `admin.analytics.view`. Price changes remain under Billing.

Publication rejects missing translations, bad option/score keys, unavailable approved offers, unsafe URLs,
unreachable questions, forward dependencies, backward chapter transitions, overly complex branching,
routes over 12 questions, and incomplete six-question banks. Student sessions pin immutable versions while
recommendations and checkout recheck live catalog/access.

No-code changes include questions, wording, translations, branching, reviewed checks, mappings, reasons,
priorities, and approved visual presets. New interaction types, integrations, or payment relationships still
need development. `guide_free_access` product metadata is informational eligibility, not an entitlement grant;
prefer an existing zero-cost plan when that is the catalog's representation of free access.

## Storage and interfaces

- `guide_versions`: private JSON configuration, draft revision, immutable publication stamp.
- `guide_release`: dark-by-default singleton and compare-and-swap release revision.
- `guide_sessions`: hashed random resume secret, answers, check state, optional verified owner, seven-day expiry.
- `guide_events`: bounded structural dimensions, no raw answers, 90-day retention.
- `guide_arrivals`: destination-bound, hashed, single-use telemetry receipts, expiring after 15 minutes.
- `guide_payment_links`: verified ownership/plan attribution; provider `paid` status produces deduplicated conversions.
- `guide_rate_limits`: daily-keyed IP hashes and short-lived rate buckets; no raw IP storage in guide tables.

All tables deny direct `anon`/`authenticated` access. The Edge function projects only published public content;
correct answers, explanations, draft configuration, session secrets, and recommendation traces stay private.
After claiming, both the resume secret and the matching authenticated user are required.

Public API: GET `/status`, GET `/config`, POST `/sessions`, GET/PATCH/DELETE `/session`, POST `/check`,
GET `/result`, POST `/open`, POST `/view`. Session-bound calls use `?session=<opaque id>` and `x-guide-token`;
the secret is never put in a URL or analytics. Protected actions: POST `/claim`, `/payment`,
`/goals/preview`, `/goals/apply`. Admin actions live under `/admin/*` with server-side permission checks.

Native goal transfer previews exact before/after changes and requires confirmation. It checks current owned
access and never writes score/CEFR history. Supported native stores are IELTS Practice, SAT Practice,
IELTS Playbook, TOEFL Playbook (no score-scale conversion), and English shared learner goals.
Numeric units follow each existing product; previews show rounding explicitly. Past deadlines and unsupported
fields are not applied. Updates compare the previously reviewed row and its timestamp, preserving other fields.
The confirmation fingerprint also includes the proposed changes and interview revision, so changing answers
in another tab invalidates an old consent preview.

Destination measurement uses a separate, short-lived `schood_guide` receipt in the destination URL, never
the resume secret or answer values. Each app removes the receipt before rendering and acknowledges it
after the application root renders. The server atomically consumes it only for the expected origin/path.
This records **destination application rendered**, not successful authentication, entitlement, a fully loaded
learning activity, or learning activation. Blocked telemetry and immediate redirects can undercount it.
Platform SPA navigation is covered as well as full cross-app loads. A receipt grants no data-reading authority.

Admin Results shows unique journeys, recommendations, no-match fallbacks, account claims, checkout intention,
destination rendering, and backend-confirmed paid outcomes. Per-question views/answers expose unfinished steps.
These outcomes are not a mandatory linear funnel. A journey uses its last known audience/language within the
30-day report window; completion rate uses only journeys with both start and result in that window. The latest
10,000-event cap is disclosed and hides rates when hit. Anonymous cohort IDs survive session deletion for the
remaining 90-day event retention; answer values and resume credentials do not enter analytics.

## Verification commands

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run test:guide
npm run check:guide
npm run test:guide:browser
npm run test:shared
npm run verify:prod
npm run verify:release
```

The migration test executes the real additive SQL against isolated PostgreSQL 17 via PGlite. It does not
contact Supabase or require Docker. Use `--node-modules-dir=none` to avoid replacing npm workspace binaries.
HTTP tests exercise the real handler with intercepted Supabase transport. Browser contract tests intercept
API responses; these are local behavioral evidence, not proof of a deployed signed-in purchase.

The real-stack smoke command is deliberately restricted to an **unlinked, disposable** Supabase project
named `adaptive_onboarding_validation`, with its API on `http://127.0.0.1:60921`. Initialize that project
separately, copy all migrations plus `guide`, `_shared` and `access-effective`, and use non-conflicting
local ports. Preserve the repository's `verify_jwt = false` settings for **both** served functions;
their handlers verify users themselves. Start/reset only that disposable project, serve the functions,
then run:

```powershell
npm run test:guide:local -- "<disposable-workdir>"
```

This creates local test accounts, drafts and sessions, tests real guest and signed-in recommendations,
claim protection, public key redaction and analytics, then disables the local guide even on test failure.
Reruns retain fixture evidence; no credentials are logged or written. It refuses linked/non-local targets.
This command is a manual integration gate, not part of the mocked browser suite or hosted purchase proof.
If the default browser-test port is occupied, set `PW_PORT` to a free local port; do not stop another app.

Public API credentials are not user identities. Guest recommendations recognize a rotated anonymous JWT
or publishable-key-shaped token without consulting user entitlements. Unverified token claims can only
select guest behavior, never authorize a claim, owned result or goal update. Explicit user tokens still
require successful Auth verification; invalid/expired user credentials fail closed. This follows
[Supabase's API-key/user-token distinction](https://supabase.com/docs/guides/getting-started/api-keys)
and [server-verified getUser authorization](https://supabase.com/docs/reference/javascript/auth-getuser).

Platform build requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. For compilation-only verification,
use clearly fake local build values in the process environment; never deploy such output. Do not copy secret
files between worktrees. Runtime browser tests supply local-only values in the Playwright configuration.

## Controlled production release (not performed)

1. Review the feature branch and all gates. The CI-only change is separate in PR #195; merge it first,
   update the feature branch from `main`, and rerun CI so the guide gates actually execute before the feature
   can merge. Never push directly to `main` or use local Pages deploy.
2. Merge only through the existing verified PR/CI workflow. CI deploys the frontend; it does not deploy SQL/functions.
   Before the backend exists, the homepage keeps its current browse CTA and `/start` shows honest unavailability.
3. Follow `release/manifest.json`: deploy the additive migration, then the `guide` Edge function, before enabling
   entry. The release starts disabled. Confirm the gateway JWT setting follows `supabase/config.toml`; protected
   routes authenticate themselves. No new secrets or product prices are required.
4. Check privacy, approved audio, real catalog mappings, and role permissions using controlled accounts.
5. Admin creates/reviews the draft and eligible offers, validates all branches, then publishes. Verify homepage
   CTA, multilingual guest → result → login → owned access and an explicitly authorized payment journey.
6. Confirm payment-link attribution from server-confirmed payment status. Do not count button clicks as purchases.
7. Verify `guide-retention` is scheduled if pg_cron is installed. Without pg_cron, schedule the service-role-only
   `guide_cleanup()` through the existing operations scheduler before public rollout. Expired sessions are denied
   immediately even before cleanup, but deletion still needs the scheduled job.
8. Watch step completion, fallback frequency, check participation, access openings, and paid outcomes by version,
   audience, language and campaign. Use Disable entry or validated version rollback if a regression appears.

## Completion audit

- [x] Public interview, four audiences, multilingual copy, optional checks, owned/free matching and fallback.
- [x] Private/versioned backend, permissioned editor, safe publishing, rollback, expiry and payment attribution.
- [x] Confirmed native goal-transfer implementation and HTTP/browser consent coverage.
- [x] Preview includes skill-check answers, owned-access scenarios, shared public recommendation cards and private rule reasoning.
- [x] No-code acceptance: add question + branch + offer mapping + all translations + publish + fresh session.
- [x] Destination-render receipts, no-match events, unique-journey funnel and question-completion summaries.
- [x] Desktop/mobile layouts, three-language viewport coverage, keyboard and reduced-motion contracts.
- [x] Separate CI-only PR prepares guide contracts, Edge typechecking, browser acceptance and scoped axe audits.
- [ ] Feature CI has run these new gates after the CI-only PR lands.

Production release, real catalog approval, and hosted purchase proof remain separate authorized operations.
The starter draft deliberately cannot sell commercial products until an admin maps and approves real offers.

## Local verification evidence — 2 September 2026

- 27 browser contracts passed: four audiences, parent-account confirmation, free-only fallback, resume/edit,
  keyboard/reduced motion, all three languages at 320/390/768/1280px, local listening audio metadata,
  full no-code question/branch/offer publication, owned goal consent, and destination-render receipt cleanup.
- Scoped axe WCAG A/AA checks passed on the mobile interview, mobile result and desktop onboarding editor.
  These are automated checks, not an accessibility certification; manually inspected desktop/mobile screenshots.
- 30 Deno top-level tests passed, including 16 HTTP steps and 7 actual PostgreSQL migration steps; starter
  validation covers 206 reachable paths with a maximum of 12 interview questions.
- 72 existing shared pricing, entitlement, Academy and Click regression tests passed.
- All 12 affected app TypeScript/Vite builds passed using clearly fake compilation-only environment values.
- Guide Edge typecheck, targeted frontend lint, production-readiness scan, release-manifest validation and
  whitespace checks passed. Non-blocking existing bundle-size, Browserslist-age and IELTS CSS-import warnings remain.
- A fresh disposable Supabase stack started and reset successfully through all 174 migrations. No linked
  production project was used.
- The real Auth + Edge + PostgreSQL smoke test initially exposed anonymous-key inequality being mistaken
  for user authentication. Regression tests reproduced that failure before the fix. After correction,
  two consecutive real-stack runs passed guest recommendations, invalid-user rejection, protected claims,
  signed-in access checks, admin publish/disable and persisted analytics.
- The validation stack also needed its `access-effective` gateway setting aligned with the existing repo
  setting; no production gateway setting or access-verification policy was changed.
- CI-only PR #195 is green. Feature-specific remote gates still require that PR to land and the feature
  branch to be updated. No production merge, migration, function deployment or publication has occurred;
  these local results do not establish credentialed production purchase behavior.
