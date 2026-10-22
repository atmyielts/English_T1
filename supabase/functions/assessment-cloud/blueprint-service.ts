import {
  buildManifest,
  ContractError,
  type Definition,
  type Manifest,
  validateItem,
} from "../../../packages/assessment-core/src/mod.ts";
import { summarizeBlueprint } from "../../../packages/assessment-core/src/blueprint.ts";
import type { Repository } from "./handler.ts";
export const hasBlueprint = (definition: Definition) =>
  definition.sections.some((section) => section.blueprint !== undefined);
export async function blueprintExample(
  repository: Repository,
  tenant: string,
  definition: Definition,
) {
  const ids = definition.sections.flatMap((section) =>
      section.item_version_ids
    ),
    rows = await repository.versions(tenant, ids),
    items = rows.map((row) => ({
      id: String(row.id),
      item: validateItem(row.payload),
      key: {},
      approved_by: typeof row.approved_by === "string" ? row.approved_by : "",
      created_by: String(row.created_by),
    }));
  if (items.length !== ids.length || items.some((item) => !item.approved_by)) {
    throw new ContractError(
      "unapproved_or_foreign_item",
      "All pinned blueprint questions must be approved institution versions.",
    );
  }
  const manifest = buildManifest(
    "00000000-0000-4000-8000-000000000001",
    definition,
    items,
    () => 0,
  );
  const witness = manifest.sections.map((section) => ({
    id: section.id,
    item_version_ids: section.items.map((item) => item.item_version_id),
  }));
  return {
    witness,
    summary: definition.sections.map((section, index) => {
      const chosen = new Set(witness[index].item_version_ids),
        selected = items.filter((item) => chosen.has(item.id));
      return {
        id: section.id,
        title: section.title,
        selected_version_ids: [...chosen],
        ...(section.blueprint
          ? summarizeBlueprint(selected, section.blueprint)
          : {
            questions: selected.length,
            points: selected.reduce((total, item) =>
              total + Math.round(item.item.max_score * 1e6), 0) / 1e6,
            rules: [],
          }),
      };
    }),
  };
}
export function manifestSelection(manifest: Manifest) {
  return manifest.sections.map((section) => ({
    id: section.id,
    item_version_ids: section.items.map((item) => item.item_version_id),
  }));
}
