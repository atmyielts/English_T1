import {
  type AppealRepository,
  createAppealHandler,
} from "./appeal-handler.ts";
import { createAppealRepository } from "./appeal-repository.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000003",
  id = "20000000-0000-4000-8000-000000000001";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(
    `https://test/functions/v1/assessment-cloud/appeals/${path}${
      path.includes("?") ? "&" : "?"
    }tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer current",
        "idempotency-key": "appeal-request-0001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
function fixture() {
  const calls: unknown[][] = [];
  const repository: AppealRepository = {
    user: async (token) => token === "current" ? actor : null,
    read: async (...args) => {
      calls.push(args);
      return [];
    },
    command: async (...args) => {
      calls.push(args);
      return { id, status: "submitted", revision: 1 };
    },
  };
  return {
    calls,
    repository,
    handle: createAppealHandler(repository, ["https://exam.schood.test"]),
  };
}
Deno.test("appeal transport derives current actor and strips privileged submission fields", async () => {
  const { handle, calls } = fixture();
  const response = await handle(
    request("commands", {
      action: "appeal.submit",
      data: {
        attempt_id: id,
        score_revision_id: id,
        category: "scoring",
        reason: " Check the marking ",
        candidate_id: id,
        status: "upheld",
        actor_id: id,
      },
    }),
  );
  equal(response.status, 200);
  equal(calls[0], [actor, tenant, "appeal-request-0001", "appeal.submit", {
    attempt_id: id,
    score_revision_id: id,
    category: "scoring",
    reason: "Check the marking",
  }]);
  equal(response.headers.get("cache-control"), "no-store");
});
Deno.test("appeal validation rejects empty reasons, invented outcomes and fractional revisions before writes", async () => {
  const { handle, calls } = fixture();
  for (
    const data of [{ category: "other", reason: "x" }, {
      category: "scoring",
      reason: "  ",
    }]
  ) {
    equal(
      (await handle(
        request("commands", {
          action: "appeal.submit",
          data: { attempt_id: id, score_revision_id: id, ...data },
        }),
      )).status,
      422,
    );
  }
  for (
    const data of [{ expected_revision: 1.2, outcome: "upheld" }, {
      expected_revision: 1,
      outcome: "change_score",
    }]
  ) {
    equal(
      (await handle(
        request("commands", {
          action: "appeal.decide",
          data: { appeal_id: id, explanation: "Checked", ...data },
        }),
      )).status,
      422,
    );
  }
  equal(calls.length, 0);
});
Deno.test("appeal list validates bounded cursor paging and detail ownership stays database-authoritative", async () => {
  const { handle, calls } = fixture();
  equal((await handle(request(`candidate?after=${id}&limit=25`))).status, 200);
  equal(calls[0], [actor, tenant, "candidate", null, id, 25]);
  equal((await handle(request(`${id}?limit=1`))).status, 200);
  equal(calls[1], [actor, tenant, "detail", id, null, 1]);
  equal((await handle(request("queue?limit=101"))).status, 422);
  equal(calls.length, 2);
});
Deno.test("appeal auth, origin, method and body size guards precede database work", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(
      request("candidate", undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  equal(
    (await handle(
      request("candidate", undefined, { origin: "https://attacker.test" }),
    )).status,
    403,
  );
  equal(
    (await handle(
      new Request(
        `https://test/assessment-cloud/appeals/candidate?tenant_id=${tenant}`,
        { method: "DELETE" },
      ),
    )).status,
    405,
  );
  equal(
    (await handle(
      request("commands", {
        action: "appeal.submit",
        data: { reason: "x".repeat(25000) },
      }),
    )).status,
    413,
  );
  equal(calls.length, 0);
});
Deno.test("appeal current authority errors are returned without false success", async () => {
  const { handle, repository } = fixture();
  repository.command = async () => {
    throw new ContractError(
      "independent_appeal_reviewer_required",
      "independent_appeal_reviewer_required",
      403,
    );
  };
  const response = await handle(
    request("commands", {
      action: "appeal.decide",
      data: {
        appeal_id: id,
        expected_revision: 1,
        outcome: "upheld",
        explanation: "Reviewed independently",
      },
    }),
  );
  equal(response.status, 403);
  equal((await response.json()).code, "independent_appeal_reviewer_required");
});
Deno.test("appeal repository maps production RPCs and database denial/conflict statuses", async () => {
  const calls: unknown[][] = [];
  let failure: { code: string; message: string } | null = null;
  const repository = createAppealRepository({
    auth: {
      getUser: async () => ({ data: { user: { id: actor } }, error: null }),
    },
  }, {
    rpc: async (...args) => {
      calls.push(args);
      return { data: [], error: failure };
    },
  });
  equal(await repository.user("current"), actor);
  await repository.read(actor, tenant, "queue", null, id, 25);
  equal(calls[0], ["assessment_appeal_read", {
    p_actor: actor,
    p_tenant: tenant,
    p_kind: "queue",
    p_id: null,
    p_after: id,
    p_limit: 25,
  }]);
  await repository.command(actor, tenant, "stable-key", "appeal.withdraw", {
    appeal_id: id,
  });
  equal(calls[1], ["assessment_appeal_command", {
    p_actor: actor,
    p_tenant: tenant,
    p_key: "stable-key",
    p_action: "appeal.withdraw",
    p_data: { appeal_id: id },
  }]);
  for (
    const [code, status] of [["42501", 403], ["23505", 409], ["P0002", 404], [
      "23514",
      422,
    ], ["XX000", 500]] as const
  ) {
    failure = { code, message: "private database message" };
    try {
      await repository.read(actor, tenant, "queue", null, null, 50);
      throw new Error("Expected failure");
    } catch (cause) {
      if (!(cause instanceof ContractError)) throw cause;
      equal(cause.status, status);
      if (status === 500) {
        equal(cause.message, "The appeals database request failed");
      }
    }
  }
});
