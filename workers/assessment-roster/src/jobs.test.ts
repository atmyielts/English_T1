import {
  consumeRoster,
  dispatchRoster,
  type RosterJob,
  rosterJob,
} from "./jobs.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
const id = "10000000-0000-4000-8000-000000000001",
  job: RosterJob = {
    schema_version: "assessment.roster.job.v1",
    tenant_id: id,
    job_id: id,
    lease_token: id,
  };
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};
Deno.test("roster queue metadata strips candidate lists and privilege overrides", () => {
  equal(
    rosterJob({ ...job, targets: [id], actor_id: id, authorized_by: id }),
    job,
  );
});
Deno.test("roster dispatch bounds claims and never hides queue send failure", async () => {
  let sent = 0;
  equal(
    await dispatchRoster(async () => [job], {
      sendBatch: async (rows) => {
        sent += rows.length;
      },
    }, 1),
    1,
  );
  equal(sent, 1);
  try {
    await dispatchRoster(async () => [job], {
      sendBatch: async () => {
        throw new Error("Provider failed");
      },
    }, 1);
    throw new Error("Failure hidden");
  } catch (cause) {
    equal((cause as Error).message, "Provider failed");
  }
});
Deno.test("roster consumers acknowledge committed partial progress and terminal blocks, retry failures", async () => {
  const events: string[] = [];
  await consumeRoster([{
    body: job,
    attempts: 1,
    ack: () => events.push("partial"),
    retry: () => events.push("bad"),
  }, {
    body: job,
    attempts: 1,
    ack: () => events.push("blocked"),
    retry: () => events.push("bad"),
  }], async () => ({ id, state: events.length ? "blocked" : "queued" }));
  equal(events, ["partial", "blocked"]);
});
Deno.test("lost-step stale lease is acknowledged without reprocessing; unknown receipts are not accepted", async () => {
  const result: string[] = [];
  await consumeRoster([{
    body: job,
    attempts: 1,
    ack: () => result.push("stale"),
    retry: () => result.push("bad"),
  }], async () => {
    throw new ServiceError(409, "invalid_roster_lease", "Stale");
  });
  await consumeRoster([{
    body: job,
    attempts: 1,
    ack: () => result.push("bad"),
    retry: () => result.push("retry"),
  }], async () => ({ id, state: "success_without_commit" }));
  equal(result, ["stale", "retry"]);
});
Deno.test("roster poison metadata stays in retry/DLQ policy without any candidate side effects", async () => {
  let invoked = 0, retried = 0;
  await consumeRoster([{
    body: { ...job, lease_token: "bad" },
    attempts: 3,
    ack: () => {
      throw new Error("Poison acknowledged");
    },
    retry: (options) => {
      equal(options.delaySeconds, 240);
      retried++;
    },
  }], async () => {
    invoked++;
  });
  equal(invoked, 0);
  equal(retried, 1);
});
