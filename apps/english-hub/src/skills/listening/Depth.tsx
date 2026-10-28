import { useEffect, useState } from 'react';
import { TapScope, TapWords } from '../../components/WordLookup';
import { useT } from '../../i18n';
import { availableAccents, canSpeak, type Accent } from '../../lib/speech';
import { Segmented } from '../../ui/kit';
import type { DictationIssue } from './api';
import type { SpeechChunk } from './script';

export type Speed = 'slow' | 'relaxed' | 'normal' | 'fast';
export const RATE: Record<Speed, number> = { slow: 0.7, relaxed: 0.85, normal: 1, fast: 1.15 };
export type AccentChoice = 'auto' | Accent;

/** Accents the browser has voices for; updates when voices finish loading. */
export const useAccents = (): Accent[] => {
  const [accents, setAccents] = useState<Accent[]>(() => availableAccents());
  useEffect(() => {
    if (!canSpeak()) return undefined;
    const update = () => setAccents(availableAccents());
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    update();
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);
  return accents;
};

/** Speaker-based accents ("auto") unless the learner chose one. */
export const withAccent = (chunks: SpeechChunk[], accent: AccentChoice): SpeechChunk[] =>
  accent === 'auto' ? chunks : chunks.map((chunk) => ({ ...chunk, accent }));

/** Speed and accent for browser speech. Only accents this browser can speak are offered. */
export const ListenControls = ({
  speed,
  onSpeed,
  accent,
  onAccent,
  accents,
}: {
  speed: Speed;
  onSpeed: (speed: Speed) => void;
  accent: AccentChoice;
  onAccent: (accent: AccentChoice) => void;
  accents: Accent[];
}) => {
  const t = useT();
  return (
    <div className="ls-controls">
      <Segmented<Speed>
        label={t('listening.listen.speed')}
        value={speed}
        onChange={onSpeed}
        options={[
          { value: 'slow', label: '0.7×' },
          { value: 'relaxed', label: '0.85×' },
          { value: 'normal', label: '1×' },
          { value: 'fast', label: '1.15×' },
        ]}
      />
      {accents.length > 1 ? (
        <Segmented<AccentChoice>
          label={t('depth.listen.accent')}
          value={accent}
          onChange={onAccent}
          options={[
            { value: 'auto', label: t('depth.listen.accentAuto') },
            ...accents.map((value) => ({ value, label: t(`depth.listen.accent.${value}`) })),
          ]}
        />
      ) : null}
    </div>
  );
};

type SegmentRow = { index: number; text: string };

/**
 * Sentence-by-sentence replay. Before checking, the text stays hidden (so the
 * learner still has to listen); afterwards each sentence shows with its words
 * tappable and the one playing highlighted.
 */
export const SegmentReplay = ({
  segments,
  showText,
  playingKey,
  onPlay,
  source,
}: {
  segments: SegmentRow[];
  showText: boolean;
  playingKey: string | null;
  onPlay: (segment: SegmentRow, slow: boolean) => void;
  source: { label: string | null; ref: string };
}) => {
  const t = useT();
  if (!segments.length) return null;
  const rows = (
    <ol className="ls-segments">
      {segments.map((segment) => {
        const normalKey = `seg${segment.index}`;
        const slowKey = `seg${segment.index}-slow`;
        const playing = playingKey === normalKey || playingKey === slowKey;
        return (
          <li key={segment.index} className={playing ? 'is-playing' : undefined}>
            <span className="ls-segment-buttons">
              <button type="button" className="quiet" aria-pressed={playingKey === normalKey} onClick={() => onPlay(segment, false)} aria-label={t('depth.listen.playSentence', { number: segment.index + 1 })}>
                ▶ {segment.index + 1}
              </button>
              <button type="button" className="is-link" aria-pressed={playingKey === slowKey} onClick={() => onPlay(segment, true)}>
                {t('depth.listen.slower')}
              </button>
            </span>
            {showText ? <span className="ls-segment-text" lang="en"><TapWords text={segment.text} /></span> : null}
          </li>
        );
      })}
    </ol>
  );
  return showText
    ? <TapScope className="ls-segments-scope" lang={null} source={{ type: 'english-listening', label: source.label, ref: source.ref }}>{rows}</TapScope>
    : rows;
};

const ISSUE_ORDER: DictationIssue['kind'][] = ['small_words', 'endings', 'contractions', 'numbers', 'spelling', 'missed_words', 'extra_words'];

/** "You often missed small words (the, a)": what kind of thing the dictation lost, with examples. */
export const DictationAdvice = ({ issues }: { issues: DictationIssue[] | undefined }) => {
  const t = useT();
  if (!issues?.length) return null;
  const sorted = [...issues].sort((a, b) => b.count - a.count || ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind)).slice(0, 4);
  return (
    <div className="ls-advice">
      <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('depth.listen.adviceTitle')}</h3>
      <ul className="en-list">
        {sorted.map((issue) => (
          <li key={issue.kind}>
            <strong>{t(`depth.listen.issue.${issue.kind}`, { count: issue.count })}</strong>
            {issue.examples.length ? <> <span className="hint" lang="en">({issue.examples.join(', ')})</span></> : null}
            <br />
            <span className="hint">{t(`depth.listen.tip.${issue.kind}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
