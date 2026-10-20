# Shared customer recovery

All thirteen React app entrypoints use `RecoveryBoundary` and `recoveryRootOptions`.
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

From the repository root, with the project dependencies and Playwright Chromium
installed:

```sh
npm run test:ui:recovery
```

The runner compiles each actual production entrypoint with its normal config and
styles, replacing only App with a controlled render failure. Its backend settings
are synthetic, on the reserved `.invalid` domain. It starts an owned local server
on an available port and closes its browser/server in a finally block.

The check blocks every non-local request and verifies all 13
apps, reload/home actions, keyboard focus, safe diagnostics, storage retention,
320/390/1280 layouts, scoped axe accessibility and language/storage-denial cases.
It saves fixtures, screenshots and proof under `supabase/.temp/ui-recovery`,
outside app dist. The command must exit successfully with 16 passing scenarios.
This is a local regression check, not a deployment or hosted customer-journey
check. Normal app builds must also pass separately.
