import type { Material } from '../../../../packages/ai-core/src/materials/mod.ts';

// The library kinds' toMarkdown on screen. It is the same ai-core converter the
// function uses (materialMarkdown), bound when the first teacher screen or the
// material renderer loads, so the first download does not carry the material model.
// Core's screens do not call it today: the function builds a page's body itself.

let convert: ((material: Material) => string) | null = null;
let loading: Promise<void> | null = null;
/** Loads the converter (called by the material renderer and the teacher screens). */
export function loadMaterialMarkdown(): Promise<void> {
  loading ??= import('../../../../packages/ai-core/src/materials/library.ts').then((module) => { convert = module.materialMarkdown; });
  return loading;
}
export function materialMarkdownLater(material: Material): string {
  if (convert) return convert(material);
  void loadMaterialMarkdown();
  // Before the converter arrives: the title, so nothing is lost; callers can retry once it loads.
  return `# ${material.title}`;
}
