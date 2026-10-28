import { useState } from 'react';
import { useT } from '../../i18n';
import { getShadowSets, type ShadowSet } from '../../lib/shadow/api';
import { CEFR_LEVELS, type CefrLevel } from '../../lib/skills';
import { useResource } from '../../lib/useResource';
import { ShadowPanel } from '../../components/shadow/ShadowPanel';
import { UpNextCard } from '../../components/UpNext';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, Segmented } from '../../ui/kit';
import '../../components/shadow/shadow.css';

/** Takes that count toward the streak each day; the server enforces the same number. */
const DAILY_LOGS = 5;

const SetPanel = ({
  set,
  openKey,
  onOpen,
  best,
  onScore,
}: {
  set: ShadowSet;
  openKey: string | null;
  onOpen: (key: string | null) => void;
  best: Record<string, number>;
  onScore: (key: string, score: number | null) => void;
}) => {
  const t = useT();
  return (
    <Panel
      title={set.source === 'listening' ? t('shadow.page.from.listening', { title: set.title }) : t('shadow.page.from.reading', { title: set.title })}
      aside={<LevelBadge level={set.level} muted />}
    >
      <div className="sh-set">
        {set.sentences.map((sentence, index) => {
          const key = `${set.id}#${index}`;
          const open = openKey === key;
          return (
            <div key={key} className="sh-sentence">
              <div className="en-row" style={{ justifyContent: 'space-between', gap: '.5rem' }}>
                <span className="eyebrow" style={{ margin: 0 }}>{t('shadow.page.sentence', { number: index + 1 })}</span>
                {best[key] !== undefined ? <span className="sh-best">{t('shadow.page.best', { score: best[key]! })}</span> : null}
              </div>
              {open ? (
                <div className="sh-inline">
                  <ShadowPanel text={sentence} source="shadowing" onScored={(score) => onScore(key, score)} />
                </div>
              ) : (
                <p className="sh-text" lang="en" style={{ margin: 0 }}>{sentence}</p>
              )}
              <div className="en-actions">
                <button type="button" className={open ? 'quiet' : undefined} aria-expanded={open} onClick={() => onOpen(open ? null : key)}>
                  {open ? t('shadow.close') : t('shadow.button')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

/** Speaking → Shadowing: sentence sets by level, cut from the listening and reading library. */
export const ShadowingPage = () => {
  const t = useT();
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const sets = useResource((signal) => getShadowSets(level, signal), [level]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [best, setBest] = useState<Record<string, number>>({});
  const [practised, setPractised] = useState(false);
  const shownLevel = level ?? sets.data?.level ?? null;

  const onScore = (key: string, score: number | null) => {
    setPractised(true);
    if (score === null) return;
    setBest((current) => (current[key] !== undefined && current[key]! >= score ? current : { ...current, [key]: score }));
  };

  return (
    <>
      <PageHeader
        back={{ to: '/speaking', label: t('skill.speaking') }}
        eyebrow={t('shadow.page.eyebrow')}
        title={t('shadow.page.title')}
        lead={t('shadow.page.lead')}
      />

      <Panel title={t('shadow.page.how')}>
        <ol className="sh-hints" style={{ paddingLeft: '1.25rem' }}>
          <li>{t('shadow.page.how1')}</li>
          <li>{t('shadow.page.how2')}</li>
          <li>{t('shadow.page.how3')}</li>
        </ol>
        <p className="hint" style={{ margin: 0 }}>{t('shadow.page.daily', { count: DAILY_LOGS })}</p>
        {shownLevel ? (
          <Segmented<CefrLevel>
            label={t('shadow.page.level')}
            value={shownLevel}
            onChange={(next) => { setOpenKey(null); setLevel(next); }}
            options={CEFR_LEVELS.map((value) => ({ value, label: value }))}
          />
        ) : null}
      </Panel>

      {sets.loading && !sets.data ? <Panel><Loading lines={5} /></Panel> : null}
      {sets.error ? <ErrorState error={sets.error} onRetry={sets.reload} /> : null}
      {sets.data && !sets.data.sets.length ? (
        <EmptyState title={t('shadow.page.empty')} body={t('shadow.page.emptyBody')} />
      ) : null}
      {sets.data?.sets.map((set) => (
        <SetPanel key={set.id} set={set} openKey={openKey} onOpen={setOpenKey} best={best} onScore={onScore} />
      ))}

      {practised ? <UpNextCard skill="speaking" /> : null}
    </>
  );
};
