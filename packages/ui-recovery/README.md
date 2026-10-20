# Shared customer recovery

All deployed React roots use `RecoveryBoundary` and `recoveryRootOptions`.
The boundary owns reporting, so React's default caught-error logger cannot
independently print the raw exception in production. Development keeps detail.
An optional reporter is best-effort; failures cannot replace the fallback.
English retains its existing backend recovery event integration.

The fallback does not prove a save succeeded. It never clears storage, signs out,
automatically reloads, or claims pending work survived. Its support reference
matches the sanitized browser diagnostic; this package does not send it to a
central logging service. It catches React render/lazy-route failures, not entry
script/module initialization errors before mounting or all async/event errors.

## Local browser verification

From the repository root, start `node scripts/recovery-preview.mjs --port=4289`.
Wait for `Recovery preview ready`. This compiles each actual production entrypoint
with its normal config and styles, replacing only App with a controlled render
failure. Outputs stay under `output/playwright/recovery-builds`, outside app dist.
Its backend configuration is synthetic, on the reserved `.invalid` domain.

In another terminal:

```powershell
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=schood-recovery open http://127.0.0.1:4289/
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=schood-recovery snapshot
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=schood-recovery --raw run-code --filename scripts/recovery-browser-check.js
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=schood-recovery close
```

Use a fresh named browser session for each full run: the final case deliberately
denies localStorage. The check blocks every non-local request and verifies all 13
apps, reload/home actions, keyboard focus, safe diagnostics, storage retention,
320/390/1280 layouts, scoped axe accessibility and language/storage-denial cases.
It saves representative screenshots under `output/playwright`. The command must
return a results object with 16 passing entries; an error is not a passing report.
Stop the preview with Ctrl+C. This is a local regression check, not a deployment
or hosted customer-journey check. Normal app builds must also pass separately.
