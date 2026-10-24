import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { depthEn } from "../src/i18n/depth.en.ts";
import { depthRu } from "../src/i18n/depth.ru.ts";
import { depthUz } from "../src/i18n/depth.uz.ts";

Deno.test("depth strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(depthEn).sort();
  assertEquals(Object.keys(depthRu).sort(), en);
  assertEquals(Object.keys(depthUz).sort(), en);
  for (const [key, value] of [...Object.entries(depthRu), ...Object.entries(depthUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("placeholders match across languages; Russian plurals have one/few/many", () => {
  const params = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(depthEn)) {
    assertEquals(params(depthRu[key] ?? ""), params(english), `ru ${key}`);
    assertEquals(params(depthUz[key] ?? ""), params(english), `uz ${key}`);
    for (const form of (depthRu[key] ?? "").matchAll(/\{\w+\|([^{}]*)\}/g)) {
      assert(/one:/.test(form[1]!) && /few:/.test(form[1]!) && /many:/.test(form[1]!), `ru plural ${key}`);
    }
  }
});

Deno.test("Uzbek uses the ʻ letter mark, not an ASCII apostrophe, in oʻ and gʻ", () => {
  for (const [key, value] of Object.entries(depthUz)) {
    assert(!/[og]['’]/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
  }
});

const sourceFiles = async (dir: URL): Promise<string[]> => {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) out.push(...await sourceFiles(url));
    else if (/\.(tsx?|ts)$/.test(entry.name)) out.push(await Deno.readTextFile(url));
  }
  return out;
};

Deno.test("every depth.* key used in the app exists in English", async () => {
  const sources = (await sourceFiles(new URL("../src/", import.meta.url))).join("\n");
  const used = new Set([...sources.matchAll(/['`](depth\.[A-Za-z0-9._-]+)['`]/g)].map((match) => match[1]!));
  // Keys built at runtime from a known set.
  for (const verdict of ["better", "worse", "same"]) used.add(`depth.compare.verdict.${verdict}`);
  for (const type of ["fill", "fix", "choose"]) used.add(`depth.lesson.type.${type}`);
  for (const status of ["done", "open", "tomorrow", "locked"]) used.add(`depth.project.status.${status}`);
  const missing = [...used].filter((key) => !key.endsWith(".") && !(key in depthEn));
  assertEquals(missing, []);
});
