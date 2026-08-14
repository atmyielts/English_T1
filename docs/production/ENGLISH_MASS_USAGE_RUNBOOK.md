# English mass-usage release runbook

Use this runbook for changes to `apps/english-hub`, the seven consolidated English modules, `supabase/functions/hub`, or English learning migrations.

Schood has no staging environment. A merge to `main` deploys the frontend to production, while database migrations and Edge Functions remain manual. Never push directly to `main`, deploy Pages locally, or combine the release with unrelated production changes.

## Release invariants

- Existing English lessons remain usable if the new database migration or Edge deployment is delayed.
- The quota migration is additive. It does not modify existing learning records or entitlements.
- Deploy the quota migration before the new `hub` Edge Function. The function calls the new RPC when AI is configured.
- The frontend can ship before the Hub function: recovery telemetry is best-effort, so the old function's temporary `405` response cannot interrupt the learner.
- A newly installed service worker waits for active tabs to leave before activating and deleting the previous English asset cache.
- Roll back application code before considering schema removal. Leave the additive quota table and RPC in place during an incident.
- Do not claim mass readiness without an authenticated purchase-to-persistence smoke and a controlled concurrency check.

## Prerequisites

- Feature branch based on current `origin/main`.
- Git hooks enabled with `git config core.hooksPath .githooks`.
- Supabase and GitHub CLIs authenticated to the production project/repository.
- Cloudflare deployment credentials available to GitHub Actions. Do not run `wrangler pages deploy` locally.
- A dedicated canary learner with one active English entitlement and a separate unentitled learner.
- The previous known-good commit SHA recorded before release.

## 1. Local preflight

Run from a clean checkout of the release branch:

```powershell
npm ci
npm test
npm run test:english:mass-readiness
npm run verify:english
npm run verify:prod
node scripts/audit-runtime-dependencies.mjs
deno check supabase/functions/hub/index.ts
npm --workspace apps/english-hub run build
git diff --check
```

`npm run verify:english` requires a disposable local Supabase database. Do not run its integration fixtures against production.

Run the bounded local load check with an entitled disposable learner:

```powershell
$env:ENGLISH_LOAD_BASE_URL = 'http://127.0.0.1:54321'
$env:ENGLISH_LOAD_ANON_KEY = '<local-anon-key>'
$env:ENGLISH_LOAD_ACCESS_TOKEN = '<local-entitled-user-token>'
npm run verify:english:load -- --requests=240 --concurrency=30 --p95-limit-ms=3000
```

The verifier refuses non-loopback hosts unless `--allow-remote` is explicitly supplied. Remote load tests require a separately approved, controlled canary window.

## 2. PR and frontend deployment

1. Push the feature branch and open a PR.
2. Confirm the PR runs the English Edge typecheck, mass-readiness contracts, security checks, and English production build.
3. Review the migration and Edge Function diff separately from the frontend diff.
4. Merge only after every required check is green.
5. Watch `deploy-pages.yml` until the `english-hub` job succeeds.
6. Confirm `https://english.schood.online` serves the merged commit before continuing.

If the Pages deployment fails, stop. Do not apply the migration or deploy the Edge Function.

## 3. Apply the additive migration

Preview the linked migration set, confirm that only the expected English quota migration is pending, then apply it:

```powershell
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

Expected migration:

```text
20260815120000_english_ai_mass_usage_guardrails.sql
```

Verify in production with a read-only SQL query:

```sql
select
  c.relrowsecurity,
  has_table_privilege('anon', 'public.english_ai_usage_daily', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.english_ai_usage_daily', 'select') as authenticated_select,
  has_table_privilege('service_role', 'public.english_ai_usage_daily', 'select') as service_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'english_ai_usage_daily';
```

Expected result: RLS enabled, no anon/authenticated access, service-role access enabled.

## 4. Deploy the Hub Edge Function

The default daily limit is 30. Set `ENGLISH_AI_DAILY_LIMIT` only when the production value should differ, and never place secret values in the repository.

```powershell
supabase functions deploy hub --project-ref <production-project-ref>
```

Do not deploy the function if the migration is absent. Do not deploy unrelated functions in the same command.

## 5. Authenticated production smoke

Use real browser sessions and dedicated canary accounts.

1. Guest route: open `/reading/dashboard?intent=review`; confirm the page preserves the complete return URL and shows no fabricated score.
2. Unentitled learner: confirm `/studio` and a paid module show the pricing boundary; direct AI API access must return `403` with `english_entitlement_required`.
3. Entitled learner: confirm all seven module dashboards load without redirecting to `/`:
   - `/reading/dashboard`
   - `/writing/dashboard`
   - `/listening/dashboard`
   - `/speaking/dashboard`
   - `/grammar/dashboard`
   - `/vocabulary/dashboard`
   - `/immersion/dashboard`
4. At 390 px and 1440 px, confirm the service menu is reachable and document overflow is zero.
5. Complete one real learning activity, reload, and confirm the attempt, feedback, profile signal, and hub recommendation persist.
6. Complete a canary purchase or trial grant and confirm the resulting entitlement unlocks only its intended product and tenant.
7. Invoke one AI Studio action. Confirm `ai_status=ok` when the configured provider is healthy, or an explicit safe fallback status when it is not.
8. Confirm a quota row is recorded for the canary user without exhausting the full daily allowance.
9. Open a legacy deep link such as `https://reading.english.schood.online/dashboard?intent=review`; confirm its permanent redirect preserves both the module path and query string.

## 6. Observation window

For at least 30 minutes after the Edge deployment, monitor:

- Hub Edge Function 5xx and 429 rates.
- Authentication failures and entitlement-denied counts.
- AI provider failure/fallback rate and daily request growth.
- Database CPU, connections, and slow queries.
- Pages asset/chunk failures and the recovery-boundary rate.
- One repeated authenticated lesson save/reload cycle.

Stop expansion if any of these occur:

- Sustained 5xx responses or elevated auth failures.
- Cross-tenant access, an incorrect product unlock, or missing persistence.
- Quota counts above their configured limit.
- A module route repeatedly enters recovery mode or loses its stylesheet.
- Database saturation or a material latency regression.

In Supabase Edge Function logs, filter for the structured event names
`english_client_recovery` and `english_hub_request_failed`. Recovery events contain only the authenticated user ID, bounded route path, failure classification, error class, request ID, and CI-provided release SHA; raw browser error messages and URL query strings are intentionally excluded. Repeated recovery reports from the same tab, route, release, and classification are session-deduplicated.

## Rollback

### Frontend

Use Cloudflare Pages Deployments to roll `schood-english` back to the previous known-good deployment. Do not run a local Pages deployment.

### Hub Edge Function

Deploy `hub` from an isolated worktree checked out at the previous known-good commit. Verify that its shared imports come from the same commit, then run:

```powershell
supabase functions deploy hub --project-ref <production-project-ref>
```

### Database

Do not drop `english_ai_usage_daily` or `consume_english_ai_daily_quota` during an incident. They are additive and inert with the previous Hub function. Any later removal requires a separate reviewed migration after all dependent code has been absent for at least one release.

After rollback, repeat guest, unentitled, entitled, persistence, and API health checks. Record the failed commit, rollback commit/deployment, timestamps, and observed symptoms.
