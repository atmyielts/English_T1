import { createProctorHandler, type ProctorRepository } from "./handler.ts";
import { createCaptureRepository } from "./capture-repository.ts";
import { captureInteractionReady } from "../../../packages/assessment-core/src/capture-launch.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
Deno.test("warning-only interaction is explicit and active-only; absent policy or pre-clock capture never silently bypasses readiness", () => {
  equal(captureInteractionReady(true, false, "active", false), true);
  equal(captureInteractionReady(true, false, "preparing", false), false);
  equal(captureInteractionReady(true, false, "paused", false), false);
  equal(captureInteractionReady(true, false, "active", undefined), false);
  equal(captureInteractionReady(true, false, "active", true), false);
  equal(captureInteractionReady(true, true, "active", true), true);
});
Deno.test("live preflight requires independent live and recording admission without downgrading secure, second-camera or document policies", async () => {
  for (
    const [mode, level, second, expected] of [
      ["live", 0, false, true],
      ["secure_desktop", 0, false, false],
      ["center", 0, false, false],
      ["live", 2, false, false],
      ["live", 0, true, false],
    ] as const
  ) {
    const repository: ProctorRepository = {
      user: async () => actor,
      workspaces: async () => [],
      capability: async () => false,
      access: async () => false,
      list: async (table) =>
        table === "proctor_window_policies" ? [{ policy_id: actor }] : [],
      get: async (table) =>
        table === "assessment_registrations"
          ? { id: actor, candidate_id: actor, window_id: actor }
          : {
            id: actor,
            title: "Live policy",
            policy: {
              schema_version: "proctor.policy.v1",
              mode,
              identity_level: level,
              camera: true,
              microphone: true,
              screen: true,
              second_camera: second,
            },
          },
      command: async () => {
        throw new Error("Preflight made a write");
      },
    };
    for (
      const [captureLaunchEnabled, liveLaunchEnabled] of [[true, false], [
        false,
        true,
      ], [true, true]]
    ) {
      const request = new Request(
          `https://service.invalid/proctor/candidate/preflight?tenant_id=${tenant}&registration_id=${actor}`,
          { headers: { authorization: "Bearer synthetic" } },
        ),
        response = await createProctorHandler(repository, [], {
          captureLaunchEnabled,
          liveLaunchEnabled,
        })(request);
      equal(response.status, 200);
      const value = (await response.json()).data;
      equal(value.capture_required, true);
      equal(
        value.runtime_ready,
        captureLaunchEnabled && liveLaunchEnabled && expected,
      );
      equal(value.capture_enabled, value.runtime_ready);
    }
  }
});
Deno.test("capture repository passes only trusted default-off live admission and preserves heartbeat recovery", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [],
    database = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: { id: actor }, error: null };
      },
    };
  const capture = createCaptureRepository(async () => actor, database);
  await capture.command(actor, tenant, "capture-key", "capture.open", {
    registration_id: actor,
    p_live_enabled: true,
  });
  await capture.command(actor, tenant, "heartbeat-key", "capture.heartbeat", {
    session_id: actor,
  });
  equal(calls.map((call) => [call.name, call.args.p_live_enabled]), [[
    "proctor_capture_command_live_gate",
    false,
  ], ["proctor_capture_command", undefined]]);
  const enabledCapture = createCaptureRepository(async () => actor, database, {
    liveLaunchEnabled: true,
  });
  await enabledCapture.command(
    actor,
    tenant,
    "enabled-capture",
    "capture.open",
    { registration_id: actor },
  );
  equal(calls.at(-1)?.args.p_live_enabled, true);
});
