import { formatQuestionTypeLabel } from '@schood/ielts-core';
import type { PracticeDeliveryBuild, PracticePlanItem } from './api';
import { translateEn, type AppKey, type AppTranslate } from '../i18n';

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

/** Label, short label and description of an experience kind in the learner's language. */
export const experienceCopy = (
  kind: PracticeExperienceKind,
  t: AppTranslate = translateEn,
): { label: string; short: string; description: string } => ({
  label: t(`exp.${kind}.label` as AppKey),
  short: t(`exp.${kind}.short` as AppKey),
  description: t(`exp.${kind}.description` as AppKey),
});

/** English copy, kept for callers that have not moved to experienceCopy(kind, t). */
export const EXPERIENCE_COPY: Record<PracticeExperienceKind, { label: string; short: string; description: string }> =
  Object.fromEntries(EXPERIENCE_KINDS.map((kind) => [kind, experienceCopy(kind)])) as Record<PracticeExperienceKind, { label: string; short: string; description: string }>;

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

// IELTS question-type names stay in English: they are the exam's own terms.
export const formatPracticeLabel = formatQuestionTypeLabel;

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

export const getBuildExperienceLabel = (build: PracticeDeliveryBuild | null, t: AppTranslate = translateEn): string =>
  experienceCopy(getBuildExperienceKind(build), t).label;

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

const sectionWord = (section: string, t: AppTranslate): string => {
  const key = `section.${section}` as AppKey;
  const value = t(key);
  return value === key ? formatPracticeLabel(section) : value;
};

export const getPlanItemFocus = (item: PracticePlanItem, t: AppTranslate = translateEn): string => {
  const labels = getPlanQuestionTypes(item).map(formatPracticeLabel).filter((entry) => entry !== '-');
  if (labels.length === 0) return sectionWord(item.section_type, t);
  if (item.section_type === 'writing' && labels.includes('Task Response')) return t('exp.focus.taskResponse');
  return labels.slice(0, 2).join(', ');
};

export const getPlanItemTitle = (item: PracticePlanItem, t: AppTranslate = translateEn): string => {
  if (!item.blueprint_id && !item.delivery_build_id) return item.exercise?.title ?? t('exp.title.session');
  const kind = getPlanExperienceKind(item);
  const focus = getPlanItemFocus(item, t);
  if (kind === 'writing_rewrite') return t('exp.title.writingRewrite', { focus });
  return t('exp.title.default', { focus, kind: experienceCopy(kind, t).label });
};

export const getPlanItemDescription = (item: PracticePlanItem, t: AppTranslate = translateEn): string =>
  experienceCopy(getPlanExperienceKind(item), t).description;

/** Signals the planner actually used (from rationale_json); no estimates are added here. */
export const getPlanPersonalizationChips = (item: PracticePlanItem, t: AppTranslate = translateEn): string[] => {
  const info = rationale(item);
  const metadata = isRecord(item.metadata) ? item.metadata as JsonRecord : {};
  const chips: string[] = [];
  const gap = asNumber(info.section_gap);
  const weakness = asNumber(info.question_weakness);
  const mastery = asNumber(info.average_mastery);
  const confidence = asNumber(info.average_confidence);
  const minutes = asNumber(metadata.estimated_minutes ?? item.blueprint?.estimated_minutes);

  if (gap != null && gap > 0) chips.push(t('exp.chip.gap', { value: gap.toFixed(2) }));
  if (weakness != null && weakness > 0) chips.push(t('exp.chip.weakness', { value: weakness.toFixed(2) }));
  if (mastery != null) chips.push(t('exp.chip.mastery', { value: `${Math.round(Math.max(0, Math.min(1, mastery)) * 100)}%` }));
  if (confidence != null) chips.push(t('exp.chip.confidence', { value: `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%` }));
  if (minutes != null) chips.push(t('exp.chip.minutes', { value: Math.round(minutes) }));

  return chips.slice(0, 5);
};

export const getPlanWhyCopy = (item: PracticePlanItem, t: AppTranslate = translateEn): string => {
  const info = rationale(item);
  const signals: string[] = [];
  const gap = asNumber(info.section_gap);
  const weakness = asNumber(info.question_weakness);
  const mastery = asNumber(info.average_mastery);
  const confidence = asNumber(info.average_confidence);
  if (gap != null && gap > 0) signals.push(t('exp.chip.gap', { value: gap.toFixed(2) }));
  if (weakness != null && weakness > 0) signals.push(t('exp.chip.weakness', { value: weakness.toFixed(2) }));
  if (mastery != null) signals.push(t('exp.chip.mastery', { value: `${Math.round(Math.max(0, Math.min(1, mastery)) * 100)}%` }));
  if (confidence != null) signals.push(t('exp.chip.confidence', { value: `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%` }));
  if (signals.length === 0) return t('exp.why.default');
  return t('exp.why.signals', { signals: signals.join(' | ') });
};

const STEPS: Record<string, AppKey[]> = {
  strategy_listening: ['exp.step.predictAnswerType', 'exp.step.trackSignposts', 'exp.step.checkParaphrase'],
  strategy_writing: ['exp.step.analyseTask', 'exp.step.buildPlan', 'exp.step.setCriterion'],
  strategy: ['exp.step.locateEvidence', 'exp.step.nameTrap', 'exp.step.answerSlowly'],
  repair_drill_listening: ['exp.step.predict', 'exp.step.catchDistractor', 'exp.step.confirmAnswer'],
  repair_drill: ['exp.step.findEvidence', 'exp.step.eliminateDistractor', 'exp.step.compareWording'],
  timed_mini: ['exp.step.workAtPace', 'exp.step.submitOnce', 'exp.step.useResult'],
  writing_rewrite: ['exp.step.readTarget', 'exp.step.rewrite', 'exp.step.aiFeedback'],
  mastery_check: ['exp.step.noHints', 'exp.step.submitProof', 'exp.step.escalate'],
  default: ['exp.step.understandPrompt', 'exp.step.useSource', 'exp.step.checkReasoning'],
};

export const getExperienceSteps = (kind: PracticeExperienceKind, section: string, t: AppTranslate = translateEn): string[] => {
  const keys = STEPS[`${kind}_${section}`] ?? STEPS[kind] ?? STEPS.default!;
  return keys.map((key) => t(key));
};

export const getPlanExperienceSteps = (item: PracticePlanItem, t: AppTranslate = translateEn): string[] =>
  getExperienceSteps(getPlanExperienceKind(item), item.section_type, t);

export const getPlanSourceCopy = (item: PracticePlanItem, t: AppTranslate = translateEn): string => {
  const summary = buildSummary(item);
  const source = String(summary.source_section_name ?? '').trim();
  const kind = experienceCopy(getPlanExperienceKind(item), t).label;
  if (source && !['reading', 'listening', 'writing'].includes(source.toLowerCase())) {
    return t('exp.source.named', { source, kind });
  }
  return t('exp.source.default', { kind });
};
