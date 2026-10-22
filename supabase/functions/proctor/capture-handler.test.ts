import {
  type CaptureRepository,
  createCaptureHandler,
} from "./capture-handler.ts";
import { createCaptureRepository } from "./capture-repository.ts";
import { captureCommand } from "../../../packages/assessment-core/src/capture-launch.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001",
  device = "30000000-0000-4000-8000-000000000001";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(JSON.stringify({ a, b }));
  }
};
const binding = { device_id: device, token_hash: "a".repeat(64) };
function fixture(enabled = true) {
  const calls: unknown[][] = [],
    repo: CaptureRepository = {
      user: async (token) => token === "current" ? actor : null,
      read: async (...args) => {
        calls.push(["read", ...args]);
        return { session_id: id };
      },
      command: async (...args) => {
        calls.push(["command", ...args]);
        return { session_id: id };
      },
    };
  return {
    calls,
    handle: createCaptureHandler(repo, ["https://exam.test"], enabled),
  };
}
function req(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(
    `https://test/proctor/capture/${path}?tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer current",
        "idempotency-key": "capture-request-001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
Deno.test("capture preparation derives actor and strips claimed readiness, timers, sources and identity approval", async () => {
  const { calls, handle } = fixture();
  equal(
    (await handle(
      req("commands", {
        action: "capture.open",
        data: {
          registration_id: id,
          ...binding,
          ready: true,
          sources: ["camera"],
          deadline_at: "forged",
          identity_verified: true,
          actor: "forged",
        },
      }),
    )).status,
    200,
  );
  equal(calls[0], [
    "command",
    actor,
    tenant,
    "capture-request-001",
    "capture.open",
    { registration_id: id, ...binding },
  ]);
});
Deno.test("capture heartbeat and cancellation preserve binding, not supplied state changes", async () => {
  const { calls, handle } = fixture();
  for (const action of ["capture.heartbeat", "capture.cancel"]) {
    equal(
      (await handle(
        req("commands", {
          action,
          data: { session_id: id, ...binding, state: "active", approved: true },
        }),
      )).status,
      200,
    );
  }
  equal(calls[1], [
    "command",
    actor,
    tenant,
    "capture-request-001",
    "capture.cancel",
    { session_id: id, ...binding },
  ]);
});
Deno.test("capture launch is default off while own recovery reads, heartbeats and cancellation remain addressable", async () => {
  const { calls, handle } = fixture(false);
  equal(
    (await handle(
      req("commands", {
        action: "capture.open",
        data: { registration_id: id, ...binding },
      }),
    )).status,
    503,
  );
  equal(calls.length, 0);
  const response = await handle(req("sessions/" + id));
  equal(response.status, 200);
  equal(response.headers.get("cache-control"), "no-store");
  equal(
    (await handle(
      req("commands", {
        action: "capture.cancel",
        data: { session_id: id, ...binding },
      }),
    )).status,
    200,
  );
});
Deno.test("capture preparation rejects foreign origin, expired session, malformed proofs, payloads and fake ready commands", async () => {
  const { calls, handle } = fixture();
  equal(
    (await handle(
      req("sessions/" + id, undefined, { origin: "https://evil.test" }),
    )).status,
    403,
  );
  equal(
    (await handle(
      req("sessions/" + id, undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  for (
    const data of [{
      registration_id: id,
      device_id: device,
      token_hash: "bad",
    }, { registration_id: id, ...binding, device_id: "bad" }]
  ) {
    equal(
      (await handle(req("commands", { action: "capture.open", data }))).status,
      422,
    );
  }
  equal(
    (await handle(
      req("commands", {
        action: "capture.ready",
        data: { session_id: id, ...binding },
      }),
    )).status,
    422,
  );
  equal(
    (await handle(
      req("commands", {
        action: "capture.open",
        data: { ...binding, registration_id: id, unused: "x".repeat(9000) },
      }),
    )).status,
    413,
  );
  equal(calls.length, 0);
});
Deno.test("capture protocol rejects unsupported commands and normalizes each scoped identity", () => {
  equal(
    captureCommand("capture.open", {
      registration_id: id,
      ...binding,
      sources: ["screen"],
    }),
    { registration_id: id, ...binding },
  );
  for (const action of ["capture.override", "attempt.start", "capture.ready"]) {
    let rejected = false;
    try {
      captureCommand(action, { session_id: id, ...binding });
    } catch (cause) {
      rejected = cause instanceof ContractError;
    }
    equal(rejected, true);
  }
});
Deno.test("capture repository binds authority to private RPCs and redacts operational failures", async () => {
  const calls: unknown[] = [],
    repo = createCaptureRepository(async () => actor, {
      rpc: async (name, args) => {
        calls.push([name, args]);
        return { data: [], error: null };
      },
    });
  await repo.read(actor, tenant, id);
  await repo.command(actor, tenant, "key", "capture.open", {
    registration_id: id,
    ...binding,
  });
  equal(calls, [["proctor_capture_read", {
    p_actor: actor,
    p_tenant: tenant,
    p_session: id,
  }], ["proctor_capture_command_live_gate", {
    p_actor: actor,
    p_tenant: tenant,
    p_key: "key",
    p_action: "capture.open",
    p_data: { registration_id: id, ...binding },
    p_live_enabled:false,
  }]]);
  for (
    const [code, status] of [["42501", 403], ["23505", 409], ["P0002", 404], [
      "22023",
      422,
    ], ["XX000", 500]] as const
  ) {
    const failing = createCaptureRepository(async () => actor, {
      rpc: async () => ({
        data: null,
        error: { code, message: "private-sql-detail" },
      }),
    });
    try {
      await failing.read(actor, tenant, id);
      throw new Error("Expected failure");
    } catch (cause) {
      if (!(cause instanceof ContractError)) throw cause;
      equal(cause.status, status);
      if (status === 500 && cause.message.includes("private-sql-detail")) {
        throw new Error("SQL error leaked");
      }
    }
  }
});
