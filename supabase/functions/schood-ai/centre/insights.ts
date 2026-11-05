import { record, text } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { centreAcademy } from './academy.ts';
import { asList, isManager, monthOf, num, requireCentre, type Centre } from './shared.ts';

// C6 insights: what students ask the Student Assistant, grouped by topic per group.
// Counting happens in the function from the students' own questions and only the
// counts are stored (ai_centre_insights): no text, no names. A group appears only
// when it has at least five students, and a topic only when at least two students
// asked about it, so no single student's questions can be picked out. Staff never
// see a transcript. Group weak spots come from Academy homework mistake tags
// (counts per group), read with the person's own Academy token.

export const MIN_GROUP = 5;
const MIN_TOPIC_STUDENTS = 2;

/** Topic → keywords in English, Uzbek and Russian (matched as word prefixes). */
export const TOPICS: Record<string, string[]> = {
  'grammar.tenses': ['tense', 'present perfect', 'past simple', 'past continuous', 'future', 'zamon', 'время', 'времена', 'perfect', 'continuous'],
  'grammar.articles': ['article', 'artikl', 'артикл', ' a or an', 'the or a'],
  'grammar.prepositions': ['preposition', 'predlog', 'предлог', 'in on at'],
  'grammar.conditionals': ['conditional', 'if clause', 'shart gap', 'условн'],
  'grammar.passive': ['passive', 'majhul', 'пассив', 'страдательн'],
  'grammar.modals': ['modal', 'must', 'should', 'might', 'модальн'],
  'grammar.reported_speech': ['reported speech', 'indirect speech', "ko'chirma", 'ko‘chirma', 'косвенн'],
  'grammar.word_order': ['word order', "so'z tartibi", 'so‘z tartibi', 'порядок слов', 'question form'],
  'vocabulary.meaning': ['meaning', 'mean', 'synonym', 'translate', 'tarjima', "ma'nosi", 'ma’nosi', 'значени', 'перевод', 'синоним', 'word'],
  'vocabulary.phrasal_verbs': ['phrasal verb', 'фразов'],
  'pronunciation': ['pronounc', 'talaffuz', 'произнош', 'произнес'],
  'writing.essay': ['essay', 'insho', 'эссе', 'сочинени', 'task 2', 'opinion'],
  'writing.task1': ['task 1', 'graph', 'chart', 'diagram', 'table', 'jadval', 'диаграм', 'график'],
  'writing.letter': ['letter', 'email', 'xat', 'письм'],
  'reading': ['reading', "o'qish", 'o‘qish', 'чтени', 'true false', 'not given', 'heading'],
  'listening': ['listening', 'tinglash', 'аудирован', 'listen'],
  'speaking': ['speaking', 'gapirish', 'говорени', 'part 2', 'cue card', 'speak'],
  'exam.ielts': ['ielts', 'band'],
  'exam.multilevel': ['multilevel', 'cefr', 'milliy sertifikat'],
  'homework': ['homework', 'uy vazifa', 'домашн', 'exercise', 'mashq', 'упражнени'],
};

export function topicsOf(question: string): string[] {
  const textValue = ` ${question.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ')} `;
  return Object.entries(TOPICS).filter(([, words]) => words.some((word) => textValue.includes(word.startsWith(' ') ? word : ` ${word.replace(/[’‘`]/g, "'")}`))).map(([topic]) => topic);
}

/** Counts topics for each group with at least five students, for one month. */
export async function computeInsights(ctx: RequestContext, centre: Centre, period: string): Promise<{ groups: number; questions: number }> {
  const ws = centre.access.workspace;
  const [groups, memberships] = await Promise.all([centre.deps.store.table('groups').list({ workspace_id: ws.id, archived: false }), centre.deps.store.table('group_members').list({ workspace_id: ws.id })]);
  const from = Date.parse(`${period}-01T00:00:00+05:00`), to = new Date(new Date(from).setUTCMonth(new Date(from).getUTCMonth() + 1)).getTime();
  const perStudent = new Map<string, Map<string, number>>();
  const questionsOf = async (userId: string) => {
    if (perStudent.has(userId)) return perStudent.get(userId)!;
    const counts = new Map<string, number>();
    const threads = (await ctx.repo.threads(ws.id, userId, 100)).filter((thread) => thread.specialistKey === 'student_assistant' && Date.parse(thread.lastMessageAt) >= from);
    for (const thread of threads.slice(0, 50)) {
      for (const message of await ctx.repo.messages(thread.id, 200)) {
        const at = Date.parse(message.createdAt);
        if (message.role !== 'user' || at < from || at >= to) continue;
        counts.set('_total', (counts.get('_total') ?? 0) + 1);
        for (const topic of topicsOf(message.content)) counts.set(topic, (counts.get(topic) ?? 0) + 1);
      }
    }
    perStudent.set(userId, counts);
    return counts;
  };
  let kept = 0, total = 0;
  for (const group of groups) {
    const members = memberships.filter((row) => row.group_id === group.id).map((row) => row.user_id);
    await centre.deps.store.table('insights').remove({ group_id: group.id, period });
    if (members.length < MIN_GROUP) continue;
    const topics = new Map<string, { questions: number; students: number }>();
    for (const userId of members) {
      const counts = await questionsOf(userId);
      total += counts.get('_total') ?? 0;
      for (const [topic, n] of counts) {
        if (topic === '_total') continue;
        const entry = topics.get(topic) ?? { questions: 0, students: 0 };
        topics.set(topic, { questions: entry.questions + n, students: entry.students + 1 });
      }
    }
    for (const [topic, entry] of topics) {
      if (entry.students < MIN_TOPIC_STUDENTS) continue;
      await centre.deps.store.table('insights').insert({ workspace_id: ws.id, group_id: group.id, period, topic, questions: entry.questions, students: entry.students, group_size: members.length, computed_at: ctx.now().toISOString() });
    }
    kept++;
  }
  return { groups: kept, questions: total };
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export const insights = {
  /** GET centre/insights?period=YYYY-MM&weak=1: topic counts per group (five students or more) and Academy weak spots. */
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const period = ctx.query.get('period') ?? monthOf(ctx.now());
    if (!PERIOD.test(period)) throw new SchoodAIError('invalid_request', 'period must be YYYY-MM.', 400, { field: 'period' });
    const ws = centre.access.workspace;
    const [groups, rows, memberships] = await Promise.all([
      centre.deps.store.table('groups').list({ workspace_id: ws.id, archived: false }, { order: 'name' }),
      centre.deps.store.table('insights').list({ workspace_id: ws.id, period }),
      centre.deps.store.table('group_members').list({ workspace_id: ws.id }),
    ]);
    const visible = isManager(centre.access.role) ? groups : groups.filter((group) => group.teacher_ids.includes(ctx.user.id));
    const weak = ctx.query.get('weak') === '1' && ws.academyTenantId && ctx.user.token ? centreAcademy(ctx, ws) : null;
    return {
      period, min_group: MIN_GROUP, min_topic_students: MIN_TOPIC_STUDENTS,
      computed_at: rows.reduce<string | null>((latest, row) => (!latest || row.computed_at > latest ? row.computed_at : latest), null),
      groups: await Promise.all(visible.map(async (group) => {
        const size = memberships.filter((row) => row.group_id === group.id).length;
        const topics = rows.filter((row) => row.group_id === group.id).sort((a, b) => b.students - a.students || b.questions - a.questions).map((row) => ({ topic: row.topic, questions: row.questions, students: row.students }));
        let weakSpots: { tag: string; open: number; total: number }[] | null = null;
        if (weak && group.academy_classroom_id && size >= MIN_GROUP) {
          const result = await weak.learning('homework_mistakes', { classroom_id: group.academy_classroom_id }).catch(() => null);
          weakSpots = result ? asList(result.tags).map((tag) => ({ tag: String(tag.tag).slice(0, 60), open: num(tag.open) ?? 0, total: num(tag.total) ?? 0 })).sort((a, b) => b.total - a.total).slice(0, 8) : null;
        }
        return { id: group.id, name: group.name, level: group.level, size, shown: size >= MIN_GROUP, topics: size >= MIN_GROUP ? topics : [], weak_spots: weakSpots };
      })),
    };
  },
  /** POST centre/insights { period? }: counts this month's (or a given month's) questions again. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    await ctx.requireFeature('C6');
    const body = record(await ctx.body());
    const period = body.period === undefined ? monthOf(ctx.now()) : text(body.period, 'period', { max: 7 });
    if (!PERIOD.test(period)) throw new SchoodAIError('invalid_request', 'period must be YYYY-MM.', 400, { field: 'period' });
    const result = await computeInsights(ctx, centre, period);
    await ctx.audit('centre.insights_computed', { period, groups: result.groups }, { type: 'workspace', id: centre.access.workspace.id });
    return { period, ...result };
  },
};
