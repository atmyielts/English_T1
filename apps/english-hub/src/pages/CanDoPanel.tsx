import { useT } from '../i18n';
import { canDoProgress } from '../lib/canDo';
import type { HistoryEntry } from '../lib/hub';
import { CEFR_LEVELS, type CefrLevel } from '../lib/skills';
import { LevelBadge, Panel, SkillDot } from '../ui/kit';

/** Real-life "I can…" goals for the learner's level, ticked by real results. */
export const CanDoPanel = ({ level, history }: { level: CefrLevel | null; history: HistoryEntry[] }) => {
  const t = useT();
  const all = canDoProgress(level, history.map((entry) => ({ skill: entry.skill, level: entry.level, score: entry.score, title: entry.title })), CEFR_LEVELS);
  const current = all.filter((entry) => entry.level === (level ?? 'A2'));
  const earlier = all.filter((entry) => entry.level !== (level ?? 'A2'));
  const done = all.filter((entry) => entry.proof).length;
  if (!all.length) return null;
  return (
    <Panel title={t('progress.cando.title')} aside={<span>{t('progress.cando.count', { done, total: all.length })}</span>}>
      <p className="hint">{t('progress.cando.lead')}</p>
      <ul className="en-list">
        {current.map((entry) => (
          <li key={entry.id} className={`en-item ${entry.proof ? 'is-done' : ''}`.trim()}>
            <span className={`en-check ${entry.proof ? 'is-done' : ''}`.trim()} aria-hidden="true">{entry.proof ? '✓' : ''}</span>
            <span className="en-item-main">
              <strong>{t(`cando.${entry.id}`)}</strong>
              <span>
                {entry.proof
                  ? t('progress.cando.proof', { title: entry.proof })
                  : t('progress.cando.next', { skill: t(`skill.${entry.skill}`), level: entry.level })}
              </span>
            </span>
            <span className="en-item-meta"><SkillDot skill={entry.skill} /><LevelBadge level={entry.level} muted /></span>
          </li>
        ))}
      </ul>
      {earlier.length ? (
        <details>
          <summary className="hint" style={{ cursor: 'pointer' }}>
            {t('progress.cando.count', { done: earlier.filter((entry) => entry.proof).length, total: earlier.length })} · {CEFR_LEVELS.filter((entry) => earlier.some((item) => item.level === entry)).join(', ')}
          </summary>
          <ul className="en-list" style={{ marginTop: '.5rem' }}>
            {earlier.map((entry) => (
              <li key={entry.id} className="en-row" style={{ fontSize: '.88rem' }}>
                <span aria-hidden="true">{entry.proof ? '✓' : '·'}</span>
                <span style={{ flex: 1 }}>{t(`cando.${entry.id}`)}</span>
                <LevelBadge level={entry.level} muted />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
};
