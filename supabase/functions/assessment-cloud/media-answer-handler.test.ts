import {
  createMediaAnswerHandler,
  type MediaAnswerRepository,
} from "./media-answer-handler.ts";
import { createMediaAnswerRepository } from "./media-answer-repository.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(
      `Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`,
    );
  }
}
const data = {
  attempt_id: actor,
  item_version_id: actor,
  source: "upload",
  upload: {
    filename: "answer.pdf",
    mime: "application/pdf",
    byte_length: 3,
    parts: [{ sha256: "a".repeat(64), byte_length: 3 }],
  },
  lease: { device_id: actor, token: "b".repeat(64), epoch: 1 },
};
function request(
  action = "upload.begin",
  value: unknown = data,
  headers: Record<string, string> = {},
) {
  return new Request(
    `https://test.invalid/assessment-cloud/answers/commands?tenant_id=${tenant}`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer valid",
        "idempotency-key": "answer-command-001",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ action, data: value }),
    },
  );
}
function fixture() {
  const calls: unknown[][] = [];
  const repository: MediaAnswerRepository = {
    user: (token) => Promise.resolve(token === "valid" ? actor : null),
    read: (...args) => {
      calls.push(args);
      return Promise.resolve([]);
    },
    command: (...args) => {
      calls.push(args);
      return Promise.resolve({ id: actor });
    },
  };
  return { repository, calls };
}
Deno.test("media answer admission defaults off while authenticated read/cancel recovery remains available", async () => {
  const { repository, calls } = fixture(),
    handle = createMediaAnswerHandler(repository, []);
  equal((await handle(request())).status, 503);
  equal(calls.length, 0);
  equal(
    (await handle(request("upload.cancel", { artifact_id: actor }))).status,
    200,
  );
  equal(
    (await handle(
      new Request(
        `https://test.invalid/assessment-cloud/answers/uploads?tenant_id=${tenant}&attempt_id=${actor}&item_version_id=${actor}`,
        { headers: { authorization: "Bearer valid" } },
      ),
    )).status,
    200,
  );
  equal(calls.length, 2);
});
Deno.test("media answer admission matches the actual coordinator token digest and strips caller authority", async () => {
  const { repository, calls } = fixture(),
    handle = createMediaAnswerHandler(repository, [], true);
  equal(
    (await handle(
      request("upload.begin", {
        ...data,
        state: "ready",
        actor: tenant,
        content_hash: "c".repeat(64),
        scanner: "forged",
        lease: { ...data.lease, token_hash: "forged" },
      }),
    )).status,
    200,
  );
  const call = calls[0],
    forwarded = call[4] as Record<string, unknown>,
    lease = forwarded.lease as Record<string, unknown>;
  equal(call.slice(0, 4), [
    actor,
    tenant,
    "answer-command-001",
    "upload.begin",
  ]);
  equal(Object.keys(forwarded).sort(), [
    "attempt_id",
    "item_version_id",
    "lease",
    "source",
    "upload",
  ]);
  equal(Object.keys(lease).sort(), ["device_id", "epoch", "token_hash"]);
  const { digest } = await import(
    "../../../workers/assessment-coordinator/src/protocol.ts"
  );
  const expected = await digest(data.lease.token);
  equal(lease.token_hash, expected);
});
Deno.test("answer routes enforce origins, authentication, strict command shapes and bounded metadata", async () => {
  const { repository, calls } = fixture(),
    handle = createMediaAnswerHandler(
      repository,
      ["https://exam.invalid"],
      true,
    );
  equal(
    (await handle(
      request("upload.begin", data, { origin: "https://foreign.invalid" }),
    )).status,
    403,
  );
  equal(
    (await handle(
      request("upload.begin", data, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  equal((await handle(request("scan.report"))).status, 422);
  equal(
    (await handle(
      request("upload.begin", { ...data, lease: { ...data.lease, epoch: 0 } }),
    )).status,
    422,
  );
  equal(
    (await handle(
      request("upload.begin", { ...data, padding: "x".repeat(400001) }),
    )).status,
    413,
  );
  equal(calls.length, 0);
  const response = await handle(
    request("upload.cancel", { artifact_id: actor }, {
      origin: "https://exam.invalid",
    }),
  );
  equal(response.headers.get("cache-control"), "no-store");
  equal(
    response.headers.get("access-control-allow-origin"),
    "https://exam.invalid",
  );
});
Deno.test("committed capture continuity rejection is not an admission receipt", async () => {
  const { repository } = fixture();
  repository.command = () =>
    Promise.resolve({ rejected: "capture_continuity_required" });
  const response = await createMediaAnswerHandler(repository, [], true)(
    request(),
  );
  equal(response.status, 422);
  equal((await response.json()).code, "capture_continuity_required");
});
Deno.test("media repository uses authenticated identity, dedicated RPCs and non-leaking database errors", async () => {
  const calls: unknown[][] = [],
    auth = {
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: { id: actor } }, error: null }),
      },
    };
  const repo = createMediaAnswerRepository(auth, {
    rpc: (name, args) => {
      calls.push([name, args]);
      return Promise.resolve({ data: [], error: null });
    },
  });
  equal(await repo.user("valid"), actor);
  await repo.read(actor, tenant, actor, actor);
  await repo.command(actor, tenant, "stable-key", "upload.begin", {});
  equal(calls, [["assessment_answer_read", {
    p_actor: actor,
    p_tenant: tenant,
    p_attempt: actor,
    p_item: actor,
  }], ["assessment_answer_command", {
    p_actor: actor,
    p_tenant: tenant,
    p_key: "stable-key",
    p_action: "upload.begin",
    p_data: {},
  }]]);
  for (
    const [code, expected] of [["42501", 403], ["23505", 409], ["P0002", 404], [
      "23514",
      422,
    ], ["XX000", 500]] as const
  ) {
    const failing = createMediaAnswerRepository(auth, {
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { code, message: "private detail" },
        }),
    });
    let error: unknown;
    try {
      await failing.read(actor, tenant, actor, actor);
    } catch (cause) {
      error = cause;
    }
    equal(error instanceof ContractError && error.status, expected);
    if (expected === 500) {
      equal((error as Error).message.includes("private detail"), false);
    }
  }
});
