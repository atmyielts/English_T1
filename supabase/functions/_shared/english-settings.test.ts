import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  defaultEnglishSettings,
  isAIFeatureEnabled,
  isServicePaused,
  parseEnglishSettingsRows,
  pausedServices,
  validateEnglishSettingsPatch,
} from "./english-settings.ts";

const defaults = defaultEnglishSettings({});

Deno.test("defaults match behaviour before the settings table existed", () => {
  assertEquals(Object.values(defaults.services).every(Boolean), true);
  assertEquals(Object.keys(defaults.services).length, 8);
  assertEquals(defaults.free_activities_per_day, 1);
  assertEquals(defaults.ai, { enabled: true, daily_limit: 30, word_lookup_daily_limit: 60, features: {} });
});

Deno.test("env limits are the fallback when no row sets them", () => {
  const fromEnv = defaultEnglishSettings({ aiDailyLimit: "45", wordLookupLimit: "80" });
  assertEquals(fromEnv.ai.daily_limit, 45);
  assertEquals(fromEnv.ai.word_lookup_daily_limit, 80);
  // A row wins over env.
  const parsed = parseEnglishSettingsRows([{ key: "ai", value: { daily_limit: 12 } }], fromEnv);
  assertEquals(parsed.ai.daily_limit, 12);
  assertEquals(parsed.ai.word_lookup_daily_limit, 80);
});

Deno.test("rows override defaults; bad values keep the default", () => {
  const parsed = parseEnglishSettingsRows([
    { key: "services", value: { speaking: false, reading: "no", unknown: false } },
    { key: "free_activities_per_day", value: 3 },
    { key: "ai", value: { enabled: false, daily_limit: 9999, word_lookup_daily_limit: 0, features: { "tutor-chat": false, "Bad Key": false, "essay-grade": "off" } } },
    { key: "something_else", value: 1 },
  ], defaults);
  assertEquals(parsed.services.speaking, false);
  assertEquals(parsed.services.reading, true);
  assertEquals(parsed.free_activities_per_day, 3);
  assertEquals(parsed.ai.enabled, false);
  assertEquals(parsed.ai.daily_limit, 30);
  assertEquals(parsed.ai.word_lookup_daily_limit, 0);
  assertEquals(parsed.ai.features, { "tutor-chat": false });
  assertEquals(pausedServices(parsed), ["speaking"]);
});

Deno.test("empty or broken input gives the defaults", () => {
  assertEquals(parseEnglishSettingsRows(null, defaults), defaults);
  assertEquals(parseEnglishSettingsRows([{ key: "free_activities_per_day", value: -1 }, { key: "ai", value: "x" }], defaults), defaults);
});

Deno.test("parsing never mutates the defaults it was given", () => {
  const base = defaultEnglishSettings({});
  parseEnglishSettingsRows([{ key: "services", value: { grammar: false } }, { key: "ai", value: { features: { "word-lookup": false } } }], base);
  assertEquals(base.services.grammar, true);
  assertEquals(base.ai.features, {});
});

Deno.test("valid patches merge with the current settings and name the rows to write", () => {
  const result = validateEnglishSettingsPatch(defaults, {
    services: { immersion: false },
    ai: { daily_limit: 50, features: { "tutor-chat": false } },
    language_code: "en",
  });
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.settings.services.immersion, false);
  assertEquals(result.settings.services.reading, true);
  assertEquals(result.settings.ai.daily_limit, 50);
  assertEquals(result.settings.ai.word_lookup_daily_limit, 60);
  assertEquals(result.rows.map((row) => row.key).sort(), ["ai", "services"]);
  assertEquals(defaults.services.immersion, true);
});

Deno.test("invalid patches are refused with every reason", () => {
  const result = validateEnglishSettingsPatch(defaults, {
    services: { reading: "off", cooking: true },
    free_activities_per_day: 2.5,
    ai: { daily_limit: 0, word_lookup_daily_limit: 501, features: { "Not OK": true }, model: "gpt" },
    colour: "red",
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.errors.length, 8);
  assertEquals(validateEnglishSettingsPatch(defaults, {}).ok, false);
  assertEquals(validateEnglishSettingsPatch(defaults, [1]).ok, false);
  assertEquals(validateEnglishSettingsPatch(defaults, { free_activities_per_day: 0 }).ok, true);
});

Deno.test("pause and AI feature helpers", () => {
  const settings = parseEnglishSettingsRows([
    { key: "services", value: { tutor: false } },
    { key: "ai", value: { features: { "word-lookup": false } } },
  ], defaults);
  assertEquals(isServicePaused(settings, "tutor"), true);
  assertEquals(isServicePaused(settings, "reading"), false);
  assertEquals(isServicePaused(settings, "not-a-service"), false);
  assertEquals(isAIFeatureEnabled(settings, "word-lookup"), false);
  assertEquals(isAIFeatureEnabled(settings, "tutor-chat"), true);
  assertEquals(isAIFeatureEnabled(settings, "brand-new-feature"), true);
  const off = parseEnglishSettingsRows([{ key: "ai", value: { enabled: false } }], defaults);
  assertEquals(isAIFeatureEnabled(off, "tutor-chat"), false);
});
