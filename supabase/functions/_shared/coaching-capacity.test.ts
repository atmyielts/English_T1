import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CoachingCapacity,
  coachingCapacity,
  createCoachingCapacityReader,
} from "./coaching-capacity.ts";
const quota = (used = 0, limit = 50, remaining = limit - used) => ({
  data: {
    free_model_daily_requests: { used, limit, remaining },
    label: "private account label",
  },
});
const config = {
  key: "synthetic",
  model: "test:free",
  baseUrl: "https://test.invalid/api/v1/",
};

Deno.test("free provider quota is confirmed before dispatch eligibility; exhausted and missing metadata disable it", () => {
  assertEquals(coachingCapacity(quota(10), true), {
    available: true,
    reason: "available",
    free_requests_remaining: 40,
    free_requests_limit: 50,
    budget_remaining_usd: null,
  });
  assertEquals(
    coachingCapacity(quota(50), true).reason,
    "provider_free_quota_exhausted",
  );
  assertEquals(coachingCapacity(quota(51, 50, 0), true).available, false);
  for (
    const data of [
      null,
      {},
      { data: {} },
      quota(-1),
      quota(1, 50, 51),
      quota(1, 50, 0),
      quota(1, 50, 48),
      {
        data: {
          free_model_daily_requests: { used: "1", limit: 50, remaining: 49 },
        },
      },
    ]
  ) {
    assertEquals(coachingCapacity(data, true).available, false);
  }
});

Deno.test("paid model eligibility requires a bounded provider budget and honors the smallest exhausted budget", () => {
  assertEquals(
    coachingCapacity({ data: { limit: null, budgets: [] } }, false).reason,
    "provider_budget_unconfigured",
  );
  assertEquals(
    coachingCapacity({ data: { limit: 5, limit_remaining: 2 } }, false)
      .available,
    true,
  );
  assertEquals(
    coachingCapacity({ data: { limit: 5, limit_remaining: 0 } }, false).reason,
    "provider_budget_exhausted",
  );
  for (
    const data of [
      { limit: 5, limit_remaining: -1 },
      { budgets: [{ limit_usd: 5, remaining_usd: -1 }] },
    ]
  ) {
    assertEquals(
      coachingCapacity({ data }, false).reason,
      "provider_budget_exhausted",
    );
  }
  assertEquals(
    coachingCapacity({
      data: { limit: null, budgets: [{ limit_usd: 5, remaining_usd: 2 }] },
    }, false).budget_remaining_usd,
    2,
  );
  assertEquals(
    coachingCapacity({
      data: {
        limit: 5,
        limit_remaining: 2,
        budgets: [{ limit_usd: 1, remaining_usd: 0 }],
      },
    }, false).available,
    false,
  );
  for (
    const data of [
      { limit: 5, limit_remaining: 6 },
      { limit: 5, limit_remaining: -1 },
      { limit: 5, limit_remaining: NaN },
      { budgets: [{ limit_usd: 5, remaining_usd: "2" }] },
    ]
  ) {
    assertEquals(coachingCapacity({ data }, false).available, false);
  }
});

Deno.test("concurrent quota readers share a bounded read and refresh expired capacity without provider generation", async () => {
  let requests = 0, clock = 0;
  const events: CoachingCapacity[] = [];
  const read = createCoachingCapacityReader(
    config,
    (async (input, init) => {
      requests++;
      assertEquals(String(input), "https://test.invalid/api/v1/key");
      assertEquals(init?.method, undefined);
      assertEquals(Boolean(init?.signal), true);
      return Response.json(quota(requests === 1 ? 10 : 50));
    }) as typeof fetch,
    (status) => events.push(status),
    () => clock,
  );
  assertEquals(
    (await Promise.all(Array.from({ length: 20 }, () => read()))).every((v) =>
      v.available
    ),
    true,
  );
  assertEquals(requests, 1);
  assertEquals(events.length, 1);
  assertEquals((await read()).available, true);
  assertEquals(requests, 1);
  clock = 30001;
  assertEquals((await read()).available, false);
  assertEquals(requests, 2);
  assertEquals(JSON.stringify(events).includes("private account label"), false);
});

Deno.test("capacity HTTP and transport failures cannot leak provider responses or grant availability", async () => {
  for (const status of [401, 402, 403, 429, 503]) {
    const events: CoachingCapacity[] = [];
    const read = createCoachingCapacityReader(
      config,
      (() =>
        Promise.resolve(
          new Response("private response and provider key", { status }),
        )) as typeof fetch,
      (v) => events.push(v),
    );
    assertEquals((await read()).reason, "provider_capacity_http_" + status);
    assertEquals(JSON.stringify(events).includes("private response"), false);
  }
  const read = createCoachingCapacityReader(
    config,
    (() =>
      Promise.reject(new Error("private transport details"))) as typeof fetch,
  );
  assertEquals((await read()).available, false);
});

Deno.test("unconfigured keys, oversized/malformed status responses and telemetry failures are handled without throwing", async () => {
  let calls = 0;
  const absent = createCoachingCapacityReader(
    { ...config, key: "" },
    (() => {
      calls++;
      return Promise.resolve(Response.json(quota()));
    }) as typeof fetch,
  );
  assertEquals((await absent()).reason, "provider_unconfigured");
  assertEquals(calls, 0);
  for (
    const response of [
      new Response("invalid JSON"),
      new Response('"' + "x".repeat(65537) + '"'),
    ]
  ) {
    const read = createCoachingCapacityReader(
      config,
      (() => Promise.resolve(response)) as typeof fetch,
    );
    assertEquals((await read()).available, false);
  }
  const read = createCoachingCapacityReader(
    config,
    (() => Promise.resolve(Response.json(quota()))) as typeof fetch,
    () => {
      throw new Error("private logger failure");
    },
  );
  assertEquals((await read()).available, true);
});
