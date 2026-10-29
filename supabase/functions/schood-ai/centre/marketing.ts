import { s } from '../../../../packages/ai-core/src/mod.ts';
import { bool, oneOf, optionalText, record, stringList, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { draftChecked } from './draft.ts';
import { centrePrompt, isManager, LANGUAGE_NAMES, requireCentre } from './shared.ts';
import type { ResultRow } from './store.ts';

// C4 marketing studio: Instagram and Telegram posts, ad copy, event announcements
// and results posts in uz/ru/en in the centre's voice. It never invents scores or
// testimonials: results posts use only results staff entered and an office manager
// verified, for students who agreed to be named; every number in a draft must come
// from the facts given; quoted testimonials are refused unless the facts hold them.

const KINDS = ['instagram', 'telegram', 'ad', 'event', 'results'] as const;
const LANGS = ['uz', 'ru', 'en'] as const;
const postSchema = s.object({
  variants: s.array(s.object({ text: s.string({ min: 20, max: 2200 }), hashtags: s.array(s.string({ min: 2, max: 40 }), { max: 12 }) }), { min: 1, max: 3 }),
});
const QUOTE = /[“"«„]([^”"»“]{15,})[”"»“]/u;

const resultJson = (row: ResultRow) => ({
  id: row.id, student_name: row.student_name, exam: row.exam, score: row.score, result_date: row.result_date, source: row.source, verified: row.verified,
  verified_at: row.verified_at, evidence_note: row.evidence_note, consent: row.consent, created_at: row.created_at,
});

export const results = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    return { results: (await centre.deps.store.table('results').list({ workspace_id: centre.access.workspace.id }, { order: 'created_at', desc: true, limit: 500 })).map(resultJson), can_verify: isManager(centre.access.role) };
  },
  /** { student_name, exam, score, result_date?, evidence_note?, consent }: staff enter a result; it is unverified until the office checks it. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const body = record(await ctx.body());
    const date = optionalText(body.result_date, 'result_date', { max: 10 });
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Date.parse(date) > ctx.now().getTime() + 86_400_000)) throw new SchoodAIError('invalid_request', 'result_date must be a past date (YYYY-MM-DD).', 400, { field: 'result_date' });
    const row = await centre.deps.store.table('results').insert({
      workspace_id: centre.access.workspace.id, student_name: text(body.student_name, 'student_name', { max: 120 }), exam: text(body.exam, 'exam', { max: 80 }),
      score: text(body.score, 'score', { max: 40 }), result_date: date, evidence_note: optionalText(body.evidence_note, 'evidence_note', { max: 300 }),
      consent: body.consent === undefined ? false : bool(body.consent, 'consent'), source: 'entered', created_by: ctx.user.id,
    });
    await ctx.audit('centre.result_entered', { exam: row.exam }, { type: 'result', id: row.id });
    return { result: resultJson(row) };
  },
  /** { id, verified?, consent? }: an owner or admin verifies a result against its evidence. */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const id = uuid(body.id, 'id');
    const patch: Partial<ResultRow> = {};
    if (body.verified !== undefined) Object.assign(patch, bool(body.verified, 'verified') ? { verified: true, verified_by: ctx.user.id, verified_at: ctx.now().toISOString() } : { verified: false, verified_by: null, verified_at: null });
    if (body.consent !== undefined) patch.consent = bool(body.consent, 'consent');
    const [row] = await centre.deps.store.table('results').update({ id, workspace_id: centre.access.workspace.id }, patch);
    if (!row) throw new SchoodAIError('not_found', 'Result not found.', 404);
    await ctx.audit('centre.result_updated', { verified: row.verified, consent: row.consent }, { type: 'result', id });
    return { result: resultJson(row) };
  },
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const id = uuid(record(await ctx.body()).id, 'id');
    if (!await centre.deps.store.table('results').remove({ id, workspace_id: centre.access.workspace.id })) throw new SchoodAIError('not_found', 'Result not found.', 404);
    await ctx.audit('centre.result_deleted', {}, { type: 'result', id });
    return { ok: true };
  },
};

const TASKS: Record<(typeof KINDS)[number], string> = {
  instagram: 'an Instagram post (a hook in the first line, short paragraphs, a clear call to action, emojis sparingly)',
  telegram: 'a Telegram channel post (scannable, a clear call to action, no hashtags unless they help)',
  ad: 'short ad copy for a paid ad (a headline line, two or three benefit lines, a call to action)',
  event: 'an event announcement (what, when, where, who it is for, how to join), using exactly the event details given',
  results: 'a results post celebrating students by name with exactly the exams and scores given, crediting the students’ work, without promising the same result to others',
};

/** POST centre/marketing { kind, language, brief, result_ids?, event?, facts? }: up to three post variants to edit and save. */
export async function marketing(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  await ctx.requireFeature('C4');
  const body = record(await ctx.body());
  const kind = oneOf(body.kind, 'kind', KINDS), language = oneOf(body.language, 'language', LANGS);
  const brief = text(body.brief, 'brief', { min: 3, max: 1500 });
  const ws = centre.access.workspace;
  let chosen: ResultRow[] = [];
  if (kind === 'results') {
    const ids = stringList(body.result_ids, 'result_ids', { max: 20, pattern: /^[0-9a-f-]{36}$/ });
    if (!ids.length) throw new SchoodAIError('results_required', 'Choose at least one verified result.', 400, { field: 'result_ids' });
    chosen = await centre.deps.store.table('results').list({ workspace_id: ws.id }, { in: { id: ids } });
    const unusable = chosen.filter((row) => !row.verified || !row.consent);
    if (chosen.length !== ids.length || unusable.length) throw new SchoodAIError('results_unverified', 'Results posts use only verified results of students who agreed to be named.', 409, { unusable: unusable.length + ids.length - chosen.length });
  }
  const event = body.event === undefined ? null : record(body.event, 'event');
  const facts = {
    centre: ws.name,
    facts_from_staff: optionalText(body.facts, 'facts', { max: 2000 }),
    ...(event ? { event: { title: optionalText(event.title, 'event.title', { max: 120 }), when: optionalText(event.when, 'event.when', { max: 80 }), where: optionalText(event.where, 'event.where', { max: 160 }), how_to_join: optionalText(event.how_to_join, 'event.how_to_join', { max: 200 }) } } : {}),
    ...(chosen.length ? { results: chosen.map((row) => ({ student: row.student_name, exam: row.exam, score: row.score, date: row.result_date })) } : {}),
  };
  const quotesAllowed = typeof facts.facts_from_staff === 'string' && QUOTE.test(facts.facts_from_staff);
  const { result, credits, balance } = await draftChecked(ctx, {
    key: 'marketing.post', schema: postSchema, facts: { ...facts, request: brief }, texts: (r) => r.variants.map((variant) => variant.text), free: 3,
    reference: ctx.idempotencyKey ? `marketing:${ctx.idempotencyKey}` : undefined, maxTokens: 1800,
    extra: (r) => (!quotesAllowed && r.variants.some((variant) => QUOTE.test(variant.text)) ? 'Do not quote anyone: there are no testimonials in the reference data.' : null),
    system: centrePrompt({
      workspace: ws, locale: ctx.locale,
      task: `Write ${TASKS[kind]} for this centre in ${LANGUAGE_NAMES[language]}. Give up to three variants that differ in angle. Use only the facts in the reference data and the request; never add scores, results, prices, dates, discounts, rankings, guarantees or testimonials that are not there.`,
      blocks: [{ kind: 'marketing_facts', title: 'Facts you may use', data: facts }],
    }),
    brief: 'Write the post.', request: brief,
  });
  await ctx.audit('centre.marketing_drafted', { kind, language, results: chosen.length }, { type: 'workspace', id: ws.id });
  return { kind, language, variants: result.variants, credits, balance: balance.total, facts };
}
