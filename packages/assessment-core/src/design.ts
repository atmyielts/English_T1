import {
  type Definition,
  type Locale,
  object,
  uuid,
  validateDefinition,
} from "./mod.ts";
import {
  type BlueprintDraft,
  buildBlueprint,
  editBlueprint,
  restoreBlueprintDraft,
} from "./blueprint-draft.ts";
export interface SectionDraft {
  id: string;
  title: string;
  seconds: string;
  selection: "fixed" | "pool";
  draw: string;
  items: string[];
  blueprint?: BlueprintDraft;
}
export interface AssessmentDraft {
  title: string;
  reason: string;
  locale: Locale;
  seconds: string;
  shuffleItems: boolean;
  shuffleOptions: boolean;
  sections: SectionDraft[];
}
export const blankSection = (): SectionDraft => ({
  id: crypto.randomUUID(),
  title: "",
  seconds: "",
  selection: "fixed",
  draw: "1",
  items: [],
});
export const blankAssessment = (): AssessmentDraft => ({
  title: "",
  reason: "",
  locale: "en",
  seconds: "3600",
  shuffleItems: false,
  shuffleOptions: false,
  sections: [blankSection()],
});
export function editAssessment(definition: Definition): AssessmentDraft {
  return {
    title: definition.title,
    reason: "",
    locale: definition.locale,
    seconds: String(definition.duration_seconds),
    shuffleItems: definition.shuffle_items,
    shuffleOptions: definition.shuffle_options,
    sections: definition.sections.map((section) => ({
      id: section.id,
      title: section.title,
      seconds: section.duration_seconds === undefined
        ? ""
        : String(section.duration_seconds),
      selection: (section.draw_count ?? section.item_version_ids.length) <
          section.item_version_ids.length
        ? "pool"
        : "fixed",
      draw: String(section.draw_count ?? section.item_version_ids.length),
      items: [...section.item_version_ids],
      ...(section.blueprint
        ? { blueprint: editBlueprint(section.blueprint) }
        : {}),
    })),
  };
}
/** Recovery accepts incomplete fields but not malformed, oversized or executable shapes. */
export function restoreAssessment(value: unknown): AssessmentDraft {
  const raw = object(value);
  const string = (v: unknown, max: number) => {
    if (typeof v !== "string" || v.length > max) {
      throw new Error("The saved assessment field is invalid.");
    }
    return v;
  };
  if (
    !["uz", "ru", "en"].includes(String(raw.locale)) ||
    typeof raw.shuffleItems !== "boolean" ||
    typeof raw.shuffleOptions !== "boolean" ||
    !Array.isArray(raw.sections) ||
    raw.sections.length < 1 ||
    raw.sections.length > 50
  ) {
    throw new Error("The saved assessment structure is invalid.");
  }
  const sections = raw.sections.map((value) => {
    const s = object(value);
    if (
      !["fixed", "pool"].includes(String(s.selection)) ||
      !Array.isArray(s.items) ||
      s.items.length > 500
    ) {
      throw new Error("The saved section is invalid.");
    }
    return {
      id: uuid(s.id),
      title: string(s.title, 200),
      seconds: string(s.seconds, 10),
      selection: s.selection as SectionDraft["selection"],
      draw: string(s.draw, 10),
      items: s.items.map((v) => uuid(v)),
      ...(s.blueprint === undefined
        ? {}
        : { blueprint: restoreBlueprintDraft(s.blueprint) }),
    };
  });
  if (new Set(sections.map((s) => s.id)).size !== sections.length) {
    throw new Error("The saved section IDs repeat.");
  }
  return {
    title: string(raw.title, 200),
    reason: string(raw.reason ?? "", 2000),
    locale: raw.locale as Locale,
    seconds: string(raw.seconds, 10),
    shuffleItems: raw.shuffleItems,
    shuffleOptions: raw.shuffleOptions,
    sections,
  };
}
export function buildAssessment(draft: AssessmentDraft): Definition {
  const seconds = (v: string, label: string) => {
    if (!/^\d+$/.test(v)) {
      throw new Error(`${label} must be a whole number of seconds.`);
    }
    return Number(v);
  };
  return validateDefinition({
    schema_version: draft.sections.some(section=>section.blueprint)?"assessment.definition.v2":"assessment.definition.v1",
    title: draft.title,
    locale: draft.locale,
    duration_seconds: seconds(draft.seconds, "Overall time"),
    shuffle_items: draft.shuffleItems,
    shuffle_options: draft.shuffleOptions,
    sections: draft.sections.map((s) => ({
      id: s.id,
      title: s.title,
      item_version_ids: s.items,
      draw_count: s.selection === "pool"
        ? seconds(s.draw, "Questions drawn")
        : s.items.length,
      ...(s.blueprint
        ? {
          blueprint: buildBlueprint(
            s.blueprint,
            s.selection === "pool"
              ? seconds(s.draw, "Questions drawn")
              : s.items.length,
          ),
        }
        : {}),
      ...(s.seconds.trim()
        ? { duration_seconds: seconds(s.seconds, "Section time") }
        : {}),
    })),
  });
}
export function moveDesignEntry<T>(values: T[], from: number, to: number): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= values.length ||
    to >= values.length
  ) {
    return values;
  }
  const result = [...values],
    [entry] = result.splice(from, 1);
  result.splice(to, 0, entry);
  return result;
}
