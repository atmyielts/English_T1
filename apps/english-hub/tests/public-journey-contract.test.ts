import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("the public English journey speaks to learners and preserves a contextual sign-in handoff", async () => {
  const hub = await Deno.readTextFile(new URL("../src/App.tsx", import.meta.url));
  const discovery = await Deno.readTextFile(
    new URL("../../platform/src/content/discoveryPages.ts", import.meta.url),
  );

  for (const internalPhrase of [
    "real routes",
    "no longer one generic dashboard",
    "Open routed start",
    "Continue to your English route",
    "gives search engines and learners",
    "Stronger internal linking",
  ]) {
    assert(
      !hub.includes(internalPhrase) && !discovery.includes(internalPhrase),
      `public copy must not expose implementation language: ${internalPhrase}`,
    );
  }

  assertStringIncludes(hub, "Know what to practice today—and why.");
  assertStringIncludes(hub, "Your place is saved");
  assertStringIncludes(hub, "Continue to English ${requestedService.label}");
  assertStringIncludes(hub, "Sign in and continue");
  assertStringIncludes(discovery, "Build every English skill without losing sight of what comes next.");
});

Deno.test("the English sign-in handoff stays inside the existing responsive design system", async () => {
  const styles = await Deno.readTextFile(new URL("../src/index.css", import.meta.url));

  assertStringIncludes(styles, ".access-gate-shell");
  assertStringIncludes(styles, ".access-redirect-card");
  assertStringIncludes(styles, "grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr)");
  assertStringIncludes(styles, "@media (max-width: 760px)");
  assertStringIncludes(styles, ".access-gate-actions");
  assertStringIncludes(styles, "a:focus-visible");
});

Deno.test("the platform homepage leads with three user goals without hiding the service catalog", async () => {
  const home = await Deno.readTextFile(
    new URL("../../platform/src/pages/HomePage.tsx", import.meta.url),
  );
  const locale = await Deno.readTextFile(
    new URL("../../platform/src/i18n/locales/en.ts", import.meta.url),
  );

  assertStringIncludes(home, "const startingPathCount = 3");
  assertStringIncludes(home, "document.getElementById('services')?.scrollIntoView");
  assertStringIncludes(locale, "Start with your goal.");
  assertStringIncludes(locale, "Exam preparation, connected English skills, or Academy operations.");
});

Deno.test("operator-visible signals hand off to existing action workspaces", async () => {
  const analytics = await Deno.readTextFile(
    new URL("../../platform/src/pages/admin/AdminAnalyticsPage.tsx", import.meta.url),
  );

  assertStringIncludes(analytics, "Operator loop handoffs");
  assertStringIncludes(analytics, 'href="/admin/users"');
  assertStringIncludes(analytics, 'href="/admin/english"');
  assertStringIncludes(analytics, 'href="/admin/payments"');
  assertStringIncludes(analytics, 'href="/academy-control"');
  assertStringIncludes(analytics, "payments_paid_ungranted_30m");
  assertStringIncludes(analytics, "sessions_completed_30d");
});
