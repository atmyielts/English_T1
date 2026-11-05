import { calibrate } from '../src/calibration.ts';
import { PACK_SOURCES, loadPacks } from '../src/registry.ts';
import { buildPack, DEPTH, PackError, validatePack } from '../src/validate.ts';
import type { PackSource } from '../src/types.ts';

// Every pack in the registry validates and calibrates (what CI enforces), and the
// validator catches the mistakes a pack author is most likely to make.

const assert = (value: unknown, label: string) => { if (!value) throw new Error(label); };
const clone = (source: PackSource): PackSource => structuredClone(source);
const problemsAfter = (mutate: (pack: PackSource) => void, source = PACK_SOURCES[0]) => { const pack = clone(source); mutate(pack); return validatePack(pack); };
const expectProblem = (problems: string[], pattern: RegExp, label: string) =>
  assert(problems.some((problem) => pattern.test(problem)), `${label}: expected a problem matching ${pattern}, got ${JSON.stringify(problems)}`);

Deno.test('packs: every registered pack validates with no problems and meets the depth bar', () => {
  assert(PACK_SOURCES.length >= 2, 'IELTS Coach and Speaking Partner are registered');
  const ids = new Set<string>(), features = new Set<string>();
  for (const source of PACK_SOURCES) {
    const problems = validatePack(source);
    assert(problems.length === 0, `${source.manifest.id}: ${problems.join('; ')}`);
    assert(!ids.has(source.manifest.id) && !features.has(source.manifest.feature), 'pack ids and features are unique');
    ids.add(source.manifest.id); features.add(source.manifest.feature);
    assert(source.diagnostic.items.length >= DEPTH.diagnosticItems, `${source.manifest.id}: placement depth`);
    // Keyed rubrics (mini-mocks scored by the answer key) have nothing to calibrate.
    for (const rubric of source.rubrics.filter((entry) => !entry.keyed)) assert(rubric.calibration.samples.length >= DEPTH.calibrationSamples, `${rubric.id}: calibration depth`);
  }
  const packs = loadPacks();
  assert(packs.get('ielts')?.manifest.feature === 'B1' && packs.get('speaking')?.manifest.feature === 'B2', 'B1 and B2 load');
  assert(loadPacks() === packs, 'packs load once per instance');
});

Deno.test('packs: the calibration runs agree with the reference scores and with each other', () => {
  for (const source of PACK_SOURCES) for (const rubric of source.rubrics.filter((entry) => !entry.keyed)) {
    const report = calibrate(rubric);
    assert(report.passed, `${rubric.id}: ${report.failures.join('; ')}`);
    assert(report.runs >= report.samples * DEPTH.calibrationRuns, `${rubric.id}: at least ${DEPTH.calibrationRuns} runs per sample`);
    assert(report.spread <= rubric.calibration.thresholds.maxSpread, `${rubric.id}: run-to-run spread`);
    const levels = new Set(rubric.calibration.samples.map((sample) => {
      const values = Object.values(sample.reference);
      return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }));
    assert(levels.size >= DEPTH.calibrationLevels, `${rubric.id}: samples cover ${DEPTH.calibrationLevels} levels`);
  }
});

Deno.test('packs: calibration fails when the assessor disagrees, drifts between runs or invents quotes', () => {
  const rubric = structuredClone(PACK_SOURCES[0].rubrics[0]);
  const scale = rubric.scale;
  const runsOf = (shifts: number[], evidence: (response: string) => string[]) => Object.fromEntries(rubric.calibration.samples.map((sample) => [
    sample.id,
    shifts.map((shift) => ({ criteria: Object.fromEntries(Object.entries(sample.reference).map(([id, value]) => [id, { score: Math.min(scale.max, Math.max(scale.min, value + shift * scale.step)), evidence: evidence(sample.response) }])) })),
  ]));
  const firstWords = (response: string) => [response.split(' ').slice(0, 4).join(' ')];
  const off = calibrate(rubric, runsOf([2, 2], firstWords));
  assert(!off.passed && off.failures.some((failure) => failure.startsWith('exact agreement')), 'disagreement fails');
  const drift = calibrate(rubric, runsOf([0, -3], firstWords));
  assert(!drift.passed && drift.failures.some((failure) => failure.startsWith('run-to-run spread')), 'drift fails');
  const invented = calibrate(rubric, runsOf([0, 0], () => ['words the learner never said']));
  assert(!invented.passed && invented.evidenceValid === 0, 'invented evidence fails');
  const perfect = calibrate(rubric, runsOf([0, 0], firstWords));
  assert(perfect.passed && perfect.exact === 1 && perfect.kappa === 1, 'agreement passes');
});

Deno.test('packs: the validator reports authoring mistakes with their path', () => {
  expectProblem(problemsAfter((pack) => { pack.activities.push({ ...pack.activities[1] }); }), /\.id: duplicate /, 'duplicate activity');
  expectProblem(problemsAfter((pack) => { delete (pack.manifest.name as Record<string, string>).uz; }), /^manifest\.name: missing uz$/, 'missing translation');
  expectProblem(problemsAfter((pack) => { delete (pack.activities[0].title as Record<string, string>).ru; }), /\.title: missing ru$/, 'missing translation in content');
  expectProblem(problemsAfter((pack) => { pack.plan.links[0].url = 'https://example.com'; }), /links go to https:\/\/\*\.schood\.online only/, 'outside link');
  expectProblem(problemsAfter((pack) => { pack.rubrics[0].calibration.samples = pack.rubrics[0].calibration.samples.slice(0, 3); }), /calibration\.samples: needs at least 8/, 'too few calibration samples');
  expectProblem(problemsAfter((pack) => { const sample = pack.rubrics[0].calibration.samples[0]; sample.reference[Object.keys(sample.reference)[0]] = 12; }), /reference: 12 is not on the scale/, 'reference off the scale');
  expectProblem(problemsAfter((pack) => { pack.milestones[0].rule.min = 6.3; }), /rule\.min: is not on the rubric scale/, 'milestone off the scale');
  expectProblem(problemsAfter((pack) => { const drill = pack.activities.find((activity) => activity.kind === 'drill')!; (drill as { errorTag: string }).errorTag = 'not_a_tag'; }), /unknown error tag not_a_tag/, 'unknown error tag');
  expectProblem(problemsAfter((pack) => { while (pack.diagnostic.items.length < 31) pack.diagnostic.items.push(pack.diagnostic.items[0]); }), /at most 30 \(they must fit in button data\)/, 'placement too long for callback data');
  expectProblem(problemsAfter((pack) => { pack.manifest.id = 'Bad_ID'; }), /^manifest\.id: must match/, 'bad pack id');
  expectProblem(problemsAfter((pack) => { pack.activities = pack.activities.filter((activity) => activity.kind !== 'writing'); }), /^depth: writing tasks: 0 of at least 6$/, 'shallow pack');
  expectProblem(problemsAfter((pack) => {
    const deck = pack.activities.find((activity) => activity.kind === 'deck') as unknown as { cards: { meaning?: string; front: string }[] };
    deck.cards[0].meaning = 'x'.repeat(120); deck.cards[0].front = 'x'.repeat(120);
  }), /longer than 100 characters/, 'poll option too long');
  expectProblem(problemsAfter((pack) => { const rubric = pack.rubrics[0]; const id = rubric.calibration.samples[0].id; rubric.calibration.runs[id] = rubric.calibration.runs[id].slice(0, 1); }), /runs/, 'too few runs');
});

Deno.test('packs: buildPack refuses an invalid pack and indexes a valid one', () => {
  const broken = clone(PACK_SOURCES[1]);
  broken.manifest.id = 'Nope!';
  let threw: unknown = null;
  try { buildPack(broken); } catch (error) { threw = error; }
  assert(threw instanceof PackError && (threw as PackError).message.includes('manifest.id'), 'PackError names the problem');
  const pack = buildPack(clone(PACK_SOURCES[1]));
  assert(pack.byId.size === pack.activities.length && pack.rubricById.size === pack.rubrics.length, 'lookups by id');
  for (const activity of pack.activities) assert(pack.skillById.has(activity.node), `${activity.id}: its skill exists`);
});

Deno.test('packs: the worker\'s index-only packs are the validated packs', async () => {
  const { ciValidatedPacks } = await import('../src/registry.ts');
  const quick = ciValidatedPacks(), checked = loadPacks();
  assert([...quick.keys()].join() === [...checked.keys()].join(), 'same coaches');
  for (const [id, pack] of quick) assert(pack.activities === checked.get(id)!.activities && pack.byId.size === checked.get(id)!.byId.size, `${id}: same content`);
});
