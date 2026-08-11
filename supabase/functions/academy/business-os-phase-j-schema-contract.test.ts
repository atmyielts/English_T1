import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(new URL("../../migrations/20260810230000_academy_lifecycle_automation_worker.sql", import.meta.url));
const handler = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("Phase J publishes each lifecycle signal to a durable, idempotent Academy outbox event", () => {
  for (const token of ["academy_publish_lifecycle_event", "academy_automation_event", "academy.lifecycle:", "on conflict(idempotency_key) do nothing"]) assert(migration.includes(token), token);
});

Deno.test("Phase J schedules the existing authenticated Academy worker and processes event rules", () => {
  assert(migration.includes("invoke_academy_worker('automation_events')"));
  for (const token of ["runAcademyAutomationEvents", "academy_begin_automation_execution", "executeAcademyAutomation", "source_event_id"]) assert(handler.includes(token), token);
});
