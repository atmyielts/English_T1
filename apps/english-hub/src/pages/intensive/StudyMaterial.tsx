import { useId } from 'react';
import { useT } from '../../i18n';
import { canRecordVoice, useShadowRecorder } from '../../lib/shadow/useShadowRecorder';
import { Panel } from '../../ui/kit';
import type { Exercise, Feedback, Recording, Source, StudyMaterial } from '../../../../../supabase/functions/_shared/english-intensive';

const Documents = ({ sources }: { sources: Source[] }) => {
  const t = useT();
  return (
    <Panel title={t('intensive.documents')}>
      <div className="intensive-sources">
        {sources.map((source) => (
          <article key={source.title} lang="en">
            <h3>{source.title}</h3>
            <p className="intensive-prose">{source.text}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
};

const Recordings = ({ sources }: { sources: Recording[] }) => {
  const t = useT();
  return (
    <Panel title={t('intensive.recordings')}>
      {sources.map((source) => (
        <div className="intensive-recording" key={source.title}>
          <h3 lang="en">{source.title}</h3>
          {source.audio_url ? <audio controls preload="none" src={source.audio_url} aria-label={source.title} /> : <p>{t('intensive.audioSoon')}</p>}
          <details>
            <summary>{t('intensive.transcript')}</summary>
            <p className="intensive-prose" lang="en">{source.text}</p>
          </details>
        </div>
      ))}
    </Panel>
  );
};

const VoicePractice = () => {
  const t = useT();
  const recorder = useShadowRecorder();
  if (!canRecordVoice()) return <p className="hint">{t('intensive.micFallback')}</p>;
  return (
    <div className="intensive-recording">
      <p className="hint">{t('intensive.micHelp')}</p>
      <div className="en-row">
        {recorder.phase === 'recording' ? (
          <button type="button" onClick={() => void recorder.stop()}>{t('intensive.stopRecording')}</button>
        ) : (
          <button type="button" disabled={recorder.phase !== 'idle'} onClick={() => void recorder.start({ voice: true, words: false })}>
            {t('intensive.record')}
          </button>
        )}
      </div>
      {recorder.problem ? <p role="status">{t('intensive.micFallback')}</p> : null}
      {recorder.take?.audioUrl ? <audio controls src={recorder.take.audioUrl} aria-label={t('intensive.yourTake')} /> : null}
    </div>
  );
};

export const MaterialPanels = ({ material }: { material: StudyMaterial }) => {
  const t = useT();
  switch (material.kind) {
    case 'reading': return <Documents sources={material.sources} />;
    case 'listening': return <Recordings sources={material.sources} />;
    case 'grammar': return (
      <Panel title={<span lang="en">{material.focus}</span>}>
        <p lang="en">{material.explanation}</p>
        <ul className="intensive-examples" lang="en">
          {material.examples.map((example) => (
            <li key={example.before}>
              <span><del>{example.before}</del> <span aria-hidden="true">→</span> <strong>{example.after}</strong></span>
              <p>{example.why}</p>
            </li>
          ))}
        </ul>
        <h3>{t('intensive.transfer')}</h3>
        <p lang="en">{material.transfer}</p>
      </Panel>
    );
    case 'vocabulary': return (
      <>
        <Panel title={t('intensive.words')}>
          <p>{t('intensive.recallHint')}</p>
          <div className="intensive-words" lang="en">
            {material.words.map((word) => (
              <details key={word.word}><summary>{word.word}</summary>
                <p>{word.meaning}</p><p><strong>{word.pair}</strong></p><p>{word.example}</p>
              </details>
            ))}
          </div>
        </Panel>
        <Documents sources={material.sources} />
      </>
    );
    case 'writing':
    case 'speaking': return (
      <>
        <Panel title={t(material.kind === 'speaking' ? 'intensive.firstTake' : 'intensive.firstDraft')}>
          <p><strong>{t('intensive.audience')}</strong> <span lang="en">{material.task.audience}</span></p>
          <p lang="en">{material.task.first}</p>
          <details>
            <summary>{t('intensive.newSituation')}</summary>
            <p lang="en">{material.task.change}</p>
            <p lang="en">{material.task.second}</p>
          </details>
          <h3>{t('intensive.checklist')}</h3>
          <ul lang="en">{material.task.checklist.map((point) => <li key={point}>{point}</li>)}</ul>
          {material.kind === 'speaking' ? <VoicePractice /> : null}
        </Panel>
        <Documents sources={material.sources} />
      </>
    );
    case 'immersion': return (
      <>
        <Panel title={t('intensive.mission')}>
          <p lang="en"><strong>{material.mission.role}</strong></p>
          <p lang="en">{material.mission.goal}</p>
          <ul lang="en">{material.mission.constraints.map((point) => <li key={point}>{point}</li>)}</ul>
          <details>
            <summary>{t('intensive.newSituation')}</summary>
            <p lang="en">{material.mission.change}</p>
          </details>
          <h3>{t('intensive.deliverables')}</h3>
          <ul lang="en">{material.mission.deliverables.map((point) => <li key={point}>{point}</li>)}</ul>
          <h3>{t('intensive.checklist')}</h3>
          <ul lang="en">{material.mission.checklist.map((point) => <li key={point}>{point}</li>)}</ul>
        </Panel>
        <Documents sources={material.sources} />
      </>
    );
  }
};

export const Questions = ({ questions, answers, feedback, busy, onChange, onCheck }: {
  questions: Exercise[]; answers: Array<number | null>; feedback: Feedback[]; busy: boolean;
  onChange: (index: number, option: number) => void; onCheck: () => void;
}) => {
  const t = useT();
  const id = useId();
  if (!questions.length) return null;
  return (
    <Panel title={t('intensive.questions')}>
      <div className="intensive-questions">
        {questions.map((question, index) => {
          const result = feedback[index];
          return (
            <fieldset key={question.prompt + index} disabled={busy}>
              <legend lang="en">{index + 1}. {question.prompt}</legend>
              {question.options.map((option, position) => (
                <label key={position} className="intensive-option" lang="en">
                  <input type="radio" name={`${id}-${index}`} checked={answers[index] === position}
                    onChange={() => onChange(index, position)} />
                  <span>{option}</span>
                </label>
              ))}
              {result ? <div className="intensive-feedback">
                <strong>{t(result.correct ? 'intensive.correct' : 'intensive.review')}</strong>
                {!result.correct ? <p lang="en">{question.options[result.answer]}</p> : null}
                <p lang="en">{result.explanation}</p>
              </div> : null}
            </fieldset>
          );
        })}
      </div>
      <div className="en-actions">
        <button type="button" disabled={busy || answers.some((answer) => answer === null)} onClick={onCheck}>{t('intensive.check')}</button>
        {feedback.length ? <span role="status">{t('intensive.result', { count: feedback.filter((item) => item.correct).length, total: feedback.length })}</span> : null}
      </div>
    </Panel>
  );
};
