import {
  type AnalyticsRepository,
  createAnalyticsHandler,
} from "./analytics-handler.ts";
import { createAnalyticsRepository } from "./analytics-repository.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(JSON.stringify({ a, b }));
  }
};
function fixture() {
  const calls: unknown[][] = [],
    repo: AnalyticsRepository = {
      user: async (token) => token === "current" ? actor : null,
      read: async (...args) => {
        calls.push(["read", ...args]);
        return [];
      },
      create: async (...args) => {
        calls.push(["create", ...args]);
        return { id };
      },
      breakdown: async (...args) => {
        calls.push(["breakdown", ...args]);
        return { id };
      },
    };
  return {
    repo,
    calls,
    handle: createAnalyticsHandler(repo, ["https://school.test"]),
  };
}
function request(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(
    `https://test/functions/v1/assessment-cloud/analytics/${path}${
      path.includes("?") ? "&" : "?"
    }tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer current",
        "idempotency-key": "report-request-001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
Deno.test("analytics snapshot creation derives actor and strips caller-supplied populations, results and pass decisions", async () => {
  const { handle, calls } = fixture();
  const response = await handle(
    request("commands", {
      action: "snapshot.create",
      data: {
        window_id: id,
        threshold_percent: 70,
        reason: "Explore released results",
        actor: "spoof",
        scores: [100],
        official_pass: true,
      },
    }),
  );
  equal(response.status, 200);
  equal(calls[0], ["create", actor, tenant, "report-request-001", {
    window_id: id,
    cohort_id: null,
    threshold_percent: 70,
    reason: "Explore released results",
  }]);
});
Deno.test("analytics routes bind report/item/form cursors and use bounded pages", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(
      request(`reports/${id}?form=${"a".repeat(64)}&after=${actor}&limit=23`),
    )).status,
    200,
  );
  equal(calls[0], [
    "read",
    actor,
    tenant,
    "report",
    id,
    "a".repeat(64),
    actor,
    23,
  ]);
  equal(
    (await handle(
      request(`reports/${id}/forms?form=${"b".repeat(64)}&limit=100`),
    )).status,
    200,
  );
  equal(calls[1], [
    "read",
    actor,
    tenant,
    "forms",
    id,
    "b".repeat(64),
    null,
    100,
  ]);
});
Deno.test("candidate breakdown accepts only an attempt identity; owner and release eligibility remain canonical", async () => {
  const { handle, calls } = fixture();
  const response = await handle(
    request(
      "candidate/result?attempt_id=" + id + "&score_revision_id=" + actor +
        "&include_keys=true",
    ),
  );
  equal(response.status, 200);
  equal(calls[0], ["breakdown", actor, tenant, id]);
  equal(response.headers.get("cache-control"), "no-store");
});
Deno.test("analytics validation rejects invalid cutoffs, empty purposes, forged actions and malformed cursors", async () => {
  const { handle, calls } = fixture();
  for (const cutoff of [-1, 101, 0.0000001, "70"]) {
    equal(
      (await handle(
        request("commands", {
          action: "snapshot.create",
          data: { window_id: id, threshold_percent: cutoff, reason: "Explore" },
        }),
      )).status,
      422,
    );
  }
  equal(
    (await handle(request("commands", { action: "grade.release", data: {} })))
      .status,
    422,
  );
  equal((await handle(request("snapshots?limit=101"))).status, 422);
  equal((await handle(request("reports/" + id + "?form=bad"))).status, 422);
  equal(calls.length, 0);
});
Deno.test("analytics denies foreign origins, missing/expired authentication and unsupported methods before private work", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(
      request("snapshots", undefined, { origin: "https://evil.test" }),
    )).status,
    403,
  );
  equal(
    (await handle(
      request("snapshots", undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  equal(
    (await handle(
      new Request(
        `https://test/assessment-cloud/analytics/snapshots?tenant_id=${tenant}`,
        { method: "DELETE" },
      ),
    )).status,
    405,
  );
  equal(calls.length, 0);
});
Deno.test("analytics repository maps explicit authority-bearing RPCs and redacts operational SQL errors", async () => {
  const calls: unknown[] = [],
    repo = createAnalyticsRepository({
      auth: {
        getUser: async () => ({ data: { user: { id: actor } }, error: null }),
      },
    }, {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: { ok: true }, error: null };
      },
    });
  await repo.breakdown(actor, tenant, id);
  await repo.create(actor, tenant, "report-key-001", { window_id: id });
  equal(calls, [{
    name: "assessment_released_breakdown",
    args: { p_actor: actor, p_tenant: tenant, p_attempt: id },
  }, {
    name: "assessment_analytics_command",
    args: {
      p_actor: actor,
      p_tenant: tenant,
      p_key: "report-key-001",
      p_data: { window_id: id },
    },
  }]);
  const failed = createAnalyticsRepository({
    auth: { getUser: async () => ({ data: { user: null }, error: "expired" }) },
  }, {
    rpc: async () => ({
      data: null,
      error: { code: "XX000", message: "private query details" },
    }),
  });
  try {
    await failed.read(actor, tenant, "report", id, null, null, 50);
    throw new Error("Expected failure");
  } catch (cause) {
    equal(
      (cause as Error).message,
      "The canonical reporting database request failed.",
    );
  }
});
