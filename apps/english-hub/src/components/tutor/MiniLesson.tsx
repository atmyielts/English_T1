import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { handbookTopicHref } from '../../lib/handbookSearch';
import { answerLesson, type TutorLessonItem, type TutorMessage } from '../../lib/tutor';
import { L1Why } from '../L1Why';
import '../../depth.css';

/** A grammar topic's name in the UI language (falls back to the key). */
export const useTopicName = () => {
  const t = useT();
  return (topic: string): string => {
    const key = `topic.${topic}`;
    const label = t(key);
    return label === key ? topic.replace(/-/g, ' ') : label;
  };
};

const ItemCard = ({
  item,
  index,
  label,
  onAnswer,
}: {
  item: TutorLessonItem;
  index: number;
  label: string;
  onAnswer: (itemId: string, answer: string) => Promise<void>;
}) => {
  const t = useT();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (answer: string) => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      await onAnswer(item.id, answer);
    } finally {
      setBusy(false);
    }
  };
  const id = `lesson-${item.id}-${index}`;
  return (
    <li className={`dp-lesson-item ${item.result ? (item.result.correct ? 'is-right' : 'is-wrong') : ''}`.trim()}>
      <p className="dp-lesson-prompt" id={id}>
        <span className="eyebrow">{label} · {t(`depth.lesson.type.${item.type}`)}</span>
        <span lang="en">{item.prompt}</span>
      </p>
      {item.result ? (
        <div className="en-stack" style={{ gap: '.2rem' }}>
          <p style={{ margin: 0 }}>
            <strong>{item.result.correct ? t('depth.lesson.right') : t('depth.lesson.notQuite')}</strong>{' '}
            {item.result.correct ? null : <span className="en-diff" lang="en"><del>{item.result.given}</del> → <ins>{item.result.expected}</ins></span>}
          </p>
          {item.result.why ? <p className="hint" style={{ margin: 0 }} lang="en">{item.result.why}</p> : null}
        </div>
      ) : item.type === 'choose' ? (
        <div className="en-options" role="group" aria-labelledby={id}>
          {item.options.map((option, optionIndex) => (
            <button key={option} type="button" className="en-option" disabled={busy} onClick={() => void send(String(optionIndex))}>
              <span className="en-option-key">{String.fromCharCode(65 + optionIndex)}</span>
              <span lang="en">{option}</span>
            </button>
          ))}
        </div>
      ) : (
        <form className="en-composer" onSubmit={(event) => { event.preventDefault(); void send(value); }}>
          <input
            type="text"
            lang="en"
            aria-labelledby={id}
            value={value}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            placeholder={item.type === 'fix' ? t('depth.lesson.fixPlaceholder') : t('depth.lesson.fillPlaceholder')}
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" disabled={busy || !value.trim()}>{t('depth.lesson.check')}</button>
        </form>
      )}
    </li>
  );
};

/** Explain → practise 3 items → one check question. Answers are checked on the server. */
export const MiniLesson = ({ message, onChange }: { message: TutorMessage; onChange: (next: TutorMessage) => void }) => {
  const t = useT();
  const topicName = useTopicName();
  const [error, setError] = useState<string | null>(null);
  const lesson = message.lesson;
  if (!lesson) return <div className="en-bubble is-tutor">{t('depth.lesson.broken')}</div>;

  const answer = async (itemId: string, value: string) => {
    setError(null);
    try {
      const response = await answerLesson(message.id, itemId, value);
      onChange(response.message);
    } catch {
      setError(t('depth.lesson.answerError'));
    }
  };

  const practiceDone = lesson.items.every((item) => item.result);
  const { progress } = lesson;
  return (
    <article className="dp-lesson" aria-label={t('depth.lesson.label', { title: lesson.title })}>
      <header>
        <p className="eyebrow" style={{ margin: 0 }}>{t('depth.lesson.eyebrow')} · {topicName(lesson.topic)} · {lesson.level}</p>
        <h3 lang="en">{lesson.title}</h3>
      </header>
      <section>
        <h4>{t('depth.lesson.step1')}</h4>
        <p lang="en" style={{ margin: 0 }}>{lesson.explain}</p>
        {lesson.example ? <p className="en-diff" lang="en" style={{ margin: '.35rem 0 0' }}><del>{lesson.example.wrong}</del> → <ins>{lesson.example.right}</ins></p> : null}
        {message.mistake ? (
          <div className="en-explain" style={{ marginTop: '.5rem' }}>
            <strong>{t('depth.lesson.yourMistake')}</strong> <span lang="en">{message.mistake}</span>
            <L1Why mistake={message.mistake} topic={lesson.topic} />
          </div>
        ) : null}
        <p style={{ margin: '.35rem 0 0' }}><Link to={handbookTopicHref(lesson.topic)}>{t('handbook.readRule')}</Link></p>
      </section>
      <section>
        <h4>{t('depth.lesson.step2')}</h4>
        <ol className="dp-lesson-items">
          {lesson.items.map((item, index) => (
            <ItemCard key={item.id} item={item} index={index} label={t('depth.lesson.itemN', { number: index + 1 })} onAnswer={answer} />
          ))}
        </ol>
      </section>
      {practiceDone ? (
        <section>
          <h4>{t('depth.lesson.step3')}</h4>
          <ol className="dp-lesson-items">
            <ItemCard item={lesson.check} index={9} label={t('depth.lesson.checkLabel')} onAnswer={answer} />
          </ol>
        </section>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {progress.done ? (
        <p className={progress.correct >= 3 ? 'en-notice' : 'en-explain'} style={{ margin: 0 }} role="status">
          {t('depth.lesson.done', { correct: progress.correct, total: progress.total })}{' '}
          {progress.correct >= 3 ? t('depth.lesson.doneGood') : t('depth.lesson.doneAgain')}
        </p>
      ) : (
        <p className="hint" style={{ margin: 0 }}>{t('depth.lesson.progress', { answered: progress.answered, total: progress.total })}</p>
      )}
    </article>
  );
};
