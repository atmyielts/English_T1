import { useSearchParams } from 'react-router-dom';
import { selectPracticeWeek } from '../../../../../packages/exam-playbook-web/src/practiceCalendar';
import { useAppT, type AppKey } from '../../i18n';
import { TOEFL_REVIEW_MINUTES, toeflDayMinutes, type ToeflPracticeSection } from './practiceCalendar';

export function PracticeStudyCalendar({ weeks, completed, starting, onStart }: {
  weeks: ToeflPracticeSection[][][];
  completed: ReadonlySet<string> | null;
  starting: string | null;
  onStart: (section: ToeflPracticeSection) => void;
}) {
  const t = useAppT();
  const [params, setParams] = useSearchParams();
  const done = (section: ToeflPracticeSection) => completed?.has(section.id) === true;
  const week = selectPracticeWeek(weeks, params.get('week'), done);
  const days = weeks[week - 1];
  if (!days) return <p className="text-[#475569]" role="status">{t('practice.calendarUnavailable')}</p>;

  return <section className="max-w-4xl space-y-4" aria-labelledby="toefl-calendar-week">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="toefl-calendar-week" className="text-xl font-semibold text-[#0f172a]">{t('practice.calendarWeek', { number: week })}</h2>
        {completed ? <p className="text-sm text-[#475569]">{t('practice.calendarCompleted', { done: days.filter(day => day.every(done)).length, total: days.length })}</p> : null}
      </div>
      <label className="grid gap-1 text-sm font-semibold text-[#334155]">{t('practice.calendarWeekLabel')}
        <select className="min-h-[44px] rounded-xl border border-[#151d2b]/15 bg-white px-3" value={week}
          onChange={event => setParams({ plan: '8-weeks', week: event.currentTarget.value })}>
          {weeks.map((_, index) => <option key={index} value={index + 1}>{t('practice.calendarWeek', { number: index + 1 })}</option>)}
        </select>
      </label>
    </div>
    <ol className="space-y-4">
      {days.map((day, index) => <li className="rounded-2xl border border-[#151d2b]/12 bg-white/80 p-4 sm:p-5" key={day[0]?.id}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 className="font-semibold text-[#0f172a]">{t('practice.calendarDay', { number: index + 1 })}</h3>
          <p className="text-sm text-[#475569]">{t('practice.minutes', { count: toeflDayMinutes(day) })}</p>
        </div>
        <ul className="divide-y divide-[#151d2b]/10">
          {day.map(section => {
            const task = String(section.metadata?.practice_task ?? '');
            const taskName = t(`task.${task}` as AppKey);
            return <li className="py-2 flex flex-wrap items-center justify-between gap-3" key={section.id}>
              <div className="min-w-0">
                <p className="font-medium text-[#0f172a] break-words">{section.name}</p>
                <p className="text-xs text-[#475569]">{taskName}{task === 'take_interview' ? ` · ${t('practice.textCue')}` : ''}{done(section) ? ` · ${t('practice.completedSet')}` : ''}</p>
              </div>
              <button type="button" disabled={starting != null} onClick={() => onStart(section)}
                aria-label={`${t('practice.start')} — ${taskName} — ${section.name}`}
                className="min-h-[44px] rounded-full border border-[#151d2b]/15 bg-white px-4 text-sm font-semibold disabled:opacity-60">
                {starting === section.id ? t('practice.starting') : t('practice.start')}
              </button>
            </li>;
          })}
        </ul>
        <p className="mt-2 text-sm text-[#475569]">{t('practice.calendarReview', { minutes: TOEFL_REVIEW_MINUTES })}</p>
      </li>)}
    </ol>
  </section>;
}
