import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { xpEn } from "../src/i18n/xp.en.ts";
import { xpRu } from "../src/i18n/xp.ru.ts";
import { xpUz } from "../src/i18n/xp.uz.ts";
import { BADGE_KEYS, LEAGUE_TIERS } from "../../../supabase/functions/_shared/english-xp.ts";

Deno.test("XP strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(xpEn).sort();
  assertEquals(Object.keys(xpRu).sort(), en);
  assertEquals(Object.keys(xpUz).sort(), en);
  for (const [key, value] of [...Object.entries(xpRu), ...Object.entries(xpUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("every badge and league tier has a name in every language", () => {
  for (const catalog of [xpEn, xpRu, xpUz]) {
    for (const key of BADGE_KEYS) {
      assert(catalog[`xp.badge.${key}.title`], `missing title for ${key}`);
      assert(catalog[`xp.badge.${key}.body`], `missing body for ${key}`);
    }
    for (const tier of LEAGUE_TIERS) assert(catalog[`xp.tier.${tier}`], `missing tier ${tier}`);
    assert(catalog["nav.league"], "missing nav.league");
  }
});

Deno.test("Uzbek uses the ʻ letter mark, not an ASCII apostrophe, in oʻ and gʻ", () => {
  for (const [key, value] of Object.entries(xpUz)) {
    assert(!/[og]'/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
  }
});
