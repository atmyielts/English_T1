import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  entryScriptFrom,
  isIosDevice,
  isNewBuild,
  manifestFor,
  shouldShowInstallCard,
  SKILL_THEME,
  skillOfPath,
} from "../src/lib/pwaManifest.ts";
import { focusSkillOf, orderedSkills, orderSkills } from "../src/lib/focusSkill.ts";
import { SKILLS, type SkillKey } from "../src/lib/skills.ts";
import { pwaEn } from "../src/i18n/pwa.en.ts";
import { pwaRu } from "../src/i18n/pwa.ru.ts";
import { pwaUz } from "../src/i18n/pwa.uz.ts";

const publicDir = new URL("../public/", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, publicDir));
const exists = async (path: string) => {
  try {
    await Deno.stat(new URL(`.${path}`, publicDir));
    return true;
  } catch {
    return false;
  }
};

type Manifest = {
  id: string;
  name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
  shortcuts?: Array<{ url: string; icons?: Array<{ src: string }> }>;
};

const checkIcons = async (manifest: Manifest) => {
  for (const purpose of ["any", "maskable"]) {
    assert(manifest.icons.some((icon) => icon.purpose === purpose && icon.sizes === "512x512"), `${manifest.name}: 512 ${purpose} icon`);
  }
  assert(manifest.icons.some((icon) => icon.sizes === "192x192"), `${manifest.name}: 192 icon`);
  const sources = [
    ...manifest.icons.map((icon) => icon.src),
    ...(manifest.shortcuts ?? []).flatMap((shortcut) => (shortcut.icons ?? []).map((icon) => icon.src)),
  ];
  for (const src of sources) assert(await exists(src), `${manifest.name}: ${src} must exist in public/`);
};

Deno.test("the main manifest is a standalone app with real icons and shortcuts", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest")) as Manifest;
  assertEquals(manifest.id, "/");
  assertEquals(manifest.start_url, "/");
  assertEquals(manifest.scope, "/");
  assertEquals(manifest.display, "standalone");
  await checkIcons(manifest);
  assertEquals(
    (manifest.shortcuts ?? []).map((shortcut) => shortcut.url),
    ["/today", "/review", "/tutor", "/speaking", "/practice"],
  );
});

Deno.test("every skill is its own installable app on the same origin and account", async () => {
  const ids = new Set<string>(["/"]);
  for (const skill of SKILLS) {
    const manifest = JSON.parse(await read(`manifests/${skill.key}.webmanifest`)) as Manifest;
    assertEquals(manifest.start_url, skill.path);
    assertEquals(manifest.scope, "/", "scope / keeps Today, Review and Tutor inside the skill app");
    assertEquals(manifest.theme_color, SKILL_THEME[skill.key]);
    assert(manifest.name.startsWith("Schood "), manifest.name);
    assert(!ids.has(manifest.id), `${skill.key} needs a distinct manifest id`);
    ids.add(manifest.id);
    await checkIcons(manifest);
  }
});

Deno.test("skill app colours match the skill workspace accents", async () => {
  const css = await Deno.readTextFile(new URL("../src/english.css", import.meta.url));
  for (const skill of SKILLS) {
    const match = new RegExp(`\\.en-workspace\\.is-${skill.key} \\{ --skill-accent: (#[0-9a-f]{6})`, "i").exec(css);
    assertEquals(match?.[1]?.toLowerCase(), SKILL_THEME[skill.key].toLowerCase(), skill.key);
  }
});

Deno.test("the page offers the skill app inside a skill and Schood English elsewhere", () => {
  assertEquals(manifestFor("/").href, "/manifest.webmanifest");
  assertEquals(manifestFor("/today").href, "/manifest.webmanifest");
  assertEquals(manifestFor("/speakingx").skill, null);
  const speaking = manifestFor("/speaking/task/abc");
  assertEquals(speaking.href, "/manifests/speaking.webmanifest");
  assertEquals(speaking.appleIcon, "/icons/speaking-180.png");
  assertEquals(speaking.title, "Schood Speaking");
  assertEquals(skillOfPath("/grammar"), "grammar");
  assertEquals(skillOfPath("/settings"), null);
});

Deno.test("a new deploy is noticed from the entry script, never in dev builds", () => {
  const html = `<!doctype html><head><script type="application/ld+json">{}</script>
    <script type="module" crossorigin src="/assets/index-AbC123-p0123.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/react-vendor-x.js"></head>`;
  assertEquals(entryScriptFrom(html), "/assets/index-AbC123-p0123.js");
  assertEquals(entryScriptFrom(`<script type="module" src="/src/main.tsx"></script>`), null);
  assert(isNewBuild("/assets/index-a.js", "/assets/index-b.js"));
  assert(!isNewBuild("/assets/index-a.js", "/assets/index-a.js"));
  assert(!isNewBuild(null, "/assets/index-b.js"));
  assert(!isNewBuild("/assets/index-a.js", null));
});

Deno.test("the Today install card waits for the 2nd visit and respects dismissal", () => {
  const base = { standalone: false, dismissed: false, visits: 2, canPrompt: true, ios: false };
  assert(shouldShowInstallCard(base));
  assert(shouldShowInstallCard({ ...base, canPrompt: false, ios: true }));
  assert(!shouldShowInstallCard({ ...base, visits: 1 }));
  assert(!shouldShowInstallCard({ ...base, dismissed: true }));
  assert(!shouldShowInstallCard({ ...base, standalone: true }));
  assert(!shouldShowInstallCard({ ...base, canPrompt: false }), "no card where the device cannot install");
  assert(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5));
  assert(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), "iPadOS reports as a Mac");
  assert(!isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0));
  assert(!isIosDevice("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5));
});

Deno.test("a single-skill buyer sees that skill first, and nothing is hidden", () => {
  const one = new Set<SkillKey>(["speaking"]);
  assertEquals(focusSkillOf({ status: "ready", unlocked: one }), "speaking");
  assertEquals(focusSkillOf({ status: "loading", unlocked: one }), null);
  assertEquals(focusSkillOf({ status: "ready", unlocked: new Set<SkillKey>() }), null);
  assertEquals(focusSkillOf({ status: "ready", unlocked: new Set<SkillKey>(["speaking", "writing"]) }), null);
  const ordered = orderSkills(SKILLS, "speaking");
  assertEquals(ordered.length, SKILLS.length);
  assertEquals(ordered[0]?.key, "speaking");
  assertEquals(
    ordered.slice(1).map((skill) => skill.key),
    SKILLS.filter((skill) => skill.key !== "speaking").map((skill) => skill.key),
  );
  assertEquals(orderSkills(SKILLS, null).map((skill) => skill.key), SKILLS.map((skill) => skill.key));
  assertEquals(orderedSkills(new Set<SkillKey>(["grammar"]))[0]?.key, "grammar");
  assertEquals(orderedSkills(new Set<SkillKey>()).map((skill) => skill.key), SKILLS.map((skill) => skill.key));
});

Deno.test("install strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(pwaEn).sort();
  assertEquals(Object.keys(pwaRu).sort(), en);
  assertEquals(Object.keys(pwaUz).sort(), en);
  for (const [key, value] of [...Object.entries(pwaRu), ...Object.entries(pwaUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
  for (const [key, value] of Object.entries(pwaUz)) {
    assert(!/[og]'/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
  }
});

Deno.test("the service worker precaches the offline page and never caches the API", async () => {
  const worker = await read("sw.js");
  assertStringIncludes(worker, "const OFFLINE_URL = '/offline.html'");
  assertStringIncludes(worker, "PRECACHE = [OFFLINE_URL");
  assertStringIncludes(worker, "if (isApiOrigin(url) || url.origin !== self.location.origin) return;");
  assertStringIncludes(worker, "url.hostname.endsWith('.supabase.co')");
  assert(!worker.includes("const VERSION = 'v3'"), "the cache version must move past v3");
  assert(await exists("/offline.html"));
  const headers = (await read("_headers")).replace(/\r\n/g, "\n");
  assertStringIncludes(headers, "/sw.js\n  Cache-Control: no-cache");
});
