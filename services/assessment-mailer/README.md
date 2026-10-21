# Schood Assessment mailer

Independent Node 24 SMTP process for the Assessment invitation outbox. Disabled by default; no database/service-role key, browser feature imports or real credentials in source. Canonical mail eligibility/leases/receipts stay in the Assessment API/Postgres.

```powershell
npm ci --prefix services/assessment-mailer --workspaces=false --ignore-scripts
npm --prefix services/assessment-mailer test --workspaces=false
npm audit --prefix services/assessment-mailer --workspaces=false --omit=dev
```

After approved secret provisioning and all release gates, `node services/assessment-mailer/worker.mjs --once` processes a bounded batch; omit `--once` for continuous polling. SIGINT/SIGTERM drains in-flight bounded sends/reports. `.env.example` lists configuration; this entry point reads process environment and does not automatically load `.env` files.

SMTP acceptance is not inbox delivery. Unknown handoffs never automatically resend. See [the mail workflow, authority model and operating runbook](../../docs/assessment-cloud/INVITATION_MAIL.md) for schema/API/app dependencies, timing/retry semantics, explicit duplicate-risk review, local proof and remaining hosted/DSN/privacy/operations/capacity gates.
