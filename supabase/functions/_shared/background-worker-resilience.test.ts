import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("scheduled workers can authenticate while the Data API is recovering", async () => {
  const [academy, domainEvents, domainEventsV2] = await Promise.all([
    read("../academy/index.ts"),
    read("../domain-events/index.ts"),
    read("../domain-events-v2/index.ts"),
  ]);

  assert(academy.includes('getOptionalEnv("ACADEMY_WORKER_SECRET")'));
  assert(domainEvents.includes('getOptionalEnv("DOMAIN_EVENTS_WORKER_SECRET")'));
  assert(domainEventsV2.includes('getOptionalEnv("DOMAIN_EVENTS_WORKER_SECRET")'));
});

Deno.test("background workers are staggered and the v2 worker accepts its internal secret", async () => {
  const [config, migration] = await Promise.all([
    read("../../config.toml"),
    read("../../migrations/20260911120000_stagger_background_workers.sql"),
  ]);

  assertMatch(config, /\[functions\.domain-events-v2\]\s+verify_jwt = false/);
  assert(migration.includes("'*/5 * * * *'"));
  assert(migration.includes("'1,6,11,16,21,26,31,36,41,46,51,56 * * * *'"));
  assert(migration.includes("'3,8,13,18,23,28,33,38,43,48,53,58 * * * *'"));
});
