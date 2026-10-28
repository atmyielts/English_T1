import { Fragment, useState } from 'react';
import { useT } from '../../i18n';
import type { ListeningPartView, McqView, ReadingPartView, SectionResult } from '../../lib/exam';
import { canSpeak } from '../../lib/speech';
import { parseScript, speechChunks } from '../../skills/listening/script';
import { usePlayer } from '../../skills/listening/usePlayer';
import { LevelBadge, Panel } from '../../ui/kit';
import { Passage } from './parts';

type Answers = Record<string, string>;
type Review = Map<string, { correct: string; ok: boolean }> | null;

const reviewOf = (result: SectionResult | null): Review =>
  result?.objective ? new Map(result.objective.items.map((item) => [item.id, { correct: item.correct, ok: item.ok }])) : null;

const ReviewLine = ({ entry }: { entry: { correct: string; ok: boolean } | undefined }) => {
  const t = useT();
  if (!entry) return null;
  return entry.ok
    ? <p className="en-notice" style={{ margin: 0 }}>{t('exam.review.right')}</p>
    : <p className="error" style={{ margin: 0 }}>{t('exam.review.answer', { answer: entry.correct })}</p>;
};

const Mcq = ({ question, name, value, onChange, review, number }: {
  question: McqView;
  name: string;
  value: string | undefined;
  onChange: (value: string) => void;
  review: Review;
  number: number;
}) => {
  const entry = review?.get(name);
  return (
    <div className="en-question" role="group" aria-labelledby={`ex-${name}`}>
      <p className="en-question-prompt" id={`ex-${name}`} lang="en">{number}. {question.prompt}</p>
      <div className="en-options">
        {question.options.map((option) => {
          const chosen = value === option.id;
          const state = entry ? (option.id === entry.correct ? 'is-correct' : chosen ? 'is-wrong' : '') : '';
          return (
            <button
              key={option.id}
              type="button"
              className={`en-option ${state}`.trim()}
              aria-pressed={chosen}
              disabled={Boolean(review)}
              onClick={() => onChange(option.id)}
            >
              <span className="en-option-key" aria-hidden="true">{option.id}</span>
              <span lang="en">{option.text}</span>
            </button>
          );
        })}
      </div>
      {entry && !entry.ok ? <ReviewLine entry={entry} /> : null}
    </div>
  );
};

const GapText = ({ part, answers, set, review }: { part: Extract<ReadingPartView, { type: 'gap_fill' }>; answers: Answers; set: (key: string, value: string) => void; review: Review }) => {
  const t = useT();
  const pieces = part.text.split(/\{\{(\d{1,2})\}\}/);
  return (
    <div className="en-passage en-exam-gaptext" lang="en">
      {pieces.map((piece, index) => {
        if (index % 2 === 0) return <Fragment key={index}>{piece}</Fragment>;
        const key = `${part.id}.${piece}`;
        const entry = review?.get(key);
        return (
          <span key={index} className="en-exam-gap">
            <small aria-hidden="true">{piece}</small>
            <input
              type="text"
              aria-label={t('exam.reading.gap', { number: piece })}
              value={answers[key] ?? ''}
              disabled={Boolean(review)}
              className={entry ? (entry.ok ? 'is-correct' : 'is-wrong') : ''}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={40}
              onChange={(event) => set(key, event.target.value)}
            />
            {entry && !entry.ok ? <small>({entry.correct})</small> : null}
          </span>
        );
      })}
    </div>
  );
};

/** The reading section: gap fill, multiple choice and matching headings. */
export const ReadingSection = ({ parts, answers, onAnswer, result }: { parts: ReadingPartView[]; answers: Answers; onAnswer: (key: string, value: string) => void; result: SectionResult | null }) => {
  const t = useT();
  const review = reviewOf(result);
  return (
    <>
      {parts.map((part) => (
        <Panel key={part.id} title={<span lang="en">{part.title}</span>} aside={<LevelBadge level={part.level} />}>
          {part.type === 'gap_fill' ? <GapText part={part} answers={answers} set={onAnswer} review={review} /> : null}
          {part.type === 'mcq' ? (
            <div className="en-stack">
              <Passage text={part.text} />
              {part.questions.map((question, index) => (
                <Mcq key={question.id} question={question} name={`${part.id}.${question.id}`} value={answers[`${part.id}.${question.id}`]} onChange={(value) => onAnswer(`${part.id}.${question.id}`, value)} review={review} number={index + 1} />
              ))}
            </div>
          ) : null}
          {part.type === 'headings' ? (
            <div className="en-stack">
              <ul className="en-exam-headings" lang="en">
                {part.headings.map((heading) => <li key={heading.id}><b>{heading.id}</b>{heading.text}</li>)}
              </ul>
              {part.paragraphs.map((paragraph) => {
                const key = `${part.id}.${paragraph.id}`;
                return (
                  <div key={paragraph.id} className="en-exam-para">
                    <label className="en-stack" style={{ gap: '.35rem' }}>
                      <strong>{t('exam.reading.paragraph', { number: paragraph.id })}</strong>
                      <select value={answers[key] ?? ''} disabled={Boolean(review)} onChange={(event) => onAnswer(key, event.target.value)}>
                        <option value="">{t('exam.reading.chooseHeading')}</option>
                        {part.headings.map((heading) => <option key={heading.id} value={heading.id}>{heading.id}. {heading.text}</option>)}
                      </select>
                    </label>
                    <p lang="en" style={{ margin: 0 }}>{paragraph.text}</p>
                    <ReviewLine entry={review?.get(key)} />
                  </div>
                );
              })}
            </div>
          ) : null}
        </Panel>
      ))}
    </>
  );
};

/** Plays a script with browser speech, at most `maxPlays` times. */
const PlayButton = ({ id, script, dialogue, plays, onPlayed, maxPlays, player }: {
  id: string;
  script: string;
  dialogue: boolean;
  plays: number;
  onPlayed: () => void;
  maxPlays: number;
  player: ReturnType<typeof usePlayer>;
}) => {
  const t = useT();
  const playing = player.state.key === id;
  if (!canSpeak()) return <p className="hint" style={{ margin: 0 }}>{t('exam.listening.noAudio')}</p>;
  return (
    <div className="en-exam-play">
      {playing ? (
        <button type="button" className="quiet" onClick={player.stop}>{t('exam.listening.stop')}</button>
      ) : (
        <button
          type="button"
          disabled={plays >= maxPlays || (player.state.key !== null && !playing)}
          onClick={() => { onPlayed(); void player.play(id, speechChunks(parseScript(script, dialogue)), 0.95); }}
        >
          ▶ {plays === 0 ? t('exam.listening.play') : t('exam.listening.playAgain')}
        </button>
      )}
      {maxPlays <= 2 ? <span className="hint">{t('exam.listening.plays', { count: Math.max(0, maxPlays - plays) })}</span> : null}
    </div>
  );
};

/** The listening section: short dialogues, note completion and longer recordings. */
export const ListeningSection = ({ parts, answers, onAnswer, plays, onPlayed, result }: {
  parts: ListeningPartView[];
  answers: Answers;
  onAnswer: (key: string, value: string) => void;
  plays: Record<string, number>;
  onPlayed: (id: string) => void;
  result: SectionResult | null;
}) => {
  const t = useT();
  const player = usePlayer();
  const review = reviewOf(result);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const maxPlays = review ? 99 : 2;
  const transcript = (id: string, script: string) => review ? (
    <details open={shown[id]} onToggle={(event) => setShown((current) => ({ ...current, [id]: (event.target as HTMLDetailsElement).open }))}>
      <summary style={{ cursor: 'pointer' }}>{t('exam.listening.transcript')}</summary>
      <p className="en-exam-script" lang="en">{script}</p>
    </details>
  ) : null;

  return (
    <>
      {parts.map((part) => (
        <Panel key={part.id} title={<span lang="en">{part.title}</span>} aside={<LevelBadge level={part.level} />}>
          {part.type === 'dialogues' ? (
            <div className="en-stack">
              {part.items.map((item, index) => {
                const id = `${part.id}.${item.id}`;
                return (
                  <div key={item.id} className="en-stack" style={{ gap: '.4rem' }}>
                    <PlayButton id={id} script={item.script} dialogue plays={plays[id] ?? 0} onPlayed={() => onPlayed(id)} maxPlays={maxPlays} player={player} />
                    <Mcq question={item} name={id} value={answers[id]} onChange={(value) => onAnswer(id, value)} review={review} number={index + 1} />
                    {transcript(id, item.script)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="en-stack">
              <PlayButton id={part.id} script={part.script} dialogue={part.type === 'mcq' && /^[A-Z][A-Za-z .']{0,30}:\s/m.test(part.script)} plays={plays[part.id] ?? 0} onPlayed={() => onPlayed(part.id)} maxPlays={maxPlays} player={player} />
              {part.type === 'notes' ? (
                <ul className="en-exam-notes" lang="en">
                  {part.notes.map((note) => {
                    const key = `${part.id}.${note.id}`;
                    const entry = review?.get(key);
                    return (
                      <li key={note.id}>
                        <span>{note.id}. {note.before}</span>
                        <input
                          type="text"
                          aria-label={t('exam.listening.note', { number: note.id })}
                          value={answers[key] ?? ''}
                          disabled={Boolean(review)}
                          maxLength={40}
                          autoComplete="off"
                          spellCheck={false}
                          className={entry ? (entry.ok ? 'is-correct' : 'is-wrong') : ''}
                          onChange={(event) => onAnswer(key, event.target.value)}
                        />
                        {note.after ? <span>{note.after}</span> : null}
                        {entry && !entry.ok ? <small className="error">({entry.correct})</small> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                part.questions.map((question, index) => (
                  <Mcq key={question.id} question={question} name={`${part.id}.${question.id}`} value={answers[`${part.id}.${question.id}`]} onChange={(value) => onAnswer(`${part.id}.${question.id}`, value)} review={review} number={index + 1} />
                ))
              )}
              {transcript(part.id, part.script)}
            </div>
          )}
        </Panel>
      ))}
    </>
  );
};
