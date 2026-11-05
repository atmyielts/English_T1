import { s } from '../../../../packages/ai-core/src/mod.ts';
import { bool, oneOf, optionalText, optionalUuid, record, text, uuid } from '../input.ts';
import { wrapUserMessage } from '../prompt.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { centrePrompt, isManager, requireCentre, schoolTerm } from './shared.ts';
import type { ObservationRow } from './store.ts';

// C16 lesson observation coach. An observer's notes, or a teacher's lesson plan,
// become structured feedback against the centre's own teaching standards: a 1-4
// rating per standard with evidence quoted from the notes (each quote is checked
// to be in the notes), strengths and next steps. The observer reviews it before it
// is shared with the teacher, who can acknowledge it with a comment. Ratings are
// tracked per standard across the school term.

export const DEFAULT_STANDARDS = [
  { key: 'aims', title: 'Clear aims', description: 'The lesson aims are clear to students and the activities serve them.' },
  { key: 'engagement', title: 'Student engagement', description: 'Most students are actively working; student talk time is high.' },
  { key: 'instructions', title: 'Instructions and checking', description: 'Instructions are short and modelled; understanding is checked before tasks.' },
  { key: 'feedback', title: 'Feedback and correction', description: 'Errors are corrected usefully; students get feedback on their work.' },
  { key: 'differentiation', title: 'Differentiation', description: 'Stronger and weaker students are both challenged and supported.' },
  { key: 'pace', title: 'Pace and timing', description: 'Stages are well timed and the lesson reaches its aims.' },
];
const KEY = /^[a-z][a-z0-9_]{1,30}$/;

function standardsOf(raw: unknown[]): { key: string; title: string; description: string }[] {
  const list = (Array.isArray(raw) ? raw : []).filter((entry) => entry && typeof entry === 'object') as { key: string; title: string; description: string }[];
  return list.length ? list : DEFAULT_STANDARDS;
}

export const standards = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    return { standards: standardsOf(centre.settings.observation_standards), custom: Array.isArray(centre.settings.observation_standards) && centre.settings.observation_standards.length > 0 };
  },
  /** { standards: [{ key, title, description }] } (2 to 12; an empty list restores the defaults). */
  async PUT(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    if (!Array.isArray(body.standards) || body.standards.length > 12 || body.standards.length === 1) throw new SchoodAIError('invalid_request', 'Give 2 to 12 standards, or none for the defaults.', 400, { field: 'standards' });
    const list = body.standards.map((entry, index) => {
      const row = record(entry, `standards[${index}]`);
      const key = text(row.key, `standards[${index}].key`, { max: 31 });
      if (!KEY.test(key)) throw new SchoodAIError('invalid_request', 'Standard keys are short lowercase words.', 400, { field: `standards[${index}].key` });
      return { key, title: text(row.title, `standards[${index}].title`, { max: 80 }), description: text(row.description, `standards[${index}].description`, { max: 400 }) };
    });
    if (new Set(list.map((entry) => entry.key)).size !== list.length) throw new SchoodAIError('invalid_request', 'Each standard needs its own key.', 400, { field: 'standards' });
    await centre.deps.store.table('settings').update({ workspace_id: centre.access.workspace.id }, { observation_standards: list, updated_by: ctx.user.id });
    await ctx.audit('centre.observation_standards', { count: list.length }, { type: 'workspace', id: centre.access.workspace.id });
    return { standards: standardsOf(list) };
  },
};

const feedbackSchema = s.object({
  summary: s.string({ min: 20, max: 800 }),
  ratings: s.array(s.object({ key: s.string({ min: 2, max: 31 }), rating: s.number({ min: 1, max: 4, integer: true }), evidence: s.array(s.string({ min: 3, max: 300 }), { max: 4 }), comment: s.string({ min: 5, max: 500 }) }), { min: 1, max: 12 }),
  strengths: s.array(s.string({ min: 5, max: 300 }), { max: 3 }),
  next_steps: s.array(s.string({ min: 5, max: 300 }), { min: 1, max: 3 }),
});
const squash = (value: string) => value.toLowerCase().replace(/[“”"«»„]/g, '').replace(/\s+/g, ' ').trim();

const observationJson = (row: ObservationRow, names: Map<string, string | null>) => ({
  id: row.id, teacher: { id: row.teacher_id, name: names.get(row.teacher_id) ?? null }, observer: row.observer_id ? { id: row.observer_id, name: names.get(row.observer_id) ?? null } : null,
  group_id: row.group_id, lesson_date: row.lesson_date, term: row.term, source: row.source, feedback: row.feedback, status: row.status, teacher_comment: row.teacher_comment,
  shared_at: row.shared_at, acknowledged_at: row.acknowledged_at, created_at: row.created_at,
});

export const observations = {
  /** ?teacher_id=&term=: managers see all; a teacher sees what was shared with them and what they observed. */
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const ws = centre.access.workspace, manager = isManager(centre.access.role);
    const teacher = ctx.query.get('teacher_id'), term = ctx.query.get('term');
    let rows = await centre.deps.store.table('observations').list({ workspace_id: ws.id, ...(teacher ? { teacher_id: uuid(teacher, 'teacher_id') } : {}), ...(term ? { term } : {}) }, { order: 'lesson_date', desc: true, limit: 300 });
    if (!manager) rows = rows.filter((row) => row.observer_id === ctx.user.id || (row.teacher_id === ctx.user.id && row.status !== 'draft'));
    const names = new Map((await centre.deps.store.members(ws.id)).map((m) => [m.userId, m.name]));
    return { observations: rows.map((row) => observationJson(row, names)), term: schoolTerm(ctx.now()), standards: standardsOf(centre.settings.observation_standards), can_observe: true, is_manager: manager };
  },
  /** { teacher_id, lesson_date, source: notes | plan, input, group_id? }: AI feedback as a draft for the observer to review. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    await ctx.requireFeature('C16');
    const body = record(await ctx.body());
    const ws = centre.access.workspace, teacherId = uuid(body.teacher_id, 'teacher_id');
    const teacher = await ctx.repo.membership(ws.id, teacherId);
    if (!teacher || !['owner', 'admin', 'teacher'].includes(teacher.role)) throw new SchoodAIError('invalid_request', 'Choose a teacher of this centre.', 400, { field: 'teacher_id' });
    const source = oneOf(body.source, 'source', ['notes', 'plan'] as const);
    if (centre.access.role === 'teacher' && teacherId === ctx.user.id && source === 'notes') throw new SchoodAIError('invalid_request', 'Observation notes come from another observer; use your lesson plan for self-review.', 400, { field: 'source' });
    const date = text(body.lesson_date, 'lesson_date', { max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SchoodAIError('invalid_request', 'lesson_date is YYYY-MM-DD.', 400, { field: 'lesson_date' });
    const input = text(body.input, 'input', { min: 20, max: 20_000 });
    const groupId = optionalUuid(body.group_id, 'group_id');
    const list = standardsOf(centre.settings.observation_standards);
    const { result, credits } = await ctx.ai.charged({ key: 'observation.feedback', mode: 'json', reference: ctx.idempotencyKey ? `observation:${ctx.idempotencyKey}` : undefined }, (session) => session.json({
      schema: feedbackSchema, maxTokens: 1800, temperature: 0.2,
      messages: [
        { role: 'system', content: centrePrompt({
          workspace: ws, locale: ctx.locale,
          task: [
            `Turn ${source === 'notes' ? 'an observer’s notes on a lesson' : 'a teacher’s lesson plan'} into structured, supportive feedback for the teacher against the centre’s standards in the reference data.`,
            'Rate each standard 1-4 (1 not yet, 2 developing, 3 secure, 4 strong) only where the text gives evidence; skip a standard the text does not cover. Evidence must be short quotes copied exactly from the text.',
            source === 'plan' ? 'For a plan, judge what the plan sets up, not what happened in class.' : 'Do not judge things the notes do not mention.',
            'Give up to three strengths and up to three concrete next steps. Write in the language of the text.',
          ].join(' '),
          blocks: [{ kind: 'standards', title: 'The centre’s teaching standards', data: list }],
        }) },
        { role: 'user', content: wrapUserMessage(input) },
      ],
    }));
    const notes = squash(input), keys = new Set(list.map((entry) => entry.key));
    const ratings = result.ratings.filter((row) => keys.has(row.key)).map((row) => {
      const evidence = row.evidence.filter((quote) => notes.includes(squash(quote)));
      return { ...row, evidence, evidence_checked: evidence.length === row.evidence.length };
    });
    const row = await centre.deps.store.table('observations').insert({
      workspace_id: ws.id, teacher_id: teacherId, observer_id: ctx.user.id, group_id: groupId, lesson_date: date, term: schoolTerm(new Date(`${date}T12:00:00+05:00`)),
      source, input, feedback: { ...result, ratings },
    });
    await ctx.audit('centre.observation_created', { teacher_id: teacherId, source }, { type: 'observation', id: row.id });
    const names = new Map((await centre.deps.store.members(ws.id)).map((m) => [m.userId, m.name]));
    return { observation: observationJson(row, names), credits };
  },
  /** { id, share: true } by the observer or the office; { id, acknowledge: true, comment? } by the teacher. */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const body = record(await ctx.body());
    const row = await centre.deps.store.table('observations').get({ id: uuid(body.id, 'id'), workspace_id: centre.access.workspace.id });
    if (!row) throw new SchoodAIError('not_found', 'Observation not found.', 404);
    const now = ctx.now().toISOString();
    let patch: Partial<ObservationRow>;
    if (body.share !== undefined && bool(body.share, 'share')) {
      if (row.observer_id !== ctx.user.id && !isManager(centre.access.role)) throw new SchoodAIError('role_required', 'The observer or the office shares feedback.', 403);
      if (row.status !== 'draft') throw new SchoodAIError('already_shared', 'This feedback was already shared.', 409);
      patch = { status: 'shared', shared_at: now };
    } else if (body.acknowledge !== undefined && bool(body.acknowledge, 'acknowledge')) {
      if (row.teacher_id !== ctx.user.id) throw new SchoodAIError('role_required', 'Only the observed teacher acknowledges feedback.', 403);
      if (row.status !== 'shared') throw new SchoodAIError('not_shared', 'This feedback has not been shared with you.', 409);
      patch = { status: 'acknowledged', acknowledged_at: now, teacher_comment: optionalText(body.comment, 'comment', { max: 2000 }) };
    } else throw new SchoodAIError('invalid_request', 'Say share or acknowledge.', 400);
    const [updated] = await centre.deps.store.table('observations').update({ id: row.id }, patch);
    await ctx.audit(`centre.observation_${patch.status}`, {}, { type: 'observation', id: row.id });
    const names = new Map((await centre.deps.store.members(centre.access.workspace.id)).map((m) => [m.userId, m.name]));
    return { observation: observationJson(updated, names) };
  },
};

/** GET centre/observation-progress?teacher_id=&term=: the average rating per standard per observation across a term. */
export async function progress(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  const teacherId = uuid(ctx.query.get('teacher_id') ?? ctx.user.id, 'teacher_id');
  if (!isManager(centre.access.role) && teacherId !== ctx.user.id) throw new SchoodAIError('role_required', 'You can see your own progress.', 403);
  const term = ctx.query.get('term') ?? schoolTerm(ctx.now());
  if (!/^\d{4}-T[1-4]$/.test(term)) throw new SchoodAIError('invalid_request', 'term is YYYY-T1..T4.', 400, { field: 'term' });
  const rows = (await centre.deps.store.table('observations').list({ workspace_id: centre.access.workspace.id, teacher_id: teacherId, term }, { order: 'lesson_date' }))
    .filter((row) => row.status !== 'draft' || isManager(centre.access.role));
  const list = standardsOf(centre.settings.observation_standards);
  const points = rows.map((row) => {
    const ratings = ((row.feedback?.ratings ?? []) as { key: string; rating: number }[]);
    return { id: row.id, lesson_date: row.lesson_date, ratings: Object.fromEntries(ratings.map((entry) => [entry.key, entry.rating])) };
  });
  return {
    term, teacher_id: teacherId, observations: points.length,
    standards: list.map((standard) => {
      const values = points.map((point) => point.ratings[standard.key]).filter((value): value is number => typeof value === 'number');
      return { key: standard.key, title: standard.title, average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null, first: values[0] ?? null, last: values.at(-1) ?? null, count: values.length };
    }),
    points,
  };
}
