// Validates one pack (or all) and prints every problem. For pack authors:
//   deno run --no-lock packages/coach-packs/scripts/check.ts ielts
import { PACK_SOURCES } from '../src/registry.ts';
import { validatePack } from '../src/validate.ts';

const wanted = Deno.args[0];
let failed = false;
for (const source of PACK_SOURCES) {
  if (wanted && source.manifest.id !== wanted) continue;
  const problems = validatePack(source);
  if (problems.length) {
    failed = true;
    console.log(`✗ ${source.manifest.id}: ${problems.length} problem(s)`);
    for (const problem of problems) console.log(`  - ${problem}`);
  } else {
    const kinds = new Map<string, number>();
    for (const activity of source.activities) kinds.set(activity.kind, (kinds.get(activity.kind) ?? 0) + 1);
    console.log(`✓ ${source.manifest.id} ${source.manifest.version}: ${source.activities.length} activities (${[...kinds].map(([kind, n]) => `${kind} ${n}`).join(', ')}), ${source.rubrics.length} rubrics, ${source.diagnostic.items.length} diagnostic items`);
  }
}
if (failed) Deno.exit(1);
