import { questionTypesForSection, type IeltsQuestionType, type IeltsSectionType } from '../../../ielts-core/src/question-types.ts';
import { speakingCriteria, writingCriteriaForTask } from '../../../ielts-core/src/rubrics.ts';
import { SAT_DIFFICULTIES } from '../../../sat-core/src/question-types.ts';
import { UZ_ADMISSION_2026 } from '../../../subject-core/src/data/uz-admission-2026.ts';
import { UZ_MATH_TOPICS } from '../../../subject-core/src/data/uz-math-topics.ts';
import { EXAM_SECTIONS, SPEAKING_PREP_SECONDS, SPEAKING_TALK_SECONDS, WRITING_WORDS } from '../../../../supabase/functions/_shared/english-exam-format.ts';
import type { ListeningPart, ReadingPart } from '../../../../supabase/functions/_shared/english-exam.ts';
import { MATH_DOMAIN_ORDER, OFFICIAL_DOMAINS, RW_MODULE_ORDER, type OfficialDomain } from '../../../../supabase/functions/_shared/sat-practice-content.ts';
import { MODULE_SPEC } from '../../../../supabase/functions/_shared/sat-practice-selection.ts';
import { BANDS, TASK_SECTION, TOEFL_2026_TASKS, TOEFL_2026_TIMING, type Toefl2026Section, type Toefl2026Task } from '../../../../supabase/functions/_shared/toefl-2026.ts';
import type { ExamFormatId, QuestionType } from './model.ts';

// Exam-style sets reuse Schood's existing format definitions; nothing here invents
// a format. Each adapter maps the exam's own ids to the material model:
//   IELTS          packages/ielts-core (question types per section, rubric criteria)
//   TOEFL 2026     supabase/functions/_shared/toefl-2026.ts (task ids, sections, timing, bands)
//   Multilevel     supabase/functions/_shared/english-exam-format.ts and english-exam.ts (parts)
//   SAT            supabase/functions/_shared/sat-practice-content.ts (official domains, skills)
//                  and sat-practice-selection.ts (module spec), packages/sat-core (difficulties)
//   Admission Maths packages/subject-core (topic graph, admission sections)
// Generation never reproduces published exam books: these give structure only.

// --- IELTS ------------------------------------------------------------------------------------

/** IELTS question type → the material question type it is written as. */
export const IELTS_TYPE_MAP: Record<IeltsQuestionType, QuestionType> = {
  question_text: 'short_answer',
  question_single_choice: 'single_choice',
  question_multi_choice: 'multi_choice',
  question_matching: 'matching',
  question_true_false_not_given: 'true_false_not_given',
  question_yes_no_not_given: 'yes_no_not_given',
  question_matching_headings: 'matching',
  question_sentence_endings: 'matching',
  question_gap_fill: 'gap',
  question_select_from_list: 'multi_choice',
  question_table_completion: 'gap',
  question_form_completion: 'gap',
  question_note_completion: 'gap',
  question_summary_completion: 'gap',
  question_diagram_labeling: 'gap',
  question_map_labeling: 'matching',
  question_drag_drop: 'matching',
};
/** Types that need a picture to answer; a text-only material leaves them out. */
const NEEDS_PICTURE: readonly IeltsQuestionType[] = ['question_diagram_labeling', 'question_map_labeling', 'question_drag_drop'];
export const ieltsTypesFor = (section: Extract<IeltsSectionType, 'reading' | 'listening'>): IeltsQuestionType[] =>
  questionTypesForSection(section).filter((type) => !NEEDS_PICTURE.includes(type));

/** The public test structure: 3 reading passages and 4 listening parts, 40 questions each. */
export const IELTS_STRUCTURE = {
  reading: { parts: 3, questions: 40, minutes: 60, perPart: [13, 13, 14] },
  listening: { parts: 4, questions: 40, minutes: 30, perPart: [10, 10, 10, 10] },
  writing: { tasks: ['task1', 'task2'] as const, minutes: { task1: 20, task2: 40 }, words: { task1: 150, task2: 250 } },
  speaking: { parts: ['part1', 'part2', 'part3'] as const, prepSeconds: 60, talkSeconds: 120 },
} as const;
export const ieltsWritingCriteria = (task: 'task1' | 'task2') => writingCriteriaForTask(task).map((criterion) => ({ id: criterion.id, name: criterion.label }));
export const ieltsSpeakingCriteria = () => speakingCriteria().map((criterion) => ({ id: criterion.id, name: criterion.label }));
/** Band scale for writing and speaking criteria: 0 to 9 in whole bands per criterion. */
export const IELTS_CRITERION_MAX = 9;

// --- TOEFL 2026 -------------------------------------------------------------------------------

export const toeflTasksFor = (section: Toefl2026Section): Toefl2026Task[] => TOEFL_2026_TASKS.filter((task) => TASK_SECTION[task] === section);
/** How each TOEFL 2026 task is written in a material. Speaking and writing tasks are open prompts. */
export const TOEFL_TASK_MAP: Record<Toefl2026Task, { questions: QuestionType[]; needsText: 'passage' | 'script' | 'none' }> = {
  complete_the_words: { questions: ['gap'], needsText: 'passage' },
  read_daily_life: { questions: ['single_choice'], needsText: 'passage' },
  read_academic_passage: { questions: ['single_choice'], needsText: 'passage' },
  listen_choose_response: { questions: ['single_choice'], needsText: 'script' },
  listen_conversation: { questions: ['single_choice'], needsText: 'script' },
  listen_announcement: { questions: ['single_choice'], needsText: 'script' },
  listen_academic_talk: { questions: ['single_choice'], needsText: 'script' },
  build_sentence: { questions: ['ordering'], needsText: 'none' },
  write_email: { questions: ['open'], needsText: 'none' },
  write_academic_discussion: { questions: ['open'], needsText: 'none' },
  listen_repeat: { questions: ['open'], needsText: 'script' },
  take_interview: { questions: ['open'], needsText: 'none' },
};
export const TOEFL_BANDS = BANDS;
export const TOEFL_TIMING = TOEFL_2026_TIMING;

// --- Multilevel (Uzbekistan CEFR multilevel exam) ---------------------------------------------

export const MULTILEVEL_SECTIONS = EXAM_SECTIONS;
export const MULTILEVEL_READING_PARTS = ['gap_fill', 'mcq', 'headings'] as const satisfies readonly ReadingPart['type'][];
export const MULTILEVEL_LISTENING_PARTS = ['dialogues', 'notes', 'mcq'] as const satisfies readonly ListeningPart['type'][];
export const MULTILEVEL_WRITING_TASKS = ['task11', 'task12', 'part2'] as const;
export const MULTILEVEL_SPEAKING_PARTS = ['part11', 'part12', 'part2', 'part3'] as const;
export const MULTILEVEL_WRITING_WORDS = WRITING_WORDS;
export const MULTILEVEL_SPEAKING_TIMING = { talk: SPEAKING_TALK_SECONDS, prep: SPEAKING_PREP_SECONDS };
export const MULTILEVEL_PART_MAP: Record<string, QuestionType> = { gap_fill: 'gap', mcq: 'single_choice', headings: 'matching', dialogues: 'single_choice', notes: 'gap' };

// --- SAT ----------------------------------------------------------------------------------------

export type SatOfficialDomain = OfficialDomain;
export const SAT_RW_DOMAINS = RW_MODULE_ORDER;
export const SAT_MATH_DOMAINS_OFFICIAL = MATH_DOMAIN_ORDER;
export const satSkillsFor = (domain: OfficialDomain): readonly string[] => OFFICIAL_DOMAINS[domain].skills;
export const satDomainLabel = (domain: OfficialDomain): string => OFFICIAL_DOMAINS[domain].label;
export const SAT_MODULES = MODULE_SPEC;
export const SAT_LEVELS = SAT_DIFFICULTIES;
/** Answer formats: four-option multiple choice, or a student-produced response (`spr`). */
export const SAT_ANSWER_FORMATS = { mcq: 'single_choice', spr: 'numeric' } as const satisfies Record<string, QuestionType>;

// --- National admission Maths -----------------------------------------------------------------

export const ADMISSION_MATH_TOPICS = UZ_MATH_TOPICS.topics.map((topic) => ({ code: topic.code, strand: topic.strand, names: topic.names }));
export const ADMISSION_MATH_TOPIC_CODES: readonly string[] = ADMISSION_MATH_TOPICS.map((topic) => topic.code);
/** Item types the admission format uses (subject-core's draft format: single choice). */
export const ADMISSION_ITEM_TYPES: readonly string[] = [...new Set(UZ_ADMISSION_2026.sections.flatMap((section) => section.item_types))];
export const ADMISSION_TOPICS_VERIFIED = UZ_MATH_TOPICS.verified;

// --- What each exam allows ----------------------------------------------------------------------

/** Valid exam targets: sections, tasks or parts per format, for briefs and validation. */
export const EXAM_TARGETS: Record<ExamFormatId, { sections: readonly string[]; tasks?: Record<string, readonly string[]> }> = {
  ielts: { sections: ['reading', 'listening', 'writing', 'speaking'], tasks: { writing: IELTS_STRUCTURE.writing.tasks, speaking: IELTS_STRUCTURE.speaking.parts } },
  toefl_2026: { sections: ['reading', 'listening', 'writing', 'speaking'], tasks: { reading: toeflTasksFor('reading'), listening: toeflTasksFor('listening'), writing: toeflTasksFor('writing'), speaking: toeflTasksFor('speaking') } },
  multilevel: { sections: MULTILEVEL_SECTIONS, tasks: { reading: MULTILEVEL_READING_PARTS, listening: MULTILEVEL_LISTENING_PARTS, writing: MULTILEVEL_WRITING_TASKS, speaking: MULTILEVEL_SPEAKING_PARTS } },
  sat: { sections: ['reading_writing', 'math'], tasks: { reading_writing: SAT_RW_DOMAINS, math: SAT_MATH_DOMAINS_OFFICIAL } },
  admission_math: { sections: ['math'] },
};

/** Exam type ids a question in this exam may carry (for `exam_type`). */
export function examTypesFor(format: ExamFormatId, section?: string): readonly string[] {
  switch (format) {
    case 'ielts': return section === 'listening' ? ieltsTypesFor('listening') : ieltsTypesFor('reading');
    case 'toefl_2026': return section && ['reading', 'listening', 'writing', 'speaking'].includes(section) ? toeflTasksFor(section as Toefl2026Section) : TOEFL_2026_TASKS;
    case 'multilevel': return section === 'listening' ? MULTILEVEL_LISTENING_PARTS : section === 'reading' ? MULTILEVEL_READING_PARTS : [...MULTILEVEL_READING_PARTS, ...MULTILEVEL_LISTENING_PARTS];
    case 'sat': return ['mcq', 'spr'];
    case 'admission_math': return ['single_choice'];
  }
}
