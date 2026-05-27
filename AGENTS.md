# AGENTS.md

Operating context for any agent (Claude Code, Codex, Cursor, etc.) working in this repo. Read this first. This file is the source of truth; `CLAUDE.md` imports it.

## What this is

Schood — a multi-app English / test-prep platform live at https://schood.online. Single operator (Jafary). Production is the only environment. There is no staging.

Monorepo layout:
- `apps/*` — 14 frontends, each deployed to its own Cloudflare Pages project.
- `packages/*` — shared libraries.
- `supabase/` — Postgres migrations, Edge Functions, config.
- `.github/workflows/` — CI + deploy pipelines.
- `.githooks/` — local pre-commit and pre-push protection (activate via `git config core.hooksPath .githooks`).

## Production deploy is automatic

**Push to `main` = deploy to production.** The `deploy-pages.yml` workflow builds all 14 apps and ships them to Cloudflare Pages on every `main` push. There is no environment gate — once it merges, it ships.

Therefore:
- Never push directly to `main`. Always go through a PR from a feature branch.
- The local `.githooks/pre-push` blocks direct pushes; GitHub branch protection is the real seatbelt.
- A `git push --force` to `main` would rewrite the deploy history and re-trigger 14 deploys. Never do this.

Override env vars exist but are last-resort: `ALLOW_PUSH_MAIN=1`, `SKIP_SECRET_SCAN=1`. Do not set them without the user explicitly asking.

## Services and where they're authenticated

| Service | Purpose | Local auth | CI auth |
|---|---|---|---|
| Supabase | Postgres, Auth, Edge Functions, Storage | `supabase` CLI logged in on this machine | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` repo secrets |
| Cloudflare | Pages hosting + DNS for `*.schood.online` | `wrangler` CLI logged in on this machine | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` repo secrets |
| AWS S3 | Media storage | n/a (only edge functions hit it) | Stored as Supabase Edge Function secrets |
| OpenRouter | AI grading | n/a | Supabase secret `OPENROUTER_API_KEY` |
| TsPay | Payments | n/a | Supabase secrets `TSPAY_*` |
| Gmail SMTP | Auth emails | n/a | Supabase secrets `GMAIL_SMTP_*` |

The Supabase **anon** key is a public JWT — fine to ship in built frontends. The **service-role** key is not — it must never appear in any frontend bundle, repo file, or commit.

## Production URLs

Source of truth for what's live (full list also in `.github/workflows/deploy-pages.yml`):

| App workspace | URL | Pages project |
|---|---|---|
| `apps/platform` | https://schood.online | `schood-platform` |
| `apps/ielts-simulator` | https://ielts.schood.online | `schood-ielts` |
| `apps/ielts-practice` | https://practice.ielts.schood.online | `schood-ielts-practice` |
| `apps/sat-simulator` | https://sat.schood.online | `schood-sat` |
| `apps/sat-practice` | https://practice.sat.schood.online | `schood-sat-practice` |
| `apps/sat-playbook` | https://playbook.sat.schood.online | `schood-sat-playbook` |
| `apps/toefl-ibt-simulator` | https://toefl.schood.online | `schood-toefl` |
| `apps/itep-simulator` | https://itep.schood.online | `schood-itep` |
| `apps/english-hub` | https://english.schood.online | `schood-english` |
| `apps/english-reading` | https://reading.english.schood.online | `schood-reading` |
| `apps/english-writing` | https://writing.english.schood.online | `schood-writing` |
| `apps/english-listening` | https://listening.english.schood.online | `schood-listening` |
| `apps/english-speaking` | https://speaking.english.schood.online | `schood-speaking` |
| `apps/english-grammar` | https://grammar.english.schood.online | `schood-grammar` |
| `apps/english-vocabulary` | https://vocabulary.english.schood.online | `schood-vocabulary` |
| `apps/english-immersion` | https://immersion.english.schood.online | `schood-immersion` |

Apps share auth via the `.schood.online` cookie domain (`VITE_AUTH_COOKIE_DOMAIN`).

## What CI does NOT do (manual steps)

CI only ships the frontends. These changes have to be deployed by hand:

- **Supabase migrations** — `supabase db push --linked` against the production project ref. Always after the frontend that depends on the new schema has shipped (or before, if backward-compatible).
- **Supabase Edge Functions** — `supabase functions deploy <name> --project-ref <prod>`. There is no GitHub Action for this.
- **Edge Function secrets** — `supabase secrets set KEY=VALUE --project-ref <prod>`. Reflect into `.env.example` (key only, never value) so future-you knows it exists.
- **DNS for new apps** — the `configure-*-domain.yml` workflows handle `*.schood.online` Pages domain + CNAME bindings. Adding a brand-new subdomain needs a new workflow file modeled on the existing ones.
- **Cloudflare Pages rollback** — Pages dashboard → Deployments → "Rollback to this deployment".

## Hard rules for any change

1. **Never commit `.env`** or any file matching `.env.*` (except `.env.example`). The pre-commit hook blocks these.
2. **Never commit secret values.** The Supabase anon key is the only secret-shaped string allowed in code/CI.
3. **Never `git push --force` to `main`** or any branch CI deploys from.
4. **Never run `wrangler pages deploy` for a `schood-*` project locally.** That bypasses CI's commit-hash tracking and pre-deploy checks. CI deploys; humans don't.
5. **Schema migrations must be backward-compatible across one deploy** — drop columns only after the frontend that used them has shipped a version without them.
6. **`npm run verify:prod` must pass before merging.** It scans for committed env files and high-confidence secret literals.

## Common workflows

**Feature change (frontend only)**
1. Branch from `main`, commit, push.
2. Open PR. CI runs `verify:prod` + builds all apps.
3. Merge → `deploy-pages.yml` ships to Cloudflare.

**Schema change**
1. Add migration in `supabase/migrations/` (timestamp-prefixed).
2. Test locally: `supabase db reset` then `supabase start`.
3. PR + merge as usual.
4. After merge, run `supabase db push --linked` against production.
5. Verify with `supabase migration list --linked`.

**Edge function change**
1. Edit in `supabase/functions/<name>/`.
2. Test locally: `supabase functions serve <name>`.
3. PR + merge (CI does not deploy this).
4. After merge: `supabase functions deploy <name> --project-ref <prod>`.

## Useful commands

- `npm run verify:prod` — pre-merge checks.
- `npm --workspace apps/<app> run build` — build one app.
- `git config core.hooksPath .githooks` — re-enable local hooks on a fresh clone.
- `gh run list --workflow=deploy-pages.yml --limit 5` — recent prod deploys.
- `gh run watch <run-id>` — watch a deploy in progress.

## See also

- `.githooks/pre-commit`, `.githooks/pre-push` — local guardrails.
- `scripts/verify-production-readiness.mjs` — what `npm run verify:prod` actually checks.
- `.claude/agents/prod-deploy-pilot.md` — Claude Code subagent that walks a feature branch through to production. Codex / other agents: follow the same six-phase flow described in that file (pre-flight → push+PR → merge gate → watch deploy → smoke test → manual follow-ups).
