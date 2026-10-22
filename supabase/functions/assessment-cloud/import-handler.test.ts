import {
  createImportHandler,
  type ImportRepository,
} from "./import-handler.ts";
import { createImportRepository } from "./import-repository.ts";
import { BANK_CSV_TEMPLATE } from "../../../packages/assessment-core/src/bank-import.ts";
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
    repo: ImportRepository = {
      user: async (token) => token === "current" ? actor : null,
      read: async (...args) => {
        calls.push(["read", ...args]);
        return [];
      },
      command: async (...args) => {
        calls.push(["command", ...args]);
        return { id };
      },
      export: async (...args) => {
        calls.push(["export", ...args]);
        return { rows: [] };
      },
    };
  return {
    repo,
    calls,
    handle: createImportHandler(repo, ["https://school.test"]),
  };
}
function request(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(
    `https://test/functions/v1/assessment-cloud/imports/${path}${
      path.includes("?") ? "&" : "?"
    }tenant_id=${tenant}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer current",
        "idempotency-key": "import-request-0001",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
Deno.test("import handler derives actor, validates exact file and strips supplied manifest and approval fields", async () => {
  const { handle, calls } = fixture();
  const response = await handle(
    request("commands", {
      action: "stage",
      data: {
        bank_id: id,
        source_name: "bank.csv",
        format: "csv",
        source: BANK_CSV_TEMPLATE,
        rows: [{ approved: true }],
        actor: "spoofed",
      },
    }),
  );
  equal(response.status, 200);
  equal(calls[0], ["read", actor, tenant, "list", null, 0, 1]);
  const command = calls[1];
  equal(command.slice(0, 5), [
    "command",
    actor,
    tenant,
    "import-request-0001",
    "stage",
  ]);
  const data = command[5] as Record<string, unknown>;
  equal("actor" in data, false);
  equal((data.rows as unknown[]).length, 1);
});
Deno.test("invalid CSV returns bounded entry diagnostics and performs no write", async () => {
  const { handle, calls } = fixture();
  const response = await handle(
    request("commands", {
      action: "stage",
      data: {
        bank_id: id,
        source_name: "bad.csv",
        format: "csv",
        source: "type,locale,prompt,max_score\nnumeric,en,Value,1",
      },
    }),
  );
  equal(response.status, 422);
  equal((await response.json()).issues.length, 1);
  equal(calls.length, 1);
});
Deno.test("import confirmation pins revision and review hash without accepting supplied item rows", async () => {
  const { handle, calls } = fixture();
  equal(
    (await handle(
      request("commands", {
        action: "confirm",
        data: {
          id,
          expected_revision: 4,
          review_hash: "a".repeat(64),
          reason: "Reviewed destination and duplicates",
          rows: [],
          authorized_by: "spoof",
        },
      }),
    )).status,
    200,
  );
  equal(calls[0][5], {
    id,
    expected_revision: 4,
    reason: "Reviewed destination and duplicates",
    review_hash: "a".repeat(64),
  });
});
Deno.test("import transport denies untrusted origins/identity, bad paging, missing revision and unsupported action", async () => {
  const { handle } = fixture();
  equal(
    (await handle(request("jobs", undefined, { origin: "https://evil.test" })))
      .status,
    403,
  );
  equal(
    (await handle(
      request("jobs", undefined, { authorization: "Bearer expired" }),
    )).status,
    401,
  );
  equal((await handle(request("jobs?limit=101"))).status, 422);
  equal(
    (await handle(request("commands", { action: "step", data: { id } })))
      .status,
    422,
  );
  equal(
    (await handle(request("commands", { action: "approve", data: { id } })))
      .status,
    422,
  );
});
Deno.test("bank export maps current actor and protected snapshot cursor, is never publicly cached", async () => {
  const { handle, calls } = fixture();
  const response = await handle(
    request(
      "export?bank_id=" + id + "&after=" + actor +
        "&snapshot_at=2026-10-19T00%3A00%3A00Z",
    ),
  );
  equal(response.status, 200);
  equal(response.headers.get("cache-control"), "no-store");
  equal(calls[0], ["export", actor, tenant, id, actor, "2026-10-19T00:00:00Z"]);
});
Deno.test("import production repository uses explicit private RPC authority and does not leak internal SQL errors", async () => {
  const calls: unknown[] = [],
    repo = createImportRepository({
      auth: {
        getUser: async () => ({ data: { user: { id: actor } }, error: null }),
      },
    }, {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return {
          data: null,
          error: { code: "XX000", message: "sensitive database detail" },
        };
      },
    });
  try {
    await repo.command(actor, tenant, "import-key-001", "step", {
      id,
      expected_revision: 1,
    });
    throw new Error("Expected failure");
  } catch (cause) {
    equal(
      (cause as Error).message,
      "The private question-bank request failed.",
    );
  }
  equal(calls, [{
    name: "assessment_bank_import_command",
    args: {
      p_actor: actor,
      p_tenant: tenant,
      p_key: "import-key-001",
      p_action: "step",
      p_data: { id, expected_revision: 1 },
    },
  }]);
});
