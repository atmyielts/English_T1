import {
  createFeedbackHandler,
  type FeedbackRepository,
} from "./feedback-handler.ts";
import { createFeedbackRepository } from "./feedback-repository.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
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
    repo: FeedbackRepository = {
      user: async (token) => token === "current" ? actor : null,
      read: async (...args) => {
        calls.push(["read", ...args]);
        return [];
      },
      command: async (...args) => {
        calls.push(["command", ...args]);
        return { id };
      },
    };
  return {
    calls,
    handle: createFeedbackHandler(repo, ["https://school.test"]),
  };
}
function req(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(
    `https://test/assessment-cloud/feedback/${path}${
      path.includes("?") ? "&" : "?"
    }tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer current",
        "idempotency-key": "feedback-key-001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
Deno.test("feedback proposal derives actor and strips approval, active policy, snapshot and grade claims", async () => {
  const { handle, calls } = fixture();
  const response = await handle(req("commands", {
    action: "policy.propose",
    data: {
      window_id: id,
      expected_revision: 0,
      level: "questions",
      available_after: "2026-10-20T12:00:00+05:00",
      reason: " Review points ",
      approved_by: actor,
      active: true,
      scores: [10],
      feedback_snapshot: { level: "questions" },
    },
  }));
  equal(response.status, 200);
  equal(calls[0], [
    "command",
    actor,
    tenant,
    "feedback-key-001",
    "policy.propose",
    {
      expected_revision: 0,
      window_id: id,
      level: "questions",
      reason: "Review points",
      available_after: "2026-10-20T07:00:00.000Z",
    },
  ]);
  equal(response.headers.get("cache-control"), "no-store");
});
Deno.test("feedback approval and withholding project only explicit reviewed command fields", async () => {
  const { handle, calls } = fixture();
  await handle(
    req("commands", {
      action: "policy.approve",
      data: {
        id,
        expected_revision: 1,
        review_hash: "a".repeat(64),
        approved_by: actor,
      },
    }),
  );
  equal(calls[0], [
    "command",
    actor,
    tenant,
    "feedback-key-001",
    "policy.approve",
    { expected_revision: 1, id, review_hash: "a".repeat(64) },
  ]);
  for (const action of ["release.hold", "release.resume"]) {
    equal(
      (await handle(
        req("commands", {
          action,
          data: {
            id,
            expected_revision: 0,
            reason: "Investigate disclosure",
            held: false,
          },
        }),
      )).status,
      200,
    );
  }
  equal(calls[1]?.at(-1), {
    expected_revision: 0,
    id,
    reason: "Investigate disclosure",
  });
});
Deno.test("feedback paged resources bind sitting, approved run and cursor identities", async () => {
  const { handle, calls } = fixture();
  for (const kind of ["policy", "releases", "preview"]) {
    equal(
      (await handle(req(`${kind}/${id}?after=${actor}&limit=17`))).status,
      200,
    );
  }
  equal(calls[0], ["read", actor, tenant, "policy", id, actor, 17]);
  equal((await handle(req("sittings"))).status, 200);
  equal(calls[3], ["read", actor, tenant, "sittings", null, null, 50]);
});
Deno.test("feedback rejects unsupported disclosure, unsafe time, malformed revisions, reasons and hashes before writes", async () => {
  const { handle, calls } = fixture(),
    base = {
      window_id: id,
      expected_revision: 0,
      level: "questions",
      reason: "Review",
    };
  for (
    const patch of [
      { level: "answers" },
      { available_after: "tomorrow" },
      { available_after: "2026-10-20T00:00:00" },
      { expected_revision: -1 },
      { expected_revision: "0" },
      { reason: " " },
      { level: "totals", available_after: "2026-10-20T00:00:00Z" },
    ]
  ) {
    equal(
      (await handle(
        req("commands", {
          action: "policy.propose",
          data: { ...base, ...patch },
        }),
      )).status,
      422,
    );
  }
  equal(
    (await handle(
      req("commands", {
        action: "policy.approve",
        data: { id, expected_revision: 1, review_hash: "bad" },
      }),
    )).status,
    422,
  );
  equal((await handle(req("releases/" + id + "?limit=101"))).status, 422);
  equal(calls.length, 0);
});
Deno.test("feedback blocks unauthorized origins, expired auth, unbounded payloads and foreign actions", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(req("sittings", undefined, { origin: "https://evil.test" })))
      .status,
    403,
  );
  equal(
    (await handle(
      req("sittings", undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  equal(
    (await handle(
      req("commands", {
        action: "grade.release",
        data: { expected_revision: 0 },
      }),
    )).status,
    422,
  );
  equal(
    (await handle(
      req("commands", {
        action: "policy.propose",
        data: { reason: "x".repeat(17000) },
      }),
    )).status,
    413,
  );
  equal(calls.length, 0);
});
Deno.test("feedback repository uses canonical authority RPCs and redacts SQL operational errors", async () => {
  const calls: unknown[] = [],
    auth = {
      auth: {
        getUser: async () => ({ data: { user: { id: actor } }, error: null }),
      },
    };
  const repo = createFeedbackRepository(auth, {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: [], error: null };
    },
  });
  await repo.read(actor, tenant, "policy", id, null, 10);
  await repo.command(actor, tenant, "key", "policy.suspend", { window_id: id });
  equal(calls, [["assessment_feedback_read", {
    p_actor: actor,
    p_tenant: tenant,
    p_kind: "policy",
    p_id: id,
    p_after: null,
    p_limit: 10,
  }], ["assessment_feedback_command", {
    p_actor: actor,
    p_tenant: tenant,
    p_key: "key",
    p_action: "policy.suspend",
    p_data: { window_id: id },
  }]]);
  for (
    const [code, status] of [["42501", 403], ["23505", 409], ["P0002", 404], [
      "22023",
      422,
    ], ["XX000", 500]] as const
  ) {
    const failing = createFeedbackRepository(auth, {
      rpc: async () => ({
        data: null,
        error: { code, message: "internal-sql-detail" },
      }),
    });
    try {
      await failing.read(actor, tenant, "policy", id, null, 10);
      throw new Error("Expected failure");
    } catch (cause) {
      if (!(cause instanceof ContractError)) throw cause;
      equal(cause.status, status);
      if (status === 500 && cause.message.includes("internal-sql-detail")) {
        throw new Error("SQL details leaked");
      }
    }
  }
});
