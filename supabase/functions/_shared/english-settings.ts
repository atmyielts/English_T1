// Operator switches for Schood English, stored in public.english_service_settings
// and edited from the platform admin "English control center"
// (admin-english-ops GET/PATCH /control).
//
// Reading never breaks learners: a missing table, a bad row or a slow
// database all fall back to DEFAULT behaviour (everything on, one free
// activity a day, AI daily limits from env or 30/60). Values are cached per
// isolate for about a minute, so a change in the admin takes up to ~60s to
// reach every running function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseEnglishAiDailyLimit } from "./english-access.ts";

export const ENGLISH_SERVICES = [
  "reading",
  "writing",
  "listening",
  "speaking",
  "grammar",
  "vocabulary",
  "immersion",
  "tutor",
] as const;
export type EnglishService = (typeof ENGLISH_SERVICES)[number];

/** Every English AI feature known today (a feature not listed still works and is enabled by default). */
export const KNOWN_ENGLISH_AI_FEATURES = [
  "coach-summary",
  "placement-test",
  "tutor-chat",
  "voice-conversation-turn",
  "pronunciation-feedback",
  "vocab-in-context",
  "grammar-decode",
  "essay-grade",
  "translation-compare",
  "idiom-extract",
  "dictation-generate",
  "daily-challenge",
  "cultural-notes",
  "goal-templates",
  "rubric-calibrate",
  "themed-week",
  "content-recommend",
  "shadowing-prep",
  "word-lookup",
  "speaking-feedback",
  "writing-feedback",
  "immersion-judge",
  "content-draft",
] as const;

export type EnglishSettings = {
  services: Record<EnglishService, boolean>;
  free_activities_per_day: number;
  ai: {
    enabled: boolean;
    /** Learner AI credits per UTC day (english_ai_usage_daily), 1..500. */
    daily_limit: number;
    /** New AI word meanings per learner day (tap-to-translate), 0..500. */
    word_lookup_daily_limit: number;
    /** Per-feature switches; a feature missing here is enabled. */
    features: Record<string, boolean>;
  };
};

export const SETTINGS_KEYS = ["services", "free_activities_per_day", "ai"] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export const FREE_PER_DAY_MAX = 20;
export const AI_DAILY_LIMIT_MAX = 500;
export const WORD_LOOKUP_LIMIT_MAX = 500;
const FEATURE_KEY = /^[a-z][a-z0-9-]{1,47}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const intIn = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
};

const envNumber = (key: string): string | undefined => {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
};

/** Today's behaviour: every service on, one free activity, AI limits from env (or 30 / 60). */
export const defaultEnglishSettings = (
  env: { aiDailyLimit?: string; wordLookupLimit?: string } = {
    aiDailyLimit: envNumber("ENGLISH_AI_DAILY_LIMIT"),
    wordLookupLimit: envNumber("WORD_AI_DAILY_LIMIT"),
  },
): EnglishSettings => ({
  services: Object.fromEntries(ENGLISH_SERVICES.map((service) => [service, true])) as Record<EnglishService, boolean>,
  free_activities_per_day: 1,
  ai: {
    enabled: true,
    daily_limit: parseEnglishAiDailyLimit(env.aiDailyLimit, 30),
    word_lookup_daily_limit: intIn(env.wordLookupLimit, 0, WORD_LOOKUP_LIMIT_MAX) ?? 60,
    features: {},
  },
});

/**
 * Builds settings from table rows. Lenient: anything missing or invalid keeps
 * its default, so one bad value never switches a service off by accident.
 */
export const parseEnglishSettingsRows = (
  rows: Array<{ key?: unknown; value?: unknown }> | null | undefined,
  defaults: EnglishSettings = defaultEnglishSettings(),
): EnglishSettings => {
  const out: EnglishSettings = {
    services: { ...defaults.services },
    free_activities_per_day: defaults.free_activities_per_day,
    ai: { ...defaults.ai, features: { ...defaults.ai.features } },
  };
  for (const row of rows ?? []) {
    const key = String(row?.key ?? "");
    const value = row?.value;
    if (key === "services" && isRecord(value)) {
      for (const service of ENGLISH_SERVICES) {
        if (typeof value[service] === "boolean") out.services[service] = value[service] as boolean;
      }
    } else if (key === "free_activities_per_day") {
      out.free_activities_per_day = intIn(value, 0, FREE_PER_DAY_MAX) ?? out.free_activities_per_day;
    } else if (key === "ai" && isRecord(value)) {
      if (typeof value.enabled === "boolean") out.ai.enabled = value.enabled;
      out.ai.daily_limit = intIn(value.daily_limit, 1, AI_DAILY_LIMIT_MAX) ?? out.ai.daily_limit;
      out.ai.word_lookup_daily_limit = intIn(value.word_lookup_daily_limit, 0, WORD_LOOKUP_LIMIT_MAX) ??
        out.ai.word_lookup_daily_limit;
      if (isRecord(value.features)) {
        for (const [feature, on] of Object.entries(value.features)) {
          if (FEATURE_KEY.test(feature) && typeof on === "boolean") out.ai.features[feature] = on;
        }
      }
    }
  }
  return out;
};

export type SettingsPatchResult =
  | { ok: true; settings: EnglishSettings; rows: Array<{ key: SettingsKey; value: unknown }> }
  | { ok: false; errors: string[] };

/**
 * Strict validation of an admin change. Accepts any subset of
 * { services: {skill: bool}, free_activities_per_day, ai: {enabled, daily_limit,
 * word_lookup_daily_limit, features: {feature: bool}} } and returns the merged
 * settings plus the rows to write. Unknown fields are errors, not ignored.
 */
export const validateEnglishSettingsPatch = (current: EnglishSettings, body: unknown): SettingsPatchResult => {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ["Send a JSON object."] };
  const next: EnglishSettings = {
    services: { ...current.services },
    free_activities_per_day: current.free_activities_per_day,
    ai: { ...current.ai, features: { ...current.ai.features } },
  };
  const touched = new Set<SettingsKey>();

  for (const field of Object.keys(body)) {
    if (field === "language_code") continue;
    if (!(SETTINGS_KEYS as readonly string[]).includes(field)) errors.push(`Unknown setting "${field}".`);
  }

  if ("services" in body) {
    const services = body.services;
    if (!isRecord(services)) {
      errors.push("services must be an object of on/off switches.");
    } else {
      for (const [service, on] of Object.entries(services)) {
        if (!(ENGLISH_SERVICES as readonly string[]).includes(service)) errors.push(`Unknown service "${service}".`);
        else if (typeof on !== "boolean") errors.push(`services.${service} must be true or false.`);
        else next.services[service as EnglishService] = on;
      }
      touched.add("services");
    }
  }

  if ("free_activities_per_day" in body) {
    const value = intIn(body.free_activities_per_day, 0, FREE_PER_DAY_MAX);
    if (value === null) errors.push(`free_activities_per_day must be a whole number from 0 to ${FREE_PER_DAY_MAX}.`);
    else next.free_activities_per_day = value;
    touched.add("free_activities_per_day");
  }

  if ("ai" in body) {
    const ai = body.ai;
    if (!isRecord(ai)) {
      errors.push("ai must be an object.");
    } else {
      for (const field of Object.keys(ai)) {
        if (!["enabled", "daily_limit", "word_lookup_daily_limit", "features"].includes(field)) errors.push(`Unknown AI setting "${field}".`);
      }
      if ("enabled" in ai) {
        if (typeof ai.enabled !== "boolean") errors.push("ai.enabled must be true or false.");
        else next.ai.enabled = ai.enabled;
      }
      if ("daily_limit" in ai) {
        const value = intIn(ai.daily_limit, 1, AI_DAILY_LIMIT_MAX);
        if (value === null) errors.push(`ai.daily_limit must be a whole number from 1 to ${AI_DAILY_LIMIT_MAX}.`);
        else next.ai.daily_limit = value;
      }
      if ("word_lookup_daily_limit" in ai) {
        const value = intIn(ai.word_lookup_daily_limit, 0, WORD_LOOKUP_LIMIT_MAX);
        if (value === null) errors.push(`ai.word_lookup_daily_limit must be a whole number from 0 to ${WORD_LOOKUP_LIMIT_MAX}.`);
        else next.ai.word_lookup_daily_limit = value;
      }
      if ("features" in ai) {
        if (!isRecord(ai.features)) {
          errors.push("ai.features must be an object of on/off switches.");
        } else {
          for (const [feature, on] of Object.entries(ai.features)) {
            if (!FEATURE_KEY.test(feature)) errors.push(`"${feature}" is not a valid feature name.`);
            else if (typeof on !== "boolean") errors.push(`ai.features.${feature} must be true or false.`);
            else next.ai.features[feature] = on;
          }
        }
      }
      touched.add("ai");
    }
  }

  if (errors.length) return { ok: false, errors };
  if (!touched.size) return { ok: false, errors: ["Nothing to change."] };
  return {
    ok: true,
    settings: next,
    rows: [...touched].map((key) => ({ key, value: next[key] })),
  };
};

export const isServicePaused = (settings: EnglishSettings, service: string): boolean =>
  (ENGLISH_SERVICES as readonly string[]).includes(service) && settings.services[service as EnglishService] === false;

export const pausedServices = (settings: EnglishSettings): EnglishService[] =>
  ENGLISH_SERVICES.filter((service) => settings.services[service] === false);

export const isAIFeatureEnabled = (settings: EnglishSettings, feature: string | null | undefined): boolean =>
  settings.ai.enabled && settings.ai.features[String(feature ?? "")] !== false;

/** Standard refusal when the owner has paused a service (admins are let through by the caller). */
export const servicePausedBody = (service: string) => ({
  error: "This part of Schood English is paused for a short while. Please try again later.",
  code: "service_paused",
  service,
});

// --- Loading -----------------------------------------------------------------

const CACHE_MS = 60_000;
const ERROR_CACHE_MS = 15_000;
const LOAD_TIMEOUT_MS = 1_500;
let cache: { at: number; ttl: number; value: EnglishSettings } | null = null;
let serviceClientCache: unknown = null;

/** A service-role client from the function's env, or null when env is missing (tests, scripts). */
export const englishServiceClient = (): any => {
  if (serviceClientCache) return serviceClientCache;
  const url = envNumber("SUPABASE_URL");
  const key = envNumber("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  serviceClientCache = createClient(url, key, { auth: { persistSession: false } });
  return serviceClientCache;
};

const withTimeout = <T>(promise: PromiseLike<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("english_settings_timeout")), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/** Current settings (cached ~60s). Never throws. Pass `fresh` after a write. */
export const loadEnglishSettings = async (sb?: any, options: { fresh?: boolean } = {}): Promise<EnglishSettings> => {
  const now = Date.now();
  if (!options.fresh && cache && now - cache.at < cache.ttl) return cache.value;
  const client = sb ?? englishServiceClient();
  if (!client) return defaultEnglishSettings();
  try {
    const { data, error } = await withTimeout<{ data: unknown; error: { message?: string } | null }>(
      client.from("english_service_settings").select("key, value"),
      LOAD_TIMEOUT_MS,
    );
    if (error) throw new Error(error.message ?? "read failed");
    const value = parseEnglishSettingsRows(Array.isArray(data) ? data : []);
    cache = { at: now, ttl: CACHE_MS, value };
    return value;
  } catch (error) {
    console.warn(JSON.stringify({
      event: "english_settings_fallback",
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    }));
    const value = cache?.value ?? defaultEnglishSettings();
    cache = { at: now, ttl: ERROR_CACHE_MS, value };
    return value;
  }
};

/** Drops the cached copy (this isolate only), e.g. right after an admin change. */
export const clearEnglishSettingsCache = () => {
  cache = null;
};
