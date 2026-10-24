import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../../i18n';
import { saveWords } from '../../lib/notebook';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { EmptyState, Panel, useErrorMessage } from '../../ui/kit';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import { RepeatAfterMe } from '../RepeatAfterMe';
import { getArticle, submitArticle, type ReadingSkillKey, type ReadingSubmitResponse } from './api';
import { findSentenceWithWord, parsePassage, savedForm, type PassageBlock } from './markdown';
import { Passage, type PickedWord } from './Passage';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const letter = (index: number) => LETTERS[index] ?? String(index + 1);
const skillShort = (skill: ReadingSkillKey) => skill.replace(/^reading\./, '');

type SavedWord = { word: string; sentence: string };

/** Shows the sentence with the chosen word highlighted. */
const SentenceWithWord = ({ sentence, word }: { sentence: string; word: string }) => {
  const index = sentence.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, index)}
      <mark>{sentence.slice(index, index + word.length)}</mark>
      {sentence.slice(index + word.length)}
    </>
  );
};

/** Up to three sentences to read aloud: the first sentence of each paragraph that is a comfortable length. */
const readAloudSentences = (blocks: PassageBlock[]): string[] =>
  blocks
    .filter((block): block is Extract<PassageBlock, { type: 'paragraph' }> => block.type === 'paragraph')
    .map((block) => block.runs.map((run) => run.text).join('').match(/[^.!?]+[.!?]+/)?.[0]?.trim() ?? '')
    .filter((sentence) => {
      const count = sentence.split(/\s+/).length;
      return count >= 5 && count <= 24;
    })
    .slice(0, 3);

export const ReadingArticle = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const resource = useResource((signal) => getArticle(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const article = resource.data?.article ?? null;
  const blocks = useMemo(() => parsePassage(article?.content_markdown ?? ''), [article?.content_markdown]);
  const questions = article?.questions ?? [];

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ReadingSubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [wordMode, setWordMode] = useState(false);
  const [picked, setPicked] = useState<PickedWord | null>(null);
  const [saved, setSaved] = useState<SavedWord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [lookup, setLookup] = useState('');
  const [notFound, setNotFound] = useState<string | null>(null);

  const savedSet = useMemo(() => new Set(saved.map((entry) => entry.word.toLowerCase())), [saved]);
  const pickedForm = picked ? savedForm(picked.word, picked.sentence) : '';
  const pickedSaved = Boolean(picked) && savedSet.has(pickedForm.toLowerCase());
  const answered = questions.filter((question) => answers[question.id] !== undefined).length;

  const pick = (next: PickedWord) => {
    setSaveError(null);
    setNotFound(null);
    setPicked((current) => (current?.key === next.key ? null : next));
  };

  const findWord = (event: FormEvent) => {
    event.preventDefault();
    const found = findSentenceWithWord(blocks, lookup);
    if (!found) {
      setPicked(null);
      setNotFound(lookup.trim());
      return;
    }
    setNotFound(null);
    setSaveError(null);
    setPicked({ key: `lookup:${found.word.toLowerCase()}`, word: found.word, sentence: found.sentence });
    setLookup('');
  };

  const rememberSaved = (word: string, sentence: string) =>
    setSaved((current) => (current.some((entry) => entry.word.toLowerCase() === word.toLowerCase())
      ? current
      : [...current, { word, sentence }]));

  const save = async () => {
    if (!picked || !article) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveWords([{
        word: pickedForm,
        context_text: picked.sentence,
        source_type: 'english-reading',
        source_label: article.title,
        source_ref: article.slug,
      }]);
      rememberSaved(pickedForm, picked.sentence);
    } catch (cause) {
      setSaveError(cause);
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await submitArticle(
        slug,
        questions.filter((question) => answers[question.id] !== undefined)
          .map((question) => ({ question_id: question.id, option_index: answers[question.id]! })),
        elapsed(),
      );
      setResult(response);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setAnswers({});
    setResult(null);
    setError(null);
  };

  const resultFor = (questionId: string) => result?.results.find((entry) => entry.question_id === questionId) ?? null;

  // Group results by reading skill for "what went well / what to work on".
  const bySkill = useMemo(() => {
    const groups = new Map<ReadingSkillKey, { right: number; total: number }>();
    for (const entry of result?.results ?? []) {
      const group = groups.get(entry.skill) ?? { right: 0, total: 0 };
      group.total += 1;
      if (entry.correct) group.right += 1;
      groups.set(entry.skill, group);
    }
    return [...groups.entries()];
  }, [result]);

  const good = result?.no_questions
    ? [t('reading.result.finishedGood')]
    : bySkill.filter(([, group]) => group.right > 0)
      .map(([skill, group]) => t('reading.result.skillRight', { skill: t(`reading.skill.${skillShort(skill)}`), right: group.right, total: group.total }));
  const fix = result?.no_questions
    ? (saved.length ? [] : [t('reading.result.saveTip')])
    : bySkill.filter(([, group]) => group.right < group.total).map(([skill]) => t(`reading.tip.${skillShort(skill)}`));

  return (
    <ActivityFrame
      skill="reading"
      title={article?.title}
      level={article?.level}
      minutes={article?.read_time_minutes ?? null}
      lead={article?.summary || undefined}
      loading={resource.loading && !resource.data}
      error={resource.error}
      onRetry={resource.reload}
    >
      {result ? (
        <ResultPanel
          skill="reading"
          slug={slug}
          score={result.no_questions ? null : result.score}
          summary={result.no_questions
            ? t('reading.result.finished')
            : t('reading.result.summary', { correct: result.correct, total: result.total })}
          good={good}
          fix={fix}
          savedWords={saved.length}
          savedQuestions={result.no_questions ? 0 : Math.max(0, result.total - result.correct)}
          title={article?.title}
          onRetry={result.no_questions ? undefined : retry}
        >
          <RepeatAfterMe title={t('repeat.reading.title')} lead={t('repeat.reading.lead')} sentences={readAloudSentences(blocks)} />
        </ResultPanel>
      ) : null}

      <Panel
        title={t('reading.text.title')}
        aside={blocks.length ? (
          <button type="button" className="quiet" aria-pressed={wordMode} onClick={() => { setWordMode((on) => !on); setPicked(null); }}>
            {wordMode ? t('reading.words.picking') : t('reading.words.pick')}
          </button>
        ) : null}
      >
        {blocks.length ? (
          <>
            <p className="hint" style={{ margin: 0 }}>{wordMode ? t('reading.words.pickHint') : t('translate.tapHint')}</p>
            <Passage
              blocks={blocks}
              wordMode={wordMode}
              selectedKey={picked?.key ?? null}
              savedWords={savedSet}
              onPick={pick}
              tapSource={{ type: 'english-reading', label: article?.title ?? null, ref: article?.slug ?? null }}
              onTapSaved={rememberSaved}
            />
          </>
        ) : (
          <EmptyState title={t('reading.text.empty')} />
        )}

        {picked ? (
          <div className="rd-picked" role="region" aria-label={t('reading.words.selected')} aria-live="polite">
            <div className="en-row" style={{ justifyContent: 'space-between' }}>
              <strong className="rd-picked-word" lang="en">{pickedForm}</strong>
              <button type="button" className="quiet" onClick={() => setPicked(null)}>{t('reading.words.close')}</button>
            </div>
            <p className="hint" style={{ margin: 0 }}>{t('reading.words.inSentence')}</p>
            <p className="rd-picked-sentence" lang="en"><SentenceWithWord sentence={picked.sentence} word={picked.word} /></p>
            {saveError ? <p className="error" role="alert" style={{ margin: 0 }}>{errorText(saveError)}</p> : null}
            <div className="en-actions">
              <button type="button" disabled={saving || pickedSaved} onClick={() => void save()}>
                {pickedSaved ? `✓ ${t('reading.words.saved')}` : saving ? t('reading.words.saving') : t('reading.words.save')}
              </button>
            </div>
          </div>
        ) : null}

        {blocks.length ? (
          <form className="rd-lookup" onSubmit={findWord}>
            <label htmlFor="rd-lookup-input">{t('reading.words.addLabel')}</label>
            <div className="en-row" style={{ gap: '.5rem', flexWrap: 'nowrap' }}>
              <input
                id="rd-lookup-input"
                type="text"
                lang="en"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={lookup}
                placeholder={t('reading.words.addPlaceholder')}
                onChange={(event) => setLookup(event.target.value)}
              />
              <button type="submit" className="quiet" disabled={!lookup.trim()}>{t('reading.words.find')}</button>
            </div>
            {notFound ? <p className="hint" role="status" style={{ margin: 0 }}>{t('reading.words.notFound', { word: notFound })}</p> : null}
          </form>
        ) : null}

        {saved.length ? (
          <div className="en-stack" style={{ gap: '.5rem' }}>
            <h3 className="rd-subtitle">
              {t('reading.words.savedTitle')} · {t('reading.words.savedCount', { count: saved.length })}
            </h3>
            <ul className="rd-saved" lang="en">
              {saved.map((entry) => <li key={entry.word} title={entry.sentence}>{entry.word}</li>)}
            </ul>
          </div>
        ) : null}
      </Panel>

      {questions.length ? (
        <Panel title={t('reading.questions.title')} aside={!result ? <span>{t('reading.questions.answered', { done: answered, total: questions.length })}</span> : null}>
          {questions.map((question, index) => {
            const checked = resultFor(question.id);
            return (
              <div key={question.id} className="en-question" role="group" aria-labelledby={`rd-q-${question.id}`}>
                <p className="eyebrow" style={{ margin: 0 }}>{t('reading.questions.item', { number: index + 1 })}</p>
                <p className="en-question-prompt" id={`rd-q-${question.id}`} lang="en">{question.prompt}</p>
                <div className="en-options">
                  {question.options.map((option, optionIndex) => {
                    const chosen = answers[question.id] === optionIndex;
                    const state = checked
                      ? optionIndex === checked.answer_index ? 'is-correct' : chosen ? 'is-wrong' : ''
                      : '';
                    return (
                      <button
                        key={optionIndex}
                        type="button"
                        className={`en-option ${state}`.trim()}
                        aria-pressed={chosen}
                        disabled={Boolean(result) || busy}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                      >
                        <span className="en-option-key" aria-hidden="true">{letter(optionIndex)}</span>
                        <span lang="en">{option}</span>
                      </button>
                    );
                  })}
                </div>
                {checked ? (
                  <>
                    <p className={checked.correct ? 'en-notice' : 'error'} style={{ margin: 0 }}>
                      {checked.correct
                        ? t('reading.questions.correct')
                        : checked.chosen_index === null
                          ? t('reading.questions.skipped', { letter: letter(checked.answer_index) })
                          : t('reading.questions.wrong', { letter: letter(checked.answer_index) })}
                    </p>
                    {checked.explanation ? <p className="en-explain" lang="en">{checked.explanation}</p> : null}
                  </>
                ) : null}
              </div>
            );
          })}
          {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
          {!result ? (
            <div className="en-actions">
              <button type="button" className="is-large" disabled={busy || answered === 0} onClick={() => void submit()}>
                {busy ? t('reading.questions.checking') : t('reading.questions.check')}
              </button>
              {answered > 0 && answered < questions.length ? <span className="hint">{t('reading.questions.unanswered')}</span> : null}
            </div>
          ) : null}
        </Panel>
      ) : article && blocks.length && !result ? (
        <Panel title={t('reading.finish.title')}>
          <p style={{ margin: 0 }}>{t('reading.finish.body')}</p>
          {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
          <div className="en-actions">
            <button type="button" className="is-large" disabled={busy} onClick={() => void submit()}>
              {busy ? t('reading.finish.saving') : t('reading.finish.button')}
            </button>
          </div>
        </Panel>
      ) : null}
    </ActivityFrame>
  );
};
