import { Link, useSearchParams } from 'react-router-dom';
import { nextPracticeSession, practiceSessionState, selectPracticeWeek } from '../../../../packages/exam-playbook-web/src/practiceCalendar';
import { PracticeSessionDisclosure, usePracticeSessionLabels } from '../../../../packages/exam-playbook-web/src/PracticeSessionDisclosure';
import { useAppT } from '../i18n';
import type { LibrarySet } from '../lib/api';
import { buildLibraryCalendar, libraryDayMinutes } from '../lib/libraryCalendar';

export function LibraryStudyCalendar({ sets }: { sets: readonly LibrarySet[] }) {
  const t = useAppT();
  const labels = usePracticeSessionLabels();
  const [params, setParams] = useSearchParams();
  const track = params.get('track') === 'general' ? 'general' : 'academic';
  const weeks = buildLibraryCalendar(sets, track);
  const reviewed = (set: LibrarySet) => Boolean(set.progress);
  const week = selectPracticeWeek(weeks, params.get('week'), reviewed);
  const next = nextPracticeSession(weeks, reviewed);
  const days = weeks[week - 1];

  return <>
    <div className="glass dashboard-card library-filters">
      <label>{t('library.track')}
        <select value={track} onChange={event => setParams({ plan: '8-weeks', track: event.currentTarget.value })}>
          <option value="academic">{t('library.academic')}</option>
          <option value="general">{t('library.general')}</option>
        </select>
      </label>
      {days ? <label>{t('library.calendarWeekLabel')}
        <select value={week} onChange={event => setParams({ plan: '8-weeks', track, week: event.currentTarget.value })}>
          {weeks.map((_, index) => <option key={index} value={index + 1}>{t('library.calendarWeek', { number: index + 1 })}</option>)}
        </select>
      </label> : null}
    </div>
    {days ? <section className="glass dashboard-card" aria-labelledby="library-calendar-week">
      <h2 id="library-calendar-week">{t('library.calendarWeek', { number: week })}</h2>
      <p>{t('library.calendarReview', { done: days.filter(day => day.every(reviewed)).length, total: days.length })}</p>
      {next ? <p>{labels.hint}</p> : null}
      {next && next.week !== week ? <button type="button" className="btn ghost"
        onClick={() => setParams({ plan: '8-weeks', track })}>{labels.resume}</button> : null}
      <ol className="library-study-days">
        {days.map((day, index) => {
          const session = String(index + 1);
          const state = practiceSessionState(day, reviewed, next?.week === week && next.day === index);
          const title = t('library.calendarDay', { number: index + 1 });
          const status = state === 'next' || state === 'started' ? labels[state] : state === 'complete' ? t('library.reviewed') : null;
          const skills = [...new Set(day.map(set => t(`section.${set.skill}`)))].join(' · ');
          const query = `?${new URLSearchParams({ plan: '8-weeks', track, ...(state === 'next' ? {} : { week: String(week), session }) })}`;
          return <li key={`${track}-${week}-${session}`} data-session-state={state}>
            <h3>{title}</h3>
            <p>{t('library.minutes', { count: libraryDayMinutes(day) })}{status ? ` · ${status}` : ''}</p>
            <PracticeSessionDisclosure state={state} title={title} buttonClassName="btn ghost"
              initiallyOpen={params.get('session') === session} preview={<p>{skills}</p>}>
              <ul className="library-sets">
                {day.map(set => <li key={set.slug}>
                  <Link to={`/library/${set.slug}${query}`}>{set.title}</Link>
                  <span>{t(`section.${set.skill}`)} · {t('library.minutes', { count: set.minutes })}{reviewed(set) ? ` · ${t('library.reviewed')}` : ''}</span>
                </li>)}
              </ul>
              {day.every(set => set.skill !== 'writing') ? <p>{t('library.calendarCheck')}</p> : null}
            </PracticeSessionDisclosure>
          </li>;
        })}
      </ol>
    </section> : <p role="status">{t('library.calendarUnavailable')}</p>}
    <section className="glass dashboard-card"><h2>{t('section.listening')}</h2><p>{t('library.listeningSoon')}</p></section>
  </>;
}
