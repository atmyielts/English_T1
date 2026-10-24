import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { saveWords } from '../../lib/notebook';
import { LevelBadge, useErrorMessage } from '../../ui/kit';
import { harvestCandidates } from '../../../../../supabase/functions/_shared/english-harvest.ts';
import { sentencesOf } from '../../../../../supabase/functions/_shared/english-reading-depth.ts';
import type { NextRead, ReadingSubmitResponse } from './api';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** "You read 240 words in 1:52: 129 words a minute, about usual for B1." */
export const ReadingSpeedLine = ({ reading, level }: { reading: ReadingSubmitResponse['reading']; level: string | null }) => {
  const t = useT();
  if (!reading?.wpm || !reading.seconds) return null;
  return (
    <p className="rd-speed" style={{ margin: 0 }}>
      <strong>{t('depth.reading.speedLine', { words: reading.words, time: clock(reading.seconds), wpm: reading.wpm })}</strong>
      {reading.pace && level ? <> {t(`depth.reading.pace.${reading.pace}`, { level })}</> : null}
    </p>
  );
};

/** What to read next, from this result: re-read, easier, same level or a step up. */
export const NextReadCard = ({ next, slug, onReread }: { next: NextRead | null | undefined; slug: string; onReread?: () => void }) => {
  const t = useT();
  if (!next) return null;
  const isThis = next.article?.slug === slug;
  return (
    <div className="rd-next">
      <p className="eyebrow" style={{ margin: 0 }}>{t('depth.reading.nextTitle')}</p>
      <p style={{ margin: 0 }}>{t(`depth.reading.next.${next.action}`)}</p>
      <div className="en-actions">
        {isThis && onReread ? <button type="button" onClick={onReread}>{t('depth.reading.rereadNow')}</button> : null}
        {next.article && !isThis ? (
          <Link className="en-button" to={`/reading/${encodeURIComponent(next.article.slug)}`}>
            {next.article.title} <LevelBadge level={next.article.level} />
          </Link>
        ) : null}
        {next.then ? (
          <Link className="en-button-quiet" to={`/reading/${encodeURIComponent(next.then.slug)}`}>
            {t('depth.reading.thenTry')} {next.then.title} <LevelBadge level={next.then.level} />
          </Link>
        ) : null}
      </div>
    </div>
  );
};

/**
 * "Which words were new?": a short list of less common words from the text;
 * the learner ticks the ones they did not know and saves them with their sentence.
 */
export const WordHarvest = ({
  markdown,
  known,
  source,
  onSaved,
}: {
  markdown: string;
  /** Lower-case words already saved (any form), never offered. */
  known: Set<string>;
  source: { type: string; label: string | null; ref: string | null };
  onSaved: (words: Array<{ word: string; sentence: string }>) => void;
}) => {
  const t = useT();
  const errorText = useErrorMessage();
  const candidates = useMemo(() => harvestCandidates(sentencesOf(markdown), { exclude: known, limit: 12 }), [markdown, known]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (!candidates.length) return null;

  const toggle = (word: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    return next;
  });

  const save = async () => {
    const chosen = candidates.filter((candidate) => picked.has(candidate.word));
    if (!chosen.length) return;
    setSaving(true);
    setError(null);
    try {
      await saveWords(chosen.map((candidate) => ({
        word: candidate.word,
        context_text: candidate.sentence,
        source_type: source.type,
        source_label: source.label,
        source_ref: source.ref,
      })));
      setSaved(chosen.length);
      onSaved(chosen.map((candidate) => ({ word: candidate.word, sentence: candidate.sentence })));
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rd-harvest">
      <h3 className="rd-subtitle">{t('depth.harvest.title')}</h3>
      <p className="hint" style={{ margin: 0 }}>{t('depth.harvest.lead')}</p>
      {saved !== null ? (
        <p className="en-notice" role="status" style={{ margin: 0 }}>{t('depth.harvest.saved', { count: saved })}</p>
      ) : (
        <>
          <ul className="rd-harvest-list" lang="en">
            {candidates.map((candidate) => (
              <li key={candidate.word}>
                <label title={candidate.sentence}>
                  <input type="checkbox" checked={picked.has(candidate.word)} onChange={() => toggle(candidate.word)} />
                  <span>{candidate.word}</span>
                </label>
              </li>
            ))}
          </ul>
          {error ? <p className="error" role="alert" style={{ margin: 0 }}>{errorText(error)}</p> : null}
          <div className="en-actions">
            <button type="button" disabled={saving || picked.size === 0} onClick={() => void save()}>
              {saving ? t('reading.words.saving') : t('depth.harvest.save', { count: picked.size })}
            </button>
            {picked.size === 0 ? <span className="hint">{t('depth.harvest.none')}</span> : null}
          </div>
        </>
      )}
    </div>
  );
};
