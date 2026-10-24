import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { L1Why } from '../../components/L1Why';
import { useI18n, useT } from '../../i18n';
import { handbookTopicHref } from '../../lib/handbookSearch';
import { useResource } from '../../lib/useResource';
import { LevelBadge, Panel } from '../../ui/kit';
import { getGrammarMastery, type GrammarMastery } from './api';
import { HandbookTeaser } from './HandbookTeaser';

/** "always / she / late / is" → tiles. Mirrors english-grammar.ts wordOrderTiles. */
export const wordOrderTiles = (prompt: string): string[] => prompt.split('/').map((tile) => tile.trim()).filter(Boolean);

/**
 * Word-order practice: tap the tiles in order to build the sentence; tap a
 * placed tile to take it back. The answer is the sentence as typed text, so
 * it is checked like any other answer.
 */
export const WordOrderInput = ({
  prompt,
  value,
  onChange,
  disabled,
  label,
}: {
  prompt: string;
  /** Indexes of the tiles placed, in order. */
  value: number[];
  onChange: (next: number[]) => void;
  disabled: boolean;
  label: string;
}) => {
  const t = useT();
  const tiles = useMemo(() => wordOrderTiles(prompt), [prompt]);
  const placed = new Set(value);
  return (
    <div className="gr-order" role="group" aria-label={label}>
      <p className="gr-order-line" lang="en" aria-live="polite">
        {value.length ? value.map((index, position) => (
          <button key={`${index}-${position}`} type="button" className="gr-tile is-placed" disabled={disabled} onClick={() => onChange(value.filter((_, at) => at !== position))}>
            {tiles[index]}
          </button>
        )) : <span className="hint">{t('depth.grammar.orderHint')}</span>}
      </p>
      <div className="gr-order-bank" lang="en">
        {tiles.map((tile, index) => (
          <button key={index} type="button" className="gr-tile" disabled={disabled || placed.has(index)} onClick={() => onChange([...value, index])}>
            {tile}
          </button>
        ))}
      </div>
      {value.length && !disabled ? (
        <button type="button" className="is-link" onClick={() => onChange([])}>{t('depth.grammar.orderClear')}</button>
      ) : null}
    </div>
  );
};

/** The sentence a word-order answer makes: tiles joined, first letter capitalised. */
export const orderedSentence = (prompt: string, value: number[]): string => {
  const tiles = wordOrderTiles(prompt);
  const text = value.map((index) => tiles[index] ?? '').filter(Boolean).join(' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};

/** Under a wrong answer: the handbook rule for this unit and, when one fits, why Russian/Uzbek speakers make it. */
export const MistakeLinks = ({ unitSlug, topic, given, expected }: { unitSlug: string; topic: string | null; given: string; expected: string }) => {
  const t = useT();
  return (
    <div className="gr-mistake-links">
      <Link to={`/grammar/handbook#${encodeURIComponent(unitSlug)}`}>{t('handbook.readRule')}</Link>
      {topic ? <> · <Link to={handbookTopicHref(topic)}>{t('depth.grammar.sameTopic')}</Link></> : null}
      <L1Why original={given || null} corrected={expected || null} topic={topic} />
    </div>
  );
};

const MASTERY_KEYS: Record<GrammarMastery['name'], string> = {
  new: 'depth.mastery.new',
  started: 'depth.mastery.started',
  practising: 'depth.mastery.practising',
  secure: 'depth.mastery.secure',
  mastered: 'depth.mastery.mastered',
};

export const MasteryDots = ({ mastery }: { mastery: GrammarMastery }) => {
  const t = useT();
  return (
    <span className="gr-mastery" title={t(MASTERY_KEYS[mastery.name])}>
      <span className="gr-dots" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => <span key={step} className={step <= mastery.level ? 'is-on' : undefined} />)}
      </span>
      <span>{t(MASTERY_KEYS[mastery.name])}</span>
    </span>
  );
};

/** After a lesson: the unit's mastery and when it comes back for a re-check. */
export const MasteryLine = ({ mastery }: { mastery: GrammarMastery | null | undefined }) => {
  const t = useT();
  const { date } = useI18n();
  if (!mastery || mastery.level === 0) return null;
  return (
    <div className="gr-mastery-line">
      <MasteryDots mastery={mastery} />
      <p className="hint" style={{ margin: 0 }}>
        {mastery.recheck_at
          ? t('depth.mastery.nextCheck', { date: date(mastery.recheck_at, { day: 'numeric', month: 'long' }) })
          : t('depth.mastery.passToSchedule')}
      </p>
    </div>
  );
};

/** Grammar home: how many units are secure or mastered, and the re-checks due now. */
export const GrammarMasteryPanel = () => {
  const t = useT();
  const overview = useResource((signal) => getGrammarMastery(signal), []);
  const data = overview.data;
  const tried = data ? data.units.filter((unit) => unit.mastery.level > 0).length : 0;
  return (
    <>
      {data && tried > 0 ? (
        <Panel title={t('depth.mastery.title')}>
          <p style={{ margin: 0 }}>
            {t('depth.mastery.summary', {
              mastered: data.counts.mastered ?? 0,
              secure: data.counts.secure ?? 0,
              practising: (data.counts.practising ?? 0) + (data.counts.started ?? 0),
            })}
          </p>
          {data.due.length ? (
            <div className="en-stack" style={{ gap: '.4rem' }}>
              <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('depth.mastery.dueTitle')}</h3>
              <p className="hint" style={{ margin: 0 }}>{t('depth.mastery.dueLead')}</p>
              <ul className="en-list">
                {data.due.map((unit) => (
                  <li key={unit.slug}>
                    <Link className="en-item" to={`/grammar/${encodeURIComponent(unit.slug)}`}>
                      <span className="en-item-main">
                        <strong>{unit.title}</strong>
                        <MasteryDots mastery={unit.mastery} />
                      </span>
                      <span className="en-item-meta"><LevelBadge level={unit.level} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint" style={{ margin: 0 }}>{t('depth.mastery.noneDue')}</p>
          )}
        </Panel>
      ) : null}
      <HandbookTeaser />
    </>
  );
};
