# Production release manifest

Schood has one production environment. Pages deploy automatically after a merge to `main`; migrations, Supabase Edge Functions, secrets, and Telegram Workers do not. A backend-bearing PR therefore needs one machine-checked release manifest.

Run from the feature branch:

```powershell
npm run verify:release -- --base origin/main
```

The verifier derives changed app workspaces, migrations, Edge Functions, Workers, and non-standard Edge secrets from the Git diff. For backend-bearing changes, `release/manifest.json` must match that derived inventory exactly and declare:

- `status: "code_ready"` so local proof is not confused with deployment;
- the backward-compatible production boundary;
- an ordered rollout beginning with the automatic Pages deployment;
- every manual command, including secret configuration;
- post-release evidence and a non-destructive rollback.

Frontend-only PRs do not need to edit the manifest. Any PR that changes a migration, Edge Function, shared Edge module, or Worker must update it. The verifier fails closed when the inventory, required secrets, or deployment commands drift.

The manifest is a plan, not authorization. Do not run its production commands until the PR is merged, the Pages deployment for that commit succeeds, and the operator explicitly authorizes the manual production writes.
