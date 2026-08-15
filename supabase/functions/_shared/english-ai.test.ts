import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isEnglishAIConfigured } from "./english-ai.ts";

const managedKeys = [
  "ENGLISH_AI_PROVIDER",
  "ENGLISH_AI_FALLBACK",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_AI_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

const withEnvironment = async (
  values: Partial<Record<(typeof managedKeys)[number], string>>,
  run: () => void,
) => {
  const previous = new Map(managedKeys.map((key) => [key, Deno.env.get(key)]));
  try {
    managedKeys.forEach((key) => Deno.env.delete(key));
    Object.entries(values).forEach(([key, value]) => Deno.env.set(key, value));
    run();
  } finally {
    previous.forEach((value, key) =>
      value == null ? Deno.env.delete(key) : Deno.env.set(key, value)
    );
  }
};

Deno.test("OpenRouter-only English AI configuration is available", async () => {
  await withEnvironment({
    ENGLISH_AI_PROVIDER: "openai",
    ENGLISH_AI_FALLBACK: "openrouter",
    OPENROUTER_API_KEY: "test-key",
  }, () => assertEquals(isEnglishAIConfigured(), true));
});

Deno.test("disabled English AI fallback fails closed without a primary key", async () => {
  await withEnvironment({
    ENGLISH_AI_PROVIDER: "openai",
    ENGLISH_AI_FALLBACK: "none",
    OPENROUTER_API_KEY: "test-key",
  }, () => assertEquals(isEnglishAIConfigured(), false));
});
