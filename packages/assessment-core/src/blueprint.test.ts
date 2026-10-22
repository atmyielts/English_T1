import {
  blueprint,
  BLUEPRINT_PROTOCOL,
  BlueprintError,
  type BlueprintRule,
  classification,
  satisfiesBlueprint,
  selectBlueprint,
} from "./blueprint.ts";
import {
  buildManifest,
  type Item,
  ITEM_TYPES,
  validateDefinition,
  validateItem,
} from "./mod.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const assert = (value: unknown, message = "Assertion failed") => {
  if (!value) throw Error(message);
};
const equal = (a: unknown, b: unknown) =>
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
  );
const rule = (extra: Partial<BlueprintRule> = {}) => ({
  id: id(90),
  label: "Algebra requirement",
  topics: ["Algebra"],
  difficulties: [],
  types: [],
  all_topics: false,
  minimum: 1,
  maximum: 2,
  ...extra,
});
const question = (
  n: number,
  topics: string[],
  difficulty: "easy" | "medium" | "hard",
  points = 1,
) => ({
  id: id(n),
  item: {
    schema_version: "assessment.item.v1",
    type: "numeric",
    prompt: `Question ${n}`,
    locale: "en",
    max_score: points,
    tags: [],
    classification: { topics, estimated_difficulty: difficulty },
  } as Item,
  key: { numeric: { value: n, tolerance: 0 } },
  approved_by: id(80),
  created_by: id(81),
});
Deno.test("blueprint overlapping topic/difficulty/type quotas and exact point bounds select a reproducible satisfying subset without changing input", () => {
  const pool = [
      question(1, ["Algebra", "Reasoning"], "hard", 2),
      question(2, ["Algebra"], "easy", .1),
      question(3, ["Geometry"], "easy", .2),
      question(4, ["Geometry", "Reasoning"], "medium", 3),
    ],
    before = JSON.stringify(pool),
    constraints = blueprint(
      {
        schema_version: BLUEPRINT_PROTOCOL,
        rules: [
          rule({ maximum: 1 }),
          rule({
            id: id(91),
            label: "Easy",
            topics: [],
            difficulties: ["easy"],
            minimum: 1,
            maximum: 2,
          }),
          rule({
            id: id(92),
            label: "Both topics",
            topics: ["Algebra", "Reasoning"],
            all_topics: true,
            minimum: 0,
            maximum: 0,
          }),
        ],
        minimum_points: .3,
        maximum_points: .3,
      },
      2,
      ITEM_TYPES,
    );
  const selected = selectBlueprint(pool, 2, constraints, () => 0);
  equal(selected.map((q) => q.id), [id(2), id(3)]);
  assert(satisfiesBlueprint(selected, constraints));
  equal(selectBlueprint(pool, 2, constraints, () => 0), selected);
  equal(JSON.stringify(pool), before);
});
Deno.test("blueprint distinguishes proved infeasibility, fixed-set failure and indeterminate search capacity without relaxing quotas", () => {
  const pool = [
      question(1, ["Algebra"], "easy"),
      question(2, ["Geometry"], "hard"),
      question(3, ["Geometry"], "easy"),
    ],
    constraints = blueprint(
      {
        schema_version: BLUEPRINT_PROTOCOL,
        rules: [rule({ minimum: 2, maximum: 2 })],
      },
      2,
      ITEM_TYPES,
    );
  for (const draw of [2, 3]) {
    let code = "";
    try {
      selectBlueprint(pool, draw, constraints, () => 0);
    } catch (error) {
      code = (error as BlueprintError).code;
    }
    equal(code, "blueprint_infeasible");
  }
  let code = "";
  try {
    selectBlueprint(
      pool,
      2,
      blueprint(
        { schema_version: BLUEPRINT_PROTOCOL, rules: [rule()] },
        2,
        ITEM_TYPES,
      ),
      () => 0,
      { remaining: 0 },
    );
  } catch (error) {
    code = (error as BlueprintError).code;
  }
  equal(code, "blueprint_search_limit");
});
Deno.test("bounded exact solver agrees with exhaustive feasibility for overlapping generated small banks", () => {
  for (let seed = 0; seed < 48; seed++) {
    const pool = Array.from(
      { length: 8 },
      (_, i) =>
        question(
          i + 1,
          [...(i & 1 ? ["Algebra"] : []), ...(i & 2 ? ["Reasoning"] : [])],
          i & 4 ? "hard" : "easy",
          i % 3 + 1,
        ),
    );
    const constraints = blueprint(
      {
        schema_version: BLUEPRINT_PROTOCOL,
        rules: [
          rule({ minimum: seed % 4, maximum: 3 }),
          rule({
            id: id(91),
            label: "Reasoning",
            topics: ["Reasoning"],
            minimum: Math.floor(seed / 4) % 4,
            maximum: 3,
          }),
          rule({
            id: id(92),
            label: "Hard algebra",
            difficulties: ["hard"],
            minimum: 0,
            maximum: seed % 3,
          }),
        ],
        minimum_points: 5 + seed % 3,
        maximum_points: 7 + seed % 4,
      },
      3,
      ITEM_TYPES,
    );
    let possible = false;
    for (let mask = 0; mask < 256; mask++) {
      const selected = pool.filter((_, i) => mask & (1 << i));
      if (selected.length === 3 && satisfiesBlueprint(selected, constraints)) {
        possible = true;
      }
    }
    let selected;
    try {
      selected = selectBlueprint(
        pool,
        3,
        constraints,
        (max) => (seed + 2) % max,
      );
    } catch (error) {
      assert(
        error instanceof BlueprintError &&
          error.code === "blueprint_infeasible",
      );
    }
    equal(!!selected, possible);
    if (selected) {
      equal(selected.length, 3);
      assert(satisfiesBlueprint(selected, constraints));
    }
  }
});
Deno.test("classification and blueprint contracts reject ambiguous, unknown, fractional and oversized shapes", () => {
  for (
    const value of [{ topics: [] }, { topics: ["A", "A"] }, {
      topics: ["A"],
      estimated_difficulty: "calibrated",
    }, { topics: ["A"], private_key: "x" }]
  ) {
    let rejected = false;
    try {
      classification(value);
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
  for (
    const value of [
      { schema_version: BLUEPRINT_PROTOCOL, rules: [] },
      { schema_version: BLUEPRINT_PROTOCOL, rules: [rule({ minimum: 1.5 })] },
      { schema_version: BLUEPRINT_PROTOCOL, rules: [rule(), rule()] },
      {
        schema_version: BLUEPRINT_PROTOCOL,
        rules: [{ ...rule(), types: ["execute_code"] }],
      },
      {
        schema_version: BLUEPRINT_PROTOCOL,
        rules: [rule()],
        maximum_points: -1,
      },
    ]
  ) {
    let rejected = false;
    try {
      blueprint(value, 2, ITEM_TYPES);
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
  equal(
    classification({ topics: ["Algebra"], estimated_difficulty: "medium" }),
    { topics: ["Algebra"], estimated_difficulty: "medium" },
  );
});
Deno.test("form assembly enforces pinned blueprint and strips author classification and blueprint rules from candidate manifests", () => {
  const items = [
      question(1, ["Algebra"], "easy"),
      question(2, ["Geometry"], "hard"),
      question(3, ["Algebra"], "hard"),
    ],
    definition = validateDefinition({
      schema_version: "assessment.definition.v2",
      title: "Placement",
      locale: "en",
      duration_seconds: 600,
      shuffle_items: false,
      shuffle_options: false,
      sections: [{
        id: id(20),
        title: "Skills",
        item_version_ids: items.map((item) => item.id),
        draw_count: 2,
        blueprint: {
          schema_version: BLUEPRINT_PROTOCOL,
          rules: [rule({ minimum: 1, maximum: 1 })],
        },
      }],
    }),
    manifest = buildManifest(id(30), definition, items, () => 0);
  equal(manifest.sections[0].items.length, 2);
  const picked = new Set(
    manifest.sections[0].items.map((item) => item.item_version_id),
  );
  assert(
    satisfiesBlueprint(
      items.filter((item) => picked.has(item.id)),
      definition.sections[0].blueprint!,
    ),
  );
  assert(!JSON.stringify(manifest).includes("classification"));
  assert(!JSON.stringify(manifest).includes("blueprint"));
  assert(
    validateItem(items[0].item).classification?.topics.includes("Algebra"),
  );
});
