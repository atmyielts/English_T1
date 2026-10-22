import React, { useState, type FormEvent } from 'react';
import type { Goal, SectionId } from './api.ts';
import { useAppT } from './i18n/index.ts';
import { SECTIONS, sectionMax } from './topics.ts';

export function GoalForm({ goal, busy, onSave }: { goal: Goal | null; busy: boolean; onSave: (goal: Goal) => void }) {
  const t = useAppT();
  const [section, setSection] = useState<SectionId>(goal?.section_id ?? 'specialised_1');
  const [locale, setLocale] = useState<'uz' | 'ru'>(goal?.question_locale ?? 'uz');
  const [minutes, setMinutes] = useState(String(goal?.daily_minutes ?? 30));
  const [examDate, setExamDate] = useState(goal?.exam_date ?? '');
  const [target, setTarget] = useState(goal?.target_points === null || goal?.target_points === undefined ? '' : String(goal.target_points));
  const max = sectionMax(section);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ section_id: section, question_locale: locale, daily_minutes: Number(minutes), exam_date: examDate || null, target_points: target === '' ? null : Number(target) });
  }
  return <section className="admission-card" aria-labelledby="goal-title">
    <h1 id="goal-title">{t('goal.title')}</h1>
    <p className="hint">{t('goal.lead')}</p>
    <form className="goal-form" onSubmit={submit}>
      <fieldset>
        <legend>{t('goal.section')}</legend>
        {SECTIONS.map((id) => <label className="check" key={id}><input type="radio" name="section" checked={section === id} onChange={() => setSection(id)}/>{t(`goal.section.${id}`)}</label>)}
      </fieldset>
      <fieldset>
        <legend>{t('goal.questionLocale')}</legend>
        {(['uz', 'ru'] as const).map((id) => <label className="check" key={id}><input type="radio" name="question-locale" checked={locale === id} onChange={() => setLocale(id)}/>{t(`goal.locale.${id}`)}</label>)}
      </fieldset>
      <div className="goal-fields">
        <label>{t('goal.minutes')}<select value={minutes} onChange={(event) => setMinutes(event.target.value)}>{[15, 20, 30, 45, 60, 90].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>{t('goal.examDate')}<input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)}/></label>
        <label>{t('goal.target')}<input type="number" inputMode="decimal" min={0} max={max} step="0.1" value={target} aria-describedby="goal-target-hint" onChange={(event) => setTarget(event.target.value)}/><span className="hint" id="goal-target-hint">{t('goal.targetHint', { max })}</span></label>
      </div>
      <button disabled={busy}>{t('goal.save')}</button>
    </form>
  </section>;
}
