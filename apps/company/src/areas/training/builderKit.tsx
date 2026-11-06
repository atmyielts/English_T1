// Pieces the builder pages share: the shapes the builder API returns, a field that
// takes text in three languages, and the list of what stops publishing.
import React from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import type { Localized } from './lib.tsx';

export type { Localized };
export type Status = 'draft' | 'published' | 'archived';

export interface Problem { code: string; n?: number; m?: number }

export type ExerciseDraft =
  | { id: string; kind: 'choice'; prompt?: string; items: { q: string; options: string[]; answer: number }[] }
  | { id: string; kind: 'gap'; prompt?: string; bank?: string[]; items: { text: string; answers: string[] }[] }
  | { id: string; kind: 'order'; prompt?: string; lines: string[] }
  | { id: string; kind: 'match'; prompt?: string; pairs: [string, string][] };

export type MissionDraft =
  | { kind: 'roleplay'; scenario: string; brief: Localized }
  | { kind: 'writing'; template: string | null; brief: Localized }
  | { kind: 'task'; brief: Localized };

export interface LessonDraft {
  title: Localized; goal: Localized; level: string;
  phrases: { en: string; ru: string; uz: string }[];
  words: { en: string; ru: string; uz: string; note?: string }[];
  dialogue: { setting: Localized; lines: { speaker: string; text: string }[] };
  exercises: ExerciseDraft[];
  mission: MissionDraft | null;
}

export interface LessonListItem {
  id: string; code: string; title: Localized; level: string; status: Status; version: number; has_changes: boolean; source: 'manual' | 'ai'; needs_approval: boolean; updated_at: string; published_at: string | null;
}
export interface LessonDetail {
  lesson: LessonListItem & { revision: number; draft: LessonDraft };
  problems: Problem[];
  versions: { version: number; created_at: string }[];
  used_in: { id: string; title: Localized; status: Status }[];
}
export interface CourseListItem {
  id: string; code: string; title: Localized; summary: Localized; job_role: string | null; lesson_ids: string[]; status: Status; revision: number; version: number; has_changes: boolean; updated_at: string; published_at: string | null;
}
export interface CourseDetail { course: CourseListItem; lessons: LessonListItem[]; problems: Problem[] }
export interface ScenarioListItem { id: string; title: Localized; difficulty: 'easy' | 'medium' | 'hard'; status: Status; updated_at: string }
export interface BuilderOverview {
  lessons: LessonListItem[]; courses: CourseListItem[]; scenarios: ScenarioListItem[]; glossary_terms: number; max_source: number;
  scenario_options: { code: string; title: Localized; lessons: { code: string; title: Localized; level: string }[]; scenarios: { code: string; title: Localized }[]; templates: { code: string; title: Localized }[] }[];
  job_roles: { code: string; title: Localized }[];
}

export const emptyLocalized = (): Localized => ({ en: '', ru: '', uz: '' });

const LANGUAGES = ['en', 'ru', 'uz'] as const;

/** One piece of text in English, Russian and Uzbek. English is what publishing asks for. */
export function LocalizedField({ label, value, onChange, max, rows, hint }: { label: string; value: Localized; onChange: (value: Localized) => void; max: number; rows?: number; hint?: string }) {
  const t = useAppT();
  return <fieldset className="training-b-localized">
    <legend>{label}</legend>
    {hint && <p className="hint">{hint}</p>}
    <div className="training-b-langs">
      {LANGUAGES.map((lang) => <label key={lang}>
        <span>{t(`training.builder.lang.${lang}` as AppKey)}</span>
        {rows ? <textarea rows={rows} lang={lang} maxLength={max} value={value[lang] ?? ''} onChange={(event) => onChange({ ...value, [lang]: event.target.value })}/>
          : <input lang={lang} maxLength={max} value={value[lang] ?? ''} onChange={(event) => onChange({ ...value, [lang]: event.target.value })}/>}
      </label>)}
    </div>
  </fieldset>;
}

export function StatusBadge({ status, hasChanges }: { status: Status; hasChanges?: boolean }) {
  const t = useAppT();
  return <>
    <span className={`company-badge${status === 'published' ? ' good' : status === 'archived' ? '' : ' warn'}`}>{t(`training.builder.status.${status}` as AppKey)}</span>
    {hasChanges && <span className="company-badge warn">{t('training.builder.unpublishedChanges')}</span>}
  </>;
}

/** What stops publishing, each in the reader's language. */
export function ProblemList({ problems }: { problems: Problem[] }) {
  const t = useAppT();
  if (!problems.length) return null;
  return <div className="training-b-problems" role="status">
    <p><strong>{t('training.builder.notReady')}</strong></p>
    <ul>{problems.map((problem, index) => <li key={index}>{t(`training.problem.${problem.code}` as AppKey, { n: problem.n ?? 0, m: problem.m ?? 0 })}</li>)}</ul>
  </div>;
}

/** The problems a refused publish carries, if that is why it was refused. */
export const problemsOf = (cause: unknown): Problem[] | null => {
  const problems = (cause as { details?: { problems?: unknown } } | null)?.details?.problems;
  return Array.isArray(problems) ? problems as Problem[] : null;
};
