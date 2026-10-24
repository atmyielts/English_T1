import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { practiceEn } from "../src/i18n/practice.en.ts";
import { practiceRu } from "../src/i18n/practice.ru.ts";
import { practiceUz } from "../src/i18n/practice.uz.ts";
import { CRITERIA, PRACTICE_TARGETS } from "../../../supabase/functions/_shared/english-speaking-mock.ts";

Deno.test("practice strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(practiceEn).sort();
  assertEquals(Object.keys(practiceRu).sort(), en);
  assertEquals(Object.keys(practiceUz).sort(), en);
  for (const [key, value] of [...Object.entries(practiceRu), ...Object.entries(practiceUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("every criterion and practice target the server can send has a label", () => {
  for (const catalog of [practiceEn, practiceRu, practiceUz]) {
    for (const criterion of CRITERIA) assert(catalog[`mock.criterion.${criterion}`], criterion);
    for (const target of PRACTICE_TARGETS) assert(catalog[`mock.practice.${target}`], target);
  }
});

Deno.test("placeholders match across languages; Russian plurals have one/few/many", () => {
  const params = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(practiceEn)) {
    assertEquals(params(practiceRu[key] ?? ""), params(english), `ru ${key}`);
    assertEquals(params(practiceUz[key] ?? ""), params(english), `uz ${key}`);
    const ru = practiceRu[key] ?? "";
    if (ru.includes("{count|")) assert(/one:/.test(ru) && /few:/.test(ru) && /many:/.test(ru), `ru plural ${key}`);
  }
});

Deno.test("Uzbek uses the ʻ letter mark, not an ASCII apostrophe, in oʻ and gʻ", () => {
  for (const [key, value] of Object.entries(practiceUz)) {
    assert(!/[og]'/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
  }
});
