import { createHandler, type Repository } from "./handler.ts";
import {
  type Definition,
  hash,
} from "../../../packages/assessment-core/src/mod.ts";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000001",
  id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const definition: Definition = {
  schema_version: "assessment.definition.v2",
  title: "Placement",
  locale: "en",
  duration_seconds: 600,
  shuffle_items: false,
  shuffle_options: false,
  sections: [{
    id: id(9),
    title: "Math",
    item_version_ids: [id(1), id(2), id(3)],
    draw_count: 2,
    blueprint: {
      schema_version: "assessment.blueprint.v1",
      rules: [{
        id: id(8),
        label: "Algebra exactly one",
        topics: ["Algebra"],
        difficulties: [],
        types: [],
        all_topics: false,
        minimum: 1,
        maximum: 1,
      }],
      minimum_points: 2,
      maximum_points: 2,
    },
  }],
};
const rows = [1, 2, 3].map((n) => ({
  id: id(n),
  payload: {
    schema_version: "assessment.item.v1",
    type: "numeric",
    prompt: `Private question ${n}`,
    locale: "en",
    max_score: 1,
    tags: [],
    classification: {
      topics: [n === 2 ? "Geometry" : "Algebra"],
      estimated_difficulty: "easy",
    },
  },
  created_by: actor,
  approved_by: id(99),
}));
function fixture() {
  const writes: Record<string, unknown>[] = [],
    repository: Repository = {
      user: async () => actor,
      workspaces: async () => [],
      capability: async () => true,
      list: async () => [],
      get: async (table) =>
        table === "assessment_definitions"
          ? { id: id(10), definition }
          : table === "assessment_registrations"
          ? { id: id(12), candidate_id: actor, window_id: id(11) }
          : table === "assessment_exam_windows"
          ? { assessment_version_id: id(10) }
          : table === "assessment_versions"
          ? { id: id(10), definition }
          : null,
      versions: async () => structuredClone(rows),
      windowRequirements: async () => [],
      key: async () => ({ key: { numeric: { value: 1, tolerance: 0 } } }),
      command: async (_a, _t, _k, _action, data) => {
        writes.push(data);
        return { id: id(10) };
      },
    };
  return {
    writes,
    repository,
    handler: () => createHandler({ repository, allowedOrigins: [] }),
  };
}
const request = (path: string, action: string, data: unknown) =>
  new Request(
    `https://service.test/assessment-cloud/${path}?tenant_id=${tenant}`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "idempotency-key": "blueprint-test-request",
        "if-match": "1",
      },
      body: JSON.stringify({ action, data }),
    },
  );
Deno.test("blueprint author preview requires bank plus author/publisher authority, returns counts but no prompts/keys and writes nothing", async () => {
  const f = fixture(),
    response = await f.handler()(
      request("blueprints/preview", "blueprint.preview", { definition }),
    ),
    body = await response.text();
  eq(response.status, 200);
  eq(body.includes("Private question"), false);
  eq(body.includes("numeric"), false);
  eq(f.writes.length, 0);
  f.repository.capability = async (_t, _a, cap) => cap !== "banks.read";
  eq(
    (await f.handler()(
      request("blueprints/preview", "blueprint.preview", { definition }),
    )).status,
    403,
  );
});
Deno.test("create/revise/publish compute deterministic satisfying witnesses from canonical approved versions, never client supplied selection", async () => {
  const f = fixture();
  for (
    const action of [
      "assessment.create",
      "assessment.revise",
      "assessment.publish",
    ]
  ) {
    const input = {
      id: id(10),
      definition,
      reason: "Reviewed requirement update",
      blueprint_witness: ["forged"],
    };
    eq((await f.handler()(request("commands", action, input))).status, 200);
    const selected = f.writes.at(-1)!.blueprint_witness as {
      item_version_ids: string[];
    }[];
    eq(selected[0].item_version_ids.length, 2);
    eq(selected[0].item_version_ids.includes(id(2)), true);
    eq(JSON.stringify(selected).includes("forged"), false);
  }
  eq(f.writes[0].blueprint_witness, f.writes[1].blueprint_witness);
  eq(f.writes[1].blueprint_witness, f.writes[2].blueprint_witness);
});
Deno.test("lost publication recovery rebuilds its immutable requested revision, not a later changed working definition", async () => {
  const f = fixture(), get = f.repository.get;
  f.repository.get = async (table, t, key) =>
    table === "assessment_definitions"
      ? {
        id: id(10),
        revision: 2,
        definition: {
          ...definition,
          title: "Later working definition",
          sections: [],
        },
      }
      : await get(table, t, key);
  f.repository.list = async (table, _tenant, filters) => {
    eq(table, "assessment_definition_revisions");
    eq(filters, { assessment_id: id(10), revision: "1" });
    return [{ definition }];
  };
  eq(
    (await f.handler()(
      request("commands", "assessment.publish", { id: id(10) }),
    )).status,
    200,
  );
  eq(
    (f.writes[0].blueprint_witness as { item_version_ids: string[] }[])[0]
      .item_version_ids.includes(id(2)),
    true,
  );
});
Deno.test("unsatisfiable or incomplete approved pools block publication before any canonical write", async () => {
  const f = fixture();
  f.repository.versions = async () =>
    rows.map((row) => ({
      ...row,
      payload: {
        ...row.payload,
        classification: { topics: ["Algebra"], estimated_difficulty: "easy" },
      },
    }));
  eq(
    (await f.handler()(
      request("commands", "assessment.create", { definition }),
    )).status,
    422,
  );
  eq(f.writes.length, 0);
  f.repository.versions = async () => rows.slice(1);
  eq(
    (await f.handler()(
      request("commands", "assessment.create", { definition }),
    )).status,
    422,
  );
  eq(f.writes.length, 0);
});
Deno.test("candidate forms meet quotas and hide classification; committed-form recovery reuses exact bytes instead of drawing again", async () => {
  const f = fixture();
  eq(
    (await f.handler()(
      request("commands", "attempt.start", {
        registration_id: id(12),
        manifest: "forged",
      }),
    )).status,
    200,
  );
  const committed = f.writes[0].manifest;
  eq(JSON.stringify(committed).includes("classification"), false);
  f.repository.list = async (table) =>
    table === "assessment_attempts" ? [{ id: id(20), form_id: id(21) }] : [];
  const get = f.repository.get;
  f.repository.get = async (table, t, key) =>
    table === "assessment_forms"
      ? { id: id(21), manifest: committed }
      : await get(table, t, key);
  eq(
    (await f.handler()(
      request("commands", "attempt.start", { registration_id: id(12) }),
    )).status,
    200,
  );
  eq(f.writes[1].manifest, committed);
});
Deno.test("question approval binds classification to the reviewed payload rather than accepting changed topic or difficulty under an old hash", async () => {
  const f = fixture(),
    old = rows[0].payload,
    changed = {
      ...old,
      classification: { topics: ["Geometry"], estimated_difficulty: "hard" },
    },
    key = { numeric: { value: 1, tolerance: 0 } };
  f.repository.get = async () => ({ id: id(1), payload: changed });
  const response = await f.handler()(
    request("commands", "item.approve", {
      id: id(1),
      review_hash: await hash({ item: old, key }),
    }),
  );
  eq(response.status, 409);
  eq(f.writes.length, 0);
});
