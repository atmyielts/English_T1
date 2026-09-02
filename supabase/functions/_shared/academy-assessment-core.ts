export const assessmentSkills = [
  'grammar',
  'vocabulary',
  'reading',
  'listening',
  'writing',
  'speaking',
] as const;
export type AssessmentSkill = typeof assessmentSkills[number];
export type AssessmentItem = {
  id: string;
  skill: AssessmentSkill;
  kind: 'choice' | 'written' | 'interview';
  prompt: string;
  rubric: string;
  passage: string;
  media_url: string;
  options: string[];
  correct: number | null;
  points: number;
};
export type AssessmentSummary = {
  percent: number | null;
  earned: number;
  possible: number;
  skills: Array<
    {
      skill: AssessmentSkill;
      percent: number | null;
      earned: number;
      possible: number;
      pending: boolean;
    }
  >;
  pending: boolean;
};
const object = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
const text = (input: unknown, max = 300) => String(input ?? '').trim().slice(0, max);

export function validateAssessmentItems(input: unknown): AssessmentItem[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new Error('Add between 1 and 100 questions.');
  }
  const ids = new Set<string>();
  return input.map((raw) => {
    const item = object(raw);
    const id = text(item.id, 64);
    const skill = text(item.skill) as AssessmentSkill;
    const kind = text(item.kind) as AssessmentItem['kind'];
    const prompt = text(item.prompt, 6000);
    const rubric = text(item.rubric, 3000);
    const options = Array.isArray(item.options) ? item.options.map((o) => text(o, 1000)) : [];
    const points = Number(item.points);
    const media_url = text(item.media_url, 2000);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) {
      throw new Error('Each question needs a unique reference.');
    }
    ids.add(id);
    if (
      !assessmentSkills.includes(skill) || !['choice', 'written', 'interview'].includes(kind) ||
      !prompt
    ) throw new Error('Choose a skill, question type, and question text.');
    if (!Number.isFinite(points) || points <= 0 || points > 100) {
      throw new Error('Question marks must be between 0 and 100.');
    }
    if (
      media_url && (!media_url.startsWith('https://') || (() => {
        try {
          return Boolean(new URL(media_url).username || new URL(media_url).password);
        } catch {
          return true;
        }
      })())
    ) throw new Error('Use a secure HTTPS audio link without a password.');
    const correct = kind === 'choice' ? Number(item.correct) : null;
    if (
      kind === 'choice' &&
      (options.length < 2 || options.length > 8 || options.some((o) => !o) ||
        item.correct === null || !Number.isInteger(correct) || correct! < 0 ||
        correct! >= options.length)
    ) throw new Error('Add 2–8 answer choices and select the correct answer.');
    if ((skill === 'writing' || skill === 'speaking') && kind === 'choice') {
      throw new Error('Writing and speaking need teacher-reviewed evidence, not multiple choice.');
    }
    if (skill === 'listening' && !media_url) {
      throw new Error('Add the listening audio before saving this paper.');
    }
    if (kind !== 'choice' && rubric.length < 10) {
      throw new Error('Add marking guidance for every teacher-reviewed task.');
    }
    return {
      id,
      skill,
      kind,
      prompt,
      rubric,
      passage: text(item.passage, 15000),
      media_url,
      options: kind === 'choice' ? options : [],
      correct,
      points,
    };
  });
}

export function publicAssessmentItems(items: AssessmentItem[]) {
  return items.map(({ correct: _correct, rubric: _rubric, ...item }) => item);
}

export function assessmentSummary(
  items: AssessmentItem[],
  marks: Record<string, number>,
): AssessmentSummary {
  const skills = assessmentSkills.map((skill) => {
    const questions = items.filter((item) => item.skill === skill);
    const possible = questions.reduce((sum, item) => sum + item.points, 0);
    const pending = questions.some((item) => !Number.isFinite(marks[item.id]));
    const earned = questions.reduce(
      (sum, item) => sum + Math.min(item.points, Math.max(0, Number(marks[item.id]) || 0)),
      0,
    );
    return {
      skill,
      earned,
      possible,
      pending,
      percent: possible && !pending ? Math.round(earned / possible * 1000) / 10 : null,
    };
  });
  const possible = skills.reduce((sum, s) => sum + s.possible, 0);
  const earned = skills.reduce((sum, s) => sum + s.earned, 0);
  const pending = skills.some((s) => s.pending);
  return {
    skills,
    possible,
    earned,
    pending,
    percent: possible && !pending ? Math.round(earned / possible * 1000) / 10 : null,
  };
}

export function validateAssessmentReport(input: unknown) {
  const report = object(input);
  const level = text(report.level, 10);
  if (level && !['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(level)) {
    throw new Error('Choose a valid estimated level.');
  }
  const basis = text(report.basis, 3000);
  if (basis.length < 20) {
    throw new Error(
      'Explain the assessment evidence and any limitations before approving the report.',
    );
  }
  return {
    level,
    basis,
    strengths: text(report.strengths, 3000),
    next_steps: text(report.next_steps, 3000),
    recommended_course: text(report.recommended_course, 200),
    learning_plan: text(report.learning_plan, 3000),
    support_needed: report.support_needed === true,
  };
}

export type ProgressEvidence = {
  contact_id: string;
  paper_id: string;
  classroom_id: string | null;
  assessed_at: string;
  percent: number | null;
};
// Compare matched learners on the same immutable paper only. CEFR categories are not interval scores.
export function assessmentProgress(rows: ProgressEvidence[]) {
  const learners = new Map<string, ProgressEvidence[]>();
  for (const row of rows) {
    if (
      row.percent === null || !Number.isFinite(row.percent) ||
      !Number.isFinite(Date.parse(row.assessed_at))
    ) continue;
    const key = `${row.contact_id}:${row.paper_id}:${row.classroom_id ?? ''}`;
    learners.set(key, [...(learners.get(key) ?? []), row]);
  }
  return [...learners.values()].filter((history) => history.length > 1).map((history) => {
    history.sort((a, b) => Date.parse(a.assessed_at) - Date.parse(b.assessed_at));
    const first = history[0], last = history[history.length - 1];
    return {
      contact_id: first.contact_id,
      paper_id: first.paper_id,
      classroom_id: first.classroom_id,
      baseline: first.percent!,
      latest: last.percent!,
      change: Math.round((last.percent! - first.percent!) * 10) / 10,
      assessments: history.length,
      from: first.assessed_at,
      to: last.assessed_at,
    };
  });
}
