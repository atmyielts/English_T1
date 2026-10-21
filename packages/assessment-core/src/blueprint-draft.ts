import {
  type Blueprint,
  blueprint,
  BLUEPRINT_PROTOCOL,
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
export interface BlueprintDraft {
  rules: BlueprintRuleDraft[];
  minimumPoints: string;
  maximumPoints: string;
}
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
  };
}
export function buildBlueprint(value: BlueprintDraft, draw: number) {
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
  return blueprint(
    {
      schema_version: BLUEPRINT_PROTOCOL,
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
  return {
    rules,
    minimumPoints: str(data.minimumPoints, 20),
    maximumPoints: str(data.maximumPoints, 20),
  };
}
