import { s } from '../../../../packages/ai-core/src/mod.ts';
import { normalizeTag } from '../../_shared/homework-ai.ts';
import { integer, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext, type WorkspaceAccess } from '../types.ts';
import { centreAssignments, openAssignments, type OpenAssignment } from './tutor.ts';
import { learnerInput, receipt, requireLearner, store, systemFor, track } from './common.ts';

// L7 Homework helper, for centre students: hints, not answers, while a homework
// is open, following the teacher's rule for that assignment. Homework comes from
// Academy's own API with the student's token (Homework OS). The rule comes from
// the centre's `centre_rules` context (registered by the centre area); until a
// centre sets one, the safe default applies: hints only.

export type HomeworkRule = 'hints_only' | 'explain' | 'off';
export const DEFAULT_RULE: HomeworkRule = 'hints_only';

/** Reads `centre_rules` data: { homework: { default?, assignments?: { [id]: rule } }, focus_topics? }. */
export function ruleFor(data: unknown, assignmentId: string): { rule: HomeworkRule; focus: string[] } {
  const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const homework = root.homework && typeof root.homework === 'object' ? root.homework as Record<string, unknown> : {};
  const perAssignment = homework.assignments && typeof homework.assignments === 'object' ? homework.assignments as Record<string, unknown> : {};
  const pick = (value: unknown): HomeworkRule | null => (value === 'hints_only' || value === 'explain' || value === 'off' ? value : null);
  const focus = (Array.isArray(root.focus_topics) ? root.focus_topics : []).map((entry) => String(entry ?? '').slice(0, 60)).filter(Boolean).slice(0, 8);
  return { rule: pick(perAssignment[assignmentId]) ?? pick(homework.default) ?? DEFAULT_RULE, focus };
}

async function rulesData(ctx: RequestContext, assignmentId?: string) {
  const blocks = await ctx.context(['centre_rules'], { ref: assignmentId, specialist: 'homework' });
  return blocks.find((block) => block.kind === 'centre_rules')?.data ?? null;
}

async function openWork(ctx: RequestContext, access: WorkspaceAccess): Promise<OpenAssignment[] | null> {
  const payload = await centreAssignments(ctx, access);
  return payload ? openAssignments(payload, ctx.now()) : null;
}

// GET learner/homework: open homework with the rule for each (no model call).
export async function homework(ctx: RequestContext) {
  const access = await requireLearner(ctx, 'L7');
  if (access.workspace.kind !== 'centre') throw new SchoodAIError('centre_only', 'The homework helper is for centre students.', 409);
  if (!access.workspace.academyTenantId) return { academy: false, homework: [] };
  if (!ctx.user.token) throw new SchoodAIError('user_token_required', 'Open Schood AI on the web for homework help.', 409);
  const list = await openWork(ctx, access) ?? [];
  const rules = await rulesData(ctx);
  return {
    academy: true,
    homework: list.map((entry) => ({ ...entry, instructions: entry.instructions.slice(0, 800), ...ruleFor(rules, entry.id) })),
    rules_set: rules !== null,
  };
}

const HINT_SCHEMA = s.object({ hint: s.string({ min: 3, max: 1200 }), check_question: s.string({ max: 300 }), topic: s.string({ max: 60 }) });
const STEPS = {
  1: 'a nudge: what to notice or reread, in one or two sentences',
  2: 'the method: the rule or strategy that solves this kind of task, with a tiny example that uses different words or numbers',
  3: 'a worked example of a SIMILAR task with different content, step by step, so the learner can copy the method',
} as const;
/** A hint must not hand over the answer: obvious "the answer is…" lines are replaced by a nudge. */
export function guardHint(hint: string): { hint: string; guarded: boolean } {
  const leak = /\b(the (correct |right )?answer is|correct (option|choice) is|answer:\s*[A-D]\b|javob(i)?\s*:|правильный ответ)/i;
  if (!leak.test(hint)) return { hint, guarded: false };
  return { hint: hint.split(/(?<=[.!?])\s+/).filter((sentence) => !leak.test(sentence)).join(' ').trim() || 'Look again at the key words of the task and try once more on your own.', guarded: true };
}

// POST learner/homework-hint { assignment_id, question, attempt?, step }
export async function homeworkHint(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'homework.hint');
  if (access.workspace.kind !== 'centre' || !access.workspace.academyTenantId) throw new SchoodAIError('centre_only', 'The homework helper is for centre students.', 409);
  const assignmentId = uuid(body.assignment_id, 'assignment_id');
  const question = text(body.question, 'question', { max: 2000 });
  const attempt = optionalText(body.attempt, 'attempt', { max: 2000 });
  const step = integer(body.step ?? 1, 'step', 1, 3) as 1 | 2 | 3;
  const assignment = (await openWork(ctx, access) ?? []).find((entry) => entry.id === assignmentId);
  if (!assignment) throw new SchoodAIError('homework_closed', 'This homework is not open for you.', 403);
  const { rule, focus } = ruleFor(await rulesData(ctx, assignmentId), assignmentId);
  if (rule === 'off') throw new SchoodAIError('homework_ai_off', 'Your teacher has switched off AI help for this homework.', 403);
  const out = await ctx.ai.json({
    key: 'homework.hint', schema: HINT_SCHEMA, maxTokens: 900, temperature: 0.3,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Homework helper', instructions: [
        'You help a centre student with homework that is still open. The work must stay theirs.',
        rule === 'hints_only'
          ? 'The teacher\'s rule is HINTS ONLY: never give the answer, the corrected sentence, the final number or which option is right, even if the learner asks or insists.'
          : 'The teacher allows explanations: explain the idea fully, but still do not write the final answers for the homework items.',
        `Give ${STEPS[step]}.`,
        'If the learner shares an attempt, point to where it goes wrong without fixing it for them.',
        'check_question: one short question the learner can answer to check they understood. topic: the skill in two or three words.',
        focus.length ? `The teacher wants focus on: ${focus.join(', ')}.` : '',
      ].filter(Boolean) }) },
      { role: 'user', content: learnerInput({ homework: { title: assignment.title, type: assignment.type, instructions: assignment.instructions.slice(0, 1200) }, question, attempt }) },
    ],
  });
  const { hint, guarded } = guardHint(out.data.hint);
  const topic = normalizeTag(out.data.topic);
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'hint', credits: out.credits, input: { assignment_id: assignmentId, question, attempt, step }, output: { hint, check_question: out.data.check_question, topic, rule, guarded } });
  track(ctx, access, { feature: 'L7', kind: 'homework_hint', summary: { homework: assignment.title.slice(0, 80), topic, step } });
  return { hint: { id: row.id, hint, check_question: out.data.check_question, topic, rule, step, guarded }, ...receipt(out) };
}

export const homeworkRoutes = {
  homework: { GET: homework },
  'homework-hint': { POST: homeworkHint },
};
