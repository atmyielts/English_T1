import { Link } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import type { LevelCheck, LevelEntry } from '../lib/hub';
import { CEFR_LEVELS, type CefrLevel } from '../lib/skills';
import { LevelBadge, Panel } from '../ui/kit';

const rank = (level: CefrLevel | null | undefined) => (level ? CEFR_LEVELS.indexOf(level) : -1);

/** Every placement, monthly check and move-up, newest first, with what changed. */
export const LevelJourneyPanel = ({ history, check }: { history: LevelEntry[]; check: LevelCheck | null }) => {
  const t = useT();
  const { date } = useI18n();
  const entries = history.map((entry, index) => {
    const previous = history[index - 1];
    const ups = previous
      ? (Object.entries(entry.per_skill) as Array<[string, CefrLevel]>)
        .filter(([skill, level]) => rank(level) > rank(previous.per_skill[skill as keyof typeof previous.per_skill] ?? previous.overall))
        .map(([skill, level]) => ({ skill, level }))
      : [];
    return { entry, ups, overallUp: previous ? rank(entry.overall) > rank(previous.overall) : false };
  }).reverse();

  return (
    <Panel
      title={t('levels.title')}
      tone={check?.due ? 'lime' : undefined}
      aside={check?.next_at && !check.due ? <span>{t('levels.next', { date: date(check.next_at, { dateStyle: 'medium' }) })}</span> : null}
    >
      {check?.due ? (
        <div className="en-panel-head">
          <p style={{ margin: 0 }}>{t('levels.dueBody')}</p>
          <Link className="en-button" to="/check">{t('levels.dueCta')}</Link>
        </div>
      ) : null}
      {entries.length ? (
        <ol className="en-timeline">
          {entries.map(({ entry, ups, overallUp }) => (
            <li key={entry.at}>
              <span className="en-timeline-date">{date(entry.at, { dateStyle: 'medium' })}</span>
              <span className="en-timeline-main">
                <strong>{t(`levels.source.${entry.source}`)}</strong>
                {entry.overall ? <LevelBadge level={entry.overall} muted={!overallUp} /> : null}
                {overallUp ? <span className="en-up">↑</span> : null}
              </span>
              {ups.length ? (
                <span className="hint">
                  {ups.map(({ skill, level }) => `${t(`skill.${skill}`)} → ${level}`).join(' · ')}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">{t('levels.empty')}</p>
      )}
      <p className="hint">{t('levels.retakeHint')} <Link to="/settings">{t('progress.retake.cta')}</Link></p>
    </Panel>
  );
};
