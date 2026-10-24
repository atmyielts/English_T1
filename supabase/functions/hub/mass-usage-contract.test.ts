import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("English AI routes enforce entitlement and quota before handlers", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const guardAt = source.indexOf("const isEnglishAiRequest");
  const firstAiHandlerAt = source.indexOf(
    'if (req.method === "GET" && route === "/insights/coach-summary")',
  );

  assert(guardAt >= 0, "English AI request guard must exist");
  assert(
    firstAiHandlerAt > guardAt,
    "English AI access guard must run before the first AI handler",
  );
  assertStringIncludes(
    source,
    "requireEnglishSuiteAccess(sb, auth.userId, products)",
  );
  // The credit is taken through the shared AI credit session (refunded on failure).
  const chargeAt = source.indexOf("await aiCredit.charge()");
  assert(chargeAt > guardAt && chargeAt < firstAiHandlerAt, "the AI credit must be charged before the first AI handler");
  const quotaModule = await Deno.readTextFile(
    new URL("../_shared/english-ai-quota.ts", import.meta.url),
  );
  assertStringIncludes(quotaModule, "consumeEnglishAiDailyQuota(");
  assertStringIncludes(source, 'code: "english_ai_daily_limit_reached"');
});

Deno.test("English Hub records bounded recovery signals and sanitizes server failures", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, 'route === "/client-events/recovery"');
  assertStringIncludes(source, 'event: "english_client_recovery"');
  assertStringIncludes(source, 'event: "english_hub_request_failed"');
  assertStringIncludes(source, 'code: "english_service_unavailable"');
  assert(
    !source.includes('return json(500, { error: error instanceof Error ? error.message'),
    "raw server errors must not be returned to clients",
  );
});

Deno.test("English AI quota storage is server-only and atomic", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260815120000_english_ai_mass_usage_guardrails.sql",
      import.meta.url,
    ),
  );

  assertStringIncludes(
    migration,
    "on conflict (user_id, usage_date) do update",
  );
  assertStringIncludes(
    migration,
    "where daily.request_count + excluded.request_count <= v_limit",
  );
  assertStringIncludes(migration, "security definer");
  assertStringIncludes(
    migration,
    "revoke all on table public.english_ai_usage_daily from public, anon, authenticated",
  );
  assertStringIncludes(
    migration,
    "grant execute on function public.consume_english_ai_daily_quota(uuid, integer, integer) to service_role",
  );
});
