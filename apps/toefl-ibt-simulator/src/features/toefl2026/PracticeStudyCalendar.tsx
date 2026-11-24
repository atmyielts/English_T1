import { useSearchParams } from 'react-router-dom';
import { nextPracticeSession, practiceSessionState, selectPracticeWeek } from '../../../../../packages/exam-playbook-web/src/practiceCalendar';
import { PracticeSessionDisclosure, usePracticeSessionLabels } from '../../../../../packages/exam-playbook-web/src/PracticeSessionDisclosure';
import { useAppT, type AppKey } from '../../i18n';
import { TOEFL_REVIEW_MINUTES, toeflDayMinutes, type ToeflPracticeSection } from './practiceCalendar';

export function PracticeStudyCalendar({ weeks, checkpoints, completed, starting, onStart }: {
  weeks: ToeflPracticeSection[][][];
  checkpoints: ReadonlyMap<number, ToeflPracticeSection>;
  completed: ReadonlySet<string> | null;
  starting: string | null;
  onStart: (section: ToeflPracticeSection) => void;
}) {
  const t = useAppT();
  const labels = usePracticeSessionLabels();
  const [params, setParams] = useSearchParams();
  const done = (section: ToeflPracticeSection) => completed?.has(section.id) === true;
  const week = selectPracticeWeek(weeks, params.get('week'), done);
  const next = nextPracticeSession(weeks, done);
  const days = weeks[week - 1];
  if (!days) return <p className="text-[#475569]" role="status">{t('practice.calendarUnavailable')}</p>;
  const checkpoint = checkpoints.get(week);
  const taskOf = (section: ToeflPracticeSection) => String(section.metadata?.practice_task ?? '');
  const taskName = (section: ToeflPracticeSection) => t(`task.${taskOf(section)}` as AppKey);
  const setRow = (section: ToeflPracticeSection) => <li className="py-2 flex flex-wrap items-center justify-between gap-3" key={section.id}>
    <div className="min-w-0">
      <p className="font-medium text-[#0f172a] break-words">{section.name}</p>
      <p className="text-xs text-[#475569]">{taskName(section)}{taskOf(section) === 'take_interview' ? ` · ${t('practice.textCue')}` : ''}{done(section) ? ` · ${t('practice.completedSet')}` : ''}</p>
    </div>
    <button type="button" disabled={starting != null} onClick={() => onStart(section)}
      aria-label={`${t('practice.start')} — ${taskName(section)} — ${section.name}`}
      className="min-h-[44px] rounded-full border border-[#151d2b]/15 bg-white px-4 text-sm font-semibold disabled:opacity-60">
      {starting === section.id ? t('practice.starting') : t('practice.start')}
    </button>
  </li>;

  return <section className="max-w-4xl space-y-4" aria-labelledby="toefl-calendar-week">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="toefl-calendar-week" className="text-xl font-semibold text-[#0f172a]">{t('practice.calendarWeek', { number: week })}</h2>
        {completed ? <p className="text-sm text-[#475569]">{t('practice.calendarCompleted', { done: days.filter(day => day.every(done)).length, total: days.length })}</p> : null}
        {next ? <p className="text-sm text-[#475569]">{labels.hint}</p> : null}
      </div>
      <label className="grid gap-1 text-sm font-semibold text-[#334155]">{t('practice.calendarWeekLabel')}
        <select className="min-h-[44px] rounded-xl border border-[#151d2b]/15 bg-white px-3" value={week}
          onChange={event => setParams({ plan: '8-weeks', week: event.currentTarget.value })}>
          {weeks.map((_, index) => <option key={index} value={index + 1}>{t('practice.calendarWeek', { number: index + 1 })}</option>)}
        </select>
      </label>
    </div>
    {next && next.week !== week ? <button type="button" className="min-h-[44px] rounded-full border border-[#151d2b]/15 bg-white px-4 text-sm font-semibold"
      onClick={() => setParams({ plan: '8-weeks' })}>{labels.resume}</button> : null}
    <ol className="space-y-4">
      {days.map((day, index) => {
        const state = practiceSessionState(day, done, next?.week === week && next.day === index);
        const title = t('practice.calendarDay', { number: index + 1 });
        const status = state === 'next' || state === 'started' ? labels[state] : state === 'complete' ? t('practice.completedSet') : null;
        const preview = [...new Set(day.map(taskName))].join(' · ');
        return <li className={`rounded-2xl border bg-white/80 p-4 sm:p-5 ${state === 'next' ? 'border-[#c2410c]/50' : 'border-[#151d2b]/12'}`} key={`${week}-${index}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h3 className="font-semibold text-[#0f172a]">{title}</h3>
            <p className="text-sm text-[#475569]">{t('practice.minutes', { count: toeflDayMinutes(day) })}{status ? ` · ${status}` : ''}</p>
          </div>
          <PracticeSessionDisclosure state={state} title={title}
            buttonClassName="mt-2 min-h-[44px] rounded-full border border-[#151d2b]/15 bg-white px-4 text-sm font-semibold"
            preview={<p className="mt-2 text-sm text-[#475569]">{preview}</p>}>
            <ul className="divide-y divide-[#151d2b]/10">
              {day.map(setRow)}
            </ul>
            <p className="mt-2 text-sm text-[#475569]">{t('practice.calendarReview', { minutes: TOEFL_REVIEW_MINUTES })}</p>
          </PracticeSessionDisclosure>
        </li>;
      })}
    </ol>
    {checkpoint ? <section className="rounded-2xl border border-[#151d2b]/12 bg-white/80 p-4 sm:p-5" aria-labelledby="toefl-calendar-checkpoint">
      <h3 id="toefl-calendar-checkpoint" className="font-semibold text-[#0f172a]">{labels.checkpointFor(week)}</h3>
      <ul>{setRow(checkpoint)}</ul>
    </section> : null}
  </section>;
}
