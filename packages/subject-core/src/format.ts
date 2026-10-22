// PE-02 exam-format registry: an exam format is a data record, not code.
// A record without an official source, check date and checker cannot be published,
// and a mock pins the version it was built for so old results never change.

export type Locale = 'uz' | 'ru' | 'en';
export type Names = Record<Locale, string>;

export interface FormatSource {
  url: string;
  /** `official`: the testing agency or ministry. `secondary`: press or prep sites that report it. */
  kind: 'official' | 'secondary';
  note: string;
}

export interface FormatSection {
  id: string;
  names: Names;
  /** Subject code, or `by_programme` when the study programme decides the subject. */
  subject: string;
  block: 'compulsory' | 'specialised';
  questions: number;
  points_per_question: number;
  item_types: string[];
}

export interface ExamFormat {
  exam_code: string;
  version: string;
  status: 'draft' | 'published';
  names: Names;
  effective_from: string | null;
  /** The official specification. Required before publishing. */
  source_url: string | null;
  checked_at: string | null;
  checked_by: string | null;
  sources: FormatSource[];
  duration_minutes: number | null;
  sections: FormatSection[];
  scoring: { max_score: number; wrong_answer_penalty: number | null };
  delivery: { calculator: boolean | null; navigation: 'free' | 'linear' | null };
  /** Details still to be checked against the official source before publishing. */
  verify: string[];
}

export class FormatError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function sectionMaxPoints(section: FormatSection): number {
  return round(section.questions * section.points_per_question);
}

export function formatMaxScore(format: ExamFormat): number {
  return round(format.sections.reduce((sum, section) => sum + sectionMaxPoints(section), 0));
}

/** Structural problems, whatever the status. An empty list means the record is consistent. */
export function formatProblems(format: ExamFormat): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9-]{2,40}$/.test(format.exam_code)) problems.push('exam_code');
  if (!format.version) problems.push('version');
  for (const locale of ['uz', 'ru', 'en'] as const) if (!format.names?.[locale]) problems.push(`names.${locale}`);
  if (!format.sections.length) problems.push('sections');
  const ids = new Set<string>();
  for (const section of format.sections) {
    if (ids.has(section.id)) problems.push(`sections.${section.id}.duplicate`);
    ids.add(section.id);
    if (!Number.isInteger(section.questions) || section.questions < 1) problems.push(`sections.${section.id}.questions`);
    if (!(section.points_per_question > 0)) problems.push(`sections.${section.id}.points_per_question`);
    if (!section.item_types.length) problems.push(`sections.${section.id}.item_types`);
    for (const locale of ['uz', 'ru', 'en'] as const) if (!section.names?.[locale]) problems.push(`sections.${section.id}.names.${locale}`);
  }
  if (Math.abs(formatMaxScore(format) - format.scoring.max_score) > 0.001) problems.push('scoring.max_score');
  if (format.scoring.wrong_answer_penalty !== null && format.scoring.wrong_answer_penalty < 0) problems.push('scoring.wrong_answer_penalty');
  return problems;
}

/** What blocks publishing: structure, a missing official source or check, and unresolved checks. */
export function publishBlockers(format: ExamFormat): string[] {
  const blockers = formatProblems(format);
  if (!format.source_url || !format.sources.some((source) => source.kind === 'official' && source.url === format.source_url)) blockers.push('source_url');
  if (!format.checked_at) blockers.push('checked_at');
  if (!format.checked_by) blockers.push('checked_by');
  if (!format.effective_from) blockers.push('effective_from');
  if (format.duration_minutes === null) blockers.push('duration_minutes');
  if (format.scoring.wrong_answer_penalty === null) blockers.push('scoring.wrong_answer_penalty');
  for (const item of format.verify) blockers.push(`verify:${item}`);
  return blockers;
}

export function assertPublishable(format: ExamFormat): void {
  const blockers = publishBlockers(format);
  if (blockers.length) throw new FormatError('format_not_publishable', blockers.join(', '));
}

export function findSection(format: ExamFormat, id: string): FormatSection {
  const section = format.sections.find((row) => row.id === id);
  if (!section) throw new FormatError('section_not_found', id);
  return section;
}

/** Points for one section from correct and wrong counts. Unanswered questions score zero. */
export function scoreSection(format: ExamFormat, sectionId: string, correct: number, wrong = 0): number {
  const section = findSection(format, sectionId);
  if (!Number.isInteger(correct) || !Number.isInteger(wrong) || correct < 0 || wrong < 0 || correct + wrong > section.questions) {
    throw new FormatError('invalid_counts', `${sectionId}: ${correct} correct, ${wrong} wrong of ${section.questions}`);
  }
  const penalty = format.scoring.wrong_answer_penalty ?? 0;
  return round(Math.max(0, correct * section.points_per_question - wrong * penalty));
}
