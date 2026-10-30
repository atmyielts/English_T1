import { s } from '../../../../packages/ai-core/src/mod.ts';
import { integer, oneOf, optionalText, record, stringList, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { learnerInput, ownRecord, receipt, requireLearner, store, systemFor, track } from './common.ts';
import { ABROAD, ABROAD_DATA_VERSION, COUNTRIES, entriesFor, type AbroadEntry, type Country, type StudyLevel } from './data/abroad.ts';

// L16 Study-abroad copilot: which tests and scores, a document checklist and a
// timeline, from the learner's scores, budget and goals. Requirements come ONLY
// from the curated, dated dataset (data/abroad.ts). The model may only cite its
// entry ids; anything it says without a verified entry is shown as "check on the
// official site".

const LEVELS = ['school', 'foundation', 'bachelor', 'master', 'phd'] as const;
const PLAN_SCHEMA = s.object({
  summary: s.string({ max: 900 }),
  checklist: s.array(s.object({ item: s.string({ min: 2, max: 300 }), entry_ids: s.array(s.string({ max: 40 }), { max: 4 }) }), { min: 1, max: 14 }),
  timeline: s.array(s.object({ when: s.string({ max: 40 }), task: s.string({ max: 300 }), entry_ids: s.array(s.string({ max: 40 }), { max: 3 }) }), { max: 12 }),
  tests: s.array(s.object({ test: s.string({ max: 60 }), note: s.string({ max: 300 }), entry_ids: s.array(s.string({ max: 40 }), { max: 3 }) }), { max: 6 }),
  next_steps: s.array(s.string({ max: 300 }), { max: 5 }),
});

/** Each line keeps only the dataset entries it cites; a line with no verified entry is "check on the official site". */
export function anchorLines<T extends { entry_ids: string[] }>(lines: T[], allowed: Map<string, AbroadEntry>) {
  return lines.map((line) => {
    const entries = [...new Set(line.entry_ids)].map((id) => allowed.get(id)).filter((entry): entry is AbroadEntry => !!entry);
    const verified = entries.filter((entry) => entry.checked);
    return { ...line, entry_ids: entries.map((entry) => entry.id), verified: verified.length > 0, sources: entries.map((entry) => ({ id: entry.id, url: entry.source, checked: entry.checked })) };
  });
}

const entryView = (entry: AbroadEntry, locale: 'en' | 'uz' | 'ru') => ({ id: entry.id, country: entry.country, topic: entry.topic, fact: entry.fact[locale], source: entry.source, checked: entry.checked, verified: !!entry.checked });

// GET learner/abroad: the dataset itself (no model call), and the learner's plans.
export async function abroadData(ctx: RequestContext) {
  const access = await ctx.workspace();
  const id = ctx.query.get('id');
  if (id) {
    const row = await ownRecord(ctx, access, uuid(id, 'id'), 'abroad');
    return { plan: { id: row.id, ...row.input, ...row.output, created_at: row.createdAt } };
  }
  const plans = await store(ctx).records(ctx.user.id, { kind: 'abroad', workspaceId: access.workspace.id, limit: 10 });
  return {
    version: ABROAD_DATA_VERSION, countries: COUNTRIES, levels: LEVELS, entries: ABROAD.map((entry) => entryView(entry, ctx.locale)),
    plans: plans.map((row) => ({ id: row.id, countries: row.input.countries, level: row.input.level, created_at: row.createdAt })),
  };
}

// POST learner/abroad-plan { countries, level, field?, intake?, budget_usd_year?, scores? }
export async function abroadPlan(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'abroad.plan');
  const countries = stringList(body.countries, 'countries', { max: 3, pattern: /^(uk|us|de|kr|tr)$/ }) as Country[];
  if (!countries.length) throw new SchoodAIError('invalid_request', 'Pick at least one country.', 400, { field: 'countries' });
  const level = oneOf(body.level, 'level', LEVELS) as StudyLevel;
  const field = optionalText(body.field, 'field', { max: 120 });
  const intake = optionalText(body.intake, 'intake', { max: 7 });
  if (intake && !/^\d{4}-\d{2}$/.test(intake)) throw new SchoodAIError('invalid_request', 'intake must look like 2027-09.', 400, { field: 'intake' });
  const budget = body.budget_usd_year === undefined || body.budget_usd_year === null ? null : integer(body.budget_usd_year, 'budget_usd_year', 0, 200000);
  const scores = body.scores && typeof body.scores === 'object' && !Array.isArray(body.scores)
    ? Object.fromEntries(Object.entries(body.scores as Record<string, unknown>).filter(([key, value]) => /^(ielts|toefl|sat|duolingo|multilevel|gpa)$/.test(key) && (typeof value === 'number' || typeof value === 'string')).map(([key, value]) => [key, String(value).slice(0, 10)]))
    : {};
  const entries = entriesFor(countries, level);
  const allowed = new Map(entries.map((entry) => [entry.id, entry]));
  const out = await ctx.ai.json({
    key: 'abroad.plan', schema: PLAN_SCHEMA, maxTokens: 2500, temperature: 0.3,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Study-abroad copilot', instructions: [
        'Build a document checklist, a month-by-month timeline and the tests to prepare, for the countries and study level given.',
        'Requirements, rules, fees, scores and deadlines may come ONLY from the dataset entries in the reference data. Every checklist, timeline and test line lists the ids of the entries it relies on in entry_ids.',
        'If something matters but no entry covers it (for example a university\'s own score or a deadline), say "check on the official site" in that line and leave entry_ids empty. Entries marked verified=false are leads to check, not facts.',
        'Use the learner\'s scores only to say how far they are from what an entry states. Never invent a requirement, a fee, a deadline or a cost, and never judge whether a budget is enough unless an entry gives the number.',
      ] }, [{ kind: 'abroad_dataset', title: `Study-abroad dataset (checked ${ABROAD_DATA_VERSION})`, data: entries.map((entry) => ({ id: entry.id, country: entry.country, topic: entry.topic, fact: entry.fact.en, verified: !!entry.checked, checked: entry.checked })) }]) },
      { role: 'user', content: learnerInput({ countries, level, field, intake, budget_usd_year: budget, scores }) },
    ],
  });
  const plan = {
    countries, level, field, intake, budget_usd_year: budget, scores, data_version: ABROAD_DATA_VERSION, summary: out.data.summary,
    checklist: anchorLines(out.data.checklist, allowed), timeline: anchorLines(out.data.timeline, allowed), tests: anchorLines(out.data.tests, allowed), next_steps: out.data.next_steps,
    entries: entries.map((entry) => entryView(entry, ctx.locale)),
  };
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'abroad', credits: out.credits, input: { countries, level, field, intake, budget_usd_year: budget, scores }, output: plan });
  track(ctx, access, { feature: 'L16', kind: 'abroad', summary: { countries, level } });
  return { plan: { id: row.id, ...plan, created_at: row.createdAt }, ...receipt(out) };
}

export const abroadRoutes = {
  abroad: { GET: abroadData },
  'abroad-plan': { POST: abroadPlan },
};
