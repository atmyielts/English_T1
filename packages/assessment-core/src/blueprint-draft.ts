import {
  type Blueprint,
  blueprint,
  BLUEPRINT_PROTOCOL,
  BLUEPRINT_PROTOCOL_V2,
  type Difficulty,
} from "./blueprint.ts";
import { ITEM_TYPES, object, uuid } from "./mod.ts";
export interface BlueprintRuleDraft {
  id: string;
  label: string;
  topics: string[];
  difficulties: Difficulty[];
  types: string[];
  allTopics: boolean;
  minimum: string;
  maximum: string;
}
export interface BlueprintFamilyDraft {
  id: string;
  label: string;
  ids: string[];
  maximum: string;
}
export interface BlueprintDraft {
  rules: BlueprintRuleDraft[];
  minimumPoints: string;
  maximumPoints: string;
  /** Optional v2 relations; absent in drafts saved before v2. */
  enemies?: [string, string][];
  families?: BlueprintFamilyDraft[];
  exposure?: string;
}
export const blankBlueprintFamily = (): BlueprintFamilyDraft => ({
  id: crypto.randomUUID(),
  label: "",
  ids: [],
  maximum: "1",
});
export const blankBlueprint = (): BlueprintDraft => ({
  rules: [],
  minimumPoints: "",
  maximumPoints: "",
});
export const blankBlueprintRule = (): BlueprintRuleDraft => ({
  id: crypto.randomUUID(),
  label: "",
  topics: [],
  difficulties: [],
  types: [],
  allTopics: false,
  minimum: "1",
  maximum: "",
});
export function editBlueprint(value: Blueprint): BlueprintDraft {
  return {
    rules: value.rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      topics: [...rule.topics],
      difficulties: [...rule.difficulties],
      types: [...rule.types],
      allTopics: rule.all_topics,
      minimum: String(rule.minimum),
      maximum: String(rule.maximum),
    })),
    minimumPoints: value.minimum_points === undefined
      ? ""
      : String(value.minimum_points),
    maximumPoints: value.maximum_points === undefined
      ? ""
      : String(value.maximum_points),
    enemies: (value.enemies ?? []).map(([a, b]) => [a, b] as [string, string]),
    families: (value.families ?? []).map((family) => ({
      id: family.id,
      label: family.label,
      ids: [...family.item_version_ids],
      maximum: String(family.maximum),
    })),
    exposure: value.exposure ? String(value.exposure.maximum_per_sitting) : "",
  };
}
export function buildBlueprint(value: BlueprintDraft, draw: number, pool?: readonly string[]) {
  const number = (value: string, label: string, integer = false) => {
    if (!(integer ? /^\d+$/ : /^\d+(?:\.\d{1,6})?$/).test(value)) {
      throw Error(
        `${label} must be a non-negative ${
          integer ? "whole number" : "number with at most six decimal places"
        }.`,
      );
    }
    return Number(value);
  };
  const enemies = value.enemies ?? [], families = value.families ?? [], exposure = (value.exposure ?? "").trim();
  const related = enemies.length > 0 || families.length > 0 || exposure !== "";
  return blueprint(
    {
      schema_version: related ? BLUEPRINT_PROTOCOL_V2 : BLUEPRINT_PROTOCOL,
      ...(enemies.length ? { enemies } : {}),
      ...(families.length
        ? {
          families: families.map((family) => ({
            id: family.id,
            label: family.label,
            item_version_ids: family.ids,
            maximum: number(family.maximum, "Family maximum", true),
          })),
        }
        : {}),
      ...(exposure ? { exposure: { maximum_per_sitting: number(exposure, "Exposure limit", true) } } : {}),
      rules: value.rules.map((rule) => ({
        id: rule.id,
        label: rule.label,
        topics: rule.topics,
        difficulties: rule.difficulties,
        types: rule.types,
        all_topics: rule.allTopics,
        minimum: number(rule.minimum, "Minimum questions", true),
        maximum: rule.maximum.trim()
          ? number(rule.maximum, "Maximum questions", true)
          : draw,
      })),
      ...(value.minimumPoints.trim()
        ? { minimum_points: number(value.minimumPoints, "Minimum points") }
        : {}),
      ...(value.maximumPoints.trim()
        ? { maximum_points: number(value.maximumPoints, "Maximum points") }
        : {}),
    },
    draw,
    ITEM_TYPES,
    pool,
  );
}
export function restoreBlueprintDraft(value: unknown): BlueprintDraft {
  const data = object(value),
    str = (v: unknown, max: number) => {
      if (typeof v !== "string" || v.length > max) {
        throw Error("Saved blueprint field is invalid.");
      }
      return v;
    },
    strings = (v: unknown, max: number) => {
      if (!Array.isArray(v) || v.length > max) {
        throw Error("Saved blueprint filters are invalid.");
      }
      return v.map((value) => str(value, 80));
    };
  if (!Array.isArray(data.rules) || data.rules.length > 20) {
    throw Error("Saved blueprint rules are invalid.");
  }
  const rules = data.rules.map((value) => {
    const rule = object(value);
    if (typeof rule.allTopics !== "boolean") {
      throw Error("Saved topic matching policy is invalid.");
    }
    const difficulties = strings(rule.difficulties, 3) as Difficulty[],
      types = strings(rule.types, 15);
    if (
      difficulties.some((value) =>
        !["easy", "medium", "hard"].includes(value)
      ) || types.some((value) =>
        !(ITEM_TYPES as readonly string[]).includes(value)
      )
    ) throw Error("Saved blueprint categories are invalid.");
    return {
      id: uuid(rule.id),
      label: str(rule.label, 200),
      topics: strings(rule.topics, 20),
      difficulties,
      types,
      allTopics: rule.allTopics,
      minimum: str(rule.minimum, 10),
      maximum: str(rule.maximum, 10),
    };
  });
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) {
    throw Error("Saved blueprint rule IDs repeat.");
  }
  const enemies = data.enemies === undefined ? [] : (Array.isArray(data.enemies) && data.enemies.length <= 100 ? data.enemies : (() => { throw Error("Saved enemy pairs are invalid."); })()).map((pair: unknown) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw Error("Saved enemy pairs are invalid.");
    return [uuid(pair[0]), uuid(pair[1])] as [string, string];
  });
  const families = data.families === undefined ? [] : (Array.isArray(data.families) && data.families.length <= 20 ? data.families : (() => { throw Error("Saved question families are invalid."); })()).map((value: unknown) => {
    const family = object(value);
    if (!Array.isArray(family.ids) || family.ids.length > 50) throw Error("Saved question families are invalid.");
    return { id: uuid(family.id), label: str(family.label, 200), ids: family.ids.map((entry: unknown) => uuid(entry)), maximum: str(family.maximum, 10) };
  });
  return {
    rules,
    minimumPoints: str(data.minimumPoints, 20),
    maximumPoints: str(data.maximumPoints, 20),
    ...(data.enemies === undefined ? {} : { enemies }),
    ...(data.families === undefined ? {} : { families }),
    ...(data.exposure === undefined ? {} : { exposure: str(data.exposure, 10) }),
  };
}
