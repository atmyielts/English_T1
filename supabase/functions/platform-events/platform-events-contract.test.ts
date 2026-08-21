import {
  assert,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const migration = await Deno.readTextFile(
  new URL("../../migrations/20260821120000_platform_journey_measurement.sql", import.meta.url),
);

Deno.test("public journey intake is allow-listed, origin-bound, rate-limited, and PII-bounded", () => {
  assertStringIncludes(source, "EVENT_NAMES = new Set");
  assertStringIncludes(source, "allowedOrigin(origin)");
  assertStringIncludes(source, "PUBLIC_JOURNEY_HASH_SECRET");
  assertStringIncludes(source, "platform_journey_rate_limit_consume");
  assertStringIncludes(source, "SENSITIVE_METADATA_KEY");
  assert(!source.includes("ip:"), "raw IP addresses must not be inserted");
  assert(!source.includes("referrer:"), "full referrers must not be inserted");
});

Deno.test("journey tables are service-role-only and automatically retained", () => {
  assertStringIncludes(migration, "alter table public.platform_journey_events enable row level security");
  assertMatch(migration, /revoke all on table public\.platform_journey_events from public, anon, authenticated/i);
  assertMatch(migration, /grant select, insert, delete on table public\.platform_journey_events to service_role/i);
  assertStringIncludes(migration, "admin_platform_journey_funnel");
  assertStringIncludes(migration, "platform-journey-retention-v1");
  assertStringIncludes(migration, "created_at < now() - interval '180 days'");
});
