// Custom role-play scenarios (HR): who the AI plays, the employee's goal, difficulty
// and the success criteria the AI feedback checks one by one. Employees practise a
// published scenario on the same role-play page. HR sees how much it is practised
// and the average score of people who agreed to share; never what anyone said.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { fetchAll } from '../people/shared.ts';
import { check, CompanyError, type Ctx, type Route } from '../types.ts';
import { obj, uuid } from '../util.ts';
import { MAX, readScenario, SCENARIO_COLUMNS, scenarioCode, scenarioProblems, type ScenarioInput, type ScenarioRow } from './custom.ts';

async function load(ctx: Ctx, id: string): Promise<ScenarioRow> {
  const row = check<ScenarioRow | null>(await ctx.db.from('company_scenarios').select(SCENARIO_COLUMNS).eq('id', uuid(id, 'scenario')).eq('org_id', ctx.org!.id).maybeSingle());
  if (!row) throw new CompanyError('custom_scenario_not_found', 'No such role-play.', 404);
  return row;
}

const toInput = (row: ScenarioRow): ScenarioInput => ({ title: row.title, goal: row.goal, persona: row.persona, learner_role: row.learner_role, setting: row.setting, opening: row.opening, difficulty: row.difficulty, checklist: row.checklist });

/** Practice of one scenario by people who agreed to share their progress. */
async function practice(ctx: Ctx, row: ScenarioRow) {
  const code = scenarioCode(row.id);
  const [sessions, members] = await Promise.all([
    fetchAll<{ member_id: string; score: number | null }>(() => ctx.db.from('company_roleplay_sessions').select('member_id,score').eq('org_id', ctx.org!.id).eq('scenario_code', code).order('id'), 20_000),
    fetchAll<{ id: string }>(() => ctx.db.from('company_members').select('id').eq('org_id', ctx.org!.id).not('consent_at', 'is', null).neq('status', 'removed').order('id')),
  ]);
  const shared = new Set(members.map((member) => member.id));
  const visible = sessions.filter((session) => shared.has(session.member_id));
  const scores = visible.map((session) => session.score).filter((score): score is number => typeof score === 'number');
  return { sessions: visible.length, people: new Set(visible.map((session) => session.member_id)).size, average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null };
}

const view = (row: ScenarioRow) => ({ ...toInput(row), id: row.id, code: scenarioCode(row.id), status: row.status, updated_at: row.updated_at });

export const routes: Route[] = [
  {
    method: 'POST', path: 'orgs/:org/builder/scenarios', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = readScenario(obj(body));
      const { count, error } = await ctx.db.from('company_scenarios').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org!.id);
      if (error) throw new Error(error.message);
      if ((count ?? 0) >= MAX.scenarios) throw new CompanyError('builder_full', `A workspace can have up to ${MAX.scenarios} role-plays.`, 409, { max: MAX.scenarios });
      const row = check<ScenarioRow>(await ctx.db.from('company_scenarios').insert({ org_id: ctx.org!.id, ...input, status: 'draft', created_by: ctx.user }).select(SCENARIO_COLUMNS).single());
      await ctx.audit('scenario.created', row.id);
      return { scenario: view(row), problems: scenarioProblems(input), practice: { sessions: 0, people: 0, average: null } };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/builder/scenarios/:scenario', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      const row = await load(ctx, params.scenario);
      return { scenario: view(row), problems: scenarioProblems(toInput(row)), practice: await practice(ctx, row) };
    },
  },
  {
    // Sessions keep the copy they started from, so a change reaches only new practice.
    method: 'PUT', path: 'orgs/:org/builder/scenarios/:scenario', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const row = await load(ctx, params.scenario);
      const input = readScenario(obj(body));
      const problems = scenarioProblems(input);
      // A published scenario stays practisable: it cannot be saved into something the AI cannot play.
      if (row.status === 'published' && problems.length) throw new CompanyError('publish_blocked', 'This role-play is not ready to publish.', 409, { problems });
      check(await ctx.db.from('company_scenarios').update(input).eq('id', row.id));
      await ctx.audit('scenario.updated', row.id);
      const saved = { ...row, ...input };
      return { scenario: view(saved), problems, practice: await practice(ctx, saved) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/builder/scenarios/:scenario/publish', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const row = await load(ctx, params.scenario);
      const problems = scenarioProblems(toInput(row));
      if (problems.length) throw new CompanyError('publish_blocked', 'This role-play is not ready to publish.', 409, { problems });
      check(await ctx.db.from('company_scenarios').update({ status: 'published' }).eq('id', row.id));
      await ctx.audit('scenario.published', row.id);
      const saved = { ...row, status: 'published' as const };
      return { scenario: view(saved), problems, practice: await practice(ctx, saved) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/builder/scenarios/:scenario/archive', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const row = await load(ctx, params.scenario);
      check(await ctx.db.from('company_scenarios').update({ status: 'archived' }).eq('id', row.id));
      await ctx.audit('scenario.archived', row.id);
      const saved = { ...row, status: 'archived' as const };
      return { scenario: view(saved), problems: scenarioProblems(toInput(row)), practice: await practice(ctx, saved) };
    },
  },
  {
    // Published or archived scenarios always keep their history. Basing this
    // response on practice would reveal activity of people who did not consent.
    method: 'DELETE', path: 'orgs/:org/builder/scenarios/:scenario', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const row = await load(ctx, params.scenario);
      if (row.status !== 'draft') {
        check(await ctx.db.from('company_scenarios').update({ status: 'archived' }).eq('id', row.id));
        await ctx.audit('scenario.archived', row.id);
        return { archived: true };
      }
      check(await ctx.db.from('company_scenarios').delete().eq('id', row.id));
      await ctx.audit('scenario.deleted', row.id);
      return { deleted: true };
    },
  },
];
