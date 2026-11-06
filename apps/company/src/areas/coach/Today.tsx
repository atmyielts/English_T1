// Today (/w/:org/today): a short plan for the day, with a real finished state. It asks for
// nothing beyond the plan, and a missed day is not treated as a failure.
import React, { useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { ListenButton, useLoad, useLocalized, type Localized } from '../training/lib.tsx';
import { Gate, Meter, PrivacyNote, SaveButton, useTranslated, type Phrase } from './lib.tsx';

interface Item {
  index: number; type: 'review' | 'lesson' | 'roleplay' | 'writing' | 'shadow'; minutes: number; done: boolean; skipped: boolean;
  why: string | null; target?: number; count?: number; title?: Localized | null; lesson?: string; track?: string | null; scenario?: string; template?: string; situation?: string;
}
interface TodayData {
  day: string;
  plan: { minutes: number; length: number; items: Item[]; finished: boolean };
  streak: { current: number; best: number; freezes_left: number; practiced_today: boolean };
  week: { done: number; goal: number; met: boolean };
  phrase: Phrase | null;
}

function linkOf(org: string, item: Item): string {
  switch (item.type) {
    case 'review': return `/w/${org}/coach/review`;
    case 'shadow': return `/w/${org}/coach/shadow?situation=${item.situation}`;
    case 'lesson': return `/w/${org}/learn/${item.track}/${item.lesson}`;
    case 'roleplay': return `/w/${org}/roleplay?scenario=${item.scenario}`;
    case 'writing': return `/w/${org}/writing?template=${item.template}`;
  }
}

export function Today() {
  const t = useAppT(), pick = useLocalized(), problem = useErrorText(), translated = useTranslated();
  const { org } = useWorkspace();
  const { data, error, cause, reload } = useLoad<TodayData>(`orgs/${org.id}/coach/today`);
  const [failure, setFailure] = useState('');
  if (!data) return <Gate error={error} cause={cause}/>;
  const { plan, streak, week, phrase } = data;

  async function skip(item: Item) {
    setFailure('');
    try {
      await api(`orgs/${org.id}/coach/today/skip`, { method: 'POST', body: { index: item.index, skipped: !item.skipped } });
      await reload();
    } catch (failed) {
      setFailure(problem(failed));
    }
  }

  const finishedSteps = plan.items.filter((item) => item.done).length;
  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.today.title')}</h1>
      <p>{plan.finished ? t('coach.today.finishedLead') : t('coach.today.lead', { minutes: plan.minutes })}</p>
    </header>

    {plan.finished && <section className="coach-finished" aria-labelledby="coach-finished">
      <h2 id="coach-finished">{t('coach.today.finished')}</h2>
      <p>{t('coach.today.finishedBody')}</p>
      <p className="company-actions">
        <Link className="button-link quiet" to={`/w/${org.id}/coach/progress`}>{t('coach.today.seeProgress')}</Link>
        <Link className="button-link quiet" to={`/w/${org.id}/coach/phrasebook`}>{t('coach.today.browse')}</Link>
      </p>
    </section>}

    <section className="coach-card" aria-labelledby="coach-plan">
      <h2 id="coach-plan">{t('coach.today.plan')}</h2>
      <Meter value={finishedSteps} total={plan.items.length} label={t('coach.today.planMeter')}/>
      <ol className="coach-steps">
        {plan.items.map((item) => <li key={item.index} className={item.done ? 'is-done' : item.skipped ? 'is-skipped' : ''}>
          <span className="coach-step-mark" aria-hidden="true">{item.done ? '✓' : item.index + 1}</span>
          <div className="coach-step-body">
            <strong>{t(`coach.step.${item.type}` as AppKey)}</strong>
            {item.title && <span>{pick(item.title)}</span>}
            {item.why && <span className="coach-why">{item.why === 'job' ? t('coach.why.job') : t('coach.why.skill', { skill: t(`skill.${item.why}` as AppKey) })}</span>}
            {item.target !== undefined && <span>{t('coach.today.count', { count: item.count ?? 0, target: item.target })}</span>}
            <span>{t('coach.today.minutes', { minutes: item.minutes })}{item.done ? ` · ${t('coach.today.done')}` : item.skipped ? ` · ${t('coach.today.skipped')}` : ''}</span>
          </div>
          <div className="coach-step-actions">
            {!item.done && !item.skipped && <Link className="button-link" to={linkOf(org.id, item)}>{t('coach.today.start')}</Link>}
            {!item.done && <button type="button" className="quiet" onClick={() => void skip(item)}>{item.skipped ? t('coach.today.bringBack') : t('coach.today.notToday')}</button>}
          </div>
        </li>)}
      </ol>
      {failure && <p className="error" role="alert">{failure}</p>}
      <p className="coach-note">{t('coach.today.planNote', { length: plan.length })}</p>
    </section>

    <div className="company-grid">
      <div className="company-stat"><strong>{streak.current}</strong><span>{t('coach.today.streak')}</span></div>
      <div className="company-stat"><strong>{week.done} / {week.goal}</strong><span>{week.met ? t('coach.today.weekMet') : t('coach.today.week')}</span></div>
      <div className="company-stat"><strong>{streak.freezes_left}</strong><span>{t('coach.today.freezes')}</span></div>
    </div>

    {phrase && <section className="coach-card" aria-labelledby="coach-phrase">
      <h2 id="coach-phrase">{t('coach.today.phrase')}</h2>
      <p className="coach-phrase-en" lang="en">{phrase.en}</p>
      <p>{translated(phrase)}</p>
      <p className="company-actions"><ListenButton text={phrase.en}/><SaveButton phrase={phrase.id}/></p>
    </section>}
    <PrivacyNote/>
  </div>;
}
