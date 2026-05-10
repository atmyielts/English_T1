// Canonical IELTS rubric criteria. The strings here MUST match what `score-session` and
// `grade-writing` write into evaluation payloads — frontend dashboards display the same
// labels users will see on their score reports.

export type IeltsWritingCriterion =
  | 'task_response'
  | 'task_achievement'
  | 'coherence_cohesion'
  | 'lexical_resource'
  | 'grammatical_range_accuracy';

export type IeltsSpeakingCriterion =
  | 'fluency_coherence'
  | 'lexical_resource'
  | 'grammatical_range_accuracy'
  | 'pronunciation';

export interface CriterionInfo {
  id: IeltsWritingCriterion | IeltsSpeakingCriterion;
  label: string;
  short: string;
  description: string;
}

// Writing Task 2 (and Speaking) use Task Response. Writing Task 1 uses Task Achievement.
// Both are surfaced here so consumers can render the right one per task.
export const WRITING_CRITERIA: Record<IeltsWritingCriterion, CriterionInfo> = {
  task_response: {
    id: 'task_response',
    label: 'Task Response',
    short: 'TR',
    description: 'Whether the response addresses every part of the prompt with a clear position and well-developed supporting ideas.',
  },
  task_achievement: {
    id: 'task_achievement',
    label: 'Task Achievement',
    short: 'TA',
    description: 'Whether the response covers the requirements of a Task 1 prompt: overview, key features, accurate data.',
  },
  coherence_cohesion: {
    id: 'coherence_cohesion',
    label: 'Coherence and Cohesion',
    short: 'CC',
    description: 'Logical organization, paragraphing, and use of cohesive devices to link ideas.',
  },
  lexical_resource: {
    id: 'lexical_resource',
    label: 'Lexical Resource',
    short: 'LR',
    description: 'Range, accuracy, and naturalness of vocabulary, including collocation and topic-appropriate word choice.',
  },
  grammatical_range_accuracy: {
    id: 'grammatical_range_accuracy',
    label: 'Grammatical Range and Accuracy',
    short: 'GRA',
    description: 'Variety of structures used and the proportion that are error-free or only minorly flawed.',
  },
};

export const SPEAKING_CRITERIA: Record<IeltsSpeakingCriterion, CriterionInfo> = {
  fluency_coherence: {
    id: 'fluency_coherence',
    label: 'Fluency and Coherence',
    short: 'FC',
    description: 'Speech flow without unnatural hesitation; logical sequencing and discourse markers.',
  },
  lexical_resource: {
    id: 'lexical_resource',
    label: 'Lexical Resource',
    short: 'LR',
    description: 'Range, precision, and idiomatic use of vocabulary in speech.',
  },
  grammatical_range_accuracy: {
    id: 'grammatical_range_accuracy',
    label: 'Grammatical Range and Accuracy',
    short: 'GRA',
    description: 'Variety of grammatical structures and accuracy under spoken-time pressure.',
  },
  pronunciation: {
    id: 'pronunciation',
    label: 'Pronunciation',
    short: 'P',
    description: 'Intelligibility, individual sound accuracy, stress, rhythm, and intonation.',
  },
};

// Convenience: writing criteria for a specific task (Task 1 vs Task 2 differ on the first one).
export const writingCriteriaForTask = (
  task: 'task1' | 'task2',
): readonly CriterionInfo[] => {
  const opener = task === 'task1' ? WRITING_CRITERIA.task_achievement : WRITING_CRITERIA.task_response;
  return [
    opener,
    WRITING_CRITERIA.coherence_cohesion,
    WRITING_CRITERIA.lexical_resource,
    WRITING_CRITERIA.grammatical_range_accuracy,
  ];
};

export const speakingCriteria = (): readonly CriterionInfo[] => [
  SPEAKING_CRITERIA.fluency_coherence,
  SPEAKING_CRITERIA.lexical_resource,
  SPEAKING_CRITERIA.grammatical_range_accuracy,
  SPEAKING_CRITERIA.pronunciation,
];
