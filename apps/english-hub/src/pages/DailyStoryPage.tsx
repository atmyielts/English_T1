import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import { answerDailyStory, getDailyStory, getDailyStoryArchive, getDailyStoryById, type DailyStory, type DailyStoryAnswer } from '../lib/dailyStory';
import { canSpeak } from '../lib/speech';
import { CEFR_LEVELS, type CefrLevel } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, ScoreBadge, Segmented, useErrorMessage } from '../ui/kit';
import { readMinutes, useStoryPolling } from '../components/DailyStoryCard';
import { parsePassage } from '../skills/reading/markdown';
import { Passage } from '../skills/reading/Passage';
import { isAnswered, ReadingQuestionBlock } from '../skills/reading/Questions';
import { ReadingSpeedLine, WordHarvest } from '../skills/reading/After';
import { savedWordsStyle } from '../skills/reading/highlight';
import type { ReadingAnswer } from '../skills/reading/api';
import { usePlayer } from '../skills/listening/usePlayer';
import { sentencesOf } from '../../../../supabase/functions/_shared/english-reading-depth.ts';
import '../skills/reading/reading.css';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** One story: listen, read with tap-to-translate, three questions, speed and new words. */
const StoryReader = ({ story }: { story: DailyStory }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const player = usePlayer();
  const blocks = useMemo(() => parsePassage(story.body), [story.body]);
  const chunks = useMemo(() => sentencesOf(story.body).map((text) => ({ text, accent: 'us' as const })), [story.body]);
  const forms = useMemo(() => story.saved_words.flatMap((entry) => entry.forms), [story.saved_words]);
  const [savedNow, setSavedNow] = useState<string[]>([]);
  const savedSet = useMemo(() => new Set([...forms, ...savedNow]), [forms, savedNow]);
  const known = useMemo(() => new Set([...savedSet, ...story.saved_words.map((entry) => entry.word.toLowerCase())]), [savedSet, story.saved_words]);
  const [answers, setAnswers] = useState<Record<string, ReadingAnswer>>({});
  const [result, setResult] = useState<DailyStoryAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const started = useRef(Date.now());
  const [readingSeconds, setReadingSeconds] = useState<number | null>(null);
  const playing = player.state.key !== null;

  const stopReading = (): number => {
    if (readingSeconds !== null) return readingSeconds;
    const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
    setReadingSeconds(seconds);
    return seconds;
  };

  const answered = story.questions.filter((question) => isAnswered(question, answers[question.id])).length;

  const check = async () => {
    setBusy(true);
    setError(null);
    player.stop();
    try {
      const response = await answerDailyStory(
        story.id,
        story.questions.filter((question) => isAnswered(question, answers[question.id])).map((question) => ({ question_id: question.id, ...answers[question.id]! })),
        stopReading(),
      );
      setResult(response);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const resultFor = (id: string) => result?.results.find((entry) => entry.question_id === id) ?? null;
  const css = useMemo(() => savedWordsStyle(savedSet), [savedSet]);

  return (
    <>
      <Panel
        title={t('depth.story.textTitle')}
        aside={canSpeak() ? (
          <span className="en-row" style={{ gap: '.4rem' }}>
            <button type="button" className="quiet" aria-pressed={playing} onClick={() => (playing ? player.stop() : void player.play('story', chunks, 0.95))}>
              {playing ? t('listening.listen.stop') : `▶ ${t('depth.story.listen')}`}
            </button>
            {!playing ? <button type="button" className="is-link" onClick={() => void player.play('story-slow', chunks, 0.75)}>{t('depth.listen.slower')}</button> : null}
          </span>
        ) : null}
      >
        <p className="hint" style={{ margin: 0 }}>{t('translate.tapHint')}</p>
        {story.saved_words.length ? <p className="hint" style={{ margin: 0 }}>{t('depth.reading.savedHighlighted', { count: story.saved_words.length })}</p> : null}
        {css ? <style>{css}</style> : null}
        <Passage
          blocks={blocks}
          wordMode={false}
          selectedKey={null}
          savedWords={savedSet}
          onPick={() => undefined}
          tapSource={{ type: 'english-daily-story', label: story.title, ref: story.id }}
          onTapSaved={(word) => setSavedNow((current) => [...current, word.toLowerCase()])}
        />
        {player.state.key && player.state.parts > 1 ? (
          <p className="hint" style={{ margin: 0 }} aria-live="polite">{t('depth.story.sentenceOf', { current: player.state.part, total: player.state.parts })}</p>
        ) : null}
      </Panel>

      <Panel title={t('reading.questions.title')} aside={!result ? <span>{t('reading.questions.answered', { done: answered, total: story.questions.length })}</span> : null}>
        {!result ? (
          <div className="rd-timer" aria-live="polite">
            {readingSeconds === null ? (
              <>
                <span className="hint">{t('depth.reading.timerRunning')}</span>
                <button type="button" className="quiet" onClick={() => stopReading()}>{t('depth.reading.doneReading')}</button>
              </>
            ) : <span className="hint">{t('depth.reading.timerDone', { time: clock(readingSeconds) })}</span>}
          </div>
        ) : null}
        {story.questions.map((question, index) => (
          <ReadingQuestionBlock
            key={question.id}
            question={question}
            index={index}
            answer={answers[question.id]}
            result={resultFor(question.id)}
            disabled={Boolean(result) || busy}
            onAnswer={(answer) => {
              stopReading();
              setAnswers((current) => ({ ...current, [question.id]: answer }));
            }}
          />
        ))}
        {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
        {!result ? (
          <div className="en-actions">
            <button type="button" className="is-large" disabled={busy || answered === 0} onClick={() => void check()}>
              {busy ? t('reading.questions.checking') : t('reading.questions.check')}
            </button>
          </div>
        ) : null}
      </Panel>

      {result ? (
        <Panel title={t('depth.story.doneTitle')}>
          <div className="en-row" style={{ gap: '1rem', alignItems: 'center' }}>
            <ScoreBadge score={result.score} />
            <p style={{ margin: 0 }}>{t('reading.result.summary', { correct: result.correct, total: result.total })}</p>
          </div>
          <ReadingSpeedLine reading={result.reading} level={story.level} />
          <WordHarvest
            markdown={story.body}
            known={known}
            source={{ type: 'english-daily-story', label: story.title, ref: story.id }}
            onSaved={(words) => setSavedNow((current) => [...current, ...words.map((entry) => entry.word.toLowerCase())])}
          />
          <div className="en-actions">
            <Link className="en-button" to="/today">{t('depth.story.backToday')}</Link>
            <Link className="en-button-quiet" to="/reading">{t('depth.story.moreReading')}</Link>
          </div>
        </Panel>
      ) : null}
    </>
  );
};

/** /stories/:id */
const StoryById = ({ id }: { id: string }) => {
  const t = useT();
  const story = useResource((signal) => getDailyStoryById(id, signal), [id]);
  const data = story.data?.story ?? null;
  return (
    <>
      <PageHeader
        back={{ to: '/stories', label: t('depth.nav.stories') }}
        eyebrow={t('depth.story.eyebrow')}
        title={data?.title ?? (story.loading ? '…' : t('depth.story.cardTitle'))}
        actions={data ? <span className="en-row"><LevelBadge level={data.level} /></span> : null}
        lead={data ? t('depth.story.lead', { minutes: readMinutes(data.word_count) }) : undefined}
      />
      {story.loading && !story.data ? <Loading lines={6} /> : null}
      {story.error ? <ErrorState error={story.error} onRetry={story.reload} /> : null}
      {data ? <StoryReader key={data.id} story={data} /> : null}
    </>
  );
};

/** /stories: today's story at a level, and the archive. */
const StoriesHome = () => {
  const t = useT();
  const { date } = useI18n();
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const today = useResource((signal) => getDailyStory(level, signal), [level]);
  const gaveUp = useStoryPolling(today);
  const shownLevel = (level ?? today.data?.level ?? null) as CefrLevel | null;
  const archive = useResource((signal) => getDailyStoryArchive(shownLevel, signal), [shownLevel], Boolean(shownLevel));
  // The archive includes today's story once it is ready.
  useEffect(() => {
    if (today.data?.status === 'ready') archive.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.data?.status]);
  const story = today.data?.story ?? null;

  return (
    <>
      <PageHeader eyebrow={t('depth.story.eyebrow')} title={t('depth.nav.stories')} lead={t('depth.story.pageLead')} />
      <Panel
        title={t('depth.story.today')}
        aside={shownLevel ? (
          <Segmented<CefrLevel>
            label={t('depth.story.level')}
            value={shownLevel}
            onChange={(next) => setLevel(next)}
            options={CEFR_LEVELS.map((value) => ({ value, label: value }))}
          />
        ) : null}
      >
        {today.loading && !today.data ? <Loading lines={3} /> : null}
        {today.error ? <ErrorState error={today.error} onRetry={today.reload} /> : null}
        {today.data?.status === 'generating' && !gaveUp ? <p className="hint" role="status" style={{ margin: 0 }}>{t('depth.story.writing')}</p> : null}
        {today.data?.status === 'failed' || (today.data?.status === 'generating' && gaveUp) ? (
          <EmptyState title={t('depth.story.unavailable')} action={<button type="button" onClick={today.reload}>{t('depth.story.tryAgain')}</button>} />
        ) : null}
        {story ? (
          <div className="en-stack" style={{ gap: '.5rem' }}>
            <p style={{ margin: 0 }}><strong lang="en">{story.title}</strong></p>
            <p className="hint" style={{ margin: 0 }}>
              {story.read ? t('depth.story.readResult', { correct: story.read.correct, total: story.read.total }) : t('depth.story.cardBody', { minutes: readMinutes(story.word_count) })}
            </p>
            <div className="en-actions">
              <Link className="en-button" to={`/stories/${encodeURIComponent(story.id)}`}>{story.read ? t('depth.story.readAgain') : t('depth.story.read')}</Link>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel title={t('depth.story.archiveTitle')}>
        {archive.loading && !archive.data ? <Loading lines={4} /> : null}
        {archive.error ? <ErrorState error={archive.error} onRetry={archive.reload} /> : null}
        {archive.data && archive.data.stories.length === 0 ? <p className="hint">{t('depth.story.archiveEmpty')}</p> : null}
        {archive.data?.stories.length ? (
          <ul className="en-list">
            {archive.data.stories.map((entry) => (
              <li key={entry.id}>
                <Link className={`en-item ${entry.read ? 'is-done' : ''}`.trim()} to={`/stories/${encodeURIComponent(entry.id)}`}>
                  <span className={`en-check ${entry.read ? 'is-done' : ''}`.trim()} aria-hidden="true">{entry.read ? '✓' : ''}</span>
                  <span className="en-item-main">
                    <strong lang="en">{entry.title}</strong>
                    <span>
                      {date(`${entry.date}T12:00:00`, { day: 'numeric', month: 'long' })}
                      {entry.read ? ` · ${t('depth.story.readResult', { correct: entry.read.correct, total: entry.read.total })}` : ''}
                    </span>
                  </span>
                  <span className="en-item-meta"><LevelBadge level={entry.level} /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </>
  );
};

export const DailyStoryPage = () => {
  const { id } = useParams();
  return id ? <StoryById id={id} /> : <StoriesHome />;
};
