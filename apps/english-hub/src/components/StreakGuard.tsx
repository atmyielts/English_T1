import { Link } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import type { StreakResponse } from '../lib/engine';
import { ProgressBar } from '../ui/kit';
import '../engine.css';

/** A freeze used in the last week is worth mentioning. */
const RECENT_FREEZE_MS = 7 * 86_400_000;

/** Freezes held, when the next one comes, and a note when one saved the streak. */
export const StreakFreezes = ({ streak }: { streak: StreakResponse }) => {
  const t = useT();
  const { date } = useI18n();
  const lastFrozen = streak.frozen_days.at(-1);
  return (
    <div className="en-stack" style={{ gap: '.35rem' }}>
      <div className="en-freezes" role="img" aria-label={t('engine.streak.freezesLabel', { count: streak.freezes, max: streak.max_freezes })}>
        {Array.from({ length: streak.max_freezes }, (_, index) => (
          <span key={index} className={`en-freeze ${index < streak.freezes ? 'is-held' : ''}`.trim()} aria-hidden="true">❄</span>
        ))}
        <small className="hint" style={{ margin: 0 }}>{t('engine.streak.freezes', { count: streak.freezes })}</small>
      </div>
      {lastFrozen && streak.current > 0 && Date.parse(streak.today) - Date.parse(lastFrozen) <= RECENT_FREEZE_MS ? (
        <p className="en-notice" style={{ margin: 0 }}>{t('engine.streak.frozen', { date: date(`${lastFrozen}T12:00:00`, { dateStyle: 'medium' }) })}</p>
      ) : null}
      {streak.at_risk ? <p className="hint" style={{ margin: 0 }}>{t('engine.streak.atRisk')}</p> : null}
      <p className="hint" style={{ margin: 0 }}>
        {streak.next_freeze_in === null ? t('engine.streak.maxFreezes') : t('engine.streak.nextFreeze', { count: streak.next_freeze_in })}
        {' '}{t('engine.streak.how')}
      </p>
    </div>
  );
};

/** "Win it back": after a broken streak, three activities in three days bring it back. */
export const ComebackCard = ({ streak }: { streak: StreakResponse }) => {
  const t = useT();
  const { date } = useI18n();
  const comeback = streak.comeback;
  if (!comeback) return null;
  if (comeback.status === 'won') {
    return (
      <section className="en-panel en-tone-lime en-comeback">
        <h2 style={{ margin: 0 }}>{t('engine.comeback.wonTitle')}</h2>
        <p style={{ margin: 0 }}>{t('engine.comeback.wonBody', { count: streak.current })}</p>
      </section>
    );
  }
  if (comeback.status !== 'open') return null;
  return (
    <section className="en-panel en-celebrate en-comeback">
      <div className="en-panel-head">
        <div>
          <h2>{t('engine.comeback.title')}</h2>
          <p style={{ margin: 0 }}>
            {t('engine.comeback.body', {
              count: comeback.old_streak,
              needed: comeback.needed,
              date: date(`${comeback.ends}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' }),
            })}
          </p>
        </div>
        <Link className="en-button" to="/practice">{t('engine.comeback.cta')}</Link>
      </div>
      <ProgressBar value={(comeback.done / Math.max(1, comeback.needed)) * 100} label={t('engine.comeback.progressLabel')} />
      <small className="hint">{t('engine.comeback.progress', { done: comeback.done, needed: comeback.needed })}</small>
    </section>
  );
};
