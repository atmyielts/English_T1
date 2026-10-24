import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { glueEn } from "../src/i18n/glue.en.ts";
import { glueRu } from "../src/i18n/glue.ru.ts";
import { glueUz } from "../src/i18n/glue.uz.ts";
import { DAY_ENTRIES, SKILL_PAGES, YOU_ENTRIES } from "../src/app/navModel.ts";
import { INBOX_KINDS } from "../../../supabase/functions/_shared/english-inbox.ts";
import { JOURNEY_KINDS } from "../../../supabase/functions/_shared/english-journey.ts";
import { XP_PER_REVIEW_CORRECT } from "../../../supabase/functions/_shared/english-xp.ts";

Deno.test("glue strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(glueEn).sort();
  assertEquals(Object.keys(glueRu).sort(), en);
  assertEquals(Object.keys(glueUz).sort(), en);
  for (const [key, value] of [...Object.entries(glueRu), ...Object.entries(glueUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("placeholders match; Russian plurals have one/few/many; Uzbek uses ʻ", () => {
  const params = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(glueEn)) {
    assertEquals(params(glueRu[key] ?? ""), params(english), `ru ${key}`);
    assertEquals(params(glueUz[key] ?? ""), params(english), `uz ${key}`);
    const ru = glueRu[key] ?? "";
    if (ru.includes("{count|")) assert(/one:/.test(ru) && /few:/.test(ru) && /many:/.test(ru), `ru plural ${key}`);
  }
  for (const [key, value] of Object.entries(glueUz)) assert(!/[og]'/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
});

Deno.test("every inbox kind the server can send has a title in the app (operator 'system' notices bring their own)", () => {
  for (const kind of INBOX_KINDS) {
    if (kind === "system") continue;
    assert(glueEn[`glue.inbox.${kind}.title`], kind);
  }
  assert(glueEn["glue.inbox.system.title"]);
});

Deno.test("journey kinds the server sends are the ones the page knows", () => {
  assertEquals([...JOURNEY_KINDS].sort(), [
    "activity", "badge", "certificate", "check", "level_up", "mock", "placement", "review", "roleplay", "telegram_quiz", "words",
  ]);
});

Deno.test("navigation offers the journey and the inbox once, under You", () => {
  const all = [...DAY_ENTRIES, ...YOU_ENTRIES, ...Object.values(SKILL_PAGES).flat()];
  assertEquals(all.filter((entry) => entry?.to === "/journey").length, 1);
  assertEquals(all.filter((entry) => entry?.to === "/inbox").length, 1);
  assert(YOU_ENTRIES.some((entry) => entry.to === "/journey" && entry.labelKey === "glue.nav.journey"));
});

Deno.test("the app's review XP matches the server's rule", async () => {
  const source = await Deno.readTextFile(new URL("../src/lib/glue.ts", import.meta.url));
  assert(source.includes(`XP_PER_REVIEW_CORRECT = ${XP_PER_REVIEW_CORRECT};`));
});
