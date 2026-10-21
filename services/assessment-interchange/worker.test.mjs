import { test } from "node:test";
import assert from "node:assert/strict";
import { runProcessor } from "./worker.mjs";
test("processor fairly claims one scan then one parse, never dispatching concurrent unrenewed claims", async () => {
  const calls = [], events = [], controller = new AbortController();
  await runProcessor({
    signal: controller.signal,
    once: true,
    ports: {
      async claim(stage, limit) {
        calls.push([stage, limit]);
        return [{ id: stage, stage }];
      },
    },
    async process(ticket) {
      calls.push(ticket.id);
      return { id: ticket.id, report_hash: "a".repeat(64) };
    },
    publish: (event) => events.push(event),
  });
  assert.deepEqual(calls, [["scan", 1], "scan", ["parse", 1], "parse"]);
  assert.equal(
    events.filter((row) => row.event === "qti.processing.committed").length,
    2,
  );
});
test("claim and processing outages do not manufacture verdicts or print credentials", async () => {
  const events = [], controller = new AbortController();
  await runProcessor({
    signal: controller.signal,
    once: true,
    ports: {
      async claim(stage) {
        if (stage === "scan") throw new Error("sensitive-provider-detail");
        return [{ stage }];
      },
    },
    async process() {
      throw new Error("sensitive-parser-detail");
    },
    publish: (event) => events.push(event),
  });
  assert.deepEqual(events.map((row) => row.event), [
    "qti.claim.failed",
    "qti.processing.failed",
  ]);
  assert.ok(!JSON.stringify(events).includes("sensitive"));
});
test("shutdown aborts running sandbox work and stops further claims", async () => {
  const controller = new AbortController(), stages = [], events = [];
  await runProcessor({
    signal: controller.signal,
    ports: {
      async claim(stage) {
        stages.push(stage);
        return [{ stage }];
      },
    },
    async process(_ticket, _ports, { signal }) {
      controller.abort();
      signal.throwIfAborted();
    },
    publish: (event) => events.push(event),
  });
  assert.deepEqual(stages, ["scan"]);
  assert.equal(events[0].event, "qti.processing.interrupted");
});
