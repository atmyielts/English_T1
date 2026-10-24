import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { socialEn } from "../src/i18n/social.en.ts";
import { socialRu } from "../src/i18n/social.ru.ts";
import { socialUz } from "../src/i18n/social.uz.ts";
import { shareLink, wrapLines } from "../src/lib/shareCardLayout.ts";
import { clockOffset, secondsLeftOn } from "../src/lib/duelClock.ts";

Deno.test("social strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(socialEn).sort();
  assertEquals(Object.keys(socialRu).sort(), en);
  assertEquals(Object.keys(socialUz).sort(), en);
  for (const [key, value] of [...Object.entries(socialRu), ...Object.entries(socialUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("placeholders match across languages; Russian plurals have one/few/many", () => {
  const params = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(socialEn)) {
    assertEquals(params(socialRu[key] ?? ""), params(english), `ru ${key}`);
    assertEquals(params(socialUz[key] ?? ""), params(english), `uz ${key}`);
    const ru = socialRu[key] ?? "";
    if (ru.includes("{count|")) assert(/one:/.test(ru) && /few:/.test(ru) && /many:/.test(ru), `ru plural ${key}`);
  }
});

Deno.test("Uzbek uses the ʻ letter mark, not an ASCII apostrophe, in oʻ and gʻ", () => {
  for (const [key, value] of Object.entries(socialUz)) {
    assert(!/[og]'/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
  }
});

Deno.test("share cards wrap text into lines and link back with a ref", () => {
  const measure = (text: string) => text.length * 10;
  assertEquals(wrapLines(measure, "one two three four", 100, 3), ["one two", "three four"]);
  assertEquals(wrapLines(measure, "one two three four five six", 70, 2), ["one two", "three…"]);
  assertEquals(shareLink("streak"), "https://english.schood.online/?ref=share_streak");
});

Deno.test("the duel timer follows the server clock", () => {
  assertEquals(clockOffset("2026-10-26T10:00:05.000Z", Date.parse("2026-10-26T10:00:00.000Z")), 5_000);
  assertEquals(clockOffset("not a date", 0), 0);
  // A device 5 s behind the server still shows the server's deadline.
  assertEquals(secondsLeftOn("2026-10-26T10:01:00.000Z", 5_000, Date.parse("2026-10-26T10:00:00.000Z")), 55);
  assertEquals(secondsLeftOn(null, 0, 0), 0);
});
