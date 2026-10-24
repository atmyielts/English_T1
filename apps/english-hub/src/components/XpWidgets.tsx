import { Link } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import type { SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { getXp } from '../lib/xp';
import { Loading, Panel, Stat } from '../ui/kit';
import '../xp.css';

/** Today's and this week's XP, with a bar per day. Loads once Today's plan is saved. */
export const TodayXpPanel = ({ enabled, reloadKey }: { enabled: boolean; reloadKey: string }) => {
  const t = useT();
  const { date } = useI18n();
  const xp = useResource((signal) => getXp(undefined, signal), [reloadKey], enabled);
  const data = xp.data;
  const peak = data ? Math.max(1, ...data.week.days.map((day) => day.xp)) : 1;
  const weekday = (day: string) => date(`${day}T12:00:00`, { weekday: 'short' });

  return (
    <Panel title={t('xp.today.title')} aside={<Link to="/league">{t('xp.today.league')}</Link>}>
      {!data ? (
        xp.error ? <p className="hint">{t('xp.today.error')}</p> : <Loading lines={2} />
      ) : (
        <>
          <div className="en-stats">
            <Stat label={t('xp.today.today')} value={t('xp.today.value', { xp: data.today.xp })} />
            <Stat label={t('xp.today.week')} value={t('xp.today.value', { xp: data.week.xp })} />
          </div>
          <div
            className="en-xp-bars"
            role="img"
            aria-label={`${t('xp.today.chartLabel')}: ${data.week.days.map((day) => t('xp.today.dayLabel', { day: weekday(day.date), xp: day.xp })).join(', ')}`}
          >
            {data.week.days.map((day) => (
              <span key={day.date} className={`${day.xp > 0 ? 'has-xp' : ''} ${day.date === data.today.date ? 'is-today' : ''}`.trim()}>
                <i style={{ height: `${Math.round((day.xp / peak) * 100)}%` }} />
                <small>{date(`${day.date}T12:00:00`, { weekday: 'narrow' })}</small>
              </span>
            ))}
          </div>
          {data.today.goal_bonus
            ? <p className="en-notice">{t('xp.today.bonus')}</p>
            : data.today.xp === 0 ? <p className="hint">{t('xp.today.empty')}</p> : null}
          <p className="hint">{t('xp.today.how')}</p>
        </>
      )}
    </Panel>
  );
};

/** "+18 XP" on an activity result: what the server credited for the attempt just saved. */
export const XpEarned = ({ skill, slug }: { skill: SkillKey; slug?: string | null }) => {
  const t = useT();
  const xp = useResource((signal) => getXp(slug ? { skill, slug } : undefined, signal), [skill, slug], Boolean(slug));
  const gain = xp.data?.last_gain;
  if (!xp.data || !gain) return null;
  return (
    <p className="en-xp-earned">
      {gain.xp > 0 ? (
        <>
          <span className="en-xp-pill">{t('xp.result.gain', { xp: gain.xp })}</span>
          <span>{t('xp.result.today', { xp: xp.data.today.xp })}</span>
        </>
      ) : <span>{t('xp.result.repeat')}</span>}
    </p>
  );
};
