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
  assertStringIncludes(boundary, "static getDerivedStateFromError");
  assertStringIncludes(boundary, "Reload English");
  assertStringIncludes(
    boundary,
    "Your account and previously saved learning data are safe.",
  );
  assertStringIncludes(boundary, "reportEnglishRecovery(error)");
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
