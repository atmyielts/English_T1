import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import {
  workloadAssignment,
  workloadFilters,
} from "../../../packages/assessment-core/src/proctor-workload.ts";
import {
  createWorkloadHandler,
  type WorkloadRepository,
} from "./workload-handler.ts";
import { createWorkloadRepository } from "./workload-repository.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  sid = "20000000-0000-4000-8000-000000000001";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}
const repo = (calls: unknown[]): WorkloadRepository => ({
  user: async (token) => token === "valid" ? actor : null,
  read: async (...args) => {
    calls.push(["read", ...args]);
    return { rows: [], next: null };
  },
  staff: async (...args) => {
    calls.push(["staff", ...args]);
    return { rows: [], next: null };
  },
  command: async (...args) => {
    calls.push(["command", ...args]);
    return { rows: [] };
  },
});
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(
    `https://service.test/proctor/workload/${path}${
      path.includes("?") ? "&" : "?"
    }tenant_id=${tenant}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: "Bearer valid",
        origin: "https://allowed.test",
        "idempotency-key": "stable-reviewed-key",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
Deno.test("workload pages derive the actor and normalize only bounded filters and tuple cursor", async () => {
  const calls: unknown[] = [],
    handler = createWorkloadHandler(repo(calls), ["https://allowed.test"]);
  let result = await handler(
    request("sessions?limit=10&assignment=mine&actor_id=" + sid),
  );
  equal(result.status, 200);
  equal(result.headers.get("cache-control"), "no-store");
  equal(calls, [[
    "read",
    actor,
    tenant,
    workloadFilters({ limit: 10, assignment: "mine" }),
  ]]);
  result = await handler(
    request(
      "sessions?after=" +
        encodeURIComponent(
          JSON.stringify({ created_at: "2026-10-20T15:00:00+00:00", id: sid }),
        ),
    ),
  );
  equal(result.status, 200);
  for (
    const query of [
      "limit=0",
      "limit=51",
      "limit=2.5",
      "assignment=foreign",
      "state=invalid",
      "candidate_id=not-a-reference",
      "after=%7B",
      "after=" +
      encodeURIComponent(JSON.stringify({ created_at: "not-time", id: sid })),
    ]
  ) equal((await handler(request("sessions?" + query))).status, 422);
});
Deno.test("workload assignment strips actor, readiness, grade and bulk authority claims and sorts reviewed session revisions", async () => {
  const calls: unknown[] = [],
    handler = createWorkloadHandler(repo(calls), ["https://allowed.test"]),
    data = {
      user_id: actor,
      role: "observer",
      reason: "Reviewed institution shift coverage",
      targets: [{ session_id: sid, expected_revision: 4, actor_id: sid }],
      actor_id: sid,
      tenant_id: sid,
      score: 100,
      ready: true,
    };
  const response = await handler(
    request("commands", { action: "assignment.set", data }),
  );
  equal(response.status, 200);
  equal(calls, [[
    "command",
    actor,
    tenant,
    "stable-reviewed-key",
    "assignment.set",
    {
      user_id: actor,
      role: "observer",
      reason: data.reason,
      targets: [{ session_id: sid, expected_revision: 4 }],
    },
  ]]);
});
Deno.test("workload invalid targets, duplicate sessions, missing revisions and uncontrolled actions never reach persistence", async () => {
  const calls: unknown[] = [],
    handler = createWorkloadHandler(repo(calls), ["https://allowed.test"]),
    data = {
      user_id: actor,
      role: "observer",
      reason: "Reviewed institution shift coverage",
      targets: [{ session_id: sid, expected_revision: 0 }],
    };
  for (
    const value of [
      { ...data, role: "administrator" },
      { ...data, reason: "short" },
      { ...data, targets: [] },
      { ...data, targets: [...data.targets, ...data.targets] },
      { ...data, targets: [{ session_id: sid }] },
      { ...data, targets: [{ session_id: sid, expected_revision: -1 }] },
      { ...data, targets: Array(51).fill(data.targets[0]) },
    ]
  ) {
    equal(
      (await handler(
        request("commands", { action: "assignment.set", data: value }),
      )).status,
      422,
    );
  }
  equal(
    (await handler(request("commands", { action: "grade.invalidate", data })))
      .status,
    422,
  );
  equal(calls.length, 0);
});
Deno.test("workload origin, identity and bounded request body gates precede all writes", async () => {
  const calls: unknown[] = [],
    handler = createWorkloadHandler(repo(calls), ["https://allowed.test"]);
  equal(
    (await handler(
      request("sessions", undefined, { origin: "https://foreign.test" }),
    )).status,
    403,
  );
  equal(
    (await handler(
      request("sessions", undefined, { authorization: "Bearer invalid" }),
    )).status,
    401,
  );
  equal(
    (await handler(request("commands", { padding: "x".repeat(17000) }))).status,
    413,
  );
  equal(calls.length, 0);
});
Deno.test("workload staff paging is role-scoped and rejects forged broad directory options", async () => {
  const calls: unknown[] = [],
    handler = createWorkloadHandler(repo(calls), ["https://allowed.test"]);
  equal(
    (await handler(request("staff?role=reviewer&limit=4&after=" + sid))).status,
    200,
  );
  equal(calls, [["staff", actor, tenant, "reviewer", sid, 4]]);
  for (const query of ["role=owner", "limit=200", "after=bad"]) {
    equal((await handler(request("staff?" + query))).status, 422);
  }
});
Deno.test("workload database conflicts retain reviewed revision errors while private database faults are redacted", async () => {
  for (
    const [code, status, expected] of [
      ["23505", 409, "assignment_revision_conflict"],
      ["42501", 403, "supervisor_required"],
      ["XX000", 500, "database_error"],
    ] as const
  ) {
    const repository = createWorkloadRepository(async () => actor, {
      rpc: async () => ({
        data: null,
        error: {
          code,
          message: expected === "database_error"
            ? "private backend detail"
            : expected,
        },
      }),
    });
    try {
      await repository.read(actor, tenant, workloadFilters({}));
      throw new Error("Expected failure");
    } catch (cause) {
      if (!(cause instanceof ContractError)) throw cause;
      equal(cause.status, status);
      equal(cause.code, expected);
      if (status === 500 && cause.message.includes("private")) {
        throw new Error("Private diagnostic escaped");
      }
    }
  }
});
Deno.test("workload normalization is deterministic and preserves distinct role/change semantics", () => {
  const second = "20000000-0000-4000-8000-000000000002",
    data = {
      user_id: actor,
      role: "reviewer",
      reason: "Reviewed independent case allocation",
      targets: [{ session_id: second, expected_revision: 2 }, {
        session_id: sid,
        expected_revision: 1,
      }],
    };
  equal(workloadAssignment("assignment.remove", data).targets, [{
    session_id: sid,
    expected_revision: 1,
  }, { session_id: second, expected_revision: 2 }]);
});
Deno.test("workload cursor preserves microsecond ordering and valid non-UTC offsets", () => {
  for (
    const created_at of [
      "2026-10-20T22:10:00.123456+05:00",
      "2026-10-20T12:10:00.123456-05:00",
      "2026-10-20T17:10:00Z",
    ]
  ) {
    equal(workloadFilters({ after: { created_at, id: sid } }).after, {
      created_at,
      id: sid,
    });
  }
  for (
    const created_at of [
      "2026-10-20T17:10:00",
      "2026-10-20TbadZ",
      "2026-10-20T17:10:00.1234567Z",
    ]
  ) {
    let failed = false;
    try {
      workloadFilters({ after: { created_at, id: sid } });
    } catch (cause) {
      failed = cause instanceof ContractError;
    }
    equal(failed, true);
  }
});
