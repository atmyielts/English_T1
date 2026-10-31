import type { Rubric } from '../src/types.ts';
import { solutionCalibration } from './calibration.ts';

// Two rubrics:
//   - `admission.mock`: keyed. Mini-mock results are the share of questions right, from
//     the answer key (no model), on 0–100. Milestones, the forecast, certificates and the
//     anonymous percentile read it. Projections onto the exam's maths blocks use the
//     question counts of subject-core's draft UZ_ADMISSION_2026 (10 compulsory, 30
//     specialised), confirmed so far only from press reports of the ministry's order.
//   - `maths.solution`: a model reads the learner's written solution and scores four
//     criteria with quotes. It is on the pack's percent scale in steps of 25 (0 none,
//     25 a start, 50 half, 75 nearly, 100 complete), because rubric scores move skill
//     levels in the rubric's own units. Descriptors are Schood's own wording.

export const rubrics: Rubric[] = [
  {
    id: 'admission.mock',
    keyed: true,
    name: { uz: 'Mini-sinov natijasi', ru: 'Результат мини-пробника', en: 'Mini-mock result' },
    scale: { id: 'percent', min: 0, max: 100, step: 1 },
    criteria: [],
    overall: { round: 'step' },
    evidence: { min: 1, max: 1 },
    assessorNotes: '',
    projections: [
      { name: { uz: 'majburiy matematika bloki', ru: 'обязательный блок математики', en: 'the compulsory maths block' }, questions: 10 },
      { name: { uz: 'mutaxassislik fani (matematika)', ru: 'профильный предмет (математика)', en: 'specialised maths' }, questions: 30 },
    ],
    calibration: { thresholds: { exact: 0, adjacent: 0, maxMae: 0, maxSpread: 0, evidenceValid: 0 }, samples: [], runs: {} },
  },
  {
    id: 'maths.solution',
    name: { uz: 'Yozma yechim', ru: 'Письменное решение', en: 'Written solution' },
    scale: { id: 'percent', min: 0, max: 100, step: 25 },
    overall: { round: 'step' },
    evidence: { min: 1, max: 2 },
    assessorNotes: [
      'The learner wrote out a full solution (typed, or transcribed from a photo of their working). The task in <schood_data> includes the verified answer and the key steps: use them, never derive a different answer.',
      'Any valid method scores as well as the one in the notes. Equations and lines of working count as the learner\'s words: quote them exactly as written, symbols included.',
      'A bare answer with no working can score on answer, but working and reasoning then stay at 0 or 25. If the first error happens early, later steps that follow correctly from it still earn working credit.',
      'Errors: tag each with one of signs, order_of_operations, fractions, percent_base, lost_root, domain, inequality_flip, powers, formulas, units, trig_values, vieta, or "other". Upgrades: rewrite one or two of the learner\'s lines as the correct step.',
    ].join(' '),
    criteria: [
      {
        id: 'method', source: 'model', node: 'solutions.method', weight: 1.2,
        name: { uz: 'Usul', ru: 'Метод', en: 'Method' }, short: 'Method',
        focus: 'Whether the learner chose a valid approach for this kind of problem and carried the plan through: the right formula or theorem, a sensible substitution, setting up the right equation from a word problem. Judge the plan, not the arithmetic.',
        descriptors: [
          { score: 0, text: 'No method, an unrelated method, or only the answer copied with nothing to show how it was reached.' },
          { score: 25, text: 'Starts in a direction that could work but uses the wrong formula or tool for the main step, so the plan cannot reach the answer.' },
          { score: 50, text: 'A valid method for part of the problem: one case or one condition is missing (only one colour in a probability, the n-th term instead of the sum), or the plan stops halfway.' },
          { score: 75, text: 'A valid, complete plan with a small gap in how it is applied, such as no domain written before squaring or endpoints not compared.' },
          { score: 100, text: 'A valid and efficient method, applied in full and in a sensible order.' },
        ],
      },
      {
        id: 'working', source: 'model', node: 'solutions.working',
        name: { uz: 'Hisob-kitob', ru: 'Вычисления', en: 'Working' }, short: 'Working',
        focus: 'Whether each line of algebra and arithmetic is correct: signs, brackets, the discriminant, powers, fractions and substitutions. Follow the learner\'s own route and credit correct steps after an earlier mistake.',
        descriptors: [
          { score: 0, text: 'No working shown, or almost every line contains an error.' },
          { score: 25, text: 'Some correct lines, but a basic error (a sign in the discriminant, a wrong power) early on changes everything after it.' },
          { score: 50, text: 'About half the steps are correct; one or two errors that change the result, or large gaps in the working.' },
          { score: 75, text: 'Correct working with one slip or one skipped step that a reader has to fill in.' },
          { score: 100, text: 'Every line is correct and easy to follow.' },
        ],
      },
      {
        id: 'reasoning', source: 'model', node: 'solutions.reasoning',
        name: { uz: 'Asoslash va tekshirish', ru: 'Обоснование и проверка', en: 'Reasoning and checks' }, short: 'Reasoning',
        focus: 'Whether the learner states and uses the conditions the problem needs (domain, t > 0 after a substitution, non-strict endpoints, rejected roots, integer counts) and checks the result by substitution or estimate. Explanations in Uzbek or Russian count.',
        descriptors: [
          { score: 0, text: 'No conditions and no check; a result that cannot be right (a fractional count, a negative length) is accepted.' },
          { score: 25, text: 'A condition the problem depends on is missing, so a wrong or extraneous result is kept, and there is no check.' },
          { score: 50, text: 'Some conditions are used but one important one is missing (endpoints, one rejected root), or there is no check.' },
          { score: 75, text: 'The conditions are used correctly and the steps follow; the final check is missing or only partial.' },
          { score: 100, text: 'All conditions are stated and used, rejected values are explained, and the answer is checked.' },
        ],
      },
      {
        id: 'answer', source: 'model', node: 'solutions.answer',
        name: { uz: 'Javob', ru: 'Ответ', en: 'Answer' }, short: 'Answer',
        focus: 'Whether the final answer matches the verified answer, is complete (every root, both the greatest and the least value) and is written in the expected form (an interval with the right brackets, a reduced fraction, units).',
        descriptors: [
          { score: 0, text: 'Missing or wrong.' },
          { score: 25, text: 'Wrong, but close to the verified answer through a single slip (one sign, one bracket).' },
          { score: 50, text: 'Partly right: an extraneous root kept, a root missing, or the right numbers in the wrong form (open brackets where the ends belong).' },
          { score: 75, text: 'Right but not fully finished: not simplified, or units or the second value left out.' },
          { score: 100, text: 'Right, complete and in the expected form.' },
        ],
      },
    ],
    calibration: {
      thresholds: { exact: 0.6, adjacent: 0.95, maxMae: 12.5, maxSpread: 25, evidenceValid: 0.9 },
      samples: solutionCalibration.samples,
      runs: solutionCalibration.runs,
    },
  },
];
