import { useT } from '../../i18n';
import { useResource } from '../../lib/useResource';
import { Panel, Stat } from '../../ui/kit';
import { getReadingSpeed } from './api';

/** Reading speed over time: the last readings as small bars, and how it is changing. */
export const ReadingSpeedPanel = () => {
  const t = useT();
  const speed = useResource((signal) => getReadingSpeed(signal), []);
  const data = speed.data;
  // Quietly absent while loading or on error: this is extra information, not the page's job.
  if (!data) return null;
  const points = data.points.slice(-20);
  const max = Math.max(...points.map((point) => point.wpm), 1);
  return (
    <Panel title={t('depth.speed.title')}>
      {!points.length ? (
        <p className="hint" style={{ margin: 0 }}>{t('depth.speed.empty')}</p>
      ) : (
        <>
          <div className="en-stats">
            <Stat label={t('depth.speed.recent')} value={t('depth.speed.wpm', { wpm: data.recent ?? data.latest ?? 0 })} />
            {data.effective !== null ? <Stat label={t('depth.speed.effective')} value={t('depth.speed.wpm', { wpm: data.effective })} hint={t('depth.speed.effectiveHint')} /> : null}
            {data.change !== null ? (
              <Stat label={t('depth.speed.change')} value={`${data.change > 0 ? '+' : ''}${data.change}%`} />
            ) : null}
          </div>
          <div className="rd-speed-chart" role="img" aria-label={t('depth.speed.chartLabel', { count: points.length, latest: data.latest ?? 0 })}>
            {points.map((point, index) => (
              <span key={`${point.at}-${index}`} style={{ height: `${Math.max(8, Math.round((point.wpm / max) * 100))}%` }} title={`${point.title ?? ''} · ${point.wpm}`} />
            ))}
          </div>
          <p className="hint" style={{ margin: 0 }}>{t('depth.speed.how')}</p>
        </>
      )}
    </Panel>
  );
};
