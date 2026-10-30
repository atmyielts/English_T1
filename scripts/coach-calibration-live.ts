// Live calibration of a coach rubric against a real model. It sends every calibration
// sample through the same scoring pipeline the coaches use (assessInSession: prompt,
// schema, evidence check, one repair call) via the real gateway, several runs each,
// and prints the same agreement and run-to-run numbers CI checks with the pack's
// runs (packages/coach-packs/src/calibration.ts).
//
// The model is never named in code: it comes from the environment (or --model), on
// any OpenAI-compatible https endpoint. The key follows the gateway's rule for
// custom keys (SCHOOD_AI_KEY_*). Nothing is written unless --out is given; --out
// saves the runs in the pack's run shape, for review before an author
// replaces a pack's `runs` with them.
//
//   SCHOOD_AI_COACH_EVAL_BASE_URL=<https://…/v1> SCHOOD_AI_KEY_COACH_EVAL=<key> SCHOOD_AI_COACH_EVAL_MODEL=<model id> \
//     deno run --no-lock --allow-net --allow-env --allow-read --allow-write scripts/coach-calibration-live.ts \
//     --pack ielts [--rubric ielts.speaking] [--runs 3] [--limit 4] [--out runs.json]
//
// It costs real model calls (samples × runs × up to two calls). It touches no
// database, no Schood account and no credits.
import { calibrate, type CalibrationReport, type CalibrationRun, type CoachPack, type Rubric } from '../packages/coach-packs/src/mod.ts';
import { loadPacks } from '../packages/coach-packs/src/registry.ts';
import type { Registry } from '../packages/ai-core/src/mod.ts';
import { assessInSession, keyOf } from '../supabase/functions/schood-ai/coach/ai.ts';
import { CircuitBreaker, createGateway } from '../supabase/functions/schood-ai/gateway.ts';
import { createMemoryRepository } from '../supabase/functions/schood-ai/memory-repository.ts';
import type { ChargedSession } from '../supabase/functions/schood-ai/types.ts';

export const KEY_ENV = 'SCHOOD_AI_KEY_COACH_EVAL';

export interface LiveOptions {
  pack: CoachPack;
  rubrics: Rubric[];
  runs: number;
  limit: number;
  baseUrl: string;
  modelId: string;
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  log?: (line: string) => void;
}
export interface LiveResult { reports: CalibrationReport[]; runs: Record<string, Record<string, CalibrationRun[]>>; attempts: number; notOk: number }

export async function liveCalibration(options: LiveOptions): Promise<LiveResult> {
  const log = options.log ?? (() => {});
  // A one-model registry for this run only.
  const registry: Registry = {
    providers: [{ key: 'eval', adapter: 'openai_compatible', displayName: 'Evaluation endpoint', baseUrl: options.baseUrl, apiKeyEnv: KEY_ENV, headers: {}, config: {}, enabled: true }],
    models: [{ key: 'eval/model', providerKey: 'eval', modelId: options.modelId, displayName: 'Evaluation model', capabilities: ['chat', 'json'], contextWindow: null, maxOutput: 4096, inputUsdPerMTok: 0, outputUsdPerMTok: 0, noTraining: false, enabled: true }],
    routes: [{ key: 'default', modelKeys: ['eval/model'], requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: null, temperature: null, enabled: true }],
  };
  const memory = createMemoryRepository({ users: {}, registry });
  let attempts = 0, notOk = 0;
  const gateway = createGateway({
    registry: () => Promise.resolve(registry),
    settings: () => memory.repository.settings(),
    takeCall: () => Promise.resolve({ ok: true }),
    record: (rows) => { attempts += rows.length; notOk += rows.filter((row) => row.status !== 'ok').length; },
    env: options.env,
    fetch: options.fetch,
    now: () => new Date(),
    breaker: new CircuitBreaker(),
  });
  const session = (key: string): ChargedSession => ({
    async json<T>(input: Parameters<ChargedSession['json']>[0]): Promise<T> {
      const result = await gateway.json({ feature: key, messages: input.messages, maxTokens: input.maxTokens, temperature: input.temperature }, input.schema);
      if (result.status !== 'ok') throw new Error(`The call did not succeed: ${result.status}${'code' in result ? ` (${result.code})` : 'reason' in result ? ` (${result.reason})` : ''}`);
      return result.data as T;
    },
    text: () => Promise.reject(new Error('not used')),
    transcribe: () => Promise.reject(new Error('not used')),
    speak: () => Promise.reject(new Error('not used')),
  });

  const reports: CalibrationReport[] = [];
  const recorded: Record<string, Record<string, CalibrationRun[]>> = {};
  for (const rubric of options.rubrics) {
    const runs: Record<string, CalibrationRun[]> = {};
    const samples = rubric.calibration.samples.slice(0, options.limit);
    const key = keyOf(options.pack, rubric.id.includes('writing') ? 'writing' : 'review');
    for (const sample of samples) {
      for (let run = 0; run < options.runs; run++) {
        try {
          const assessment = await assessInSession(session(key), { pack: options.pack, rubric, task: { task: sample.task }, answer: sample.response, explain: 'en', fluency: null });
          (runs[sample.id] ??= []).push({ criteria: Object.fromEntries(assessment.criteria.filter((criterion) => criterion.status === 'scored').map((criterion) => [criterion.id, { score: criterion.score!, evidence: criterion.evidence.map((item) => item.quote) }])) });
        } catch (error) {
          // A failed call counts as no score: it lowers agreement instead of hiding.
          (runs[sample.id] ??= []).push({ criteria: {} });
          log(`${sample.id} run ${run + 1}: ${(error as Error).message}`);
        }
      }
    }
    // Only the samples that were run count towards this report.
    reports.push(calibrate({ ...rubric, calibration: { ...rubric.calibration, samples } }, runs));
    recorded[rubric.id] = runs;
  }
  return { reports, runs: recorded, attempts, notOk };
}

if (import.meta.main) {
  const arg = (name: string) => { const at = Deno.args.indexOf(`--${name}`); return at >= 0 ? Deno.args[at + 1] : undefined; };
  const fail = (message: string): never => { console.error(message); Deno.exit(2); };
  const packId = arg('pack') ?? fail('Missing --pack.');
  const pack = loadPacks().get(packId) ?? fail(`Unknown pack ${packId}.`);
  const rubrics = arg('rubric') ? [pack.rubricById.get(arg('rubric')!) ?? fail(`Unknown rubric ${arg('rubric')}.`)] : pack.rubrics;
  const baseUrl = Deno.env.get('SCHOOD_AI_COACH_EVAL_BASE_URL') ?? fail('Missing SCHOOD_AI_COACH_EVAL_BASE_URL.');
  if (!baseUrl.startsWith('https://')) fail('The endpoint must be https.');
  const modelId = arg('model') ?? Deno.env.get('SCHOOD_AI_COACH_EVAL_MODEL') ?? fail('Missing --model or SCHOOD_AI_COACH_EVAL_MODEL.');
  if (!Deno.env.get(KEY_ENV)) fail(`Missing ${KEY_ENV}.`);
  const runs = Math.max(2, Math.min(5, Number(arg('runs') ?? '3') || 3));
  const result = await liveCalibration({
    pack, rubrics, runs, limit: Number(arg('limit') ?? '0') || Infinity, baseUrl, modelId,
    env: (name) => Deno.env.get(name), fetch: (input, init) => fetch(input, init), log: (line) => console.error(line),
  });
  for (const report of result.reports) {
    console.log(`${report.passed ? 'PASS' : 'FAIL'} ${pack.manifest.id}/${report.rubric}: ${report.samples} samples × ${runs} runs · exact ${report.exact} · adjacent ${report.adjacent} · MAE ${report.mae} · spread ${report.spread} · evidence ${report.evidenceValid} · QWK ${report.kappa}`);
    for (const [id, value] of Object.entries(report.criteria)) console.log(`    ${id}: exact ${value.exact} · adjacent ${value.adjacent} · MAE ${value.mae}`);
    for (const failure of report.failures) console.log(`    ! ${failure}`);
  }
  console.log(`${result.attempts} model attempts, ${result.notOk} not ok.`);
  const out = arg('out');
  if (out) {
    await Deno.writeTextFile(out, `${JSON.stringify(result.runs, null, 2)}\n`);
    console.log(`Runs written to ${out} (review before copying into a pack's calibration runs).`);
  }
  if (result.reports.some((report) => !report.passed)) Deno.exit(1);
}
