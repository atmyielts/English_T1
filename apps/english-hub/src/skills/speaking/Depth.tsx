import { useT } from '../../i18n';
import { useResource } from '../../lib/useResource';
import { TextDiff } from '../../components/TextDiff';
import { compareAttempts, findFillers, type AttemptSnapshot } from '../../../../../supabase/functions/_shared/english-fluency.ts';
import { getAttempts, type SpeakingAttemptSummary, type SpeakingFeedback, type SpeakingFluency, type SpeakingSubmitResponse } from './api';
import '../../depth.css';

const seconds = (value: number | null): string => (value === null ? '–' : `${value.toFixed(1)} s`);

/**
 * What the browser could time: pace against the level's band, long pauses,
 * time before the first word, and filler words. Approximate by nature.
 */
export const FluencyPanel = ({ feedback, fluency, transcript, level }: { feedback: SpeakingFeedback; fluency: SpeakingFluency | null; transcript: string; level: string | null }) => {
  const t = useT();
  const { stats } = feedback;
  const [low, high] = stats.pace_band;
  const fillers = findFillers(transcript);
  const fillerWords = [...new Set(fillers)];
  const tips: string[] = [];
  if (stats.wpm !== null && stats.wpm < low) tips.push(t('depth.fluency.tipSlow'));
  if (stats.wpm !== null && stats.wpm > high) tips.push(t('depth.fluency.tipFast'));
  if (fluency && fluency.long_pauses >= 2) tips.push(t('depth.fluency.tipPauses'));
  if (fluency && fluency.first_word_seconds !== null && fluency.first_word_seconds > 4) tips.push(t('depth.fluency.tipStart'));
  if (stats.filler_count >= 3) tips.push(t('depth.fluency.tipFillers'));
  return (
    <div className="en-stack dp-fluency" style={{ gap: '.5rem' }}>
      <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('depth.fluency.title')}</h3>
      <div className="dp-fluency-grid">
        <div className="en-stat">
          <small>{t('depth.fluency.wpm')}</small>
          <strong>{stats.wpm ?? '–'}</strong>
          <span>{t('depth.fluency.band', { low, high, level: level ?? '' })}</span>
        </div>
        <div className="en-stat">
          <small>{t('depth.fluency.pauses')}</small>
          <strong>{fluency ? fluency.long_pauses : '–'}</strong>
          <span>{fluency?.longest_pause_seconds ? t('depth.fluency.longest', { time: seconds(fluency.longest_pause_seconds) }) : t('depth.fluency.pausesHint')}</span>
        </div>
        <div className="en-stat">
          <small>{t('depth.fluency.start')}</small>
          <strong>{fluency ? seconds(fluency.first_word_seconds) : '–'}</strong>
          <span>{t('depth.fluency.startHint')}</span>
        </div>
        <div className="en-stat">
          <small>{t('depth.fluency.fillers')}</small>
          <strong>{stats.filler_count}</strong>
          <span lang="en">{fillerWords.length ? fillerWords.join(', ') : t('depth.fluency.noFillers')}</span>
        </div>
      </div>
      {tips.length ? (
        <ul className="en-list">
          {tips.map((tip) => <li key={tip} className="en-explain">{tip}</li>)}
        </ul>
      ) : stats.wpm !== null ? <p className="en-notice" style={{ margin: 0 }}>{t('depth.fluency.good')}</p> : null}
      <p className="hint" style={{ margin: 0 }}>{fluency ? t('depth.fluency.note') : t('depth.fluency.noTiming')}</p>
    </div>
  );
};

const snapshotOf = (input: {
  overall: number | null;
  scores: { task: number | null; vocabulary: number | null; grammar: number | null; fluency: number | null };
  wpm: number | null;
  fillers: number | null;
  words: number | null;
  fluency: SpeakingFluency | null;
}): AttemptSnapshot => ({
  overall: input.overall,
  task: input.scores.task,
  vocabulary: input.scores.vocabulary,
  grammar: input.scores.grammar,
  fluency: input.scores.fluency,
  wpm: input.wpm,
  long_pauses: input.fluency ? input.fluency.long_pauses : null,
  filler_count: input.fillers,
  words: input.words,
});

const ROW_LABEL: Record<keyof AttemptSnapshot, string> = {
  overall: 'depth.compare.overall',
  task: 'speaking.result.task',
  vocabulary: 'speaking.result.vocabulary',
  grammar: 'speaking.result.grammar',
  fluency: 'speaking.result.pace',
  wpm: 'depth.fluency.wpm',
  long_pauses: 'depth.fluency.pauses',
  filler_count: 'depth.fluency.fillers',
  words: 'speaking.record.words',
};

/** This try next to the last one: every score and signal, and what was said. */
export const AttemptCompare = ({ previous, result }: { previous: SpeakingAttemptSummary; result: SpeakingSubmitResponse }) => {
  const t = useT();
  const { feedback } = result;
  const rows = compareAttempts(
    snapshotOf({
      overall: previous.overall,
      scores: previous.scores,
      wpm: previous.stats.wpm,
      fillers: previous.stats.filler_count,
      words: previous.stats.words,
      fluency: previous.fluency,
    }),
    snapshotOf({
      overall: feedback.overall,
      scores: feedback.scores,
      wpm: feedback.stats.wpm,
      fillers: feedback.stats.filler_count,
      words: feedback.stats.words,
      fluency: result.fluency ?? null,
    }),
    feedback.stats.pace_band,
  );
  const better = rows.filter((row) => row.verdict === 'better').length;
  return (
    <div className="en-stack dp-compare" style={{ gap: '.5rem' }}>
      <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('depth.compare.title')}</h3>
      <p className={better ? 'en-notice' : 'hint'} style={{ margin: 0 }}>
        {better ? t('depth.compare.better', { count: better }) : t('depth.compare.noBetter')}
      </p>
      <table className="dp-table">
        <caption className="visually-hidden">{t('depth.compare.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('depth.compare.signal')}</th>
            <th scope="col">{t('depth.compare.last')}</th>
            <th scope="col">{t('depth.compare.now')}</th>
            <th scope="col">{t('depth.writing.change')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{t(ROW_LABEL[row.key])}</th>
              <td>{row.before ?? '–'}</td>
              <td>{row.after ?? '–'}</td>
              <td className={row.verdict === 'better' ? 'is-up' : row.verdict === 'worse' ? 'is-down' : ''}>
                {row.delta === null ? '–' : row.delta > 0 ? `+${row.delta}` : String(row.delta)}
                {row.verdict ? <span className="visually-hidden"> ({t(`depth.compare.verdict.${row.verdict}`)})</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {previous.transcript ? (
        <TextDiff before={previous.transcript} after={result.transcript} beforeLabel={t('depth.compare.last')} afterLabel={t('depth.compare.now')} />
      ) : null}
    </div>
  );
};

/** Before recording: how the learner did last time on this prompt, to beat it. */
export const LastTries = ({ slug }: { slug: string }) => {
  const t = useT();
  const attempts = useResource((signal) => getAttempts(slug, signal), [slug]);
  const list = attempts.data?.attempts ?? [];
  if (!list.length) return null;
  const last = list[0]!;
  const scores = list.slice(0, 5).map((entry) => entry.overall).filter((value): value is number => value !== null).reverse();
  return (
    <p className="hint dp-strip" style={{ margin: 0 }}>
      {t('depth.tries.last', { score: last.overall ?? '–' })}
      {last.stats.wpm !== null ? ` · ${t('depth.tries.wpm', { wpm: last.stats.wpm })}` : ''}
      {last.fluency ? ` · ${t('depth.tries.pauses', { count: last.fluency.long_pauses })}` : ''}
      {scores.length > 1 ? ` · ${t('depth.tries.history', { scores: scores.join(' → ') })}` : ''}
      {' '}{t('depth.tries.beat')}
    </p>
  );
};
