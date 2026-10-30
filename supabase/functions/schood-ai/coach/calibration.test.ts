import { calibrate, quoteFound, type Assessment, type CalibrationRun, type CoachPack, type RawAssessment, type Rubric } from '../../../../packages/coach-packs/src/mod.ts';
import { loadPacks } from '../../../../packages/coach-packs/src/registry.ts';
import { equal, ok } from '../fixture.test.ts';
import type { ChargedSession } from '../types.ts';
import { assessInSession } from './ai.ts';

// Calibration in CI. A fake model replays the recorded assessor runs of every
// calibration sample through the real scoring pipeline (the prompt, the schema,
// the evidence check and the one repair call), then the same agreement and
// run-to-run thresholds the live evaluation uses are applied to what the pipeline
// kept. scripts/coach-calibration-live.ts runs the same against a real model.

interface Call { messages: { role: string; content: string }[]; schema: unknown; temperature?: number; keys: string[] }

/** A charged session whose model returns the recorded run; a repair call returns only the verbatim quotes. */
function replaySession(run: CalibrationRun, response: string, calls: Call[]): ChargedSession {
  const raw = (onlyValid: boolean): RawAssessment => ({
    criteria: Object.entries(run.criteria).map(([id, entry]) => ({
      id, score: entry.score,
      evidence: entry.evidence.filter((quote) => !onlyValid || quoteFound(quote, response)).map((quote) => ({ quote, comment: 'recorded' })),
    })),
    errors: [], upgrades: [], summary: 'recorded run',
  });
  return {
    json<T>(input: Parameters<ChargedSession['json']>[0]): Promise<T> {
      calls.push({ messages: input.messages as Call['messages'], schema: input.schema, temperature: input.temperature, keys: Object.keys(input) });
      return Promise.resolve(raw(calls.length > 1) as unknown as T);
    },
    text: () => Promise.reject(new Error('not used')),
    transcribe: () => Promise.reject(new Error('not used')),
    speak: () => Promise.reject(new Error('not used')),
  };
}

async function replay(pack: CoachPack, rubric: Rubric) {
  const runs: Record<string, CalibrationRun[]> = {};
  const assessments: Record<string, Assessment[]> = {};
  let callCount = 0, repairs = 0;
  for (const sample of rubric.calibration.samples) {
    for (const run of rubric.calibration.runs[sample.id] ?? []) {
      const calls: Call[] = [];
      const assessment = await assessInSession(replaySession(run, sample.response, calls), {
        pack, rubric, task: { task: sample.task }, answer: sample.response, explain: 'en',
        fluency: sample.metrics ? { words: 0, seconds: sample.metrics.seconds ?? null, wpm: sample.metrics.wpm ?? null, articulationWpm: null, longPauses: sample.metrics.longPauses ?? 0, longestPause: null, pausesPerMinute: null, meanRunWords: null, fillers: sample.metrics.fillers ?? 0, fillersPerMinute: null, fillersPer100: 0, fillerWords: [], repetitions: 0, timed: true, pace: null } : null,
      });
      callCount += calls.length;
      if (calls.length === 2) repairs += 1;
      ok(calls.length <= 2, `${sample.id}: one call and at most one repair, inside one charge`);
      for (const call of calls) {
        ok(!call.keys.some((key) => /model|provider/i.test(key)), 'no model or provider is named by the feature');
        equal(call.temperature, 0, 'assessment runs at temperature 0');
      }
      const user = calls[0].messages.at(-1)!.content;
      ok(user.includes('<user_message>') && user.includes(sample.response.slice(0, 40)), `${sample.id}: the answer travels inside <user_message>`);
      ok(calls[0].messages[0].content.includes(rubric.assessorNotes.slice(0, 40)), `${sample.id}: the rubric's assessor notes are in the prompt`);
      (assessments[sample.id] ??= []).push(assessment);
      (runs[sample.id] ??= []).push({
        criteria: Object.fromEntries(assessment.criteria.filter((criterion) => criterion.status === 'scored').map((criterion) => [criterion.id, { score: criterion.score!, evidence: criterion.evidence.map((item) => item.quote) }])),
      });
    }
  }
  return { runs, assessments, callCount, repairs };
}

for (const pack of loadPacks().values()) {
  for (const rubric of pack.rubrics) {
    Deno.test(`calibration: ${pack.manifest.id}/${rubric.id} through the scoring pipeline`, async () => {
      const recorded = calibrate(rubric);
      ok(recorded.passed, `recorded runs: ${recorded.failures.join('; ')}`);
      const { runs, assessments, repairs } = await replay(pack, rubric);
      const piped = calibrate(rubric, runs);
      ok(piped.passed, `after the evidence check: ${piped.failures.join('; ')} (exact ${piped.exact}, adjacent ${piped.adjacent}, MAE ${piped.mae})`);
      equal(piped.evidenceValid, 1, 'every quote the pipeline keeps is in the answer word for word');
      ok(piped.exact >= rubric.calibration.thresholds.exact && piped.spread <= rubric.calibration.thresholds.maxSpread, 'agreement and run-to-run consistency');
      // Audio criteria (pronunciation) are never scored from a transcript.
      for (const list of Object.values(assessments)) for (const assessment of list) {
        for (const criterion of rubric.criteria.filter((entry) => entry.source === 'audio')) {
          equal(assessment.criteria.find((entry) => entry.id === criterion.id)?.status, 'not_scored_audio', `${criterion.id} is not scored`);
        }
        ok(assessment.overall === null || assessment.overall >= rubric.scale.min, 'overall on the scale');
      }
      // Recorded paraphrases (deliberately in the sets) exercise the repair call.
      const paraphrased = rubric.calibration.samples.some((sample) => (rubric.calibration.runs[sample.id] ?? []).some((run) => Object.values(run.criteria).some((entry) => entry.evidence.some((quote) => !quoteFound(quote, sample.response)))));
      if (paraphrased) ok(repairs > 0 || piped.evidenceValid === 1, 'paraphrased quotes are dropped or repaired');
    });
  }
}

Deno.test('calibration: the same run through the pipeline twice gives the same assessment', async () => {
  const pack = loadPacks().get('ielts')!;
  const rubric = pack.rubricById.get('ielts.writing_task2')!;
  const sample = rubric.calibration.samples[0];
  const run = rubric.calibration.runs[sample.id][0];
  const once = async () => await assessInSession(replaySession(run, sample.response, []), { pack, rubric, task: { task: sample.task }, answer: sample.response, explain: 'uz', fluency: null });
  equal(await once(), await once(), 'deterministic scoring');
});

Deno.test('calibration: the live evaluation script runs the pipeline through the real gateway', async () => {
  const { liveCalibration, KEY_ENV } = await import('../../../../scripts/coach-calibration-live.ts');
  const { fakeModel } = await import('./harness.ts');
  const pack = loadPacks().get('speaking')!;
  const sent: string[] = [];
  const model = fakeModel({ score: null, cefr: 3.5, corrections: false, failNext: false, prompts: [] });
  const result = await liveCalibration({
    pack, rubrics: pack.rubrics, runs: 2, limit: 3, baseUrl: 'https://eval.invalid/v1', modelId: 'any-model',
    env: (name) => (name === KEY_ENV ? 'test-key' : undefined),
    fetch: (input, init) => { const request = new Request(input, init); sent.push(new URL(request.url).host); return model(request); },
  });
  equal([result.notOk, sent.every((host) => host === 'eval.invalid')], [0, true], 'every call went to the configured endpoint and succeeded');
  ok(result.attempts >= 6, 'samples × runs calls');
  const report = result.reports[0];
  equal([report.samples, report.runs, report.evidenceValid, report.spread], [3, 6, 1, 0], 'scored with real quotes, the same every run');
  const unkeyed = await liveCalibration({ pack, rubrics: pack.rubrics, runs: 2, limit: 1, baseUrl: 'https://eval.invalid/v1', modelId: 'any-model', env: () => undefined, fetch: () => Promise.reject(new Error('no call expected')) });
  equal([unkeyed.reports[0].passed, unkeyed.notOk], [false, 2], 'without a key nothing is sent and the report fails');
});
