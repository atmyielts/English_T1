# Production rollout: Assessment Cloud and Exam

Status 2026-10-22: plan only. Nothing below has been run against production. Proctor stays paused and is not part of this rollout.

## What production looks like today (read-only checks, 2026-10-22)

- **Supabase `bbjawctnqrufvnesdsel`:** production's history has nothing that is missing from git. Production is consistent and on the older payment code. Pending against this branch:
  - **9 payment migrations already on `main` that production has not applied yet** (PR #220, merged 2026-10-10: payment fulfillment, checkouts, seats and vouchers as single transactions). The live `click` function (deployed 2026-08-12) predates them, so code and schema agree. The rework simply hasn't been released. Codex's Academy migrations are already applied.
  - **43 Assessment Cloud migrations** from this branch.

  `supabase db push` applies everything pending, so the payment release comes first, on its own (step 0).
- **Cloudflare account:**
  - 20 Pages projects, none for Assessment or Exam.
  - R2 is enabled.
  - Every service below fits the free plan at pilot scale. The coordinator uses SQLite-backed Durable Objects, which the free plan allows, and free-plan Queues with shorter retention.
  - Free limits that matter: 100,000 Worker requests and 100,000 Durable Object row writes per day.
- **Migration numbering:** fixed on this branch. Fourteen Assessment and Proctor migrations had the same version numbers as Academy migrations and could never have been pushed. They were renumbered, and `verify:prod` now refuses duplicate versions.

## Order

0. **Release Codex's payment rework (separate decision, payments are live).** Review the 9 migrations together with the new `click` function, which is deployed by hand. Push the migrations, deploy `click`, then make one real test purchase and check fulfillment. No Assessment migration goes in this step. Codex's other merged work is already in production and is left untouched.
1. **Merge this branch to `main` through a PR.** CI runs `verify:prod`, builds all 14 existing apps, and runs Assessment Services CI. Merging redeploys the existing apps unchanged; Assessment and Exam are not in `deploy-pages.yml` yet. The Click change (institution-plan guard) only takes effect when `click` is deployed by hand. Leave that until the assessment product exists in the database.
2. **Database:** `supabase db push --linked` for the 43 Assessment migrations. All are additive. New tables have RLS on and are readable only by `service_role`. Afterwards run `supabase migration list --linked`.
3. **Edge functions:** deploy `assessment-cloud` and `assessment-runtime` with every `ASSESSMENT_*` feature flag unset (off). Set the coordinator shared secret with `supabase secrets set`. Record each new key, name only, in `.env.example`.
4. **Workers:** deploy `assessment-coordinator` first. It needs a production env block in `wrangler.toml` (Durable Object class, recovery queue and dead-letter queue, cron, `ALLOWED_ORIGINS` = the Exam origin, Supabase URL and anon key, coordinator secret).
   - Media, QTI, grading, roster and webhooks come later, each behind its own flag.
   - Media also needs a hosted malware scanner (Checkpoint A), so uploads stay off until one exists.
5. **Frontends:**
   - Add Pages projects `schood-assessment` and `schood-exam` (free).
   - Add `configure-assessment-domain.yml` and `configure-exam-domain.yml`, modelled on the existing domain workflows, for `assessment.schood.online` and `exam.schood.online`.
   - Add both apps to `deploy-pages.yml`.
   - Build variables are the existing Supabase URL and anon key, the cookie domain and the coordinator URL.
6. **Smoke test, then a pilot:**
   - Sign in on both subdomains.
   - Set up one pilot institution (an owner and one reviewer).
   - Author, review and publish a two-question test.
   - A test candidate takes the exam on one device, then takes over on a second.
   - Grade and release the result, then file and decide an appeal.
   - Confirm existing apps still work.
   - Turn on the flags this needs, one at a time.

Rollback: Pages has per-deployment rollback. Edge functions are redeployed from the previous commit. Migrations are additive, so leaving them in place is safe. Feature flags are the off switch.

## Not covered here (needs separate approval)

- Proctor (paused).
- Hosted malware scanning for media.
- Production email for invitations, which could reuse the existing Gmail SMTP secrets.
- Click static-IP settlement.
- Legal and data-localization review.
- Native apps.
