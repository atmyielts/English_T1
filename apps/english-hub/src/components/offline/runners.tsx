import { useMemo, useState, type ReactNode } from 'react';
import { useI18n, useT } from '../../i18n';
import type { OfflineActivity } from '../../lib/offline/model';
import { canSpeak, speak } from '../../lib/speech';
import { useElapsedSeconds } from '../../lib/useResource';
import { Panel } from '../../ui/kit';
import { parsePassage, runsText } from '../../skills/reading/markdown';
import { parseScript, speechChunks } from '../../skills/listening/script';
import { usePlayer } from '../../skills/listening/usePlayer';
import { buildQuiz } from '../../skills/vocabulary/quiz';
import type { ReadingArticle } from '../../skills/reading/api';
import type { DictationTarget, ListeningItem } from '../../skills/listening/api';
import type { GrammarDrill, GrammarUnit } from '../../skills/grammar/api';
import type { DeckWord, VocabularyDeck } from '../../skills/vocabulary/api';

// Offline versions of the four AI-free activities. They show the saved content
// and collect answers in the same shape the online pages submit; checking
// happens on the server when the answers are sent.

export type RunnerProps = { activity: OfflineActivity; onFinish: (body: Record<string, unknown>) => void };

const letter = (index: number) => String.fromCharCode(65 + index);

type Choice = { id: string; prompt: string; options: string[] };

const ChoiceQuestions = ({ questions, answers, onAnswer }: { questions: Choice[]; answers: Record<string, number>; onAnswer: (id: string, index: number) => void }) => {
  const t = useT();
  return (
    <>
      {questions.map((question, index) => (
        <div key={question.id} className="en-question" role="group" aria-labelledby={`off-q-${question.id}`}>
          <p className="eyebrow" style={{ margin: 0 }}>{t('offline.run.question', { number: index + 1 })}</p>
          <p className="en-question-prompt" id={`off-q-${question.id}`} lang="en">{question.prompt}</p>
          <div className="en-options">
            {question.options.map((option, optionIndex) => (
              <button
                key={optionIndex}
                type="button"
                className="en-option"
                aria-pressed={answers[question.id] === optionIndex}
                onClick={() => onAnswer(question.id, optionIndex)}
              >
                <span className="en-option-key" aria-hidden="true">{letter(optionIndex)}</span>
                <span lang="en">{option}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
};

const FinishBar = ({ disabled, note, onFinish }: { disabled?: boolean; note?: ReactNode; onFinish: () => void }) => {
  const t = useT();
  return (
    <div className="en-actions">
      <button type="button" className="is-large" disabled={disabled} onClick={onFinish}>{t('offline.run.finish')}</button>
      {note ? <span className="hint">{note}</span> : null}
    </div>
  );
};

export const ReadingRunner = ({ activity, onFinish }: RunnerProps) => {
  const t = useT();
  const elapsed = useElapsedSeconds();
  const article = (activity.content.article ?? {}) as Partial<ReadingArticle>;
  const blocks = useMemo(() => parsePassage(article.content_markdown ?? ''), [article.content_markdown]);
  const questions = article.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const answered = questions.filter((question) => answers[question.id] !== undefined).length;

  return (
    <>
      <Panel title={t('offline.run.text')}>
        <div className="en-passage rd-passage" lang="en">
          {blocks.map((block, index) => {
            if (block.type === 'heading') return block.level === 2 ? <h2 key={index} className="rd-heading">{runsText(block.runs)}</h2> : <h3 key={index} className="rd-heading">{runsText(block.runs)}</h3>;
            if (block.type === 'quote') return <blockquote key={index} className="rd-quote">{runsText(block.runs)}</blockquote>;
            if (block.type === 'list') {
              const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{runsText(item)}</li>);
              return block.ordered ? <ol key={index} className="rd-list">{items}</ol> : <ul key={index} className="rd-list">{items}</ul>;
            }
            return <p key={index}>{runsText(block.runs)}</p>;
          })}
        </div>
      </Panel>
      <Panel title={t('offline.run.questions')}>
        <ChoiceQuestions questions={questions} answers={answers} onAnswer={(id, index) => setAnswers((current) => ({ ...current, [id]: index }))} />
        <FinishBar
          disabled={questions.length > 0 && answered === 0}
          note={answered > 0 && answered < questions.length ? t('offline.run.unanswered') : null}
          onFinish={() => onFinish({
            answers: questions.filter((question) => answers[question.id] !== undefined).map((question) => ({ question_id: question.id, option_index: answers[question.id]! })),
            time_spent_seconds: elapsed(),
          })}
        />
      </Panel>
    </>
  );
};

export const ListeningRunner = ({ activity, onFinish }: RunnerProps) => {
  const t = useT();
  const elapsed = useElapsedSeconds();
  const player = usePlayer();
  const item = (activity.content.item ?? {}) as Partial<ListeningItem>;
  const targets = (activity.content.dictation ?? []) as DictationTarget[];
  const questions = item.questions ?? [];
  const lines = useMemo(() => parseScript(item.transcript_text ?? '', item.metadata?.format === 'dialogue'), [item.transcript_text, item.metadata?.format]);
  const chunks = useMemo(() => speechChunks(lines), [lines]);
  const [readingMode, setReadingMode] = useState(() => !canSpeak());
  const [plays, setPlays] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const playing = player.state.key === 'script';
  const useDictation = !readingMode && targets.length > 0;
  const answered = questions.filter((question) => answers[question.id] !== undefined).length;
  const written = targets.filter((target) => (typed[target.segment_index] ?? '').trim()).length;
  const heard = readingMode || plays > 0;

  return (
    <>
      <Panel title={readingMode ? t('offline.run.script') : t('offline.run.listen')}>
        {readingMode ? (
          <>
            {!canSpeak() ? <p className="en-notice" style={{ margin: 0 }}>{t('offline.run.noVoice')}</p> : null}
            <div className="en-passage" lang="en">
              {lines.map((line, index) => <p key={index}>{line.speaker ? <strong>{line.speaker}: </strong> : null}{line.text}</p>)}
            </div>
          </>
        ) : (
          <>
            <div className="en-actions">
              <button
                type="button"
                className="is-large"
                aria-pressed={playing}
                onClick={() => {
                  if (playing) { player.stop(); return; }
                  setPlays((count) => count + 1);
                  void player.play('script', chunks, 1);
                }}
              >
                {playing ? t('offline.run.stopListen') : t('offline.run.listen')}
              </button>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              <button type="button" className="is-link" onClick={() => { player.stop(); setReadingMode(true); }}>{t('offline.run.readInstead')}</button>
            </p>
          </>
        )}
      </Panel>

      {useDictation ? (
        <Panel title={t('offline.run.dictation')}>
          {targets.map((target, index) => (
            <div key={target.segment_index} className="en-question">
              <p className="eyebrow" style={{ margin: 0 }}>{t('offline.run.dictationItem', { number: index + 1 })}</p>
              <div className="en-actions">
                <button type="button" className="quiet" onClick={() => void speak(target.segment_text, { rate: 0.85 })}>
                  ▶ {t('offline.run.playSentence', { number: index + 1 })}
                </button>
              </div>
              <input
                type="text"
                lang="en"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={t('offline.run.dictationItem', { number: index + 1 })}
                value={typed[target.segment_index] ?? ''}
                onChange={(event) => setTyped((current) => ({ ...current, [target.segment_index]: event.target.value }))}
              />
            </div>
          ))}
        </Panel>
      ) : null}

      <Panel title={t('offline.run.questions')}>
        <ChoiceQuestions questions={questions} answers={answers} onAnswer={(id, index) => setAnswers((current) => ({ ...current, [id]: index }))} />
        <FinishBar
          disabled={!heard || (answered === 0 && !(useDictation && written > 0))}
          note={answered > 0 && answered < questions.length ? t('offline.run.unanswered') : null}
          onFinish={() => {
            player.stop();
            onFinish({
              mode: readingMode ? 'reading' : 'listening',
              answers: Object.entries(answers).map(([question_id, option_index]) => ({ question_id, option_index })),
              dictation: useDictation ? targets.map((target) => ({ segment_index: target.segment_index, text: typed[target.segment_index] ?? '' })) : [],
              plays,
              time_spent_seconds: elapsed(),
            });
          }}
        />
      </Panel>
    </>
  );
};

export const GrammarRunner = ({ activity, onFinish }: RunnerProps) => {
  const t = useT();
  const elapsed = useElapsedSeconds();
  const unit = (activity.content.unit ?? {}) as Partial<GrammarUnit>;
  const drills = ((activity.content.drills ?? []) as GrammarDrill[]).slice().sort((a, b) => a.sort_order - b.sort_order);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answered = drills.filter((drill) => (answers[drill.id] ?? '').trim()).length;
  const examples = (unit.examples_json ?? []).filter((example) => example.good).slice(0, 3);

  return (
    <>
      {unit.explanation_text ? (
        <Panel title={unit.title ?? activity.title}>
          <p className="en-passage" lang="en" style={{ whiteSpace: 'pre-line' }}>{unit.explanation_text}</p>
          {examples.length ? (
            <ul className="en-passage" lang="en">
              {examples.map((example, index) => <li key={index}>{example.good}</li>)}
            </ul>
          ) : null}
        </Panel>
      ) : null}
      <Panel title={t('offline.run.questions')}>
        {drills.map((drill, index) => (
          <div key={drill.id} className="en-question">
            <p className="eyebrow">{t('offline.run.drill', { number: index + 1 })}{drill.instructions ?? drill.title ? ` · ${drill.instructions ?? drill.title}` : ''}</p>
            <p className="en-question-prompt" lang="en">{drill.prompt_text}</p>
            <input
              type="text"
              lang="en"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label={`${t('offline.run.answer')} ${index + 1}`}
              value={answers[drill.id] ?? ''}
              onChange={(event) => setAnswers((current) => ({ ...current, [drill.id]: event.target.value }))}
            />
          </div>
        ))}
        <FinishBar
          disabled={answered === 0}
          note={answered > 0 && answered < drills.length ? t('offline.run.unanswered') : null}
          onFinish={() => onFinish({
            answers: drills.filter((drill) => (answers[drill.id] ?? '').trim()).map((drill) => ({ drill_id: drill.id, response: answers[drill.id]!.trim() })),
            time_spent_seconds: elapsed(),
          })}
        />
      </Panel>
    </>
  );
};

export const VocabularyRunner = ({ activity, onFinish }: RunnerProps) => {
  const t = useT();
  const { locale } = useI18n();
  const elapsed = useElapsedSeconds();
  const deck = (activity.content.deck ?? {}) as Partial<VocabularyDeck>;
  const words = useMemo(() => ((activity.content.words ?? []) as DeckWord[]).slice().sort((a, b) => a.sort_order - b.sort_order), [activity.content.words]);
  const quiz = useMemo(() => buildQuiz(words), [words]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answered = quiz.filter((question) => answers[question.word.id] !== undefined).length;
  const translation = (word: DeckWord) => (locale === 'ru' ? word.translation_ru : locale === 'uz' ? word.translation_uz : null);

  return (
    <>
      <Panel title={deck.title ?? t('offline.run.words')}>
        <ul className="en-list" style={{ display: 'grid', gap: '.5rem' }}>
          {words.map((word) => (
            <li key={word.id} className="en-question" style={{ padding: '.6rem 0' }}>
              <strong lang="en">{word.word}</strong>
              {word.part_of_speech ? <span className="hint"> · {word.part_of_speech}</span> : null}
              <span lang="en"> — {word.definition}</span>
              {translation(word) ? <span className="hint" lang={locale}> ({translation(word)})</span> : null}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('offline.run.quiz')}>
        {quiz.map((question, index) => (
          <div key={question.word.id} className="en-question" role="group" aria-labelledby={`off-w-${question.word.id}`}>
            <p className="eyebrow" style={{ margin: 0 }}>{t('offline.run.question', { number: index + 1 })}</p>
            <p className="en-question-prompt" id={`off-w-${question.word.id}`} lang="en">{question.word.definition}</p>
            <div className="en-options">
              {question.options.map((option, optionIndex) => (
                <button
                  key={option}
                  type="button"
                  className="en-option"
                  aria-pressed={answers[question.word.id] === option}
                  onClick={() => setAnswers((current) => ({ ...current, [question.word.id]: option }))}
                >
                  <span className="en-option-key" aria-hidden="true">{letter(optionIndex)}</span>
                  <span lang="en">{option}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <FinishBar
          disabled={answered === 0}
          note={answered > 0 && answered < quiz.length ? t('offline.run.unanswered') : null}
          onFinish={() => onFinish({
            answers: quiz.filter((question) => answers[question.word.id] !== undefined).map((question) => ({ word_id: question.word.id, option: answers[question.word.id]! })),
            time_spent_seconds: elapsed(),
            save_words: false,
          })}
        />
      </Panel>
    </>
  );
};

export const RUNNERS = {
  reading: ReadingRunner,
  listening: ListeningRunner,
  grammar: GrammarRunner,
  vocabulary: VocabularyRunner,
} as const;
