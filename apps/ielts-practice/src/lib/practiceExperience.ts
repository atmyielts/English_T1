import type { PracticeDeliveryBuild, PracticePlanItem } from './api';

type JsonRecord = Record<string, unknown>;

export type PracticeExperienceKind =
  | 'strategy'
  | 'repair_drill'
  | 'guided_set'
  | 'timed_mini'
  | 'writing_rewrite'
  | 'mastery_check';

export const EXPERIENCE_KINDS: PracticeExperienceKind[] = [
  'strategy',
  'repair_drill',
  'guided_set',
  'timed_mini',
  'writing_rewrite',
  'mastery_check',
];

export const EXPERIENCE_COPY: Record<PracticeExperienceKind, { label: string; short: string; description: string }> = {
  strategy: {
    label: 'Strategy Primer',
    short: 'Strategy',
    description: 'Learn the task pattern before answering: evidence, paraphrase, and likely traps.',
  },
  repair_drill: {
    label: 'Repair Drill',
    short: 'Repair',
    description: 'Slow targeted practice for the exact mistake pattern exposed by simulator results.',
  },
  guided_set: {
    label: 'Guided Practice Set',
    short: 'Guided',
    description: 'A short transformed set with focused prompts and selected source material.',
  },
  timed_mini: {
    label: 'Timed Mini-Session',
    short: 'Timed',
    description: 'A compact exam-paced slice that checks whether the skill holds under time pressure.',
  },
  writing_rewrite: {
    label: 'Writing Rewrite',
    short: 'Rewrite',
    description: 'Rewrite a response with criterion-focused upgrades and AI scoring feedback.',
  },
  mastery_check: {
    label: 'Mastery Check',
    short: 'Mastery',
    description: 'A no-hints checkpoint used to decide whether the skill can move up in difficulty.',
  },
};

const isRecord = (value: unknown): value is JsonRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const asNumber = (value: unknown): number | null => {
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : null;
};

const normalizeKind = (value: unknown): PracticeExperienceKind => {
  const raw = String(value ?? '').trim().toLowerCase();
  return (EXPERIENCE_KINDS as string[]).includes(raw) ? raw as PracticeExperienceKind : 'guided_set';
};

export const formatPracticeLabel = (value: unknown): string => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '-';
  const mapped: Record<string, string> = {
    question_text: 'Task Response',
    question_gap_fill: 'Gap Fill',
    question_matching_headings: 'Matching Headings',
    question_matching: 'Matching',
    question_tfng: 'True / False / Not Given',
    question_ynng: 'Yes / No / Not Given',
    question_multiple_choice: 'Multiple Choice',
    question_table_completion: 'Table Completion',
    question_note_completion: 'Note Completion',
    question_form_completion: 'Form Completion',
    question_map_labeling: 'Map Labelling',
  };
  if (mapped[text]) return mapped[text];
  return text
    .replace(/^question_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (token) => token.toUpperCase());
};

const buildSummary = (item: PracticePlanItem): JsonRecord =>
  isRecord(item.delivery_build?.build_summary) ? item.delivery_build.build_summary as JsonRecord : {};

const rationale = (item: PracticePlanItem): JsonRecord =>
  isRecord(item.rationale_json) ? item.rationale_json as JsonRecord : {};

export const getPlanExperienceKind = (item: PracticePlanItem): PracticeExperienceKind => {
  const summary = buildSummary(item);
  return normalizeKind(item.delivery_build?.experience_kind ?? item.blueprint?.experience_kind ?? summary.experience_kind);
};

export const getBuildExperienceKind = (build: PracticeDeliveryBuild | null): PracticeExperienceKind => {
  const summary = isRecord(build?.build_summary) ? build?.build_summary as JsonRecord : {};
  return normalizeKind(build?.experience_kind ?? summary.experience_kind);
};

export const getBuildExperienceLabel = (build: PracticeDeliveryBuild | null): string =>
  EXPERIENCE_COPY[getBuildExperienceKind(build)].label;

export const getPlanQuestionTypes = (item: PracticePlanItem): string[] => {
  const summary = buildSummary(item);
  const rawTypes = Array.isArray(summary.target_question_types)
    ? summary.target_question_types
    : Array.isArray(summary.question_types)
      ? summary.question_types
      : Array.isArray(item.blueprint?.target_question_types)
        ? item.blueprint.target_question_types
        : Array.isArray(item.metadata?.question_types)
          ? item.metadata.question_types
          : [];
  return rawTypes.map((entry) => String(entry ?? '').trim()).filter(Boolean);
};

export const getPlanItemFocus = (item: PracticePlanItem): string => {
  const labels = getPlanQuestionTypes(item).map(formatPracticeLabel).filter((entry) => entry !== '-');
  if (labels.length === 0) return formatPracticeLabel(item.section_type);
  if (item.section_type === 'writing' && labels.includes('Task Response')) return 'Task Response Upgrade';
  return labels.slice(0, 2).join(', ');
};

export const getPlanItemTitle = (item: PracticePlanItem): string => {
  if (!item.blueprint_id && !item.delivery_build_id) return item.exercise?.title ?? 'Practice session';
  const kind = getPlanExperienceKind(item);
  const focus = getPlanItemFocus(item);
  if (kind === 'writing_rewrite') return `Writing Rewrite: ${focus}`;
  return `${focus} ${EXPERIENCE_COPY[kind].label}`;
};

export const getPlanItemDescription = (item: PracticePlanItem): string =>
  EXPERIENCE_COPY[getPlanExperienceKind(item)].description;

export const getPlanPersonalizationChips = (item: PracticePlanItem): string[] => {
  const info = rationale(item);
  const metadata = isRecord(item.metadata) ? item.metadata as JsonRecord : {};
  const chips: string[] = [];
  const gap = asNumber(info.section_gap);
  const weakness = asNumber(info.question_weakness);
  const mastery = asNumber(info.average_mastery);
  const confidence = asNumber(info.average_confidence);
  const minutes = asNumber(metadata.estimated_minutes ?? item.blueprint?.estimated_minutes);

  if (gap != null && gap > 0) chips.push(`Band gap ${gap.toFixed(2)}`);
  if (weakness != null && weakness > 0) chips.push(`Weakness ${weakness.toFixed(2)}`);
  if (mastery != null) chips.push(`Mastery ${Math.round(Math.max(0, Math.min(1, mastery)) * 100)}%`);
  if (confidence != null) chips.push(`Confidence ${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`);
  if (minutes != null) chips.push(`${Math.round(minutes)} min`);

  return chips.slice(0, 5);
};

export const getPlanWhyCopy = (item: PracticePlanItem): string => {
  const chips = getPlanPersonalizationChips(item).filter((chip) => !chip.endsWith('min'));
  if (chips.length === 0) return 'Chosen from your simulator history, target band, recency, and mastery record.';
  return `Chosen from your simulator results: ${chips.join(' | ')}.`;
};

export const getExperienceSteps = (kind: PracticeExperienceKind, section: string): string[] => {
  if (kind === 'strategy') {
    if (section === 'listening') return ['Predict answer type', 'Track signposts', 'Check paraphrase'];
    if (section === 'writing') return ['Analyse task', 'Build plan', 'Set criterion target'];
    return ['Locate evidence', 'Name the trap', 'Answer slowly'];
  }
  if (kind === 'repair_drill') {
    if (section === 'listening') return ['Predict', 'Catch distractor', 'Confirm final answer'];
    return ['Find evidence', 'Eliminate distractor', 'Compare wording'];
  }
  if (kind === 'timed_mini') return ['Work at pace', 'Submit once', 'Use result for next plan'];
  if (kind === 'writing_rewrite') return ['Read target', 'Rewrite response', 'Get AI feedback'];
  if (kind === 'mastery_check') return ['No hints', 'Submit proof', 'Escalate if mastered'];
  return ['Understand prompt', 'Use selected source', 'Check reasoning'];
};

export const getPlanExperienceSteps = (item: PracticePlanItem): string[] =>
  getExperienceSteps(getPlanExperienceKind(item), item.section_type);

export const getPlanSourceCopy = (item: PracticePlanItem): string => {
  const summary = buildSummary(item);
  const source = String(summary.source_section_name ?? '').trim();
  const label = EXPERIENCE_COPY[getPlanExperienceKind(item)].label.toLowerCase();
  if (source && !['reading', 'listening', 'writing'].includes(source.toLowerCase())) {
    return `Uses "${source}" as raw simulator material, rebuilt into a ${label}.`;
  }
  return `Uses simulator material as raw content, rebuilt into a focused ${label} instead of a full retake.`;
};
