import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anywhereEn } from "../src/i18n/anywhere.en.ts";
import { anywhereRu } from "../src/i18n/anywhere.ru.ts";
import { anywhereUz } from "../src/i18n/anywhere.uz.ts";

const sources = [
  "../src/components/shadow/ShadowPanel.tsx",
  "../src/components/shadow/ShadowButton.tsx",
  "../src/skills/speaking/Shadowing.tsx",
  "../src/skills/speaking/index.tsx",
  "../src/components/offline/OfflineDownloadCard.tsx",
  "../src/components/offline/runners.tsx",
  "../src/components/OfflineBanner.tsx",
  "../src/pages/OfflineSessionPage.tsx",
];

Deno.test("shadowing and offline strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(anywhereEn).sort();
  assertEquals(Object.keys(anywhereRu).sort(), en);
  assertEquals(Object.keys(anywhereUz).sort(), en);
  for (const [key, value] of [...Object.entries(anywhereRu), ...Object.entries(anywhereUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("placeholders match; Russian plurals have one/few/many; Uzbek uses the ʻ letter mark", () => {
  const params = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(anywhereEn)) {
    assertEquals(params(anywhereRu[key] ?? ""), params(english), `ru ${key}`);
    assertEquals(params(anywhereUz[key] ?? ""), params(english), `uz ${key}`);
    const ru = anywhereRu[key] ?? "";
    if (ru.includes("{count|")) assert(/one:/.test(ru) && /few:/.test(ru) && /many:/.test(ru), `ru plural ${key}`);
  }
  for (const [key, value] of Object.entries(anywhereUz)) {
    assert(!/[og]['‘’`]/i.test(value ?? ""), `${key} must write oʻ / gʻ with ʻ`);
  }
});

Deno.test("every key the new screens use exists, including the ones built at run time", async () => {
  for (const path of sources) {
    const text = await Deno.readTextFile(new URL(path, import.meta.url));
    for (const match of text.matchAll(/t\('((?:shadow|offline)\.[\w.]+)'/g)) {
      assert(anywhereEn[match[1]!], `${path}: missing ${match[1]}`);
    }
  }
  for (const pace of ["slow", "fast", "good"]) assert(anywhereEn[`shadow.pace.${pace}`]);
  for (const problem of ["quota", "unavailable", "network", "failed"]) assert(anywhereEn[`offline.error.${problem}`]);
  for (const reason of ["free_used", "not_found", "invalid", "no_access", "server"]) assert(anywhereEn[`offline.reason.${reason}`]);
});

Deno.test("the Shadowing page is under Speaking in the navigation", async () => {
  const nav = await Deno.readTextFile(new URL("../src/app/navModel.ts", import.meta.url));
  assertStringIncludes(nav, "{ to: '/speaking/shadowing', labelKey: 'shadow.nav'");
  const speaking = await Deno.readTextFile(new URL("../src/skills/speaking/index.tsx", import.meta.url));
  assertStringIncludes(speaking, '<Route path="shadowing"');
});

Deno.test("recordings never leave the browser", async () => {
  const recorder = await Deno.readTextFile(new URL("../src/lib/shadow/useShadowRecorder.ts", import.meta.url));
  const api = await Deno.readTextFile(new URL("../src/lib/shadow/api.ts", import.meta.url));
  assert(!/edge\(|fetch\(/.test(recorder), "the recorder makes no network calls");
  // The only thing sent about a take: four numbers/labels, no audio and no transcript.
  assertStringIncludes(api, "take: { score: number | null; words: number; seconds: number; source: ShadowSource }");
  assertStringIncludes(api, "body: take");
});
