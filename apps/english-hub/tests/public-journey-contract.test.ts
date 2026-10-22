import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const learnerCopy = async (): Promise<string> => {
  const parts = [await Deno.readTextFile(new URL("../src/i18n/en.ts", import.meta.url))];
  for await (const entry of Deno.readDir(new URL("../src/skills/", import.meta.url))) {
    if (!entry.isDirectory) continue;
    try {
      parts.push(await Deno.readTextFile(new URL(`../src/skills/${entry.name}/i18n.ts`, import.meta.url)));
    } catch {
      // A skill without its own strings uses the shared catalog.
    }
  }
  return parts.join("\n");
};

Deno.test("the public English journey speaks to learners and preserves a contextual sign-in handoff", async () => {
  const app = await Deno.readTextFile(new URL("../src/App.tsx", import.meta.url));
  const copy = await learnerCopy();
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
    "orchestrat",
  ]) {
    assert(
      !copy.includes(internalPhrase) && !discovery.includes(internalPhrase),
      `public copy must not expose implementation language: ${internalPhrase}`,
    );
  }

  assert(!copy.includes("readiness"), "English learners see levels and scores, never invented readiness");
  assertStringIncludes(copy, "English practice that knows what you need next");
  assertStringIncludes(copy, "'gate.titleSkill': 'Sign in to practise {skill}'");
  // Signed-out visitors to any deep link are sent to sign-in and brought back to that exact page.
  assertStringIncludes(app, "signInHref(location.pathname + location.search)");
  assertStringIncludes(discovery, "Build every English skill without losing sight of what comes next.");
});

Deno.test("the English app keeps its own responsive, accessible look", async () => {
  const styles = await Deno.readTextFile(new URL("../src/english.css", import.meta.url));
  assertStringIncludes(styles, "family=Outfit");
  assertStringIncludes(styles, ".en-rail");
  assertStringIncludes(styles, "@media (max-width: 720px)");
  assertStringIncludes(styles, "prefers-reduced-motion");
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
