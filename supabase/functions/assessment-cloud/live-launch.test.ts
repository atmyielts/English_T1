import {
  type AssessmentDatabase,
  createAssessmentRepository,
} from "./repository.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
Deno.test("academic live start admission comes only from trusted default-off configuration; other commands keep their authority path", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [],
    database = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: { id: actor }, error: null };
      },
      from: () => {
        throw new Error("Unexpected table read");
      },
    } as unknown as AssessmentDatabase;
  const auth = {
      auth: {
        getUser: async () => ({ data: { user: { id: actor } }, error: null }),
      },
    },
    repository = createAssessmentRepository(auth, database);
  await repository.command(actor, tenant, "start-key", "attempt.start", {
    registration_id: actor,
    p_live_enabled: true,
  });
  await repository.command(actor, tenant, "bank-key", "bank.create", {
    title: "Example",
  });
  equal(calls.map((call) => [call.name, call.args.p_live_enabled]), [[
    "assessment_command_live_gate",
    false,
  ], ["assessment_command", undefined]]);
  await createAssessmentRepository(auth, database, { liveLaunchEnabled: true })
    .command(actor, tenant, "enabled-start", "attempt.start", {
      registration_id: actor,
    });
  equal(calls.at(-1)?.args.p_live_enabled, true);
});
