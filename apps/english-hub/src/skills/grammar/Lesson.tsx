import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TapScope, TapWords } from '../../components/WordLookup';
import { useT } from '../../i18n';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { Panel, useErrorMessage } from '../../ui/kit';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import { getUnit, submitLesson, type GrammarSubmitResponse } from './api';

export const GrammarLesson = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const lesson = useResource((signal) => getUnit(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GrammarSubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const unit = lesson.data?.unit;
  const drills = lesson.data?.drills ?? [];
  const examples = (unit?.examples_json ?? []).filter((example) => example.good);
  const answered = drills.filter((drill) => (answers[drill.id] ?? '').trim()).length;

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await submitLesson(slug, drills.map((drill) => ({ drill_id: drill.id, response: answers[drill.id] ?? '' })), elapsed());
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
  };

  const resultFor = (drillId: string) => result?.results.find((entry) => entry.drill_id === drillId) ?? null;

  return (
    <ActivityFrame
      skill="grammar"
      title={unit?.title}
      level={unit?.level}
      minutes={8}
      loading={lesson.loading && !lesson.data}
      error={lesson.error}
      onRetry={lesson.reload}
    >
      {result ? (
        <ResultPanel
          skill="grammar"
          slug={slug}
          score={result.score}
          summary={t('grammar.result.summary', { correct: result.correct, total: result.total })}
          good={[
            ...(result.correct > 0 ? [t('grammar.result.good', { count: result.correct })] : []),
            ...(result.practised_mistakes ? [t('grammar.result.practisedMistakes', { count: result.practised_mistakes })] : []),
          ]}
          fix={result.correct < result.total ? [unit?.common_error_pattern ?? t('grammar.result.fixDefault')] : []}
          onRetry={retry}
        />
      ) : null}

      <Panel
        title={t('grammar.rule.title')}
        aside={unit ? <Link to={`/grammar/handbook#${encodeURIComponent(unit.slug)}`}>{t('handbook.openLesson')}</Link> : null}
      >
        {unit?.explanation_text ? <p className="en-passage" style={{ fontSize: '1rem' }}>{unit.explanation_text}</p> : null}
        {unit?.contrast_text ? <p className="en-explain">{unit.contrast_text}</p> : null}
        {examples.length ? (
          <div className="en-stack" style={{ gap: '.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('grammar.rule.examples')}</h3>
            {/* Correct examples can be tapped for word meanings; the wrong versions cannot. */}
            <TapScope as="ul" className="en-list" source={{ type: 'english-grammar', label: unit?.title ?? null, ref: slug }}>
              {examples.map((example, index) => (
                <li key={index} className="en-diff" style={{ fontSize: '.95rem' }}>
                  {example.bad ? <><del>{example.bad}</del><br /></> : null}
                  <ins><TapWords text={example.good ?? ''} /></ins>
                </li>
              ))}
            </TapScope>
          </div>
        ) : null}
        {unit?.common_error_pattern ? (
          <p className="hint"><strong>{t('grammar.rule.watchOut')}</strong> {unit.common_error_pattern}</p>
        ) : null}
      </Panel>

      <Panel title={t('grammar.practice.title')} aside={!result ? <span>{t('grammar.practice.answered', { done: answered, total: drills.length })}</span> : null}>
        {drills.map((drill, index) => {
          const checked = resultFor(drill.id);
          return (
            <div key={drill.id} className="en-question">
              <p className="eyebrow">{t('grammar.practice.item', { number: index + 1 })} · {drill.instructions ?? drill.title}</p>
              <p className="en-question-prompt" lang="en">{drill.prompt_text}</p>
              <input
                type="text"
                lang="en"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={t('grammar.practice.answerLabel', { number: index + 1 })}
                value={answers[drill.id] ?? ''}
                disabled={Boolean(result) || busy}
                onChange={(event) => setAnswers((current) => ({ ...current, [drill.id]: event.target.value }))}
                placeholder={drill.prompt_text.includes('___') ? t('grammar.practice.fillPlaceholder') : t('grammar.practice.rewritePlaceholder')}
                style={checked ? { borderColor: checked.correct ? 'var(--good)' : '#dc2626' } : undefined}
              />
              {checked ? (
                <p className={checked.correct ? 'en-notice' : 'error'} style={{ margin: 0 }}>
                  {checked.correct
                    ? checked.typo ? t('grammar.practice.typo', { answer: checked.expected }) : t('grammar.practice.correct')
                    : t('grammar.practice.wrong', { answer: checked.expected })}
                </p>
              ) : null}
            </div>
          );
        })}
        {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
        {!result ? (
          <div className="en-actions">
            <button type="button" className="is-large" disabled={busy || answered === 0} onClick={() => void check()}>
              {busy ? t('grammar.practice.checking') : t('grammar.practice.check')}
            </button>
            {answered < drills.length && answered > 0 ? <span className="hint">{t('grammar.practice.unanswered')}</span> : null}
          </div>
        ) : null}
      </Panel>
    </ActivityFrame>
  );
};
