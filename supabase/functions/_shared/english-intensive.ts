export const intensiveLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const intensiveSkills = ['reading', 'listening', 'grammar', 'vocabulary', 'speaking', 'writing', 'immersion'] as const;
export type IntensiveLevel = typeof intensiveLevels[number];
export type IntensiveSkill = typeof intensiveSkills[number];

// Suggested blocks for the actual study agenda. Completion has no timer.
export const intensiveBlocks: Record<IntensiveSkill, readonly [number, number, number, number]> = {
  reading: [10, 12, 12, 12],
  listening: [10, 12, 12, 12],
  grammar: [8, 12, 14, 12],
  vocabulary: [10, 10, 12, 14],
  speaking: [8, 12, 12, 14],
  writing: [8, 16, 14, 12],
  immersion: [10, 14, 12, 14],
};
export const sessionMinutes = (skill: IntensiveSkill) => intensiveBlocks[skill].reduce((total, n) => total + n, 0);
export const coreUnitMinutes = intensiveSkills.filter((skill) => skill !== 'listening').reduce((total, skill) => total + sessionMinutes(skill), 0);

export const workFields = {
  reading: ['evidence', 'corrections', 'synthesis'],
  listening: ['notes', 'corrections', 'briefing'],
  grammar: ['corrections', 'transfer', 'edit'],
  vocabulary: ['recall', 'examples', 'application'],
  speaking: ['plan', 'reflection', 'revision'],
  writing: ['plan', 'draft', 'revision'],
  immersion: ['options', 'artifact', 'handover'],
} as const satisfies Record<IntensiveSkill, readonly string[]>;

export type Source = { title: string; text: string };
export type Recording = Source & { audio_url?: string | null };
export type Question = { prompt: string; options: string[]; answer: number; explanation: string };
export type Exercise = Omit<Question, 'answer' | 'explanation'>;
export type Example = { before: string; after: string; why: string };
export type Word = { word: string; meaning: string; example: string; pair: string };
export type Produce = { audience: string; first: string; change: string; second: string; checklist: string[] };
export type Mission = { role: string; goal: string; constraints: string[]; change: string; deliverables: string[]; checklist: string[] };
export type Unit = {
  slug: string; title: string; level: IntensiveLevel; summary: string;
  documents: Source[]; recordings: Recording[]; reading: Question[]; listening: Question[];
  grammar: { focus: string; explanation: string; examples: Example[]; questions: Question[]; transfer: string };
  vocabulary: Word[]; speaking: Produce; writing: Produce; immersion: Mission;
  guide?: Partial<Record<IntensiveSkill, string>>;
};
export type UnitOverview = Pick<Unit, 'slug' | 'title' | 'level' | 'summary'> & { listening_ready: boolean };

export type StudyMaterial =
  | { kind: 'reading'; sources: Source[]; questions: Exercise[] }
  | { kind: 'listening'; sources: Recording[]; questions: Exercise[] }
  | { kind: 'grammar'; focus: string; explanation: string; examples: Example[]; questions: Exercise[]; transfer: string }
  | { kind: 'vocabulary'; words: Word[]; sources: Source[] }
  | { kind: 'writing' | 'speaking'; task: Produce; sources: Source[] }
  | { kind: 'immersion'; mission: Mission; sources: Source[] };

export type Feedback = { answer: number; explanation: string; correct: boolean };
export type Progress = {
  revision: number;
  answers: Array<number | null>;
  work: Record<string, string>;
  feedback: Feedback[];
  completed: boolean;
};
export const emptyProgress: Progress = { revision: 0, answers: [], work: {}, feedback: [], completed: false };
export type SaveAction = 'save' | 'check' | 'complete';

export const questionsFor = (unit: Unit, skill: IntensiveSkill): Question[] => {
  if (skill === 'grammar') return unit.grammar.questions;
  return skill === 'reading' || skill === 'listening' ? unit[skill] : [];
};

const exercises = (questions: Question[]): Exercise[] => questions.map(({ prompt, options }) => ({ prompt, options }));

export const materialFor = (unit: Unit, kind: IntensiveSkill): StudyMaterial => {
  const sources = unit.documents;
  switch (kind) {
    case 'reading': return { kind, sources, questions: exercises(unit.reading) };
    case 'listening': return { kind, sources: unit.recordings, questions: exercises(unit.listening) };
    case 'grammar': return { ...unit.grammar, kind, questions: exercises(unit.grammar.questions) };
    case 'vocabulary': return { kind, words: unit.vocabulary, sources };
    case 'speaking':
    case 'writing': return { kind, task: unit[kind], sources };
    case 'immersion': return { kind, mission: unit.immersion, sources };
  }
};

export const gradeIntensive = (questions: Question[], choices: Progress['answers']): Feedback[] =>
  questions.map(({ answer, explanation }, index) => ({ answer, explanation, correct: choices[index] === answer }));
