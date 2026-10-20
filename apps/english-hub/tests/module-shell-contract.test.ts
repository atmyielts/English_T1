import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const services = [
  "reading",
  "writing",
  "listening",
  "speaking",
  "grammar",
  "vocabulary",
  "immersion",
] as const;

Deno.test("every consolidated English module keeps its production workspace styles", async () => {
  for (const service of services) {
    const app = await Deno.readTextFile(
      new URL(`../src/modules/${service}/App.tsx`, import.meta.url),
    );
    const css = await Deno.readTextFile(
      new URL(`../src/modules/${service}/module.css`, import.meta.url),
    );

    assertStringIncludes(
      app,
      "import './module.css';",
      `${service} must import its workspace styles`,
    );
    assertStringIncludes(
      app,
      "import '../../../../english-shared/src/workspace-shell.css';",
      `${service} must import the shared single-shell layout after module styles`,
    );
    assert(
      css.length > 30_000,
      `${service} workspace CSS is unexpectedly incomplete`,
    );
    assertStringIncludes(
      css,
      ".app-shell",
      `${service} must style the workspace shell`,
    );
    assertStringIncludes(
      css,
      ".mobile-nav-inline-toggle",
      `${service} must style the mobile service menu`,
    );
    assertStringIncludes(
      css,
      "@media (max-width: 920px)",
      `${service} must retain its mobile breakpoint`,
    );
  }
});

Deno.test("the shared English workspace exposes an accessible mobile service menu", async () => {
  const source = await Deno.readTextFile(
    new URL("../../english-shared/src/ui.tsx", import.meta.url),
  );
  assertStringIncludes(source, 'aria-controls="service-side-nav-body"');
  assertStringIncludes(source, "aria-expanded={mobileNavOpen}");
  assertStringIncludes(source, "Service menu");
  assertStringIncludes(source, "topbar-context");
  assert(
    !source.includes("Welcome back, learner"),
    "deep skill routes must not add a second generic page heading",
  );
});

Deno.test("skill routes suppress the duplicate Hub shell", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/App.tsx", import.meta.url),
  );
  const hubStyles = await Deno.readTextFile(
    new URL("../src/index.css", import.meta.url),
  );
  const workspaceStyles = await Deno.readTextFile(
    new URL("../../english-shared/src/workspace-shell.css", import.meta.url),
  );

  assertStringIncludes(source, "const isModuleWorkspace");
  assertStringIncludes(source, "!isModuleWorkspace ? <header");
  assertStringIncludes(source, "isModuleWorkspace ? 'module-host' : ''");
  assertStringIncludes(hubStyles, ".hub-root.module-host");
  assertStringIncludes(workspaceStyles, ".route-page-hero.without-aside");
  assertStringIncludes(workspaceStyles, ".reading-root > .app-shell");
});

Deno.test("the English root contains a user-recoverable crash boundary", async () => {
  const main = await Deno.readTextFile(
    new URL("../src/main.tsx", import.meta.url),
  );
  const boundary = await Deno.readTextFile(
    new URL("../src/components/AppErrorBoundary.tsx", import.meta.url),
  );
  const recovery = await Deno.readTextFile(
    new URL("../src/lib/clientRecovery.ts", import.meta.url),
  );
  assertStringIncludes(main, "<AppErrorBoundary>");
  const sharedBoundary = await Deno.readTextFile(new URL('../../../packages/ui-recovery/src/RecoveryBoundary.tsx', import.meta.url));
  assertStringIncludes(boundary, "<RecoveryBoundary");
  assertStringIncludes(sharedBoundary, "static getDerivedStateFromError");
  assertStringIncludes(boundary, "Reload English");
  assertStringIncludes(
    sharedBoundary,
    "Changes that had not finished saving may need to be entered again.",
  );
  assertStringIncludes(boundary, "onError={reportEnglishRecovery}");
  assertStringIncludes(recovery, "window.sessionStorage.getItem(dedupeKey)");
  assertStringIncludes(recovery, "window.location.pathname");
  assertStringIncludes(recovery, "window.addEventListener('unhandledrejection'");
  assertStringIncludes(main, "installEnglishGlobalRecoveryReporting()");
  assert(
    !recovery.includes("message: error.message"),
    "raw browser error messages must not leave the learner's browser",
  );
});

Deno.test("service-worker updates preserve assets needed by active learner tabs", async () => {
  const worker = await Deno.readTextFile(
    new URL("../public/sw.js", import.meta.url),
  );
  assert(
    !worker.includes("skipWaiting("),
    "a new worker must wait for active tabs before replacing their asset cache",
  );
  assert(
    !worker.includes("clients.claim("),
    "a new worker must not take control of already-open tabs",
  );
  assertStringIncludes(worker, "key.startsWith(CACHE_PREFIX)");
  assertStringIncludes(worker, "url.pathname.startsWith('/assets/')");
  assertStringIncludes(worker, "if (isNavigationRequest(req))");
});

Deno.test("the English build isolates stable vendor dependencies for long-lived caching", async () => {
  const config = await Deno.readTextFile(
    new URL("../vite.config.ts", import.meta.url),
  );
  assertStringIncludes(config, "'supabase-vendor'");
  assertStringIncludes(config, "'react-vendor'");
  assertStringIncludes(config, "manualChunks(id)");
});
