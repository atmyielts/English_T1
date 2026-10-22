import {
  type CohortRepository,
  createCohortHandler,
} from "./cohort-handler.ts";
import { createCohortRepository } from "./cohort-repository.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001",
  secret = "synthetic-roster-secret-for-local-tests-only";
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};
function fixture() {
  const calls: unknown[][] = [];
  const repository: CohortRepository = {
    user: async (token) => token === "current" ? actor : null,
    read: async (...args) => {
      calls.push(["read", ...args]);
      return [];
    },
    command: async (...args) => {
      calls.push(["command", ...args]);
      return { id };
    },
    claim: async (...args) => {
      calls.push(["claim", ...args]);
      return [];
    },
    step: async (...args) => {
      calls.push(["step", ...args]);
      return { id };
    },
  };
  return {
    calls,
    repository,
    handle: createCohortHandler(
      repository,
      ["https://assessment.test"],
      secret,
    ),
  };
}
const req = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(
    `https://test/assessment-cloud/cohorts/${path}${
      path.includes("?") ? "&" : "?"
    }tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer current",
        "idempotency-key": "cohort-request-0001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
Deno.test("cohort command derives actor and strips forged authority, members and worker fields", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(req("commands", {
      action: "member.add",
      data: {
        cohort_id: id,
        user_id: id,
        expected_revision: 2,
        extra_seconds: 300,
        reason: "Approved accommodation",
        actor_id: id,
        tenant_id: id,
        role: "owner",
        members: [id],
        lease_token: id,
      },
    }))).status,
    200,
  );
  equal(calls[0], [
    "command",
    actor,
    tenant,
    "cohort-request-0001",
    "member.add",
    {
      cohort_id: id,
      user_id: id,
      expected_revision: 2,
      extra_seconds: 300,
      reason: "Approved accommodation",
    },
  ]);
});
Deno.test("roster creation accepts reviewed source identifiers only, not caller-supplied candidates", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(
      req("commands", {
        action: "job.create",
        data: {
          cohort_id: id,
          window_id: id,
          review_hash: "a".repeat(64),
          targets: [id],
          processed: 20000,
          authorized_by: id,
        },
      }),
    )).status,
    200,
  );
  equal(calls[0], [
    "command",
    actor,
    tenant,
    "cohort-request-0001",
    "job.create",
    { cohort_id: id, window_id: id, review_hash: "a".repeat(64) },
  ]);
});
Deno.test("cohort reads preserve bounded tenant search/cursors and validate preview references", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(req(`directory?q=Candidate&limit=25&after=${id}`))).status,
    200,
  );
  equal(calls[0], [
    "read",
    actor,
    tenant,
    "directory",
    null,
    null,
    id,
    25,
    "Candidate",
  ]);
  equal(
    (await handle(req(`preview?cohort_id=${id}&window_id=${id}`))).status,
    200,
  );
  equal(calls[1], ["read", actor, tenant, "preview", id, id, null, 50, ""]);
  equal((await handle(req("groups?limit=101"))).status, 422);
});
Deno.test("roster worker authority is separate from candidate identity and strips injected actor", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(req("internal", { action: "job.claim", data: { limit: 1 } })))
      .status,
    403,
  );
  equal(
    (await handle(
      req("internal", {
        action: "job.step",
        data: {
          tenant_id: tenant,
          job_id: id,
          lease_token: id,
          actor_id: actor,
          targets: [id],
        },
      }, { "x-assessment-roster-key": secret }),
    )).status,
    200,
  );
  equal(calls[0], ["step", tenant, id, id]);
});
Deno.test("cohort auth, origin, precision and body limits reject before writes", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(
      req("directory", undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  equal(
    (await handle(req("directory", undefined, { origin: "https://evil.test" })))
      .status,
    403,
  );
  equal(
    (await handle(
      req("commands", {
        action: "member.add",
        data: {
          cohort_id: id,
          user_id: id,
          expected_revision: 1.1,
          reason: "Invalid",
        },
      }),
    )).status,
    422,
  );
  equal(
    (await handle(
      req("commands", {
        action: "cohort.create",
        data: { title: "x".repeat(33000) },
      }),
    )).status,
    413,
  );
  equal(calls.length, 0);
});
Deno.test("cohort production repository maps internal claims and private reads, preserving conflict statuses", async () => {
  const calls: unknown[][] = [];
  let error: { code: string; message: string } | null = null;
  const repository = createCohortRepository({
    auth: {
      getUser: async () => ({ data: { user: { id: actor } }, error: null }),
    },
  }, {
    rpc: async (...args) => {
      calls.push(args);
      return { data: [], error };
    },
  });
  await repository.step(tenant, id, id);
  equal(calls[0], ["assessment_roster_step", {
    p_tenant: tenant,
    p_job: id,
    p_lease: id,
  }]);
  await repository.read(
    actor,
    tenant,
    "directory",
    null,
    null,
    id,
    25,
    "Candidate",
  );
  equal(calls[1], ["assessment_cohort_read", {
    p_actor: actor,
    p_tenant: tenant,
    p_kind: "directory",
    p_id: null,
    p_window: null,
    p_after: id,
    p_limit: 25,
    p_query: "Candidate",
  }]);
  error = { code: "23505", message: "roster_review_changed" };
  try {
    await repository.command(actor, tenant, "test-key", "job.create", {});
    throw new Error("Conflict hidden");
  } catch (cause) {
    if (!(cause instanceof ContractError)) throw cause;
    equal(cause.status, 409);
    equal(cause.code, "roster_review_changed");
  }
});
