import type { AppKey, AppTranslate } from '../i18n';
import type { PlanItem, SatQuestion } from './api';
import { LEGACY_TO_OFFICIAL, type LegacyDomain, OFFICIAL_DOMAINS, type OfficialDomain, officialTaxonomy } from './content';

export const domainLabel = (t: AppTranslate, domain: string | null | undefined) =>
  domain && domain in OFFICIAL_DOMAINS ? t(`domain.${domain}` as AppKey) : '';
export const skillLabel = (t: AppTranslate, skill: string | null | undefined) =>
  skill ? t(`skill.${skill}` as AppKey) : '';
export const sectionLabel = (t: AppTranslate, section: string | null | undefined) =>
  section === 'math' ? t('section.math') : t('section.reading_writing');
export const percent = (value: number | null | undefined) => value == null ? '—' : `${Math.round(value * 100)}%`;

export const questionTaxonomy = (q: Pick<SatQuestion, 'metadata' | 'domain'>) => officialTaxonomy(q.metadata, q.domain);
export const legacyOfficial = (domain: string | null | undefined): OfficialDomain =>
  LEGACY_TO_OFFICIAL[(domain && domain in LEGACY_TO_OFFICIAL ? domain : 'grammar') as LegacyDomain];

export function planTaskLabel(t: AppTranslate, item: PlanItem): string {
  const p = item.payload as Record<string, unknown>;
  if (item.task_type === 'notebook_review') return t('plan.task.review');
  if (item.task_type === 'tutor_session') return t('plan.task.tutor');
  if (item.task_type === 'module' || item.task_type === 'half_mock') return t('plan.task.module', { section: sectionLabel(t, String(p.module_section ?? p.section_type ?? '')) });
  const official = typeof p.official_domain === 'string' ? p.official_domain : legacyOfficial(String(p.domain ?? ''));
  const skill = typeof p.skill === 'string' ? skillLabel(t, p.skill) : '';
  return t('plan.task.drill', { domain: skill ? `${domainLabel(t, official)}: ${skill}` : domainLabel(t, official) });
}

export function planTaskMeta(t: AppTranslate, item: PlanItem): string {
  const p = item.payload as Record<string, unknown>;
  const count = Number(p.question_count ?? 0);
  return count > 0 && item.task_type === 'drill' ? t('plan.meta.questions', { minutes: item.estimated_minutes, count }) : t('plan.meta.minutes', { minutes: item.estimated_minutes });
}

export function planTaskReason(t: AppTranslate, item: PlanItem): string | null {
  const p = item.payload as Record<string, unknown>;
  const reason = typeof p.reason === 'string' ? p.reason : null;
  if (!reason || !['no_data', 'weak', 'maintain', 'reviews_due', 'retention', 'pacing', 'test_soon'].includes(reason)) return null;
  return t(`plan.reason.${reason}` as AppKey, { accuracy: percent(typeof p.accuracy === 'number' ? p.accuracy : null) });
}
