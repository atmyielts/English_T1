import {
  blankItemDraft,
  buildItemDraft,
  editItemDraft,
  restoreItemDraft,
} from "./authoring.ts";
import {
  blankAssessment,
  buildAssessment,
  editAssessment,
  restoreAssessment,
} from "./design.ts";
import {
  blankBlueprintRule,
  buildBlueprint,
  restoreBlueprintDraft,
} from "./blueprint-draft.ts";
import { validateDefinition } from "./mod.ts";
const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error("Round-trip differs");
  }
};
Deno.test("classification survives incomplete encrypted drafts and approved item editing without rewriting comma-bearing topic names", () => {
  const draft = {
      ...blankItemDraft("numeric"),
      prompt: "Number?",
      numericValue: "2",
      topics: ["Algebra, advanced", "Reasoning"],
      estimatedDifficulty: "hard",
    },
    built = buildItemDraft(restoreItemDraft(draft));
  eq(built.item.classification?.topics, draft.topics);
  eq(buildItemDraft(editItemDraft(built.item, built.key)), built);
  const { topics: _topics, estimatedDifficulty: _difficulty, ...legacy } =
    draft;
  eq(restoreItemDraft(legacy).topics, []);
  eq(restoreItemDraft(legacy).estimatedDifficulty, "");
  let rejected = false;
  try {
    restoreItemDraft({ ...draft, estimatedDifficulty: ["hard"] });
  } catch {
    rejected = true;
  }
  eq(rejected, true);
});
Deno.test("overlapping quota/points rules roundtrip through encrypted working definitions without dropping authored requirements", () => {
  const base = blankAssessment(),
    rule = {
      ...blankBlueprintRule(),
      label: "Algebra",
      topics: ["Algebra"],
      minimum: "1",
      maximum: "1",
    },
    draft = {
      ...base,
      title: "Placement",
      sections: [{
        ...base.sections[0],
        title: "Skills",
        selection: "pool" as const,
        draw: "2",
        items: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000003",
        ],
        blueprint: { rules: [rule], minimumPoints: "2", maximumPoints: "3" },
      }],
    },
    definition = buildAssessment(restoreAssessment(draft));
  eq(
    buildAssessment(restoreAssessment(editAssessment(definition))),
    definition,
  );
});
Deno.test("constrained definitions require v2 and cannot be silently downgraded to an unconstrained v1 schema", () => {
  const base = blankAssessment(),
    draft = {
      ...base,
      title: "Blueprint version fence",
      sections: [{
        ...base.sections[0],
        title: "Skills",
        items: ["00000000-0000-4000-8000-000000000001"],
        blueprint: {
          rules: [{
            ...blankBlueprintRule(),
            label: "Numeric requirement",
            types: ["numeric"],
          }],
          minimumPoints: "",
          maximumPoints: "",
        },
      }],
    },
    definition = buildAssessment(draft);
  eq(definition.schema_version, "assessment.definition.v2");
  for (
    const schema_version of ["assessment.definition.v1", [
      "assessment.definition.v2",
    ], { version: "assessment.definition.v2" }]
  ) {
    let rejected = false;
    try {
      validateDefinition({ ...definition, schema_version });
    } catch {
      rejected = true;
    }
    eq(rejected, true);
  }
  const plain = buildAssessment({
    ...draft,
    sections: draft.sections.map(({ blueprint: _constraints, ...section }) =>
      section
    ),
  });
  eq(plain.schema_version, "assessment.definition.v1");
});
Deno.test("incomplete quota strings remain recoverable but cannot become a published numeric requirement", () => {
  const draft = {
    rules: [{ ...blankBlueprintRule(), label: "", minimum: "" }],
    minimumPoints: "",
    maximumPoints: "",
  };
  eq(restoreBlueprintDraft(draft), draft);
  let rejected = false;
  try {
    buildBlueprint(draft, 2);
  } catch {
    rejected = true;
  }
  eq(rejected, true);
});
