// Calibration report from the pack's runs in the repo (what CI checks; authored until
// replaced with real runs from scripts/coach-calibration-live.ts --out):
//   deno run --no-lock packages/coach-packs/scripts/calibration.ts [pack]
// The live script (scripts/coach-calibration-live.ts) prints the same against real models.
import { calibrate } from '../src/calibration.ts';
import { PACK_SOURCES } from '../src/registry.ts';

const wanted = Deno.args[0];
let failed = false;
for (const source of PACK_SOURCES) {
  if (wanted && source.manifest.id !== wanted) continue;
  // Keyed rubrics (mini-mocks scored by the answer key) have nothing to calibrate.
  for (const rubric of source.rubrics.filter((entry) => !entry.keyed)) {
    const report = calibrate(rubric);
    failed ||= !report.passed;
    console.log(`${report.passed ? '✓' : '✗'} ${source.manifest.id}/${rubric.id}: ${report.samples} samples, ${report.runs} runs · exact ${report.exact} · adjacent ${report.adjacent} · MAE ${report.mae} · spread ${report.spread} · evidence ${report.evidenceValid} · QWK ${report.kappa}`);
    for (const [id, value] of Object.entries(report.criteria)) console.log(`    ${id}: exact ${value.exact} · adjacent ${value.adjacent} · MAE ${value.mae}`);
    for (const failure of report.failures) console.log(`    ! ${failure}`);
  }
}
if (failed) Deno.exit(1);
