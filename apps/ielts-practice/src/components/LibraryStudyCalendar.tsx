import { Link, useSearchParams } from 'react-router-dom';
import { selectPracticeWeek } from '../../../../packages/exam-playbook-web/src/practiceCalendar';
import { useAppT } from '../i18n';
import type { LibrarySet } from '../lib/api';
import { buildLibraryCalendar, libraryDayMinutes } from '../lib/libraryCalendar';

export function LibraryStudyCalendar({ sets }: { sets: readonly LibrarySet[] }) {
  const t = useAppT();
  const [params, setParams] = useSearchParams();
  const track = params.get('track') === 'general' ? 'general' : 'academic';
  const weeks = buildLibraryCalendar(sets, track);
  const reviewed = (set: LibrarySet) => Boolean(set.progress);
  const week = selectPracticeWeek(weeks, params.get('week'), reviewed);
  const days = weeks[week - 1];
  const query = `?${new URLSearchParams({ plan: '8-weeks', track, week: String(week) })}`;

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
      <ol className="library-study-days">
        {days.map((day, index) => <li key={day[0]?.slug}>
          <h3>{t('library.calendarDay', { number: index + 1 })}</h3>
          <p>{t('library.minutes', { count: libraryDayMinutes(day) })}</p>
          <ul className="library-sets">
            {day.map(set => <li key={set.slug}>
              <Link to={`/library/${set.slug}${query}`}>{set.title}</Link>
              <span>{t(`section.${set.skill}`)} · {t('library.minutes', { count: set.minutes })}{reviewed(set) ? ` · ${t('library.reviewed')}` : ''}</span>
            </li>)}
          </ul>
          {day.every(set => set.skill !== 'writing') ? <p>{t('library.calendarCheck')}</p> : null}
        </li>)}
      </ol>
    </section> : <p role="status">{t('library.calendarUnavailable')}</p>}
    <section className="glass dashboard-card"><h2>{t('section.listening')}</h2><p>{t('library.listeningSoon')}</p></section>
  </>;
}
