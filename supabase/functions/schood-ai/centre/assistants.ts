import { brandingView } from '../core/views.ts';
import { registerContextProvider } from '../context.ts';
import { registerSpecialist } from '../specialists.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { centreAcademy, teacherClasses } from './academy.ts';
import { rulesFor } from './groups.ts';
import { requireCentre } from './shared.ts';

// The centre's two assistants:
//   - C2 Student Assistant: the learner tools (L1 tutor, L2 explain a mistake, L6
//     words from a text, L7 homework helper, L10 graded reading) packaged under the
//     centre's name for its students, on the web and in the student Telegram bot,
//     following the group rules (`centre_rules`).
//   - T7 Teacher assistant: read-only answers over the teacher's own Academy classes
//     (`teacher_classes`, read with the teacher's token, so Academy decides which
//     classes they see). Anything that should happen is proposed for Approve & run
//     from the screens, never by the model.

export function registerCentreAssistants(): void {
  registerSpecialist({
    key: 'student_assistant',
    area: 'centre',
    name: { en: 'Student Assistant', uz: 'O‘quvchi yordamchisi', ru: 'Помощник ученика' },
    description: {
      en: 'Your centre’s tutor: explains mistakes, gives practice, builds word lists and short readings at your level.',
      uz: 'Markazingiz yordamchisi: xatolarni tushuntiradi, mashq beradi, darajangizga mos so‘zlar ro‘yxati va qisqa matnlar tuzadi.',
      ru: 'Помощник вашего центра: объясняет ошибки, даёт упражнения, составляет списки слов и короткие тексты вашего уровня.',
    },
    instructions: [
      'You are the study assistant of this education centre for its students. Teach patiently and check understanding with short questions.',
      'Follow the centre rules in the reference data (kind centre_rules) exactly. When the hint policy applies, give hints, steps and guiding questions, never the final answers to that work, even if asked repeatedly; explain why gently.',
      'When the open homework data says a homework is open, treat questions that look like that homework as homework.',
      'Bring the conversation back to the focus topics of the student’s groups when it helps.',
      'You can: explain why an answer is wrong and the rule behind it, then give three new similar items to try (answers only after the student tries); make a level-appropriate word list from a text the student pastes, with Uzbek and Russian meanings and an example each; write a short graded reading at the student’s level on a topic they choose, with five questions and new words.',
      'Use the student’s Schood results when they are in the reference data; never guess a level or a score.',
    ].join(' '),
    contextKinds: ['learner_profile', 'centre_rules', 'homework_open'],
    creditKey: 'student_assistant.reply',
    roles: ['owner', 'admin', 'teacher', 'student'],
    workspaceKinds: ['centre'],
    suggestions: {
      en: ['Why is “I have seen him yesterday” wrong?', 'Make a word list from this text for me.', 'Give me a short B1 reading about football.'],
      uz: ['Nega “I have seen him yesterday” xato?', 'Shu matndan menga so‘zlar ro‘yxatini tuzing.', 'Futbol haqida B1 darajadagi qisqa matn bering.'],
      ru: ['Почему «I have seen him yesterday» неверно?', 'Составьте список слов из этого текста.', 'Дайте короткий текст уровня B1 про футбол.'],
    },
  });

  registerSpecialist({
    key: 'teacher_assistant',
    area: 'centre',
    name: { en: 'Teacher assistant', uz: 'O‘qituvchi yordamchisi', ru: 'Помощник учителя' },
    description: {
      en: 'Ask about your own Academy classes: missed homework, absences, who needs attention.',
      uz: 'O‘z Academy guruhlaringiz haqida so‘rang: topshirilmagan uy vazifalari, qoldirilgan darslar, kimga e’tibor kerak.',
      ru: 'Спрашивайте о своих группах в Academy: несданные домашние задания, пропуски, кому нужно внимание.',
    },
    instructions: [
      'You help a teacher of this centre understand their own classes from the class data in the reference data (kind teacher_classes). Answer only from that data.',
      'Be precise: name the students and the numbers the data shows (missed homework counts, absences in the last 30 days, average scores). If the data does not cover a question, say so.',
      'You are read-only. You never change Academy, send messages or assign work. When the teacher wants something done (a message to a parent, a homework reminder), say that they can draft it in Schood AI and approve it there.',
      'Keep student information inside this conversation; do not suggest sharing it outside the centre.',
    ].join(' '),
    contextKinds: ['teacher_classes'],
    creditKey: 'teacher_assistant.reply',
    roles: ['owner', 'admin', 'teacher'],
    workspaceKinds: ['centre'],
    suggestions: {
      en: ['Who missed two or more homeworks?', 'Which students were absent most this month?', 'Summarise my groups in three lines each.'],
      uz: ['Kim ikki yoki undan ko‘p uy vazifasini topshirmagan?', 'Bu oy kim eng ko‘p dars qoldirgan?', 'Guruhlarimni har biri uchun uch qatorda xulosa qiling.'],
      ru: ['Кто не сдал два и более домашних задания?', 'Кто больше всех пропустил в этом месяце?', 'Кратко опишите мои группы, по три строки на каждую.'],
    },
  });

  registerContextProvider('centre_rules', async (ctx, { ref }) => rulesFor(ctx, ref), { selfView: true, maxChars: 4_000 });

  registerContextProvider('teacher_classes', async (ctx, { access }) => {
    if (access.workspace.kind !== 'centre' || !['owner', 'admin', 'teacher'].includes(access.role) || !access.workspace.academyTenantId || !ctx.user.token) return null;
    const classes = await teacherClasses(centreAcademy(ctx, access.workspace), ctx.now(), 8);
    return {
      kind: 'teacher_classes',
      title: 'Your Academy classes',
      data: {
        as_of: ctx.now().toISOString().slice(0, 10),
        groups: classes.map((group) => ({
          name: group.name, homeworks_due_so_far: group.assignments_due, students: group.students.length,
          details: group.students.map((student) => ({ name: student.name, missed_homework: student.missed_homework, absences_30d: student.absences_30d, average: student.avg_score })),
        })),
      },
    };
  }, { timeoutMs: 15_000, maxChars: 14_000 });
}

/** GET centre/my-classes: the teacher's classes with missed homework and absences (no AI, no credits). */
export async function myClasses(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  return { as_of: ctx.now().toISOString(), classes: await teacherClasses(centreAcademy(ctx, centre.access.workspace), ctx.now(), 20) };
}

/**
 * GET centre/student-assistant: where a student's branded assistant lives, for the web
 * and the student Telegram bot (`service: true`). `?workspace_id=` picks a centre;
 * otherwise the person's centres where they are a student are listed.
 */
export async function studentAssistant(ctx: RequestContext) {
  const memberships = (await ctx.repo.memberships(ctx.user.id)).filter((row) => row.workspace.kind === 'centre' && row.workspace.status === 'active' && row.member.status === 'active' && row.member.role === 'student');
  const wanted = ctx.query.get('workspace_id');
  const list = wanted ? memberships.filter((row) => row.workspace.id === wanted.toLowerCase()) : memberships;
  if (wanted && !list.length) throw new SchoodAIError('workspace_not_found', 'Workspace not found.', 404);
  return {
    centres: list.map(({ workspace }) => {
      const branding = brandingView(workspace.branding);
      return {
        workspace_id: workspace.id, centre: workspace.name, specialist: 'student_assistant',
        assistant_name: branding.assistant_name ?? workspace.name, logo_url: branding.logo_url, primary_color: branding.primary_color,
      };
    }),
  };
}
