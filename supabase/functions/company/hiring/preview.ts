// HR tries a test as a candidate would. Nothing is stored and no test is used: the page
// keeps the state and sends it back with each step, and the server only runs the engine on
// it. Served questions carry no answer keys, so HR sees exactly what a candidate sees.
// Writing and speaking are not graded here, because that would spend AI on a trial.
import { SKILLS, overallScore, scoreToLevel, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { CompanyError, type Ctx, type Route } from '../types.ts';
import { obj, oneOf, uuid } from '../util.ts';
import {
  attemptView, jobRoleFor, loadAssessment, type AssessmentRow, type AttemptRow,
} from './attempts.ts';
import { PRODUCTION, activeIndex, advance, cleanAnswers, closeAll, createSections, toBankKeys, toBankLevel, type Answers, type Results, type Section } from './engine.ts';
import { HR } from './shared.ts';

interface PreviewState { items: Section[]; answers: Answers; results: Results; started_at: string; deadline_at: string }

function readState(value: unknown): PreviewState {
  const raw = obj(value);
  const items = raw.items;
  if (!Array.isArray(items) || !items.length || items.length > SKILLS.length || items.some((section) => !SKILLS.includes((section as Section)?.skill))) {
    throw new CompanyError('invalid_field', 'This preview can no longer continue. Start it again.', 400, { field: 'state' });
  }
  return {
    items: items as Section[],
    answers: (raw.answers && typeof raw.answers === 'object' ? raw.answers : {}) as Answers,
    results: (raw.results && typeof raw.results === 'object' ? raw.results : {}) as Results,
    started_at: typeof raw.started_at === 'string' ? raw.started_at : new Date(0).toISOString(),
    deadline_at: typeof raw.deadline_at === 'string' ? raw.deadline_at : new Date(0).toISOString(),
  };
}

/** The candidate's view of a preview, built by the same code as a real attempt. */
function view(ctx: Ctx, assessment: AssessmentRow, state: PreviewState, status: AttemptRow['status']) {
  const objective = Object.fromEntries(state.items.filter((section) => !PRODUCTION.includes(section.skill as Skill) && state.results[section.skill]).map((section) => [section.skill, state.results[section.skill]!.score]));
  const score = status === 'graded' ? overallScore(objective) : null;
  const row = {
    id: 'preview', org_id: assessment.org_id, assessment_id: assessment.id, member_id: null, user_id: null, candidate_name: null, candidate_email: null, candidate_phone: null, access_token_hash: null,
    status, started_at: state.started_at, deadline_at: state.deadline_at, submitted_at: status === 'started' ? null : ctx.now().toISOString(), graded_at: null,
    items: state.items, answers: state.answers, overall_level: score === null ? null : scoreToLevel(score), overall_score: score, skill_results: state.results, ai_feedback: {}, integrity: {},
    decision: null, decision_by: null, notes: null, certificate_code: null, created_at: state.started_at, updated_at: state.started_at,
  } as unknown as AttemptRow;
  return attemptView(ctx, row, assessment, ctx.org!, { showResult: true });
}

export const routes: Route[] = [
  {
    method: 'POST', path: 'orgs/:org/assessments/:assessment/preview', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params, body) {
      const input = obj(body);
      const assessment = await loadAssessment(ctx, ctx.org!.id, uuid(params.assessment, 'assessment'));
      const action = oneOf(input.action, ['start', 'next', 'submit'] as const, 'action');
      const options = { jobRole: jobRoleFor(assessment, null), rng: Math.random, now: ctx.now().toISOString(), fallback: toBankLevel(assessment.min_level, 'b1') };
      if (action === 'start') {
        const state: PreviewState = {
          items: createSections(assessment.skills, options), answers: {}, results: {}, started_at: ctx.now().toISOString(),
          deadline_at: new Date(ctx.now().getTime() + assessment.time_limit_minutes * 60_000).toISOString(),
        };
        return { state, attempt: view(ctx, assessment, state, 'started') };
      }
      const state = readState(input.state);
      try {
        const section = state.items[activeIndex(state.items)];
        const answers = section ? { ...state.answers, ...cleanAnswers(section, toBankKeys(state.items, input.answers)) } : state.answers;
        if (action === 'next') {
          const shown = input.at as { current?: unknown; stage?: unknown } | undefined;
          const index = activeIndex(state.items);
          // A retry of a step that already happened returns the current page instead of moving twice.
          if (shown && (shown.current !== index || (shown.stage ?? null) !== (state.items[index]?.stages?.length ?? null))) return { state, attempt: view(ctx, assessment, state, 'started') };
          const moved = advance(state.items, answers, state.results, options);
          const next: PreviewState = { ...state, items: moved.sections, answers, results: moved.results };
          return { state: next, attempt: view(ctx, assessment, next, moved.finished ? 'graded' : 'started') };
        }
        const closed = closeAll(state.items, answers, state.results, ctx.now().toISOString());
        const next: PreviewState = { ...state, items: closed.sections, answers, results: closed.results };
        return { state: next, attempt: view(ctx, assessment, next, 'graded') };
      } catch (cause) {
        if (cause instanceof CompanyError) throw cause;
        // The state came from the browser, so anything odd in it is the page's problem, not a server failure.
        throw new CompanyError('invalid_field', 'This preview can no longer continue. Start it again.', 400, { field: 'state' });
      }
    },
  },
];
